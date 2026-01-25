import axios from 'axios';
import FormData from 'form-data';

class IPFSService {
  constructor() {
    this.pinataApiKey = process.env.PINATA_API_KEY;
    this.pinataSecretKey = process.env.PINATA_API_SECRET;
    this.pinataJWT = process.env.PINATA_JWT;
    this.pinataBaseUrl = 'https://api.pinata.cloud';
    this.gatewayUrl = 'https://gateway.pinata.cloud/ipfs';
  }

  /**
   * Pin JSON data to IPFS
   * @param {Object} jsonData - JSON data to pin
   * @param {Object} metadata - Optional metadata
   */
  async pinJSON(jsonData, metadata = {}) {
    try {
      const data = {
        pinataContent: jsonData,
        pinataMetadata: {
          name: metadata.name || 'LifeVault Memory',
          keyvalues: metadata.keyvalues || {}
        },
        pinataOptions: {
          cidVersion: 1
        }
      };

      const response = await axios.post(
        `${this.pinataBaseUrl}/pinning/pinJSONToIPFS`,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.pinataJWT}`
          }
        }
      );

      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        pinSize: response.data.PinSize,
        timestamp: response.data.Timestamp,
        gatewayUrl: `${this.gatewayUrl}/${response.data.IpfsHash}`
      };
    } catch (error) {
      console.error('IPFS Pin JSON Error:', error.response?.data || error.message);
      throw new Error(`Failed to pin to IPFS: ${error.message}`);
    }
  }

  /**
   * Pin file buffer to IPFS
   * @param {Buffer} fileBuffer - File buffer
   * @param {String} fileName - Original file name
   * @param {Object} metadata - Optional metadata
   */
  async pinFile(fileBuffer, fileName, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename: fileName });
      
      const pinataMetadata = JSON.stringify({
        name: fileName,
        keyvalues: {
          ...metadata,
          uploadedAt: new Date().toISOString()
        }
      });
      formData.append('pinataMetadata', pinataMetadata);

      const pinataOptions = JSON.stringify({
        cidVersion: 1
      });
      formData.append('pinataOptions', pinataOptions);

      const response = await axios.post(
        `${this.pinataBaseUrl}/pinning/pinFileToIPFS`,
        formData,
        {
          maxBodyLength: Infinity,
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.pinataJWT}`
          }
        }
      );

      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        pinSize: response.data.PinSize,
        timestamp: response.data.Timestamp,
        gatewayUrl: `${this.gatewayUrl}/${response.data.IpfsHash}`
      };
    } catch (error) {
      console.error('IPFS Pin File Error:', error.response?.data || error.message);
      throw new Error(`Failed to pin file to IPFS: ${error.message}`);
    }
  }

  /**
   * Pin Base64 encoded data to IPFS
   * @param {String} base64Data - Base64 encoded file data
   * @param {String} fileName - File name
   * @param {Object} metadata - Optional metadata
   */
  async pinBase64(base64Data, fileName, metadata = {}) {
    try {
      // Remove data URL prefix if present
      const base64Content = base64Data.replace(/^data:.*?;base64,/, '');
      const buffer = Buffer.from(base64Content, 'base64');
      
      return await this.pinFile(buffer, fileName, metadata);
    } catch (error) {
      throw new Error(`Failed to pin base64 to IPFS: ${error.message}`);
    }
  }

  /**
   * Get file from IPFS
   * @param {String} ipfsHash - IPFS hash (CID)
   */
  async getFile(ipfsHash) {
    try {
      const response = await axios.get(`${this.gatewayUrl}/${ipfsHash}`, {
        responseType: 'arraybuffer'
      });
      
      return {
        success: true,
        data: response.data,
        contentType: response.headers['content-type']
      };
    } catch (error) {
      throw new Error(`Failed to get file from IPFS: ${error.message}`);
    }
  }

  /**
   * Unpin file from IPFS
   * @param {String} ipfsHash - IPFS hash to unpin
   */
  async unpin(ipfsHash) {
    try {
      await axios.delete(
        `${this.pinataBaseUrl}/pinning/unpin/${ipfsHash}`,
        {
          headers: {
            'Authorization': `Bearer ${this.pinataJWT}`
          }
        }
      );
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to unpin from IPFS: ${error.message}`);
    }
  }

  /**
   * List all pinned files
   */
  async listPins() {
    try {
      const response = await axios.get(
        `${this.pinataBaseUrl}/data/pinList?status=pinned`,
        {
          headers: {
            'Authorization': `Bearer ${this.pinataJWT}`
          }
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list pins: ${error.message}`);
    }
  }
}

export default new IPFSService();