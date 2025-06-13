# Quick Start

Get up and running with the Tari JavaScript SDK in just 5 minutes! This guide will walk you through creating your first wallet, checking balances, and sending transactions.

## Prerequisites

Before starting, ensure you have:
- ✅ [Node.js 18+](https://nodejs.org/) installed
- ✅ [Installed the Tari SDK](./installation.md)
- ✅ Basic knowledge of JavaScript/TypeScript

## Your First Wallet (2 minutes)

### Step 1: Create a New Project

```bash
# Create a new directory
mkdir my-tari-wallet
cd my-tari-wallet

# Initialize npm project
npm init -y

# Install Tari SDK
npm install @tari-project/tarijs-wallet

# Install TypeScript (optional but recommended)
npm install --save-dev typescript @types/node ts-node
```

### Step 2: Create Your First Wallet

Create a file called `my-wallet.ts` (or `my-wallet.js` for JavaScript):

```typescript
import { TariWallet, NetworkType, createSecureStorage } from '@tari-project/tarijs-wallet';

async function createWallet() {
  try {
    console.log('🚀 Creating your first Tari wallet...\n');
    
    // Create secure storage with automatic platform detection
    const storage = await createSecureStorage({
      enableCaching: true,    // Improve performance
      enableBatching: true,   // Optimize FFI calls
      testBackends: true      // Verify storage availability
    });
    
    console.log(`✅ Storage backend: ${storage.backend}`);
    
    // Create a new wallet
    const wallet = await TariWallet.create({
      network: NetworkType.Testnet,     // Use testnet for development
      storagePath: './wallet-data',     // Local storage path
      logLevel: 'info',                 // Enable logging
      storage: storage                  // Use secure storage
    });
    
    console.log('✅ Wallet created successfully!\n');
    
    // Get wallet address
    const address = await wallet.getAddress();
    console.log('📍 Your wallet address:');
    console.log(`   Base58: ${address.toString()}`);
    console.log(`   Emoji:  ${address.toEmojiId()}\n`);
    
    // Check initial balance
    const balance = await wallet.getBalance();
    console.log('💰 Current balance:');
    console.log(`   Available: ${balance.available} µT`);
    console.log(`   Pending:   ${balance.pendingIncoming} µT`);
    console.log(`   Total:     ${balance.available + balance.pendingIncoming} µT\n`);
    
    // Set up event listeners for real-time updates
    wallet.on('onTransactionReceived', (transaction) => {
      console.log(`🎉 Received ${transaction.amount} µT!`);
    });
    
    wallet.on('onBalanceUpdated', (newBalance) => {
      console.log(`💰 Balance updated: ${newBalance.available} µT available`);
    });
    
    console.log('👂 Listening for transactions and balance updates...');
    console.log('💡 Send some testnet Tari to your address to see live updates!\n');
    
    // Keep the wallet running for 30 seconds to demonstrate events
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Clean up
    await wallet.destroy();
    console.log('✅ Wallet closed successfully');
    
  } catch (error) {
    console.error('❌ Error creating wallet:', error);
  }
}

// Run the example
createWallet();
```

### Step 3: Run Your Wallet

```bash
# TypeScript
npx ts-node my-wallet.ts

# JavaScript (compile first)
npx tsc my-wallet.ts
node my-wallet.js
```

You should see output like:
```
🚀 Creating your first Tari wallet...

✅ Storage backend: TauriSecureStorage
✅ Wallet created successfully!

📍 Your wallet address:
   Base58: 7e2b8c9d4f5a6b3e8c1d9f2a5b8c4e7f1a2b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f
   Emoji:  🌟🎯🚀⭐🎨🌙✨🎭🎪🎨🌟🎯🚀⭐🎨🌙✨🎭🎪🎨🌟🎯🚀⭐🎨🌙✨🎭🎪🎨🌟🎯🚀

💰 Current balance:
   Available: 0 µT
   Pending:   0 µT
   Total:     0 µT

👂 Listening for transactions and balance updates...
💡 Send some testnet Tari to your address to see live updates!
```

## Getting Test Funds (1 minute)

To test transactions, you'll need some testnet Tari:

### Option 1: Community Faucet
1. Copy your wallet address from the output above
2. Join the [Tari Discord](https://discord.gg/tari)
3. Request testnet funds in the #faucet channel
4. Provide your testnet address

### Option 2: Mining (Advanced)
Set up a Tari miner to mine directly to your wallet address.

## Sending Your First Transaction (2 minutes)

Once you have test funds, create `send-transaction.ts`:

```typescript
import { TariWallet, NetworkType, createSecureStorage } from '@tari-project/tarijs-wallet';

async function sendTransaction() {
  try {
    console.log('💸 Sending your first transaction...\n');
    
    // Create storage and wallet (same as before)
    const storage = await createSecureStorage({ enableCaching: true });
    const wallet = await TariWallet.create({
      network: NetworkType.Testnet,
      storagePath: './wallet-data',
      storage: storage
    });
    
    // Check balance before sending
    const balance = await wallet.getBalance();
    console.log(`💰 Current balance: ${balance.available} µT`);
    
    if (balance.available === 0n) {
      console.log('⚠️  No funds available. Get some testnet Tari first!');
      await wallet.destroy();
      return;
    }
    
    // Estimate fees for the transaction
    const amount = 1000000n; // 0.001 Tari (1,000,000 microTari)
    const recipientAddress = 'RECIPIENT_ADDRESS_HERE'; // Replace with actual address
    
    const feeEstimate = await wallet.estimateFee(amount, {
      recipient: recipientAddress,
      message: 'My first Tari transaction! 🎉'
    });
    
    console.log(`📊 Estimated fee: ${feeEstimate.fee} µT`);
    console.log(`💰 Total cost: ${amount + feeEstimate.fee} µT`);
    
    if (balance.available < amount + feeEstimate.fee) {
      console.log('⚠️  Insufficient funds for transaction + fees');
      await wallet.destroy();
      return;
    }
    
    // Send the transaction
    console.log('🚀 Sending transaction...');
    const txId = await wallet.sendTransaction(
      recipientAddress,
      amount,
      {
        message: 'My first Tari transaction! 🎉',
        feePerGram: feeEstimate.feePerGram
      }
    );
    
    console.log(`✅ Transaction sent! ID: ${txId.toString()}`);
    
    // Monitor transaction status
    console.log('👂 Monitoring transaction status...');
    
    wallet.on('onTransactionStatusUpdate', (update) => {
      console.log(`📊 Transaction ${update.txId.toString()}: ${update.status}`);
    });
    
    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
    
    // Check final balance
    const finalBalance = await wallet.getBalance();
    console.log(`💰 Final balance: ${finalBalance.available} µT`);
    
    await wallet.destroy();
    console.log('✅ Transaction monitoring complete');
    
  } catch (error) {
    console.error('❌ Error sending transaction:', error);
  }
}

sendTransaction();
```

Run it:
```bash
npx ts-node send-transaction.ts
```

## Platform Optimization

Your wallet automatically optimizes for your platform:

### Tauri Applications (Best Performance)
```typescript
import { PlatformDetector } from '@tari-project/tarijs-wallet';

const platform = PlatformDetector.detect();
if (platform.runtime === 'tauri') {
  console.log('🦀 Tauri optimization active!');
  console.log('- 60% lower memory usage');
  console.log('- 10x faster startup');
  console.log('- Hardware-backed security');
}
```

### Electron Applications
```typescript
// Electron-specific security enhancements are automatically applied
const wallet = await TariWallet.create({
  network: NetworkType.Testnet,
  storagePath: './wallet-data',
  // Context isolation and IPC security enabled automatically
});
```

## Real-Time Features

The SDK provides comprehensive event handling:

```typescript
// Set up comprehensive event listeners
wallet.on('onTransactionReceived', (tx) => {
  console.log(`🎉 Received ${tx.amount} µT from ${tx.source.slice(0, 8)}...`);
});

wallet.on('onTransactionSent', (tx) => {
  console.log(`💸 Sent ${tx.amount} µT to ${tx.destination.slice(0, 8)}...`);
});

wallet.on('onBalanceUpdated', (balance) => {
  console.log(`💰 Balance: ${balance.available} µT available`);
});

wallet.on('onConnectionStatusChanged', (status) => {
  console.log(`🌐 Network: ${status.connected ? 'Connected' : 'Disconnected'}`);
});

wallet.on('onSyncProgress', (progress) => {
  console.log(`🔄 Sync: ${progress.percentage}% complete`);
});
```

## Error Handling

Always implement proper error handling:

```typescript
import { TariError, ErrorCode } from '@tari-project/tarijs-wallet';

try {
  await wallet.sendTransaction(recipient, amount);
} catch (error) {
  if (error instanceof TariError) {
    switch (error.code) {
      case ErrorCode.InsufficientFunds:
        console.error('💰 Not enough funds for transaction');
        break;
      case ErrorCode.InvalidAddress:
        console.error('📍 Invalid recipient address');
        break;
      case ErrorCode.NetworkError:
        console.error('🌐 Network connection error');
        break;
      default:
        console.error(`❌ Wallet error: ${error.message}`);
    }
  } else {
    console.error('❌ Unexpected error:', error);
  }
}
```

## Next Steps

🎉 **Congratulations!** You've successfully:
- ✅ Created your first Tari wallet
- ✅ Checked balances and addresses
- ✅ Set up real-time event monitoring
- ✅ Sent your first transaction (with test funds)

### Continue Learning

1. **[Detailed Wallet Guide](./first-wallet.md)** - Deep dive into wallet features
2. **[Configuration Options](./configuration.md)** - Customize networks and storage
3. **[API Documentation](../api/wallet-creation.md)** - Explore all available methods
4. **[Platform Integration](../platforms/nodejs.md)** - Platform-specific guides
5. **[Example Applications](../../examples/)** - Complete application examples

### Join the Community

- 💬 **[Discord](https://discord.gg/tari)** - Get help and connect with developers
- 🐛 **[GitHub](https://github.com/tari-project/tari-javascript-sdk)** - Report issues and contribute
- 📖 **[Tari Docs](https://docs.tari.com/)** - Learn about the Tari ecosystem

Happy building! 🚀
