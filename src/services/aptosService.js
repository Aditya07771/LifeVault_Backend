import { Aptos, AptosConfig, Network, Account, AccountAddress, Ed25519PrivateKey } from 'aptos';

class AptosService {
  constructor() {
    this.aptos = null;
    this.masterAccount = null;
    this.moduleAddress = null;
    this.moduleName = null;
    this.initialized = false;
  }

  /**
   * Initialize connection to Aptos network
   */
  async initialize() {
    try {
      // Determine network
      const networkName = process.env.APTOS_NETWORK || 'testnet';
      let network;
      switch (networkName) {
        case 'mainnet':
          network = Network.MAINNET;
          break;
        case 'devnet':
          network = Network.DEVNET;
          break;
        default:
          network = Network.TESTNET;
      }

      // Create Aptos client
      const config = new AptosConfig({ network });
      this.aptos = new Aptos(config);

      // Load master wallet from private key
      if (process.env.APTOS_PRIVATE_KEY) {
        const privateKey = new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY);
        this.masterAccount = Account.fromPrivateKey({ privateKey });
        console.log(`✅ Aptos master wallet: ${this.masterAccount.accountAddress.toString()}`);
      }

      // Set module info
      this.moduleAddress = process.env.APTOS_MODULE_ADDRESS;
      this.moduleName = process.env.APTOS_MODULE_NAME || 'memory_vault';

      if (this.moduleAddress) {
        console.log(`✅ Aptos module: ${this.moduleAddress}::${this.moduleName}`);
      }

      this.initialized = true;
      console.log(`✅ Connected to Aptos ${networkName}`);
      return true;
    } catch (error) {
      console.error('❌ Aptos initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Generate a new Aptos account for a user
   * @returns {Object} { address, privateKey }
   */
  generateAccount() {
    const account = Account.generate();
    return {
      address: account.accountAddress.toString(),
      privateKey: account.privateKey.toString()
    };
  }

  /**
   * Get account balance
   * @param {string} address - Aptos address
   */
  async getBalance(address) {
    try {
      const balance = await this.aptos.getAccountAPTAmount({
        accountAddress: AccountAddress.from(address)
      });
      return {
        success: true,
        address,
        balance: balance / 100_000_000, // Convert from Octas to APT
        balanceOctas: balance
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fund account from faucet (testnet/devnet only)
   * @param {string} address - Aptos address to fund
   */
  async fundAccount(address) {
    try {
      await this.aptos.fundAccount({
        accountAddress: AccountAddress.from(address),
        amount: 100_000_000 // 1 APT
      });
      return { success: true, message: 'Account funded with 1 APT' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Store memory hash on Aptos blockchain
   * @param {string} ipfsHash - IPFS hash of the memory
   * @param {string} userAddress - User's Aptos address (optional, uses master)
   */
  async storeMemoryOnChain(ipfsHash, userAddress = null) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.moduleAddress) {
        console.log('⚠️ Module not deployed. Skipping blockchain transaction.');
        return {
          success: false,
          message: 'Module not deployed',
          mock: true
        };
      }

      // Build the transaction
      const transaction = await this.aptos.transaction.build.simple({
        sender: this.masterAccount.accountAddress,
        data: {
          function: `${this.moduleAddress}::${this.moduleName}::store_memory`,
          functionArguments: [ipfsHash]
        }
      });

      // Sign the transaction
      const senderAuthenticator = this.aptos.transaction.sign({
        signer: this.masterAccount,
        transaction
      });

      // Submit the transaction
      const pendingTx = await this.aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator
      });

      console.log(`📝 Transaction submitted: ${pendingTx.hash}`);

      // Wait for confirmation
      const executedTx = await this.aptos.waitForTransaction({
        transactionHash: pendingTx.hash
      });

      return {
        success: true,
        txHash: pendingTx.hash,
        txVersion: executedTx.version,
        gasUsed: executedTx.gas_used,
        vmStatus: executedTx.vm_status
      };
    } catch (error) {
      console.error('Aptos store error:', error);
      throw new Error(`Aptos transaction failed: ${error.message}`);
    }
  }

  /**
   * Get memory from blockchain
   * @param {string} ownerAddress - Owner's Aptos address
   */
  async getMemoriesFromChain(ownerAddress) {
    try {
      if (!this.moduleAddress) {
        return { success: false, message: 'Module not deployed' };
      }

      // Read the resource from the user's account
      const resource = await this.aptos.getAccountResource({
        accountAddress: AccountAddress.from(ownerAddress),
        resourceType: `${this.moduleAddress}::${this.moduleName}::MemoryStore`
      });

      return {
        success: true,
        memories: resource.memories || []
      };
    } catch (error) {
      // Resource might not exist if user has no memories
      if (error.message.includes('Resource not found')) {
        return { success: true, memories: [] };
      }
      throw new Error(`Failed to get memories: ${error.message}`);
    }
  }

  /**
   * View function to get memory by ID
   * @param {number} memoryId - Memory ID
   */
  async getMemoryById(memoryId) {
    try {
      if (!this.moduleAddress) {
        return { success: false, message: 'Module not deployed' };
      }

      const result = await this.aptos.view({
        payload: {
          function: `${this.moduleAddress}::${this.moduleName}::get_memory`,
          functionArguments: [memoryId.toString()]
        }
      });

      return {
        success: true,
        memory: {
          ipfsHash: result[0],
          owner: result[1],
          timestamp: result[2]
        }
      };
    } catch (error) {
      throw new Error(`Failed to get memory: ${error.message}`);
    }
  }

  /**
   * Get total memory count (view function)
   */
  async getTotalMemoryCount() {
    try {
      if (!this.moduleAddress) {
        return { success: false, count: 0 };
      }

      const result = await this.aptos.view({
        payload: {
          function: `${this.moduleAddress}::${this.moduleName}::get_total_memories`,
          functionArguments: []
        }
      });

      return { success: true, count: parseInt(result[0]) };
    } catch (error) {
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Verify ownership of a memory
   * @param {number} memoryId - Memory ID
   * @param {string} ownerAddress - Address to verify
   */
  async verifyOwnership(memoryId, ownerAddress) {
    try {
      const result = await this.aptos.view({
        payload: {
          function: `${this.moduleAddress}::${this.moduleName}::verify_ownership`,
          functionArguments: [memoryId.toString(), ownerAddress]
        }
      });

      return { success: true, isOwner: result[0] };
    } catch (error) {
      return { success: false, isOwner: false, error: error.message };
    }
  }

  /**
   * Transfer memory to new owner
   * @param {number} memoryId - Memory ID
   * @param {string} newOwnerAddress - New owner's address
   */
  async transferMemory(memoryId, newOwnerAddress) {
    try {
      const transaction = await this.aptos.transaction.build.simple({
        sender: this.masterAccount.accountAddress,
        data: {
          function: `${this.moduleAddress}::${this.moduleName}::transfer_memory`,
          functionArguments: [memoryId.toString(), newOwnerAddress]
        }
      });

      const senderAuthenticator = this.aptos.transaction.sign({
        signer: this.masterAccount,
        transaction
      });

      const pendingTx = await this.aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator
      });

      await this.aptos.waitForTransaction({ transactionHash: pendingTx.hash });

      return { success: true, txHash: pendingTx.hash };
    } catch (error) {
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }

  /**
   * Get transaction details
   * @param {string} txHash - Transaction hash
   */
  async getTransaction(txHash) {
    try {
      const tx = await this.aptos.getTransactionByHash({ transactionHash: txHash });
      return {
        success: true,
        transaction: {
          hash: tx.hash,
          version: tx.version,
          gasUsed: tx.gas_used,
          success: tx.success,
          timestamp: tx.timestamp,
          sender: tx.sender
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new AptosService();