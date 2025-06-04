# Tari JavaScript SDK Examples

This directory contains example applications demonstrating how to use the Tari JavaScript SDK.

## Current Status

The SDK is currently in **development phase**. The TypeScript interfaces, utility functions, and high-level APIs are implemented and working, but the native Rust bindings are still being completed.

### What Works ✅

- **Package compilation and imports**: All packages build successfully
- **Wallet builder pattern**: Fluent API for wallet configuration
- **Type safety**: Full TypeScript support with proper types
- **Utility functions**: Amount formatting, parsing, validation
- **Event system**: Typed event handlers for wallet events
- **Mock testing**: Complete test infrastructure with mocks

### What's In Progress 🚧

- **Native Rust bindings**: FFI functions for actual wallet operations
- **Network connectivity**: Real connection to Tari network
- **Transaction handling**: Sending and receiving actual transactions

## Examples

### 1. Simple Demo (`simple-demo.js`)

A basic demonstration of the SDK's current capabilities:

```bash
cd examples/exchange-basic
node simple-demo.js
```

This example shows:
- Wallet creation using the builder pattern
- Amount formatting and parsing utilities
- Available event types
- Error handling for incomplete native bindings

### 2. Exchange Basic (`index.js`)

A comprehensive exchange integration example (will work once native bindings are complete):

```bash
cd examples/exchange-basic
npm start
```

This example demonstrates:
- Hot wallet management for exchanges
- Deposit address generation per user
- Real-time balance monitoring
- Transaction event handling
- Graceful shutdown procedures

### 3. Wallet CLI (`index.js`)

An interactive command-line wallet interface:

```bash
cd examples/wallet-cli
npm start
```

Features:
- Interactive wallet management
- Balance checking
- Transaction history
- Send/receive functionality

## Development Workflow

1. **Test the SDK interfaces**:
   ```bash
   # Run the simple demo to verify SDK structure
   cd examples/exchange-basic
   node simple-demo.js
   ```

2. **Run the full test suite**:
   ```bash
   # From the root directory
   pnpm test
   ```

3. **Build all packages**:
   ```bash
   # From the root directory
   pnpm build
   ```

## API Usage Examples

### Creating a Wallet

```javascript
const { TariWallet } = require('@tari-project/wallet');
const { Network } = require('@tari-project/core');

// Using builder pattern
const wallet = TariWallet.builder()
  .network(Network.Testnet)
  .seedWords('your seed words here')
  .dataDirectory('./wallet-data')
  .baseNode('tcp://basenode.tari.com:18189', 'public_key_here')
  .build();

// Or using constructor directly
const wallet = new TariWallet({
  network: Network.Testnet,
  seedWords: 'your seed words here',
  dbPath: './wallet-data'
});
```

### Amount Handling

```javascript
const { formatTari, parseTari } = require('@tari-project/wallet');

// Format microTari for display
const amount = 1500000n; // 1.5 Tari in microTari
console.log(formatTari(amount)); // "1.500000 XTR"

// Parse user input to microTari
const userInput = "1.5";
const microTari = parseTari(userInput); // 1500000n
```

### Event Handling

```javascript
const { WalletEvent } = require('@tari-project/wallet');

wallet.on(WalletEvent.Connected, (info) => {
  console.log('Wallet connected:', info);
});

wallet.on(WalletEvent.TransactionReceived, (transaction) => {
  console.log('Received transaction:', transaction);
});

wallet.on(WalletEvent.BalanceUpdated, (balance) => {
  console.log('Balance updated:', formatTari(balance.available));
});
```

## Contributing

The examples serve as both demonstrations and integration tests for the SDK. When adding new features:

1. Update the relevant example to demonstrate the new functionality
2. Ensure the example handles both working and error states gracefully
3. Add appropriate documentation and comments
4. Test with both mock and real native bindings (when available)

## Support

- Check the main README for build instructions
- Review the TESTING.md guide for running tests
- See the CONTRIBUTING.md for development guidelines

The SDK is designed to provide a clean, type-safe interface for Tari wallet operations. These examples will evolve as the native implementation progresses.
