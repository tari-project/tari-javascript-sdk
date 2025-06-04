# Basic Exchange Example

A simple demonstration of how to integrate Tari wallet functionality into an exchange or payment service.

## Features

- Hot wallet management
- Deposit address generation for users
- Real-time deposit monitoring
- Balance tracking and reporting
- Event-driven architecture
- Graceful shutdown handling

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. (Optional) Edit `.env` with your own seed words:
```bash
# WARNING: Never use real seed words in development!
SEED_WORDS="your twenty four word test seed phrase here..."
```

## Running

Start the exchange:
```bash
npm start
```

Or with auto-restart on changes:
```bash
npm run dev
```

## What You'll See

The example will:

1. **Connect** to Tari testnet
2. **Display** wallet address and balance
3. **Generate** deposit addresses for sample users (alice, bob, charlie, diana)
4. **Monitor** for incoming transactions
5. **Report** balance updates every 30 seconds
6. **Handle** deposits with confirmation tracking

## Sample Output

```
🏪 Starting Tari Basic Exchange Example...

📡 Connecting to Tari network...
✅ Connected to Tari testnet

🏛️  Exchange Hot Wallet Information:
   Address: 🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳🎮🎪🎨🎭🎯🎲🎸🎺🎻🎰🎱🎳

💰 Initial Wallet Balance:
   Available: 0.000000 XTR
   Pending:   0.000000 XTR
   Total:     0.000000 XTR

👥 Creating deposit addresses for users...
   alice   : 🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳🎮...
   bob     : 🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳🎮...
   charlie : 🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳🎮...
   diana   : 🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳🎮...

🏪 Exchange is now running...
📊 Balance updates every 30 seconds
💰 Watching for incoming deposits
⚡ Press Ctrl+C to stop
```

## Testing Deposits

To test deposit functionality:

1. Send testnet Tari to the displayed wallet address
2. Watch for deposit events in the console
3. See balance updates as transactions confirm

## Key Concepts Demonstrated

### Deposit Management
```javascript
const deposits = new DepositManager(wallet);

// Generate addresses for users
const address = await deposits.generateAddress('user123');

// Listen for deposits
deposits.on('deposit', (event) => {
  console.log(`User ${event.userId} deposited ${formatTari(event.amount)}`);
});
```

### Event Handling
```javascript
wallet.on('transaction-received', (tx) => {
  console.log('New transaction:', tx.id);
});

wallet.on('balance-updated', (balance) => {
  console.log('Balance changed:', formatTari(balance.available));
});
```

### Error Handling
```javascript
try {
  await wallet.connect();
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    console.log('Connection failed, retrying...');
  }
}
```

## Next Steps

This example shows basic functionality. For production use, consider:

- Database integration for persistent user accounts
- Withdrawal processing with `WithdrawalProcessor`
- REST API for external integration
- Better error handling and recovery
- Logging and monitoring
- Security measures for seed phrase storage

See the `exchange-advanced` example for a more complete implementation.
