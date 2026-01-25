import axios from 'axios';
import FormData from 'form-data';

class IPFSService {
  constructor() {
    this.pinataJWT = process.env.PINATA_JWT;
    this.pinataBaseUrl = 'https://api.pinata.cloud';
    this.gatewayUrl = 'https://gateway.pinata.cloud/ipfs';
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
            'Authorization': `Bearer ${this.pinataJWT}`
          }
        }
      );

      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        gatewayUrl: `${this.gatewayUrl}/${response.data.IpfsHash}`
      };
    } catch (error) {
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
            'Authorization': `Bearer ${this.pinataJWT}`
          }
        }
      );

      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        gatewayUrl: `${this.gatewayUrl}/${response.data.IpfsHash}`
      };
    } catch (error) {
      throw new Error(`Failed to pin file to IPFS: ${error.message}`);
    }
  }

  async pinBase64(base64Data, fileName, metadata = {}) {
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

  async unpin(ipfsHash) {
    await axios.delete(`${this.pinataBaseUrl}/pinning/unpin/${ipfsHash}`, {
      headers: { 'Authorization': `Bearer ${this.pinataJWT}` }
    });
    return { success: true };
  }
}

export default new IPFSService();