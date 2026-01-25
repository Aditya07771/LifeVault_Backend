import {
  Aptos,
  AptosConfig,
  Network,
  Ed25519Account,
  Ed25519PrivateKey,
  PrivateKey,
  Account,  // ADD THIS IMPORT
  AccountAddress  // ADD THIS TOO - you use it in getBalance
} from "@aptos-labs/ts-sdk";


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

      console.log(`🌐 Connecting to Aptos ${networkName}...`);

      // Create Aptos client
      const config = new AptosConfig({ network });
      this.aptos = new Aptos(config);

      // Load master wallet from private key
      if (process.env.APTOS_PRIVATE_KEY) {
        console.log('🔑 Loading master account from private key...');
        
        try {
          // Clean the private key
          let privateKeyStr = process.env.APTOS_PRIVATE_KEY.trim();
          
          // Method 1: Try using PrivateKey.formatPrivateKey
          try {
            const formattedKey = PrivateKey.formatPrivateKey(
              privateKeyStr,
              "ed25519"
            );
            const privateKey = new Ed25519PrivateKey(formattedKey);
            this.masterAccount = new Ed25519Account({ privateKey });
          } catch (formatError) {
            // Method 2: Direct approach
            console.log('Trying alternative key loading method...');
            
            // Remove 0x prefix if present
            if (privateKeyStr.startsWith('0x')) {
              privateKeyStr = privateKeyStr.slice(2);
            }
            
            const privateKey = new Ed25519PrivateKey(privateKeyStr);
            this.masterAccount = new Ed25519Account({ privateKey });
          }

          console.log(
            `✅ Aptos master wallet loaded: ${this.masterAccount.accountAddress.toString()}`
          );

        } catch (keyError) {
          console.error('❌ Failed to load private key:', keyError.message);
          console.log('ℹ️ Generating new test account instead...');
          
          // Fallback to generating a new account
          this.masterAccount = Account.generate();
          console.log(`✅ Generated test account: ${this.masterAccount.accountAddress.toString()}`);
        }
      } else {
        // If no private key provided, generate a test account
        console.log('⚠️ No APTOS_PRIVATE_KEY found in environment variables');
        this.masterAccount = Account.generate();
        console.log(`✅ Generated test account: ${this.masterAccount.accountAddress.toString()}`);
      }

      // Set module info
      this.moduleAddress = process.env.APTOS_MODULE_ADDRESS;
      this.moduleName = process.env.APTOS_MODULE_NAME || 'memory_vault';

      if (this.moduleAddress) {
        console.log(`📦 Aptos module: ${this.moduleAddress}::${this.moduleName}`);
      } else {
        console.log('⚠️ No module address configured (APTOS_MODULE_ADDRESS)');
      }

      // Test the connection
      try {
        const ledgerInfo = await this.aptos.getLedgerInfo();
        console.log(`📊 Chain ID: ${ledgerInfo.chain_id}`);
        console.log(`🕐 Ledger Version: ${ledgerInfo.ledger_version}`);
      } catch (error) {
        console.warn('⚠️ Could not fetch ledger info:', error.message);
      }

      this.initialized = true;
      console.log(`✅ Connected to Aptos ${networkName}`);
      return true;
    } catch (error) {
      console.error('❌ Aptos initialization failed:', error.message);
      console.error('Stack trace:', error.stack);
      
      // Create a minimal setup for development
      console.log('🛠️ Setting up minimal Aptos client for development...');
      
      const config = new AptosConfig({ network: Network.DEVNET });
      this.aptos = new Aptos(config);
      this.masterAccount = Account.generate();
      this.initialized = true;
      
      console.log(`✅ Using development account: ${this.masterAccount.accountAddress.toString()}`);
      return true;
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
      privateKey: account.privateKey.toString(),
      publicKey: account.publicKey.toString()
    };
  }

  /**
   * Get account balance
   * @param {string} address - Aptos address
   */
  async getBalance(address) {
    try {
      const balance = await this.aptos.getAccountAPTAmount({
        accountAddress: address
      });

      return {
        success: true,
        address,
        balance: balance / 100_000_000, // Convert from Octas to APT
        balanceOctas: balance,
        formattedBalance: `${(balance / 100_000_000).toFixed(4)} APT`
      };
    } catch (error) {
      console.error('Balance check error:', error);
      return { 
        success: false, 
        error: error.message,
        address 
      };
    }
  }

  /**
   * Fund account from faucet (testnet/devnet only)
   * @param {string} address - Aptos address to fund
   */
  async fundAccount(address) {
    try {
      const networkName = process.env.APTOS_NETWORK || 'testnet';
      if (networkName === 'mainnet') {
        return { 
          success: false, 
          error: 'Cannot fund accounts on mainnet via faucet' 
        };
      }

      console.log(`💸 Funding account: ${address}`);
      
      await this.aptos.fundAccount({
        accountAddress: address,
        amount: 100_000_000 // 1 APT
      });
      
      return { 
        success: true, 
        message: 'Account funded with 1 APT',
        amount: 1,
        address
      };
    } catch (error) {
      console.error('Funding error:', error);
      return { 
        success: false, 
        error: error.message,
        address 
      };
    }
  }

  /**
   * Store memory hash on Aptos blockchain
   */
  async storeMemoryOnChain(ipfsHash, userAddress = null) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.moduleAddress) {
        console.log('⚠️ Module not deployed. Returning mock transaction.');
        return {
          success: true,
          mock: true,
          message: 'Module not deployed - mock transaction',
          txHash: `mock_${Date.now()}`,
          ipfsHash
        };
      }

      console.log(`📝 Storing memory on chain: ${ipfsHash}`);

      const transaction = await this.aptos.transaction.build.simple({
        sender: this.masterAccount.accountAddress,
        data: {
          function: `${this.moduleAddress}::${this.moduleName}::store_memory`,
          functionArguments: [ipfsHash]
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

      console.log(`✅ Transaction submitted: ${pendingTx.hash}`);

      const executedTx = await this.aptos.waitForTransaction({
        transactionHash: pendingTx.hash
      });

      console.log(`✅ Transaction confirmed: ${executedTx.hash}`);

      return {
        success: true,
        txHash: pendingTx.hash,
        txVersion: executedTx.version,
        gasUsed: executedTx.gas_used,
        vmStatus: executedTx.vm_status,
        ipfsHash
      };
    } catch (error) {
      console.error('Aptos store error:', error);
      throw new Error(`Aptos transaction failed: ${error.message}`);
    }
  }

  getMasterAddress() {
    return this.masterAccount ? this.masterAccount.accountAddress.toString() : null;
  }

  isInitialized() {
    return this.initialized && this.aptos !== null;
  }
}

export default new AptosService();