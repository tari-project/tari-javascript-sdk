// Simple exchange example using the new FFI-based SDK
// This follows the same pattern as iOS/Android mobile wallets

const { 
  ffi, 
  withWallet, 
  createTestnetWallet,
  formatBalance, 
  parseBalance,
  Network,
  TariFFIError 
} = require('@tari/sdk');
require('dotenv').config();

// =============================================================================
// SIMPLE EXCHANGE BUSINESS LOGIC (Application Layer)
// This is where your exchange implements its own business logic
// =============================================================================

class ExchangeDepositManager {
  constructor() {
    this.userAddresses = new Map(); // userId -> address mapping
    this.deposits = new Map();      // address -> deposit info
  }

  // Generate a deposit address for a user
  generateAddress(userId, walletHandle) {
    const addressInfo = ffi.getAddress(walletHandle);
    const address = addressInfo.emojiId;
    
    this.userAddresses.set(userId, address);
    this.deposits.set(address, {
      userId,
      totalReceived: BigInt(0),
      transactions: []
    });
    
    return address;
  }

  // Check if an address belongs to a user
  getUserForAddress(address) {
    const deposit = this.deposits.get(address);
    return deposit ? deposit.userId : null;
  }

  // Get all deposit info
  getAllDeposits() {
    return Array.from(this.deposits.values());
  }

  // Record a deposit
  recordDeposit(address, amount, txId) {
    const deposit = this.deposits.get(address);
    if (!deposit) return false;

    deposit.totalReceived += amount;
    deposit.transactions.push({ amount, txId, timestamp: new Date() });
    
    console.log(`💰 DEPOSIT: User ${deposit.userId} received ${formatBalance(amount)} (Total: ${formatBalance(deposit.totalReceived)})`);
    return true;
  }
}

// =============================================================================
// MAIN EXCHANGE APPLICATION
// =============================================================================

async function main() {
  console.log('🏪 Starting Simple Tari Exchange (FFI-based SDK)...\n');

  // Exchange business logic
  const depositManager = new ExchangeDepositManager();
  
  // Network configuration
  const networkName = process.env.TARI_NETWORK || 'testnet';
  const network = networkName.toLowerCase() === 'mainnet' ? Network.Mainnet : Network.Testnet;
  
  // Wallet configuration (simple!)
  const seedWords = process.env.SEED_WORDS || generateTestSeedWords();
  
  console.log(`📡 Using ${networkName} network`);
  console.log('🔑 Wallet seed loaded from environment\n');

  // Use the simple FFI approach with automatic cleanup
  await withWallet(
    { 
      seedWords, 
      network,
      dbPath: process.env.DATA_DIRECTORY || './exchange-data',
      dbName: 'exchange_wallet'
    },
    async (walletHandle) => {
      console.log('✅ Wallet created successfully');
      
      // Get wallet address
      const addressInfo = ffi.getAddress(walletHandle);
      console.log('🏛️ Exchange Hot Wallet:');
      console.log(`   Address: ${addressInfo.emojiId}\n`);
      
      // Check initial balance
      const balance = ffi.getBalance(walletHandle);
      console.log('💰 Initial Balance:');
      console.log(`   Available: ${formatBalance(balance.available)}`);
      console.log(`   Pending:   ${formatBalance(balance.pending)}`);
      console.log(`   Total:     ${formatBalance(balance.total)}\n`);
      
      // Create deposit addresses for demo users
      console.log('👥 Creating deposit addresses...');
      const users = ['alice', 'bob', 'charlie', 'diana'];
      
      users.forEach(user => {
        // In a real exchange, each user would get a unique address
        // For this demo, we'll just use the main wallet address
        const address = addressInfo.emojiId;
        depositManager.userAddresses.set(user, address);
        depositManager.deposits.set(address, {
          userId: user,
          totalReceived: BigInt(0),
          transactions: []
        });
        console.log(`   ${user.padEnd(8)}: ${address.substring(0, 25)}...`);
      });
      console.log('');
      
      // Monitor for transactions (simple polling approach)
      console.log('🔄 Starting transaction monitoring...');
      let lastTransactionCount = 0;
      
      const monitorTransactions = async () => {
        try {
          const transactions = ffi.getCompletedTransactions(walletHandle);
          
          if (transactions.length > lastTransactionCount) {
            const newTransactions = transactions.slice(lastTransactionCount);
            
            newTransactions.forEach(tx => {
              if (!tx.isOutbound) { // Only process incoming transactions
                console.log('\n📥 New Incoming Transaction:');
                console.log(`   Amount: ${formatBalance(tx.amount)}`);
                console.log(`   ID: ${tx.id}`);
                console.log(`   Message: ${tx.message || 'No message'}`);
                
                // In a real exchange, you'd:
                // 1. Map the transaction to a user based on the destination address
                // 2. Wait for sufficient confirmations
                // 3. Credit the user's account
                
                // For demo, just record it
                depositManager.recordDeposit(addressInfo.emojiId, tx.amount, tx.id);
              }
            });
            
            lastTransactionCount = transactions.length;
          }
          
          // Show periodic balance update
          const currentBalance = ffi.getBalance(walletHandle);
          console.log(`[${new Date().toISOString()}] 💼 Balance: ${formatBalance(currentBalance.available)}`);
          
        } catch (error) {
          if (error instanceof TariFFIError) {
            console.error(`FFI Error: ${error.message} (Code: ${error.code})`);
          } else {
            console.error('Monitor error:', error.message);
          }
        }
      };
      
      // Start monitoring
      const monitorInterval = setInterval(monitorTransactions, 30000); // Every 30 seconds
      
      // Demo: show how to send a transaction (if we have funds)
      setTimeout(async () => {
        try {
          const balance = ffi.getBalance(walletHandle);
          if (balance.available > parseBalance('0.1')) {
            console.log('\n💸 Demo: Could send transaction');
            console.log('   (Uncomment code below to actually send)');
            
            // Example of how to send:
            /*
            const txId = ffi.sendTransaction(walletHandle, {
              destination: 'recipient_emoji_address_here',
              amount: parseBalance('0.01'),
              message: 'Test from exchange'
            });
            console.log(`📤 Transaction sent: ${txId}`);
            */
          } else {
            console.log('\nℹ️  No funds for demo transaction');
            console.log('   Send some testnet Tari to see transaction processing');
          }
        } catch (error) {
          console.log('Demo transaction error:', error.message);
        }
      }, 10000);
      
      // Keep running
      console.log('🏪 Exchange is running...');
      console.log('📊 Monitoring transactions every 30 seconds');
      console.log('⚡ Press Ctrl+C to stop\n');
      
      // Graceful shutdown
      const shutdown = () => {
        console.log('\n🛑 Shutting down exchange...');
        clearInterval(monitorInterval);
        
        console.log('📊 Final deposit summary:');
        depositManager.getAllDeposits().forEach(deposit => {
          if (deposit.totalReceived > 0) {
            console.log(`   ${deposit.userId}: ${formatBalance(deposit.totalReceived)}`);
          }
        });
        
        console.log('👋 Exchange shutdown complete');
        process.exit(0);
      };
      
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      
      // Keep the process alive
      await new Promise(() => {}); // Run forever until shutdown
    }
  );
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateTestSeedWords() {
  // Deterministic test seed for demo
  return [
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'art'
  ].join(' ');
}

// Run the exchange
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  if (error instanceof TariFFIError) {
    console.error(`   Error code: ${error.code}`);
  }
  process.exit(1);
});
