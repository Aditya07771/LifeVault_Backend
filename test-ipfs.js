import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

const test = async () => {
    console.log('\n🔍 DIAGNOSTIC START');
    try {
        const jwt = process.env.PINATA_JWT;
        if (!jwt) { 
            console.log('❌ No PINATA_JWT found in .env file'); 
            return; 
        }
        
        console.log('🔑 Testing JWT from .env...');
        await axios.get('https://api.pinata.cloud/data/testAuthentication', {
            headers: { Authorization: 'Bearer ' + jwt }
        });
        console.log('✅ SUCCESS: Your JWT is valid! The issue is in your code.');
    } catch (e) {
        console.log('❌ FAILED: Pinata rejected the key.');
        if (e.response) {
            console.log('   Status Code:', e.response.status);
            console.log('   Reason:', e.response.statusText);
        } else {
            console.log('   Error:', e.message);
        }
        console.log('\n👇 SOLUTION:');
        console.log('1. Go to https://app.pinata.cloud/developers/keys');
        console.log('2. Create a NEW Key (Select Admin).');
        console.log('3. Copy the huge JWT string.');
        console.log('4. Paste it into your .env file as PINATA_JWT=...');
    }
};
test();
