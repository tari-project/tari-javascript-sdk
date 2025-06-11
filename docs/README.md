# Tari JavaScript SDK Documentation

Welcome to the Tari JavaScript SDK documentation. This directory contains comprehensive documentation for developers working with the Tari JavaScript SDK.

## Documentation Overview

### For SDK Users

- **[Quick Start Guide](../README.md#quick-start)** - Get up and running quickly
- **[API Reference](../packages/wallet/README.md)** - Complete API documentation
- **[TypeScript Integration](typescript.md)** - TypeScript usage patterns
- **[Error Handling](error-handling.md)** - Error handling strategies
- **[Network Configuration](networks.md)** - Multi-network setup

### For Contributors

- **[Development Guide](development.md)** - Development setup and workflow
- **[Architecture Overview](architecture.md)** - System design and structure
- **[Build System](build-system.md)** - Compilation and packaging
- **[Testing Guide](testing.md)** - Testing strategies and patterns
- **[Contributing Guidelines](../CONTRIBUTING.md)** - How to contribute

### Advanced Topics

- **[Performance Optimization](performance.md)** - Optimization strategies
- **[Platform Integration](platforms.md)** - Electron, Node.js specifics
- **[Security Considerations](security.md)** - Security best practices
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

## SDK Architecture

The Tari JavaScript SDK is built as a multi-package monorepo:

```mermaid
graph TD
    A[Applications] --> B[@tari-project/tarijs-wallet]
    B --> C[@tari-project/tarijs-core]
    C --> D[Native FFI Bindings]
    D --> E[Tari Wallet FFI]
    
    F[@tari-project/tarijs-build] --> G[Build Tools]
    G --> D
```

### Package Overview

| Package | Purpose | Status |
|---------|---------|--------|
| `@tari-project/tarijs-core` | Core FFI bindings and utilities | ✅ Foundation complete |
| `@tari-project/tarijs-wallet` | High-level wallet API | ✅ Structure complete |
| `@tari-project/tarijs-build` | Build utilities and scripts | ✅ Foundation complete |

## Development Phases

The SDK is being developed in 14 phases:

### ✅ Phase 1: Project Foundation (Complete)
- NPM workspaces monorepo structure
- TypeScript configuration and build system
- ESLint, Prettier, and Jest configuration
- Core, wallet, and build package scaffolding

### 🚧 Phase 2: Rust FFI Build System (Next)
- Automated Tari source fetching
- Cross-platform Rust compilation
- NAPI-RS integration
- Network-specific build variants

### ⏳ Upcoming Phases (3-14)
- FFI bindings and handle management
- Type system and data models
- Error handling architecture
- Core wallet operations
- Transaction management
- Event system and callbacks
- Advanced wallet features
- Memory management and performance
- Platform-specific features
- Testing infrastructure
- Examples and documentation
- CI/CD and publishing

## Quick Reference

### Common Tasks

```bash
# Development setup
npm install
npm run build
npm test

# Testing specific packages
npm test --workspace=packages/core
npm test --workspace=packages/wallet

# Linting and type checking
npm run lint
npm run typecheck

# Clean rebuild
npm run clean
npm install
npm run build
```

### Package Management

```bash
# Add dependency to specific package
npm install --workspace=packages/wallet some-package

# Run script in specific package
npm run build --workspace=packages/core

# Install all workspace dependencies
npm install
```

### Key APIs

```typescript
// Core types and utilities
import { NetworkType, TariError } from '@tari-project/tarijs-core';

// High-level wallet API
import { TariWallet } from '@tari-project/tarijs-wallet';

// Create wallet
const wallet = await TariWallet.create({
  network: NetworkType.Testnet,
  storagePath: './wallet-data'
});
```

## Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/tari-project/tari-javascript-sdk/issues)
- **Discord**: [Join the Tari community](https://discord.gg/tari)
- **Documentation**: [Browse the full docs](https://docs.tari.com)
- **Examples**: [See usage examples](../examples/)

## Contributing

We welcome contributions! Please see our [Contributing Guide](../CONTRIBUTING.md) for:

- Development setup instructions
- Code style guidelines
- Testing requirements
- Pull request process

---

**Note**: The SDK is currently in Phase 1 with foundational structure complete. Wallet operations are implemented as placeholders that will be replaced with real FFI functionality in subsequent phases.
