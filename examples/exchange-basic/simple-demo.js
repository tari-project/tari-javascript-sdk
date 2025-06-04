const { TariWallet, DepositManager, formatTari, parseTari, WalletEvent } = require('@tari-project/wallet');
const { Network } = require('@tari-project/core');

console.log('🏪 Tari JavaScript SDK Example\n');

// Create a wallet configuration
console.log('📋 Creating wallet configuration...');
const config = {
  network: Network.Testnet,
  seedWords: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
  dbPath: './demo-wallet-data'
};

console.log(`   Network: ${config.network === Network.Testnet ? 'Testnet' : 'Unknown'}`);
console.log(`   Seed words: ${config.seedWords.split(' ').length} words`);
console.log(`   Database path: ${config.dbPath}\n`);

// Demonstrate wallet builder pattern
console.log('🔨 Using wallet builder pattern...');
try {
  const wallet = TariWallet.builder()
    .network(Network.Testnet)
    .seedWords('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art')
    .dataDirectory('./demo-data')
    .build();
  
  console.log('✅ Wallet created successfully using builder pattern');
  console.log('   Type:', typeof wallet);
  console.log('   Constructor:', wallet.constructor.name);
  
  // Check available methods
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(wallet))
    .filter(name => typeof wallet[name] === 'function' && name !== 'constructor');
  
  console.log(`   Available methods: ${methods.join(', ')}\n`);
  
  // Try to connect (this might fail if native bindings aren't complete)
  console.log('🌐 Attempting to connect...');
  
  // Since we expect this to fail with incomplete native bindings, wrap in try/catch
  wallet.connect().then(() => {
    console.log('✅ Successfully connected to network!');
  }).catch(error => {
    console.log(`⚠️  Connection failed (expected with incomplete native bindings):`);
    console.log(`   ${error.message}`);
    console.log('   This is normal in the development/testing phase.\n');
    
    // Demonstrate other SDK features that don't require native connection
    demonstrateSDKFeatures();
  });

} catch (error) {
  console.error('❌ Error creating wallet:', error.message);
  if (error.code) {
    console.error(`   Error code: ${error.code}`);
  }
  
  // Still show SDK features
  demonstrateSDKFeatures();
}

function demonstrateSDKFeatures() {
  console.log('🔧 Demonstrating SDK utility functions...\n');
  
  // Test utility functions
  console.log('💰 Amount formatting examples:');
  const amounts = [0n, 1000000n, 1500000n, 123456789000000n];
  
  amounts.forEach(amount => {
    console.log(`   ${amount.toString().padStart(15)} microTari = ${formatTari(amount)}`);
  });
  
  console.log('\n📊 Amount parsing examples:');
  const strings = ['0', '1.000000', '1.5', '123456.789'];
  
  strings.forEach(str => {
    try {
      const parsed = parseTari(str);
      console.log(`   "${str}" = ${parsed} microTari`);
    } catch (error) {
      console.log(`   "${str}" = ERROR: ${error.message}`);
    }
  });
  
  console.log('\n🎯 Available wallet events:');
  const events = Object.values(WalletEvent);
  events.forEach(event => {
    console.log(`   - ${event}`);
  });
  
  console.log('\n✅ SDK demonstration complete!');
  console.log('\n📚 Next steps:');
  console.log('   1. Complete the native Rust bindings implementation');
  console.log('   2. Run integration tests with real network connection');
  console.log('   3. Build your exchange integration using this SDK');
  console.log('\n   See README.md for more information.');
}
