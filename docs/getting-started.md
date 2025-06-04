# Getting Started with Tari JavaScript SDK

## Installation

Install the Tari JavaScript SDK using your preferred package manager:

```bash
npm install @tari-project/wallet
# or
yarn add @tari-project/wallet
# or  
pnpm add @tari-project/wallet
```

For full node functionality with mining and P2P features:

```bash
npm install @tari-project/full
```

## Prerequisites

- Node.js 16 or later
- TypeScript 4.5+ (for TypeScript projects)
- Platform-specific build tools (see [Build Requirements](#build-requirements))

## Quick Start

### 1. Create Your First Wallet

```typescript
import { TariWallet, Network } from '@tari-project/wallet';

async function main() {
  // Create wallet with builder pattern
  const wallet = TariWallet.builder()
    .network(Network.Testnet)  // Use Testnet for development
    .seedWords('your twenty four word seed phrase goes here...')
    .dataDirectory('./wallet-data')
    .build();

  try {
    // Connect to Tari network
    console.log('Connecting to Tari network...');
    await wallet.connect();
    console.log('✓ Connected successfully!');

    // Get your deposit address
    const address = wallet.getReceiveAddress();
    console.log('Your address:', address);

    // Check balance
    const balance = await wallet.getBalance();
    console.log('Balance:', formatTari(balance.available));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await wallet.close();
  }
}

main();
```

### 2. Generating Seed Words

If you don't have seed words, the SDK can generate them:

```typescript
import { generateSeedWords } from '@tari-project/wallet';

// Generate new 24-word seed phrase
const seedWords = generateSeedWords();
console.log('🔐 Keep these words safe:', seedWords);

// Store securely (never log in production!)
const wallet = TariWallet.builder()
  .network(Network.Testnet)
  .seedWords(seedWords)
  .build();
```

### 3. Sending Your First Transaction

```typescript
try {
  const transaction = await wallet.sendTransaction({
    destination: '🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳🎮🎪🎨🎭🎯🎲🎸🎺🎻🎰🎱🎳',
    amount: parseTari('1.5'), // 1.5 XTR
    message: 'My first Tari transaction!'
  });
  
  console.log('Transaction sent!', transaction.id);
  
  // Monitor transaction status
  const unwatch = wallet.watchTransaction(transaction.id, (tx) => {
    console.log(`Confirmations: ${tx.confirmations}`);
    if (tx.confirmations >= 6) {
      console.log('Transaction fully confirmed!');
      unwatch(); // Stop monitoring
    }
  });

} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    console.log('❌ Not enough funds in wallet');
  } else {
    console.error('Transaction failed:', error.message);
  }
}
```

### 4. Listening for Incoming Transactions

```typescript
import { WalletEvent } from '@tari-project/wallet';

// Listen for incoming transactions
wallet.on(WalletEvent.TransactionReceived, (transaction) => {
  console.log(`💰 Received ${formatTari(transaction.amount)} XTR`);
  console.log(`From: ${transaction.source}`);
  console.log(`Message: ${transaction.message || 'No message'}`);
});

// Listen for balance changes
wallet.on(WalletEvent.BalanceUpdated, (balance) => {
  console.log(`💼 New balance: ${formatTari(balance.available)} XTR`);
});

// Listen for connection status
wallet.on(WalletEvent.Connected, () => {
  console.log('🌐 Wallet connected to network');
});

wallet.on(WalletEvent.Disconnected, (info) => {
  console.log('❌ Wallet disconnected:', info.reason);
});
```

## Exchange Integration

### Setting Up Deposit Management

For exchanges and services that need to handle user deposits:

```typescript
import { DepositManager } from '@tari-project/wallet';

const deposits = new DepositManager(wallet);

// Generate unique addresses for users
async function onboardUser(userId: string) {
  try {
    const address = await deposits.generateAddress(userId);
    
    // Save to your database
    await saveUserAddress(userId, address);
    
    console.log(`✓ Address created for ${userId}: ${address}`);
    return address;
  } catch (error) {
    console.error(`Failed to create address for ${userId}:`, error.message);
    throw error;
  }
}

// Monitor all incoming deposits
deposits.on('deposit', async (event) => {
  console.log(`💰 Deposit received!`);
  console.log(`  User: ${event.userId}`);
  console.log(`  Amount: ${formatTari(event.amount)} XTR`);
  console.log(`  Transaction: ${event.txId}`);
  console.log(`  Confirmations: ${event.confirmations}`);
  
  // Credit user account in your system
  if (event.confirmations >= 6) {
    await creditUserAccount(event.userId, event.amount);
    console.log(`✓ Credited ${event.userId} account`);
  }
});

// Monitor confirmations
deposits.on('confirmed', async (event) => {
  console.log(`✅ Deposit confirmed for ${event.userId}`);
  await markDepositConfirmed(event.txId);
});
```

### Processing Withdrawals

Handle user withdrawal requests with automatic batching:

```typescript
import { WithdrawalProcessor } from '@tari-project/wallet';

const processor = new WithdrawalProcessor(wallet, {
  batchSize: 10,        // Process 10 withdrawals at once
  batchDelayMs: 5000,   // Wait 5 seconds between batches
  maxRetries: 3         // Retry failed withdrawals 3 times
});

// Start processing withdrawals
processor.start();

// Handle user withdrawal request
async function processWithdrawal(userId: string, amount: bigint, address: string) {
  try {
    // Validate user has sufficient balance
    const userBalance = await getUserBalance(userId);
    if (userBalance < amount) {
      throw new Error('Insufficient user balance');
    }
    
    // Deduct from user account immediately
    await deductUserBalance(userId, amount);
    
    // Add to withdrawal queue
    const result = await processor.addWithdrawal({
      id: generateWithdrawalId(),
      userId,
      address,
      amount,
      priority: amount > parseTari('100') ? 'high' : 'normal',
      created: new Date()
    });
    
    console.log(`✓ Withdrawal queued: ${result.requestId}`);
    console.log(`📅 Estimated processing: ${result.estimatedProcessingTime}s`);
    
    return result;
    
  } catch (error) {
    // Refund user if queuing fails
    await refundUserBalance(userId, amount);
    throw error;
  }
}

// Monitor withdrawal completion
processor.on('withdrawal-processed', (event) => {
  console.log(`✅ Withdrawal completed for ${event.userId}`);
  console.log(`💸 Transaction: ${event.txId}`);
  updateWithdrawalStatus(event.id, 'completed', event.txId);
});

processor.on('withdrawal-failed', (event) => {
  console.log(`❌ Withdrawal failed for ${event.userId}: ${event.error}`);
  // Refund user and notify
  refundUserBalance(event.userId, event.amount);
  updateWithdrawalStatus(event.id, 'failed', null, event.error);
});
```

## Advanced Usage

### Custom Base Node Configuration

```typescript
const wallet = TariWallet.builder()
  .network(Network.Mainnet)
  .seedWords(seedWords)
  .baseNode('tcp://my-base-node.example.com:18142', 'base_node_public_key_hex')
  .build();
```

### Wallet Recovery

```typescript
// Recover wallet from seed words
const wallet = TariWallet.builder()
  .network(Network.Mainnet)
  .seedWords('existing twenty four word recovery phrase...')
  .passphrase('optional passphrase if used')
  .build();

await wallet.connect();

// Scan for transactions (this may take time)
console.log('🔍 Scanning for transactions...');
await wallet.scanForUtxos();

const balance = await wallet.getBalance();
console.log(`💰 Recovered balance: ${formatTari(balance.total)} XTR`);
```

### Mining Integration (Full SDK)

```typescript
import { TariClient, Network } from '@tari-project/full';

const client = TariClient.builder()
  .network(Network.Testnet)
  .seedWords(seedWords)
  .enableMining()
  .build();

await client.connect();

// Start mining
await client.mining.startMining({
  threads: 4,                    // Use 4 CPU threads
  targetDifficulty: 1000000n     // Target difficulty
});

console.log('⛏️ Mining started!');

// Monitor mining progress
client.mining.on('hash-rate-updated', (hashRate) => {
  console.log(`Hash rate: ${hashRate.toFixed(2)} H/s`);
});

client.mining.on('block-found', (block) => {
  console.log(`🎉 Block found! Height: ${block.height}, Reward: ${formatTari(block.reward)}`);
});

// Get mining stats
setInterval(() => {
  const stats = client.mining.getStats();
  console.log(`Mining: ${stats.blocksFound} blocks, ${stats.hashRate} H/s`);
}, 10000);
```

## Error Handling Best Practices

### Comprehensive Error Handling

```typescript
import { TariError } from '@tari-project/wallet';

async function robustTransaction(destination: string, amount: bigint) {
  let retries = 3;
  
  while (retries > 0) {
    try {
      const tx = await wallet.sendTransaction({
        destination,
        amount,
        feePerGram: parseTari('0.000001') // 1 microTari per gram
      });
      
      console.log('✅ Transaction sent:', tx.id);
      return tx;
      
    } catch (error) {
      if (error instanceof TariError) {
        switch (error.code) {
          case 'INSUFFICIENT_BALANCE':
            console.error('❌ Insufficient funds');
            return null; // Don't retry
            
          case 'NETWORK_ERROR':
            console.log(`🔄 Network error, retrying... (${retries} left)`);
            retries--;
            await sleep(5000); // Wait 5 seconds
            continue;
            
          case 'INVALID_ARGUMENT':
            console.error('❌ Invalid transaction parameters');
            return null; // Don't retry
            
          default:
            console.error('❌ Unknown error:', error.message);
            retries--;
            await sleep(2000);
        }
      } else {
        console.error('❌ Unexpected error:', error);
        return null;
      }
    }
  }
  
  console.error('❌ Transaction failed after all retries');
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Graceful Shutdown

```typescript
class WalletService {
  private wallet?: TariWallet;
  private deposits?: DepositManager;
  private processor?: WithdrawalProcessor;
  
  async start() {
    this.wallet = TariWallet.builder()
      .network(Network.Mainnet)
      .seedWords(process.env.WALLET_SEED_WORDS!)
      .build();
    
    await this.wallet.connect();
    
    this.deposits = new DepositManager(this.wallet);
    this.processor = new WithdrawalProcessor(this.wallet);
    this.processor.start();
    
    // Handle shutdown signals
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }
  
  async shutdown() {
    console.log('🛑 Shutting down wallet service...');
    
    if (this.processor) {
      this.processor.stop();
      console.log('✓ Withdrawal processor stopped');
    }
    
    if (this.deposits) {
      this.deposits.destroy();
      console.log('✓ Deposit manager cleaned up');
    }
    
    if (this.wallet) {
      await this.wallet.close();
      console.log('✓ Wallet disconnected');
    }
    
    console.log('👋 Shutdown complete');
    process.exit(0);
  }
}
```

## Build Requirements

### Platform-Specific Dependencies

**Windows:**
```bash
npm install --global windows-build-tools
# or
npm install --global @microsoft/windows-build-tools
```

**macOS:**
```bash
xcode-select --install
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install build-essential python3
```

**Linux (CentOS/RHEL):**
```bash
sudo yum groupinstall "Development Tools"
sudo yum install python3
```

### Building from Source

If the pre-built binaries don't work for your platform:

```bash
npm install @tari-project/wallet --build-from-source
```

## Environment Configuration

### Development Environment

Create a `.env` file for development:

```bash
# .env
TARI_NETWORK=testnet
TARI_SEED_WORDS="your development seed words here..."
TARI_DATA_DIR=./dev-wallet-data
TARI_BASE_NODE_ADDRESS=tcp://testnet.tari.com:18142
TARI_BASE_NODE_PUBLIC_KEY=testnet_public_key_here
TARI_LOG_LEVEL=debug
```

Load in your application:

```typescript
import dotenv from 'dotenv';
dotenv.config();

const wallet = TariWallet.builder()
  .network(process.env.TARI_NETWORK === 'mainnet' ? Network.Mainnet : Network.Testnet)
  .seedWords(process.env.TARI_SEED_WORDS!)
  .dataDirectory(process.env.TARI_DATA_DIR!)
  .build();
```

### Production Security

**Never expose seed words:**
```typescript
// ❌ BAD - Never do this
console.log('Seed words:', seedWords);

// ✅ GOOD - Use environment variables
const seedWords = process.env.WALLET_SEED_WORDS;
if (!seedWords) {
  throw new Error('WALLET_SEED_WORDS environment variable is required');
}
```

**Use encrypted storage:**
```typescript
import { encrypt, decrypt } from './crypto-utils';

// Store encrypted
const encryptedSeed = encrypt(seedWords, password);
await storage.set('wallet_seed', encryptedSeed);

// Load and decrypt
const encryptedSeed = await storage.get('wallet_seed');
const seedWords = decrypt(encryptedSeed, password);
```

## Troubleshooting

### Common Issues

**1. Connection Timeout**
```
Error: Connection timeout after 30000ms
```
Solution: Check network connectivity and base node address:
```typescript
const wallet = TariWallet.builder()
  .network(Network.Testnet)
  .baseNode('tcp://alternative-node.tari.com:18142', 'public_key')
  .build();
```

**2. Native Module Load Error**
```
Error: Cannot find module './bindings/tari_wallet_ffi.node'
```
Solution: Rebuild native modules:
```bash
npm rebuild @tari-project/wallet
# or
npm install @tari-project/wallet --build-from-source
```

**3. Insufficient Balance**
```
TariError: Insufficient balance for transaction
```
Solution: Check available balance and ensure it's greater than amount + fees:
```typescript
const balance = await wallet.getBalance();
const feeEstimate = 1000n; // microTari
if (balance.available < amount + feeEstimate) {
  throw new Error('Insufficient funds including fees');
}
```

**4. Invalid Address Format**
```
TariError: Invalid destination address format
```
Solution: Validate address before sending:
```typescript
import { validateAddress } from '@tari-project/wallet';

if (!validateAddress(destinationAddress)) {
  throw new Error('Invalid Tari address format');
}
```

### Getting Help

- **Documentation**: [https://docs.tari.com](https://docs.tari.com)
- **GitHub Issues**: [https://github.com/tari-project/tari-javascript-sdk/issues](https://github.com/tari-project/tari-javascript-sdk/issues)
- **Discord Community**: [https://discord.gg/tari](https://discord.gg/tari)
- **API Reference**: [API Documentation](./api-reference.md)

### Debugging

Enable detailed logging:

```typescript
import { setLogLevel, LogLevel } from '@tari/wallet';

// Set debug logging
setLogLevel(LogLevel.Debug);

// Or use environment variable
process.env.TARI_LOG_LEVEL = 'debug';
```

View internal wallet state:

```typescript
// Get detailed wallet info
const info = await wallet.getWalletInfo();
console.log('Wallet info:', info);

// Get transaction history
const transactions = await wallet.getTransactionHistory();
console.log('Recent transactions:', transactions);

// Get peer information
const peers = await wallet.getPeers();
console.log('Connected peers:', peers);
```

## Next Steps

Now that you have the basics working:

1. **Read the [API Reference](./api-reference.md)** for detailed method documentation
2. **Check the [Examples](../examples/)** directory for complete applications
3. **Join the [Tari Community](https://discord.gg/tari)** for support and updates
4. **Star the [GitHub Repository](https://github.com/tari-project/tari-javascript-sdk)** to stay updated

Happy building with Tari! 🚀
