# Tari JavaScript SDK

[![npm version](https://img.shields.io/npm/v/@tari-project/wallet)](https://www.npmjs.com/package/@tari-project/wallet)
[![Platform Support](https://img.shields.io/badge/platform-Node.js%2016%2B-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue)](LICENSE)

## JavaScript/TypeScript SDK for Tari Cryptocurrency

The Tari JavaScript SDK provides Node.js bindings for the Tari wallet FFI, enabling cryptocurrency exchanges and applications to integrate Tari without running full node infrastructure.

## Features

- 🚀 **Simple Integration** - High-level API for exchange deposits and withdrawals
- 🔒 **Type-Safe** - Full TypeScript support with comprehensive type definitions
- 🏗️ **No Binary Dependencies** - Pre-built native modules for all major platforms
- ⚡ **High Performance** - Native Rust FFI with minimal overhead
- 🔧 **Flexible Architecture** - Choose between simple wallet API or full protocol access

## Packages

- **[@tari-project/wallet](packages/@tari/wallet)** - Exchange-focused wallet SDK
- **[@tari-project/full](packages/@tari/full)** - Full protocol access including mining and P2P
- **[@tari-project/core](packages/@tari/core)** - Low-level FFI bindings (advanced users)

## Quick Start

### Installation

```bash
npm install @tari-project/wallet
# or
yarn add @tari-project/wallet
# or
pnpm add @tari-project/wallet
```

### Basic Usage

```typescript
import { TariWallet, Network } from '@tari-project/wallet';

// Create and connect wallet
const wallet = TariWallet.builder()
  .network(Network.Mainnet)
  .seedWords('your secure seed words here...')
  .dataDirectory('./wallet-data')
  .build();

await wallet.connect();

// Get deposit address
const address = wallet.getReceiveAddress();
console.log('Deposit to:', address);

// Check balance
const balance = await wallet.getBalance();
console.log('Available:', balance.available);

// Send transaction
const tx = await wallet.sendTransaction({
  destination: 'recipient_address',
  amount: 1000000n, // 1 XTR
  message: 'Payment'
});
```

## Documentation

- 📖 **[API Reference](docs/api-reference.md)** - Complete API documentation
- 🧪 **[Testing Guide](TESTING.md)** - Comprehensive testing documentation
- 🤝 **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project
- 💡 **[Examples](examples/)** - Sample applications and use cases

## Exchange Integration

For detailed exchange integration guides, see our [Exchange Integration Documentation](docs/exchange-integration.md).

### Quick Example

```typescript
import { DepositManager, WithdrawalProcessor } from '@tari-project/wallet';

// Deposit management
const deposits = new DepositManager(wallet);
const address = await deposits.generateAddress('user123');

// Monitor deposits
deposits.on('deposit', (event) => {
  console.log(`User ${event.userId} deposited ${event.amount}`);
});

// Process withdrawals
const processor = new WithdrawalProcessor(wallet);
await processor.addWithdrawal({
  id: 'withdrawal_123',
  userId: 'user123',
  address: 'destination_address',
  amount: 1000000n,
  priority: 'high'
});
```

## Supported Platforms

| Platform | Architecture | Node.js Version |
|----------|-------------|-----------------|
| Linux    | x64, arm64  | 16, 18, 20+    |
| macOS    | x64, arm64  | 16, 18, 20+    |
| Windows  | x64         | 16, 18, 20+    |

## Development

For development setup and contribution guidelines, see our [Contributing Guide](CONTRIBUTING.md).

```bash
# Quick start for contributors
git clone https://github.com/tari-project/tari-javascript-sdk.git
cd tari-javascript-sdk
pnpm install
pnpm build
pnpm test
```

## Support

- 💬 **Discord**: [discord.gg/tari](https://discord.gg/tari)
- 🐛 **Issues**: [GitHub Issues](https://github.com/tari-project/tari-javascript-sdk/issues)
- 📚 **Docs**: [docs.tari.com](https://docs.tari.com)
- 📧 **Exchange Support**: exchange-support@tari.com

## License

The Tari JavaScript SDK is licensed under the [BSD 3-Clause License](LICENSE).

## Security

For security issues, please email security@tari.com instead of using the public issue tracker.