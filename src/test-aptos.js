// test-aptos.js
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

async function testAptos() {
  try {
    const config = new AptosConfig({ network: Network.DEVNET });
    const aptos = new Aptos(config);
    
    // Test connection
    const ledgerInfo = await aptos.getLedgerInfo();
    console.log('✅ Connected to Aptos');
    console.log(`Chain ID: ${ledgerInfo.chain_id}`);
    
    // Test account generation
    const testAccount = Account.generate();
    console.log(`Test Account: ${testAccount.accountAddress.toString()}`);
    
    return true;
  } catch (error) {
    console.error('Test failed:', error);
    return false;
  }
}

testAptos();