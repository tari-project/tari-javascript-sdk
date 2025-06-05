const { TariWallet, DepositManager, formatTari, parseTari, WalletEvent } = require('@tari-project/wallet');
const { Network } = require('@tari-project/core');
require('dotenv').config();

async function main() {
  console.log('🏪 Starting Tari Basic Exchange Example...\n');

  // Create hot wallet for the exchange
  const wallet = TariWallet.builder()
    .network(Network.Testnet)
    .seedWords(process.env.SEED_WORDS || generateTestSeedWords())
    .dataDirectory('./exchange-data')
    .build();

  let isShuttingDown = false;

  try {
    // Connect to network
    console.log('📡 Connecting to Tari network...');
    await wallet.connect();
    console.log('✅ Connected to Tari testnet\n');

    // Show wallet info
    const address = wallet.getReceiveAddress();
    console.log('🏛️  Exchange Hot Wallet Information:');
    console.log(`   Address: ${address}`);
    console.log('');

    // Check initial balance
    const balance = await wallet.getBalance();
    console.log('💰 Initial Wallet Balance:');
    console.log(`   Available: ${formatTari(balance.available)}`);
    console.log(`   Pending:   ${formatTari(balance.pending)}`);
    console.log(`   Total:     ${formatTari(balance.total)}`);
    console.log('');

    // Set up deposit management
    const deposits = new DepositManager(wallet);
    deposits.initialize();
    
    // Simulate user onboarding
    console.log('👥 Creating deposit addresses for users...');
    const users = ['alice', 'bob', 'charlie', 'diana'];
    
    for (const user of users) {
      const addr = await deposits.generateAddress(user);
      console.log(`   ${user.padEnd(8)}: ${addr.substring(0, 25)}...`);
    }
    console.log('');

    // Set up event listeners
    setupWalletEvents(wallet);
    setupDepositEvents(deposits);

    // Start periodic balance reporting
    const balanceInterval = setInterval(async () => {
      if (isShuttingDown) return;
      
      try {
        const currentBalance = await wallet.getBalance();
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 💼 Current Balance: ${formatTari(currentBalance.available)}`);
        
        // Show deposit statistics
        const stats = deposits.getStatistics();
        if (stats.totalDeposits > 0) {
          console.log(`[${timestamp}] 📊 Deposits: ${stats.totalDeposits} users, ${formatTari(stats.totalVolume)} total volume`);
        }
      } catch (error) {
        console.error('Error checking balance:', error.message);
      }
    }, 30000); // Every 30 seconds

    // Simulate some test transactions for demo
    setTimeout(() => simulateTestActivity(wallet, deposits), 10000);

    // Keep running
    console.log('🏪 Exchange is now running...');
    console.log('📊 Balance updates every 30 seconds');
    console.log('💰 Watching for incoming deposits');
    console.log('⚡ Press Ctrl+C to stop\n');

    // Handle shutdown gracefully
    const shutdown = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      
      console.log('\n🛑 Shutting down exchange...');
      clearInterval(balanceInterval);
      
      try {
        deposits.teardown();
        console.log('✅ Deposit manager cleaned up');
        
        await wallet.close();
        console.log('✅ Wallet disconnected');
        
        console.log('👋 Exchange shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('❌ Error starting exchange:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    process.exit(1);
  }
}

function setupWalletEvents(wallet) {
  wallet.on(WalletEvent.Connected, (info) => {
    console.log('🌐 Wallet connected to network');
    if (info.baseNode) {
      console.log(`   Base node: ${info.baseNode}`);
    }
  });

  wallet.on(WalletEvent.Disconnected, (info) => {
    console.log(`❌ Wallet disconnected: ${info.reason}`);
  });

  wallet.on(WalletEvent.BalanceUpdated, (balance) => {
    console.log(`💰 Balance updated: ${formatTari(balance.available)} available`);
  });

  wallet.on(WalletEvent.TransactionReceived, (tx) => {
    console.log('📥 Incoming transaction detected:');
    console.log(`   Amount: ${formatTari(tx.amount)}`);
    console.log(`   TX ID: ${tx.id}`);
    console.log(`   Confirmations: ${tx.confirmations}`);
  });

  wallet.on(WalletEvent.TransactionConfirmed, (tx) => {
    console.log(`✅ Transaction confirmed: ${tx.id} (${tx.confirmations} confirmations)`);
  });
}

function setupDepositEvents(deposits) {
  deposits.on('deposit', (event) => {
    console.log('\n💰 DEPOSIT RECEIVED!');
    console.log(`   User: ${event.userId}`);
    console.log(`   Amount: ${formatTari(event.amount)}`);
    console.log(`   TX ID: ${event.txId}`);
    console.log(`   Confirmations: ${event.confirmations}`);
    
    if (event.confirmations >= 6) {
      console.log('   ✅ Fully confirmed - can credit user account');
    } else {
      console.log(`   ⏳ Waiting for confirmations (${event.confirmations}/6)`);
    }
    console.log('');
  });

  deposits.on('confirmed', (event) => {
    console.log(`✅ Deposit confirmed for user ${event.userId}`);
    console.log(`   Amount: ${formatTari(event.amount)}`);
    console.log(`   Transaction: ${event.txId}`);
    console.log('   💳 User account can now be credited\n');
  });
}

async function simulateTestActivity(wallet, deposits) {
  console.log('🎭 Simulating some test activity...\n');
  
  try {
    // Show how to check if we have funds to send
    const balance = await wallet.getBalance();
    if (balance.available > parseTari('0.1')) {
      console.log('💸 Would send test transaction, but this is demo mode');
      console.log('   (Uncomment sendTransaction code to actually send)');
      
      // Uncomment to actually send a transaction:
      /*
      const tx = await wallet.sendTransaction({
        destination: 'recipient_emoji_address_here',
        amount: parseTari('0.01'),
        message: 'Test transaction from exchange'
      });
      console.log(`📤 Test transaction sent: ${tx.id}`);
      */
    } else {
      console.log('ℹ️  No funds available for test transactions');
      console.log('   Send some testnet Tari to this wallet to see transaction handling');
    }

    // Show deposit address lookup
    console.log('\n📋 Current deposit addresses:');
    const allAddresses = deposits.getAllAddresses();
    allAddresses.forEach(deposit => {
      console.log(`   ${deposit.userId}: ${formatTari(deposit.totalReceived)} received`);
    });

  } catch (error) {
    console.error('Error in test simulation:', error.message);
  }
}

function generateTestSeedWords() {
  // Generate deterministic test seed words for demo
  const words = [
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'art'
  ];
  return words.join(' ');
}

// Run the example
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
