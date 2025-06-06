# API Reference

## @tari-project/wallet

The main package for exchange integration and wallet management.

### TariWallet

The primary wallet class for managing Tari funds.

#### Constructor

```typescript
new TariWallet(config: WalletConfig)
```

**Parameters:**
- `config` - Wallet configuration object

**WalletConfig Interface:**
```typescript
interface WalletConfig {
  network: Network;              // Network to connect to (Mainnet/Testnet)
  seedWords?: string;           // 24-word recovery phrase (generated if not provided)
  passphrase?: string;          // Optional passphrase for seed
  dataDirectory?: string;       // Directory for wallet data storage
  baseNode?: {                  // Base node connection details
    address: string;            // TCP address (e.g., 'tcp://localhost:18142')
    publicKey: string;          // Base node public key
  };
}
```

#### Methods

##### connect()
Establishes connection to the Tari network.

```typescript
await wallet.connect(): Promise<void>
```

**Throws:**
- `TariError` - If connection fails or wallet already connected

**Example:**
```typescript
const wallet = new TariWallet({ network: Network.Testnet });
await wallet.connect();
```

##### getReceiveAddress()
Gets a receiving address for deposits.

```typescript
wallet.getReceiveAddress(): string
```

**Returns:** Emoji ID format address (e.g., '🎉🎨🎭🎪🎯🎲🎸🎺')

**Throws:**
- `TariError` - If wallet not connected

##### getBalance()
Gets current wallet balance.

```typescript
await wallet.getBalance(): Promise<Balance>
```

**Returns:**
```typescript
interface Balance {
  available: bigint;  // Spendable balance in microTari
  pending: bigint;    // Incoming pending transactions
  locked: bigint;     // Time-locked or staked funds
  total: bigint;      // Sum of all above
}
```

**Example:**
```typescript
const balance = await wallet.getBalance();
console.log(`Available: ${formatTari(balance.available)}`);
```

##### sendTransaction()
Sends a transaction to another address.

```typescript
await wallet.sendTransaction(params: SendTransactionParams): Promise<Transaction>
```

**Parameters:**
```typescript
interface SendTransactionParams {
  destination: string;     // Recipient emoji ID or hex address
  amount: bigint;          // Amount in microTari
  feePerGram?: bigint;     // Fee rate (default: network recommended)
  message?: string;        // Optional transaction message
}
```

**Returns:**
```typescript
interface Transaction {
  id: string;              // Transaction ID
  amount: bigint;          // Amount sent
  destination: string;     // Recipient address
  status: TransactionStatus;
  message?: string;        // Transaction message
  timestamp: Date;         // When transaction was created
  isOutbound: boolean;     // True for sent transactions
  confirmations: number;   // Number of confirmations
}
```

**Throws:**
- `TariError` with code `INSUFFICIENT_BALANCE` - Not enough funds
- `TariError` with code `INVALID_ARGUMENT` - Invalid parameters
- `TariError` with code `NETWORK_ERROR` - Network issues

##### watchTransaction()
Monitor a transaction for status updates.

```typescript
wallet.watchTransaction(txId: string, callback: (tx: Transaction) => void): () => void
```

**Parameters:**
- `txId` - Transaction ID to monitor
- `callback` - Function called on status updates

**Returns:** Function to stop watching

**Example:**
```typescript
const unwatch = wallet.watchTransaction(tx.id, (updated) => {
  console.log(`Transaction ${updated.id} has ${updated.confirmations} confirmations`);
  if (updated.confirmations >= 6) {
    unwatch(); // Stop watching after 6 confirmations
  }
});
```

##### close()
Closes wallet connection and cleans up resources.

```typescript
await wallet.close(): Promise<void>
```

#### Events

The wallet extends EventEmitter and emits the following events:

**connected**
Emitted when wallet connects to network.
```typescript
wallet.on('connected', (info: ConnectionInfo) => {
  console.log('Wallet connected');
});

interface ConnectionInfo {
  connected: boolean;
  baseNode?: string;
  lastSeen: Date;
}
```

**disconnected**
Emitted when wallet loses connection.
```typescript
wallet.on('disconnected', (info: DisconnectionInfo) => {
  console.log('Wallet disconnected:', info.reason);
});

interface DisconnectionInfo {
  reason: string;
}
```

**balance-updated**
Emitted when wallet balance changes.
```typescript
wallet.on('balance-updated', (balance: Balance) => {
  console.log('New balance:', balance);
});
```

**transaction-received**
Emitted when receiving a transaction.
```typescript
wallet.on('transaction-received', (tx: Transaction) => {
  console.log('Received transaction:', tx.id);
});
```

**transaction-sent**
Emitted when sending a transaction.
```typescript
wallet.on('transaction-sent', (tx: Transaction) => {
  console.log('Sent transaction:', tx.id);
});
```

**transaction-confirmed**
Emitted when a transaction gets confirmed.
```typescript
wallet.on('transaction-confirmed', (tx: Transaction) => {
  console.log('Transaction confirmed:', tx.id);
});
```

### WalletBuilder

Fluent builder for creating wallet instances.

```typescript
const wallet = TariWallet.builder()
  .network(Network.Mainnet)
  .seedWords('your twenty four word seed phrase...')
  .passphrase('optional passphrase')
  .dataDirectory('./wallet-data')
  .baseNode('tcp://localhost:18142', 'base_node_public_key')
  .build();
```

### DepositManager

Manages deposit addresses for exchange users.

#### Constructor

```typescript
const deposits = new DepositManager(wallet: TariWallet);
```

**Note:** After construction, you must call `initialize()` before using the manager and `teardown()` for cleanup.

#### Methods

##### initialize()
Initializes the deposit manager and starts event listening.

```typescript
deposits.initialize(): void
```

**Note:** Must be called after construction before using any other methods. This method is idempotent - safe to call multiple times.

##### teardown()
Cleans up all event listeners and resources.

```typescript
deposits.teardown(): void
```

**Note:** Should be called before discarding the instance to prevent memory leaks. This method is idempotent - safe to call multiple times or before initialize().

##### generateAddress()
Creates a deposit address for a user.

```typescript
await deposits.generateAddress(userId: string): Promise<string>
```

**Returns:** Emoji ID address for the user

**Example:**
```typescript
const address = await deposits.generateAddress('user123');
console.log(`Deposit address for user123: ${address}`);
```

##### getAddress()
Gets deposit info for a user.

```typescript
deposits.getAddress(userId: string): DepositInfo | null
```

**Returns:**
```typescript
interface DepositInfo {
  userId: string;
  address: string;
  created: Date;
  totalReceived: bigint;
  transactionCount: number;
}
```

##### getAllAddresses()
Gets all deposit addresses.

```typescript
deposits.getAllAddresses(): DepositInfo[]
```

##### getStatistics()
Gets deposit statistics.

```typescript
deposits.getStatistics(): DepositStatistics
```

**Returns:**
```typescript
interface DepositStatistics {
  totalUsers: number;
  totalDeposits: number;
  totalVolume: bigint;
  averageDeposit: bigint;
}
```

#### Events

**deposit**
Emitted when a deposit is received.
```typescript
deposits.on('deposit', (event: DepositEvent) => {
  console.log(`User ${event.userId} deposited ${formatTari(event.amount)}`);
});

interface DepositEvent {
  userId: string;
  address: string;
  amount: bigint;
  txId: string;
  confirmations: number;
}
```

**confirmed**
Emitted when a deposit is confirmed.
```typescript
deposits.on('confirmed', (event: DepositEvent) => {
  console.log(`Deposit confirmed for user ${event.userId}`);
});
```

### WithdrawalProcessor

Handles withdrawal processing with queuing and batching.

#### Constructor

```typescript
const processor = new WithdrawalProcessor(
  wallet: TariWallet,
  options?: WithdrawalOptions
);
```

**WithdrawalOptions:**
```typescript
interface WithdrawalOptions {
  batchSize?: number;        // Max withdrawals per batch (default: 10)
  batchDelayMs?: number;     // Delay between batches (default: 5000)
  maxRetries?: number;       // Max retry attempts (default: 3)
  retryDelayMs?: number;     // Delay between retries (default: 5000)
}
```

#### Methods

##### addWithdrawal()
Adds a withdrawal request to the queue.

```typescript
await processor.addWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult>
```

**Parameters:**
```typescript
interface WithdrawalRequest {
  id: string;                    // Unique withdrawal ID
  userId: string;                // User requesting withdrawal
  address: string;               // Destination address
  amount: bigint;                // Amount to withdraw in microTari
  priority: 'low' | 'normal' | 'high';
  created: Date;
}
```

**Returns:**
```typescript
interface WithdrawalResult {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedProcessingTime: number; // Seconds
  error?: string;
}
```

##### getQueueStatus()
Gets current queue status.

```typescript
processor.getQueueStatus(): QueueStatus
```

**Returns:**
```typescript
interface QueueStatus {
  pending: WithdrawalRequest[];
  processing: WithdrawalRequest[];
  completed: WithdrawalRequest[];
  failed: WithdrawalRequest[];
  totalPending: number;
  totalProcessing: number;
  totalCompleted: number;
  totalFailed: number;
}
```

##### getWithdrawalStatus()
Gets status of specific withdrawal.

```typescript
processor.getWithdrawalStatus(withdrawalId: string): WithdrawalStatus | null
```

##### start() / stop()
Controls withdrawal processing.

```typescript
processor.start();  // Start processing queue
processor.stop();   // Stop processing
processor.isRunning(): boolean;
```

#### Events

**withdrawal-processed**
Emitted when withdrawal completes successfully.
```typescript
processor.on('withdrawal-processed', (event: WithdrawalProcessedEvent) => {
  console.log(`Withdrawal ${event.id} completed`);
});
```

**withdrawal-failed**
Emitted when withdrawal fails permanently.
```typescript
processor.on('withdrawal-failed', (event: WithdrawalFailedEvent) => {
  console.log(`Withdrawal ${event.id} failed: ${event.error}`);
});
```

## @tari-project/full

Extended SDK with mining and advanced features.

### TariClient

Full client with all protocol features.

```typescript
const client = TariClient.builder()
  .network(Network.Mainnet)
  .seedWords('...')
  .enableMining()
  .enableP2P()
  .build();

await client.connect();
```

#### Properties

- `client.wallet` - TariWallet instance
- `client.mining` - MiningManager instance
- `client.p2p` - P2PManager instance  
- `client.advanced` - AdvancedFeatures instance

### MiningManager

Mining functionality and statistics.

#### Methods

##### startMining()
Starts mining operation.

```typescript
await client.mining.startMining(config: MiningConfig): Promise<void>
```

**MiningConfig:**
```typescript
interface MiningConfig {
  threads?: number;              // Number of mining threads
  targetDifficulty?: bigint;     // Target difficulty
  coinbaseExtra?: string;        // Extra data in coinbase
}
```

##### stopMining()
Stops mining operation.

```typescript
await client.mining.stopMining(): Promise<void>
```

##### getStats()
Gets mining statistics.

```typescript
client.mining.getStats(): MiningStats
```

**Returns:**
```typescript
interface MiningStats {
  isActive: boolean;
  hashRate: number;              // Hashes per second
  blocksFound: number;
  totalHashes: bigint;
  startTime: Date;
  difficulty: bigint;
}
```

#### Events

**block-found**
Emitted when a block is successfully mined.
```typescript
client.mining.on('block-found', (block: MinedBlock) => {
  console.log(`Found block at height ${block.height}`);
});
```

**hash-rate-updated**
Emitted periodically with current hash rate.
```typescript
client.mining.on('hash-rate-updated', (hashRate: number) => {
  console.log(`Current hash rate: ${hashRate} H/s`);
});
```

### P2PManager

Peer-to-peer network management.

#### Methods

##### getPeers()
Gets list of connected peers.

```typescript
await client.p2p.getPeers(): Promise<PeerInfo[]>
```

**Returns:**
```typescript
interface PeerInfo {
  publicKey: string;
  address: string;
  connectionTime: Date;
  lastSeen: Date;
  banned: boolean;
}
```

##### addPeer()
Manually adds a peer.

```typescript
await client.p2p.addPeer(publicKey: string, address: string): Promise<void>
```

##### banPeer()
Bans a misbehaving peer.

```typescript
await client.p2p.banPeer(publicKey: string, durationSeconds: number): Promise<void>
```

## Utility Functions

### formatTari()
Formats microTari amounts for display.

```typescript
import { formatTari } from '@tari-project/wallet';

formatTari(1000000n);        // "1.000000 XTR"
formatTari(1500000n, 2);     // "1.50 XTR"
```

### parseTari()
Parses Tari string to microTari.

```typescript
import { parseTari } from '@tari-project/wallet';

parseTari("1.5");            // 1500000n
parseTari("0.001");          // 1000n
```

### validateAddress()
Validates Tari addresses.

```typescript
import { validateAddress } from '@tari-project/wallet';

validateAddress('🎉🎨🎭🎪🎯🎲🎸🎺');  // true
validateAddress('invalid');             // false
```

## Error Handling

All methods may throw `TariError` with specific error codes:

```typescript
try {
  await wallet.sendTransaction({...});
} catch (error) {
  if (error instanceof TariError) {
    switch (error.code) {
      case 'INSUFFICIENT_BALANCE':
        console.log('Not enough funds');
        break;
      case 'NETWORK_ERROR':
        console.log('Connection issue');
        break;
      case 'INVALID_ARGUMENT':
        console.log('Invalid input');
        break;
      default:
        console.log('Unknown error:', error.message);
    }
  }
}
```

**Error Codes:**
- `INVALID_ARGUMENT` - Invalid input parameter
- `NETWORK_ERROR` - Connection or network issue  
- `INSUFFICIENT_BALANCE` - Not enough funds
- `WALLET_ERROR` - General wallet error
- `TRANSACTION_ERROR` - Transaction processing error
- `ADDRESS_ERROR` - Address validation error

## Type Definitions

### Network
```typescript
enum Network {
  Mainnet = 'mainnet',
  Testnet = 'testnet'
}
```

### TransactionStatus
```typescript
enum TransactionStatus {
  Pending = 0,
  Completed = 1,
  Failed = 2,
  Cancelled = 3
}
```

### WalletEvent
```typescript
enum WalletEvent {
  Connected = 'connected',
  Disconnected = 'disconnected',
  BalanceUpdated = 'balance-updated',
  TransactionReceived = 'transaction-received',
  TransactionSent = 'transaction-sent',
  TransactionConfirmed = 'transaction-confirmed'
}
```
