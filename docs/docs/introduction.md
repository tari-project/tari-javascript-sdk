# Introduction

Welcome to the **Tari JavaScript SDK** - a high-performance, type-safe JavaScript library for building applications on the Tari network. This SDK provides developers with comprehensive tools to create wallet applications, manage transactions, and integrate with the Tari blockchain using modern JavaScript and TypeScript.

## What is Tari?

[Tari](https://www.tari.com/) is a decentralized protocol focused on digital assets and smart contracts. The Tari network enables developers to build applications for digital ownership, gaming, NFTs, and decentralized finance (DeFi) with a focus on privacy, security, and performance.

## Why Use the JavaScript SDK?

🚀 **High Performance**
- Built with NAPI-RS for optimal JavaScript-to-Rust FFI performance
- Up to 157x faster than traditional FFI approaches
- Memory-efficient operations with automatic resource management

🔒 **Type Safety & Developer Experience**
- Comprehensive TypeScript definitions with strict type checking
- IntelliSense support for all APIs and parameters
- Runtime type validation for critical operations

🏗️ **Modern Architecture**
- Clean separation between core bindings and high-level APIs
- Event-driven design with typed event emitters
- Modular package structure for optimized bundle sizes

🌐 **Cross-Platform Support**
- **Node.js**: Server applications and CLI tools
- **Electron**: Desktop wallet applications with enhanced security
- **Tauri**: High-performance desktop apps (60% lower memory, 10x faster startup)
- **Browser**: Web applications with secure storage fallbacks

🔄 **Real-Time Capabilities**
- Live transaction status updates
- Balance change notifications
- Network event streaming
- Connection state monitoring

## Architecture Overview

The SDK is built as a multi-package monorepo designed for flexibility and performance:

```mermaid
graph TD
    A[Your Application] --> B[@tari-project/tarijs-wallet]
    B --> C[@tari-project/tarijs-core]
    C --> D[Native Rust FFI]
    D --> E[Tari Wallet Library]
    
    F[Secure Storage] --> G[Platform Detection]
    G --> H[Tauri Backend]
    G --> I[Electron Backend]
    G --> J[Node.js Backend]
    
    B --> F
```

### Package Structure

| Package | Purpose | Use Case |
|---------|---------|----------|
| `@tari-project/tarijs-core` | Core FFI bindings, types, and utilities | Low-level blockchain operations |
| `@tari-project/tarijs-wallet` | High-level wallet API and transaction management | Wallet applications and services |

## Key Features

### Wallet Operations
- **Wallet Creation**: Generate new wallets or restore from seed phrases
- **Transaction Management**: Send, receive, and monitor transaction status
- **Balance Queries**: Real-time balance updates with detailed breakdowns
- **Address Management**: Generate and validate Tari addresses (base58 and emoji formats)
- **Fee Estimation**: Accurate fee calculation for optimal transaction costs

### Security & Storage
- **Hardware-Backed Security**: Platform-specific secure storage (Keychain, Credential Store, Secret Service)
- **Automatic Backend Selection**: Intelligent choice of best available storage backend
- **Tauri Integration**: Enhanced security with Rust-based storage and minimal attack surface
- **Memory Protection**: Secure cleanup and encryption for sensitive data

### Performance Optimization
- **Intelligent Caching**: Reduce FFI calls with smart caching strategies
- **Batch Operations**: Group operations for improved efficiency
- **Resource Management**: Automatic cleanup and leak detection
- **Concurrent Processing**: Managed concurrent operations with resource limits

### Network Support
- **Multi-Network**: Mainnet, testnet, and nextnet configurations
- **Base Node Management**: Automatic peer discovery and connection management
- **Network Health**: Connection monitoring and automatic reconnection
- **Sync Management**: Efficient blockchain synchronization

## Getting Started

Ready to build your first Tari application? Follow our comprehensive guides:

1. **[Installation](./getting-started/installation.md)** - Set up the SDK in your project
2. **[Quick Start](./getting-started/quick-start.md)** - Build your first wallet in 5 minutes
3. **[First Wallet](./getting-started/first-wallet.md)** - Detailed walkthrough of wallet creation
4. **[Configuration](./getting-started/configuration.md)** - Configure networks and storage

## Who Should Use This SDK?

### Wallet Developers
Build feature-rich wallet applications with secure storage, transaction management, and real-time updates.

### DApp Developers
Integrate Tari blockchain functionality into web and desktop applications with type-safe APIs.

### Enterprise Developers
Create secure, scalable applications with enterprise-grade security and performance optimization.

### Blockchain Researchers
Explore Tari network capabilities with comprehensive tooling and detailed documentation.

## Community & Support

- 📖 **Documentation**: Comprehensive guides and API reference
- 💬 **Discord**: [Join the Tari community](https://discord.gg/tari) for real-time support
- 🐛 **GitHub Issues**: [Report bugs and request features](https://github.com/tari-project/tari-javascript-sdk/issues)
- 🌐 **Tari Project**: [Learn more about Tari](https://www.tari.com/)

## What's Next?

- Explore our **[Getting Started Guide](./getting-started/installation.md)** to set up your development environment
- Check out **[Example Applications](../examples/)** to see the SDK in action
- Browse the **[API Reference](../api/)** for detailed method documentation
- Join our **[Discord community](https://discord.gg/tari)** to connect with other developers

Welcome to the Tari ecosystem! Let's build the future of digital ownership together. 🚀
