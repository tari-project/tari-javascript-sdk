# Tari JavaScript SDK

A high-performance, type-safe JavaScript SDK for interacting with Tari wallet functionality via Rust FFI bindings.

[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%3E%3D5.3.0-blue.svg)](https://www.typescriptlang.org/)

## Overview

The Tari JavaScript SDK provides developers with a comprehensive, type-safe interface to build applications on the Tari network. Built using modern NAPI-RS for optimal performance (up to 157x faster than traditional FFI approaches), this SDK enables JavaScript applications to leverage Tari's Rust-based wallet capabilities while maintaining the safety and developer experience expected in the JavaScript ecosystem.

## Features

- 🚀 **High Performance**: NAPI-RS-based FFI bindings for optimal performance
- 🔒 **Type Safety**: Comprehensive TypeScript definitions with strict type checking
- 🏗️ **Modular Architecture**: Clean separation between core bindings and high-level APIs
- 🌐 **Multi-Network**: Support for mainnet, testnet, and nextnet configurations
- 💾 **Memory Safe**: Automatic resource management and leak detection
- 🔄 **Event-Driven**: Real-time wallet events and transaction notifications
- 📦 **Modern Tooling**: ESM/CJS dual builds, NPM workspaces, and comprehensive testing

## Quick Start

### Installation

```bash
# Install the main wallet package
npm install @tari-project/tarijs-wallet

# Or install core utilities only
npm install @tari-project/tarijs-core
```

### Basic Usage

```typescript
import { TariWallet, NetworkType } from '@tari-project/tarijs-wallet';

// Create a new wallet
const wallet = await TariWallet.create({
  network: NetworkType.Testnet,
  storagePath: './my-wallet',
  logLevel: 'info'
});

// Get wallet address
const address = await wallet.getAddress();
console.log(`Wallet address: ${address.toString()}`);

// Check balance
const balance = await wallet.getBalance();
console.log(`Available: ${balance.available} µT`);

// Send a transaction
const txId = await wallet.sendTransaction(
  'recipient_address_here',
  1000000n, // 1 Tari in microTari
  { message: 'Payment for services' }
);

// Listen for events
wallet.on('onTransactionReceived', (tx) => {
  console.log(`Received ${tx.amount} µT`);
});

// Clean up when done
await wallet.destroy();
```

## Package Structure

This is a monorepo containing multiple packages:

### [@tari-project/tarijs-core](packages/core)
Core FFI bindings, type definitions, error handling, and memory management utilities.

### [@tari-project/tarijs-wallet](packages/wallet)
High-level wallet API for transaction management, balance queries, and address handling.

### [@tari-project/tarijs-build](packages/build)
Build utilities for compiling network-specific variants (private package).

## Development

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Rust 1.70.0 or higher (for FFI compilation)

### Setup

```bash
# Clone the repository
git clone https://github.com/tari-project/tari-javascript-sdk.git
cd tari-javascript-sdk

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

### Available Scripts

```bash
npm run build        # Build all packages
npm run build:ts     # TypeScript compilation only
npm run clean        # Clean all build artifacts
npm run test         # Run all tests
npm run test:ci      # Run tests with coverage
npm run lint         # Lint all packages
npm run lint:fix     # Fix linting issues
npm run typecheck    # Type checking only
```

### Project Structure

```
tari-javascript-sdk/
├── packages/
│   ├── core/           # Core FFI bindings and utilities
│   ├── wallet/         # High-level wallet API
│   └── build/          # Build utilities
├── scripts/            # Development scripts
├── docs/              # Documentation
├── .github/           # CI/CD configuration
└── native/            # Rust FFI workspace (future)
```

## Network Support

The SDK supports multiple Tari network configurations:

- **Mainnet** (`@tari-project/tarijs-wallet`): Production network
- **Testnet** (`@tari-project/tarijs-wallet-testnet`): Testing network  
- **Nextnet** (`@tari-project/tarijs-wallet-nextnet`): Pre-release network

## Documentation

- [Architecture Overview](docs/README.md)
- [Development Guide](docs/development.md)
- [API Reference](packages/wallet/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## Development Status

This SDK is currently in active development. The current implementation (Phase 1) provides:

- ✅ Complete monorepo structure and build system
- ✅ TypeScript configuration and type definitions
- ✅ Testing infrastructure with Jest
- ✅ ESLint and Prettier configuration
- ✅ Core package with error handling and utilities
- ✅ Wallet package with placeholder API implementations

**Upcoming phases will add:**
- Rust FFI build system (Phase 2)
- Real FFI bindings and wallet operations (Phases 3-6)
- Event system and advanced features (Phases 7-9)
- Platform-specific optimizations (Phases 10-11)
- Comprehensive testing and examples (Phases 12-13)
- CI/CD and publishing automation (Phase 14)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Development setup
- Code style and conventions
- Testing requirements
- Pull request process

## License

This project is licensed under the BSD-3-Clause License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: [dev@tari.com](mailto:dev@tari.com)
- 💬 Discord: [Tari Community](https://discord.gg/tari)
- 🐛 Issues: [GitHub Issues](https://github.com/tari-project/tari-javascript-sdk/issues)
- 📖 Documentation: [docs.tari.com](https://docs.tari.com)

---

**Note**: This SDK currently contains placeholder implementations for wallet operations. Full FFI integration will be completed in subsequent development phases.
