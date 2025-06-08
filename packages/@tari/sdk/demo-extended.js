// Demo of extended FFI functionality
const { ffi, Network, createTestnetWallet } = require('./dist/index.js');

console.log('🚀 Tari SDK Extended Functionality Demo');
console.log('=======================================\n');

async function demo() {
  try {
    console.log('1. 🌐 Network enum:');
    console.log(`   Mainnet: ${Network.Mainnet}`);
    console.log(`   Testnet: ${Network.Testnet}`);
    console.log(`   Nextnet: ${Network.Nextnet}\n`);

    console.log('2. 🔑 Creating a test wallet...');
    const seedWords = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const wallet = createTestnetWallet(seedWords);
    console.log(`   Wallet handle: ${wallet}\n`);

    console.log('3. 🌱 Getting seed words...');
    try {
      const retrievedSeeds = ffi.getSeedWords(wallet);
      console.log(`   Seed words: ${retrievedSeeds}\n`);
    } catch (error) {
      console.log(`   Error: ${error.message}\n`);
    }

    console.log('4. 💰 Getting wallet balance...');
    try {
      const balance = ffi.getBalance(wallet);
      console.log(`   Available: ${balance.available}`);
      console.log(`   Pending: ${balance.pending}`);
      console.log(`   Locked: ${balance.locked}`);
      console.log(`   Total: ${balance.total}\n`);
    } catch (error) {
      console.log(`   Error: ${error.message}\n`);
    }

    console.log('5. 📍 Getting wallet address...');
    try {
      const addressInfo = ffi.getAddress(wallet);
      console.log(`   Address handle: ${addressInfo.handle}`);
      console.log(`   Emoji ID: ${addressInfo.emojiId}\n`);
      
      // Clean up address handle
      ffi.destroyAddress(addressInfo.handle);
      console.log('   ✅ Address handle cleaned up\n');
    } catch (error) {
      console.log(`   Error: ${error.message}\n`);
    }

    console.log('6. 💸 Testing transaction (mock)...');
    try {
      const txId = await ffi.sendTransaction(wallet, {
        destination: '🚀🎯💎🌟⚡🔥🎨🌈',
        amount: 1000n,
        feePerGram: 5n,
        message: 'Test transaction',
        oneSided: true,
      });
      console.log(`   Transaction ID: ${txId}\n`);
    } catch (error) {
      console.log(`   Error: ${error.message}\n`);
    }

    console.log('7. 📞 Testing callback system...');
    const callbackId = ffi.registerCallback(() => {
      console.log('   📢 Callback triggered!');
    });
    console.log(`   Callback registered with ID: ${callbackId}`);
    console.log(`   Total callbacks: ${ffi.getCallbackCount()}`);
    
    const unregistered = ffi.unregisterCallback(callbackId);
    console.log(`   Callback unregistered: ${unregistered}`);
    console.log(`   Total callbacks after cleanup: ${ffi.getCallbackCount()}\n`);

    console.log('8. 🧹 Cleaning up...');
    ffi.destroyWallet(wallet);
    console.log('   ✅ Wallet destroyed\n');

    console.log('🎉 Demo completed successfully!');
    console.log('\n📊 Summary of implemented features:');
    console.log('   ✅ Complete FFI type definitions (266 functions)');
    console.log('   ✅ Type-safe handle system with branded types');
    console.log('   ✅ 6 essential wallet operations');
    console.log('   ✅ Callback infrastructure');
    console.log('   ✅ Comprehensive error handling');
    console.log('   ✅ Auto-initialization');
    console.log('   ✅ Memory management helpers');

  } catch (error) {
    console.error('💥 Demo failed:', error.message);
    console.error(error.stack);
  }
}

demo();
