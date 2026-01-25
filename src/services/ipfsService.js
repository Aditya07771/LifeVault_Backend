import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';

// Ensure env variables are loaded even if called out of order
dotenv.config();

class IPFSService {
  constructor() {
    this.pinataBaseUrl = 'https://api.pinata.cloud';
    this.gatewayUrl = 'https://gateway.pinata.cloud/ipfs';
  }

  // Get JWT dynamically to ensure it's loaded from process.env
  getHeaders() {
    const jwt = process.env.PINATA_JWT;
    
    if (!jwt) {
      console.error("❌ CRITICAL: PINATA_JWT is missing from process.env");
      throw new Error("Pinata JWT not configured");
    }

    return {
      'Authorization': `Bearer ${jwt.trim()}`
    };
  }

  async pinJSON(jsonData, metadata = {}) {
    try {
      const response = await axios.post(
        `${this.pinataBaseUrl}/pinning/pinJSONToIPFS`,
        {
          pinataContent: jsonData,
          pinataMetadata: { name: metadata.name || 'LifeVault Memory' }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders()
          }
        }
      );

      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        gatewayUrl: `${this.gatewayUrl}/${response.data.IpfsHash}`
      };
    } catch (error) {
      console.error('IPFS JSON Pin Error:', error.response?.data || error.message);
      throw new Error(`Failed to pin to IPFS: ${error.message}`);
    }
  }

  async pinFile(fileBuffer, fileName, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename: fileName });
      formData.append('pinataMetadata', JSON.stringify({ name: fileName }));

      const response = await axios.post(
        `${this.pinataBaseUrl}/pinning/pinFileToIPFS`,
        formData,
        {
          maxBodyLength: Infinity,
          headers: {
            ...formData.getHeaders(),
            ...this.getHeaders() // Calling the helper here
          }
        }
      );

      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        gatewayUrl: `${this.gatewayUrl}/${response.data.IpfsHash}`
      };
    } catch (error) {
      console.error('IPFS File Pin Error:', error.response?.data || error.message);
      throw new Error(`Failed to pin file to IPFS: ${error.message}`);
    }
  }

  async pinBase64(base64Data, fileName, metadata = {}) {
    if (!base64Data) throw new Error("No base64 data provided");
    const base64Content = base64Data.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');
    return await this.pinFile(buffer, fileName, metadata);
  }

  async getFile(ipfsHash) {
    const response = await axios.get(`${this.gatewayUrl}/${ipfsHash}`, {
      responseType: 'arraybuffer'
    });
    return {
      success: true,
      data: response.data,
      contentType: response.headers['content-type']
    };
  }
}

export default new IPFSService();