import { ethers } from 'ethers';


// Minimal ABI for MemoryVault contract
const MEMORY_VAULT_ABI = [
  "function storeMemory(string memory ipfsHash) external returns (uint256)",
  "function getMemory(uint256 memoryId) external view returns (string memory ipfsHash, address owner, uint256 timestamp)",
  "function getUserMemories(address user) external view returns (uint256[] memory)",
  "function transferMemory(uint256 memoryId, address newOwner) external",
  "event MemoryStored(uint256 indexed memoryId, address indexed owner, string ipfsHash, uint256 timestamp)",
  "event MemoryTransferred(uint256 indexed memoryId, address indexed from, address indexed to)"
];

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contract = null;
    this.initialized = false;
  }

  /**
   * Initialize the blockchain connection
   */
  async initialize() {
    try {
      // Connect to Polygon network
      this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
      
      // Create wallet from private key
      if (process.env.MASTER_WALLET_PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(process.env.MASTER_WALLET_PRIVATE_KEY, this.provider);
        console.log(`✅ Blockchain wallet initialized: ${this.wallet.address}`);
      }

      // Connect to contract
      if (process.env.CONTRACT_ADDRESS && process.env.CONTRACT_ADDRESS !== 'your_deployed_contract_address') {
        this.contract = new ethers.Contract(
          process.env.CONTRACT_ADDRESS,
          MEMORY_VAULT_ABI,
          this.wallet || this.provider
        );
        console.log(`✅ Smart contract connected: ${process.env.CONTRACT_ADDRESS}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Store memory hash on blockchain
   * @param {String} ipfsHash - IPFS hash of the memory
   * @param {String} userWallet - User's wallet address (optional, uses master wallet)
   */
  async storeMemoryOnChain(ipfsHash, userWallet = null) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.contract) {
        console.log('⚠️ Contract not deployed. Skipping blockchain transaction.');
        return {
          success: false,
          message: 'Contract not deployed',
          mock: true
        };
      }

      // Estimate gas
      const gasEstimate = await this.contract.storeMemory.estimateGas(ipfsHash);
      
      // Send transaction
      const tx = await this.contract.storeMemory(ipfsHash, {
        gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
      });

      console.log(`📝 Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Parse event to get memory ID
      const event = receipt.logs.find(log => {
        try {
          return this.contract.interface.parseLog(log)?.name === 'MemoryStored';
        } catch {
          return false;
        }
      });

      let memoryId = null;
      if (event) {
        const parsedEvent = this.contract.interface.parseLog(event);
        memoryId = parsedEvent.args.memoryId.toString();
      }

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        memoryId,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      console.error('Blockchain store error:', error.message);
      throw new Error(`Blockchain transaction failed: ${error.message}`);
    }
  }

  /**
   * Get memory details from blockchain
   * @param {Number} memoryId - Memory ID on chain
   */
  async getMemoryFromChain(memoryId) {
    try {
      if (!this.contract) {
        return { success: false, message: 'Contract not deployed' };
      }

      const memory = await this.contract.getMemory(memoryId);
      
      return {
        success: true,
        ipfsHash: memory.ipfsHash,
        owner: memory.owner,
        timestamp: new Date(Number(memory.timestamp) * 1000)
      };
    } catch (error) {
      throw new Error(`Failed to get memory from chain: ${error.message}`);
    }
  }

  /**
   * Get all memories for a user
   * @param {String} walletAddress - User's wallet address
   */
  async getUserMemoriesFromChain(walletAddress) {
    try {
      if (!this.contract) {
        return { success: false, message: 'Contract not deployed' };
      }

      const memoryIds = await this.contract.getUserMemories(walletAddress);
      return {
        success: true,
        memoryIds: memoryIds.map(id => id.toString())
      };
    } catch (error) {
      throw new Error(`Failed to get user memories: ${error.message}`);
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice() {
    try {
      const feeData = await this.provider.getFeeData();
      return {
        gasPrice: ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei',
        maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') + ' gwei' : null
      };
    } catch (error) {
      throw new Error(`Failed to get gas price: ${error.message}`);
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance() {
    try {
      if (!this.wallet) {
        return { success: false, message: 'Wallet not initialized' };
      }
      
      const balance = await this.provider.getBalance(this.wallet.address);
      return {
        success: true,
        address: this.wallet.address,
        balance: ethers.formatEther(balance) + ' MATIC'
      };
    } catch (error) {
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Create hash for verification
   * @param {String} data - Data to hash
   */
  createHash(data) {
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }

  /**
   * Verify signature
   * @param {String} message - Original message
   * @param {String} signature - Signature to verify
   */
  verifySignature(message, signature) {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return { success: true, address: recoveredAddress };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new BlockchainService();