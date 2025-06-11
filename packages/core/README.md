# @tari-project/tarijs-core

Core FFI bindings and utilities for the Tari JavaScript SDK.

## Overview

This package provides the fundamental building blocks for interacting with Tari wallet functionality through Rust FFI via NAPI-RS. It contains shared types, error handling infrastructure, memory management utilities, and the low-level bindings that other packages build upon.

## Features

- **Type Safety**: Comprehensive TypeScript definitions for all Tari data structures
- **Memory Management**: Automatic resource tracking and cleanup utilities
- **Error Handling**: Structured error system with contextual information
- **FFI Integration**: NAPI-RS bindings for optimal performance
- **Network Support**: Multi-network configuration (mainnet, testnet, nextnet)

## Installation

```bash
npm install @tari-project/tarijs-core
```

## Usage

```typescript
import { NetworkType, LogLevel, TariError } from '@tari-project/tarijs-core';

// Configure for testnet
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
