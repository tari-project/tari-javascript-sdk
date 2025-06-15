# @tari-project/tarijs-core

Core FFI bindings and utilities for the Tari JavaScript SDK using **real minotari_wallet_ffi**.

## Overview

This package provides the fundamental building blocks for interacting with Tari wallet functionality through **real Rust FFI via NAPI-RS**. It contains shared types, error handling infrastructure, memory management utilities, and the low-level bindings that other packages build upon. **No mock implementations** - all FFI calls connect to actual Tari blockchain functionality.

## Features

- **Real FFI Integration**: Direct NAPI-RS bindings to minotari_wallet_ffi (no mocks)
- **Network-Aware Binary Loading**: Automatic resolution of network-specific FFI binaries
- **Type Safety**: Comprehensive TypeScript definitions for all Tari data structures
- **Memory Management**: Automatic resource tracking and cleanup utilities
- **Error Handling**: Structured error system with contextual information
- **Multi-Network Support**: Mainnet, testnet, and nextnet with fallback chains

## Installation

```bash
npm install @tari-project/tarijs-core
```

## Usage

```typescript
import { 
  NetworkType, 
  LogLevel, 
  TariError,
  loadNativeModuleForNetwork,
  BinaryResolver 
} from '@tari-project/tarijs-core';

// Load real FFI binary for testnet
await loadNativeModuleForNetwork(NetworkType.Testnet);

// Validate network binary availability
const resolver = new BinaryResolver({ 
  network: NetworkType.Testnet,
  enableNetworkFallback: true 
});
const resolved = resolver.resolveBinary(NetworkType.Testnet);
console.log(`Binary found: ${resolved.exists} at ${resolved.path}`);

// Configure for testnet with real FFI
const config = {
  network: NetworkType.Testnet,
  logLevel: LogLevel.Info
};
```

## API Reference

### Types

- `NetworkType` - Supported Tari networks (Mainnet, Testnet, Nextnet)
- `LogLevel` - Logging levels for debugging
- `BaseConfig` - Base configuration interface
- `FFIResource` - Interface for FFI handle management

### Errors

- `TariError` - Base error class with structured error codes
- `ErrorCode` - Enumeration of all possible error conditions
- `createError()` - Helper for creating errors with context

### Utilities

- `validateRequired()` - Validate required fields
- `validatePositive()` - Validate positive numbers
- `withTimeout()` - Add timeout to promises
- `ResourceTracker` - Memory leak detection

## Development

This package is part of the Tari JavaScript SDK monorepo. See the root README for development setup instructions.

## License

BSD-3-Clause
