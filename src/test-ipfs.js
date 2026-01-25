// test-ipfs.js
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

dotenv.config();

const testPinataAuth = async () => {
  console.log('\n🔍 --- DIAGNOSTIC START ---');
  
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_API_SECRET;

  console.log(`🔑 JWT Loaded: ${jwt ? 'Yes (Length: ' + jwt.length + ')' : 'No'}`);
  console.log(`🔑 API Key Loaded: ${apiKey ? 'Yes' : 'No'}`);

  // Test 1: Try JWT
  if (jwt) {
    console.log('\n👉 Testing JWT Authentication...');
    try {
      await axios.get('https://api.pinata.cloud/data/testAuthentication', {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      console.log('✅ JWT is WORKING! The issue might be in your code logic.');
      return; 
    } catch (error) {
      console.error('❌ JWT Failed:', error.response?.status, error.response?.data || error.message);
    }
  }

  // Test 2: Try API Keys (Fallback)
  if (apiKey && apiSecret) {
    console.log('\n👉 Testing API Key/Secret Authentication...');
    try {
      await axios.get('https://api.pinata.cloud/data/testAuthentication', {
        headers: { 
          pinata_api_key: apiKey,
          pinata_secret_api_key: apiSecret
        }
      });
      console.log('✅ API Keys are WORKING! We should switch your service to use these.');
    } catch (error) {
      console.error('❌ API Keys Failed:', error.response?.status, error.response?.data || error.message);
    }
  }
  
  console.log('\n💡 CONCLUSION: If both failed, you MUST generate new keys at https://app.pinata.cloud/developers/keys');
};

testPinataAuth();