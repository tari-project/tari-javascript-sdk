# @tari-project/tarijs-build

Build utilities and automation scripts for the Tari JavaScript SDK.

## Overview

This package contains build tooling for compiling Tari's Rust FFI bindings into JavaScript-compatible native modules. It handles source fetching, cross-platform compilation, and network-specific package variants.

## Features

- **Source Management**: Automated fetching of Tari source code from GitHub
- **FFI Compilation**: Cross-platform Rust to NAPI-RS compilation
- **Network Variants**: Build separate packages for mainnet, testnet, and nextnet
- **Target Support**: Multi-platform binary generation
- **Package Creation**: Automated NPM package variant generation

## Scripts

### fetch-tari

Downloads Tari source code for compilation.

```bash
npx fetch-tari 4.3.1 testnet
```

### compile-ffi

Compiles Rust FFI bindings to native modules.

```bash
npx compile-ffi ./tari-source ./output
```

### package-variants

Creates network-specific NPM packages.

```bash
npx package-variants ./dist
```

## Build Configuration

### Supported Targets

- Windows x64 (`x86_64-pc-windows-msvc`)
- macOS Intel (`x86_64-apple-darwin`)
- macOS Apple Silicon (`aarch64-apple-darwin`)
- Linux x64 (`x86_64-unknown-linux-gnu`)
- Linux ARM64 (`aarch64-unknown-linux-gnu`)
- Alpine Linux (`x86_64-unknown-linux-musl`)

### Network Variants

The build system creates separate packages for each Tari network:

- `@tari-project/tarijs-wallet` (mainnet)
- `@tari-project/tarijs-wallet-testnet` (testnet)
- `@tari-project/tarijs-wallet-nextnet` (nextnet)

## Usage

This package is primarily used during development and CI/CD. End users typically won't interact with it directly.

```typescript
import { NetworkBuilder } from '@tari-project/tarijs-build';

// Build for testnet
await NetworkBuilder.buildForNetwork('4.3.1', NetworkType.Testnet);
```

## Development Status

This package contains placeholder implementations that will be completed in Phase 2 of the SDK development. The build scripts are structured but not yet functional.

## License

BSD-3-Clause
