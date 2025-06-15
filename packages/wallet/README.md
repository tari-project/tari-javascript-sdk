# @tari-project/tarijs-wallet

High-level Tari wallet API for JavaScript applications using **real Tari blockchain FFI bindings**.

## Overview

This package provides a comprehensive, type-safe interface for interacting with Tari wallets from JavaScript and TypeScript applications. Built on top of `@tari-project/tarijs-core`, it offers wallet creation, transaction management, balance queries, and network synchronization capabilities through **real minotari_wallet_ffi bindings** - no mock implementations.

## ⚠️ Important: Real FFI Usage

**This package uses actual Tari blockchain functionality, not mock data or placeholder implementations.** All operations connect to real Tari network infrastructure. Ensure you have:

1. **Compiled FFI binaries** for your target network
2. **Network connectivity** for blockchain operations  
3. **Test funds** when using testnet (not required for wallet creation)

## Features

- **Wallet Management**: Create, restore, and manage Tari wallets
- **Transaction Operations**: Send transactions, query history, cancel pending operations
- **Balance Queries**: Get available, pending, and time-locked balances
- **Address Management**: Handle Tari addresses with validation and conversion utilities
- **Contact Management**: Store and manage frequently used addresses
- **Event System**: Real-time notifications for transactions and network events
- **Network Operations**: Sync with base nodes and manage network configuration

## Installation

```bash
npm install @tari-project/tarijs-wallet
```

## Prerequisites: Build Network-Specific FFI Binaries

**Before using the wallet**, you must compile network-specific FFI binaries:

```bash
# Clone the SDK repository
git clone https://github.com/tari-project/tari-javascript-sdk.git
cd tari-javascript-sdk

# Set up Tari source code
npm run setup:tari-source

# Build all network binaries (5-10 minutes)
npm run build:networks

# Or build specific networks
npm run build:networks:testnet  # For development
npm run build:networks:mainnet  # For production
```

## Quick Start with Real FFI

```typescript
import { 
  TariWallet, 
  NetworkType, 
  loadNativeModuleForNetwork 
} from '@tari-project/tarijs-wallet';

// STEP 1: Load network-specific FFI binary
await loadNativeModuleForNetwork(NetworkType.Testnet);

// STEP 2: Create a wallet using real blockchain functionality
const wallet = await TariWallet.create({
  network: NetworkType.Testnet,  // Must match loaded FFI binary
  storagePath: './my-wallet',
  logPath: './wallet.log'
});

// STEP 3: Real blockchain operations
const address = await wallet.getAddress();
console.log(`Real Tari address: ${address.toString()}`);

// Real balance from blockchain
const balance = await wallet.getBalance();
console.log(`Actual balance: ${balance.available} µT`);

// Real transaction on testnet
const txId = await wallet.sendTransaction(
  'recipient_address_here',
  1000000n, // 1 Tari in microTari
  { message: 'Real blockchain transaction' }
);

// Real-time blockchain events
wallet.on('onTransactionReceived', (tx) => {
  console.log(`Received real transaction: ${tx.amount} µT`);
});

// Proper cleanup
await wallet.destroy();
```

## API Reference

### TariWallet

The main wallet class providing all wallet operations.

#### Factory Methods

- `TariWallet.create(config)` - Create new wallet
- `TariWallet.restore(seedWords, config)` - Restore from seed

#### Core Operations

- `getAddress()` - Get wallet's primary address
- `getBalance()` - Get current balance information
- `sendTransaction(recipient, amount, options?)` - Send transaction
- `getTransactions()` - Get transaction history
- `cancelTransaction(txId)` - Cancel pending transaction

#### Contact Management

- `addContact(contact)` - Add new contact
- `getContacts()` - Get all contacts

#### Network Operations

- `setBaseNode(peer)` - Configure base node
- `sync()` - Sync with network

#### Utility Methods

- `getSeedWords(passphrase?)` - Get wallet seed phrase
- `signMessage(message)` - Sign arbitrary message
- `destroy()` - Clean up resources

### Models

#### TariAddress

Represents a Tari address with validation and utility methods.

```typescript
const address = TariAddress.fromBase58('address_string');
const emojiId = address.toEmojiId();
```

#### WalletBalance

Enhanced balance model with computed properties.

```typescript
const balance = await wallet.getBalance();
console.log(`Spendable: ${balance.spendable} µT`);
console.log(`Has enough for 1 Tari: ${balance.hasEnoughFor(1000000n)}`);
```

#### TransactionId

Type-safe transaction ID wrapper.

```typescript
const txId = new TransactionId(12345n);
console.log(`Transaction: ${txId.toString()}`);
```

### Types

- `WalletConfig` - Wallet configuration options
- `Balance` - Balance information structure
- `TransactionInfo` - Transaction details
- `Contact` - Contact information
- `WalletEventHandlers` - Event handler definitions

## Event Handling

The wallet emits events for various operations:

```typescript
wallet.on('onTransactionReceived', (tx) => {
  console.log(`Received transaction: ${tx.id}`);
});

wallet.on('onBalanceUpdated', (balance) => {
  console.log(`New balance: ${balance.available}`);
});

wallet.on('onConnectivityChanged', (isOnline) => {
  console.log(`Network status: ${isOnline ? 'online' : 'offline'}`);
});
```

## Configuration

### WalletConfig

```typescript
interface WalletConfig {
  network: NetworkType;           // Required: Mainnet, Testnet, or Nextnet
  storagePath: string;           // Required: Local storage directory
  logPath?: string;              // Optional: Log file location
  passphrase?: string;           // Optional: Wallet encryption passphrase
  seedWords?: string[];          // Optional: For wallet restoration
  numRollingLogFiles?: number;   // Optional: Log rotation count
  rollingLogFileSize?: number;   // Optional: Log file size limit
}
```

## Error Handling

All wallet operations can throw `TariError` with specific error codes:

```typescript
import { TariError, ErrorCode } from '@tari-project/tarijs-wallet';

try {
  await wallet.sendTransaction(recipient, amount);
} catch (error) {
  if (error instanceof TariError) {
    switch (error.code) {
      case ErrorCode.InsufficientFunds:
        console.log('Not enough balance');
        break;
      case ErrorCode.InvalidAddress:
        console.log('Invalid recipient address');
        break;
      default:
        console.log(`Wallet error: ${error.message}`);
    }
  }
}
```

## Development Status

This package is currently in early development. Many features are implemented as placeholders that will be replaced with actual FFI bindings to the Tari wallet in subsequent development phases.

## License

BSD-3-Clause
