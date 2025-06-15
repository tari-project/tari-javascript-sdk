# Network-Specific Build System

The Tari JavaScript SDK uses **real FFI bindings** to interact with the Tari blockchain. This means you must compile network-specific native binaries before using the SDK. This guide covers the comprehensive network build system.

## Overview

The SDK supports three Tari networks, each requiring separate FFI binary compilation:

- **Mainnet**: Production Tari network for real transactions
- **Testnet**: Testing network with free test funds 
- **Nextnet**: Pre-release network for cutting-edge features

Each network has its own compiled FFI binary stored in `dist/native/{network}/{platform}/` directories.

## Prerequisites

### System Requirements

- **Node.js 18.0.0+**: Runtime and package management
- **Rust 1.70.0+**: FFI compilation via Cargo
- **Platform tools**: 
  - macOS: Xcode Command Line Tools
  - Linux: build-essential, libssl-dev
  - Windows: MSVC 2019+ or Build Tools for Visual Studio

### Verify Installation

```bash
# Check versions
node --version    # Should be 18.0.0+
rustc --version   # Should be 1.70.0+
cargo --version   # Should be latest

# Check platform tools
cc --version      # C compiler
```

## Quick Start

### 1. Initial Setup

```bash
# Clone the SDK
git clone https://github.com/tari-project/tari-javascript-sdk.git
cd tari-javascript-sdk

# Install dependencies
npm install

# Set up Tari source code (required for compilation)
npm run setup:tari-source
```

### 2. Build All Networks

```bash
# Build binaries for all networks (5-10 minutes)
npm run build:networks

# Verify build output
ls -la dist/native/
# Should show: mainnet/ testnet/ nextnet/ directories

ls -la dist/native/testnet/
# Should show platform-specific directories with .node files
```

### 3. Verify Installation

```bash
# Test that binaries work
npm run test:integration
```

## Network Build Commands

### Build All Networks

```bash
# Build mainnet, testnet, and nextnet sequentially
npm run build:networks

# Build with debug symbols (slower, larger files)
BUILD_TYPE=debug npm run build:networks

# Build without cleaning between networks (faster, may have issues)
CLEAN_BETWEEN_BUILDS=false npm run build:networks
```

### Build Specific Networks

```bash
# Build only testnet (recommended for development)
npm run build:networks:testnet

# Build only mainnet (for production)
npm run build:networks:mainnet

# Build only nextnet (for latest features)
npm run build:networks:nextnet

# Build current platform for all networks
npm run build:networks:current
```

### Clean Build Artifacts

```bash
# Clean all network builds
npm run build:networks:clean

# Clean and rebuild all networks
npm run build:networks:clean && npm run build:networks
```

## Build Process Details

### Network-Specific Compilation

Each network build:

1. **Sets environment variables:**
   ```bash
   export TARI_NETWORK="testnet"  # or mainnet/nextnet
   export NETWORK="testnet"
   ```

2. **Compiles Rust FFI with network features:**
   ```bash
   cargo build --release --target {platform} --package tari-wallet-ffi
   ```

3. **Generates NAPI-compatible .node files:**
   ```
   dist/native/testnet/x86_64-apple-darwin/tari-wallet-ffi.darwin-x64.node
   ```

4. **Validates compilation:**
   - Verifies binary exists
   - Checks for required FFI functions
   - Tests basic loading

### Supported Platforms

The build system compiles for all supported platforms:

| Platform | Architecture | Output Binary |
|----------|--------------|---------------|
| macOS    | Intel (x64)  | `tari-wallet-ffi.darwin-x64.node` |
| macOS    | Apple Silicon (arm64) | `tari-wallet-ffi.darwin-arm64.node` |
| Linux    | x64          | `tari-wallet-ffi.linux-x64.node` |
| Linux    | ARM64        | `tari-wallet-ffi.linux-arm64.node` |
| Windows  | x64          | `tari-wallet-ffi.win32-x64.node` |

### Directory Structure

After compilation:

```
dist/native/
├── mainnet/
│   ├── x86_64-apple-darwin/
│   │   └── tari-wallet-ffi.darwin-x64.node
│   ├── aarch64-apple-darwin/
│   │   └── tari-wallet-ffi.darwin-arm64.node
│   └── ... (other platforms)
├── testnet/
│   ├── x86_64-apple-darwin/
│   │   └── tari-wallet-ffi.darwin-x64.node
│   └── ... (other platforms)
└── nextnet/
    └── ... (same structure)
```

## Using Network-Specific Binaries

### Automatic Network Resolution

The SDK automatically loads the correct binary for your network:

```typescript
import { TariWallet, NetworkType, loadNativeModuleForNetwork } from '@tari-project/tarijs-wallet';

// Load testnet FFI binary
await loadNativeModuleForNetwork(NetworkType.Testnet);

// Create wallet - automatically uses testnet binary
const wallet = await TariWallet.create({
  network: NetworkType.Testnet,
  storagePath: './wallet-data',
});
```

### Manual Binary Resolution

For advanced use cases:

```typescript
import { BinaryResolver, NetworkType } from '@tari-project/tarijs-core';

// Create network-aware resolver
const resolver = new BinaryResolver({
  network: NetworkType.Testnet,
  enableNetworkFallback: true  // Falls back to mainnet if testnet not found
});

// Resolve binary path
const resolved = resolver.resolveBinary(NetworkType.Testnet);
console.log(`Using binary: ${resolved.path}`);
console.log(`Network: ${resolved.network}`);
console.log(`Source: ${resolved.source}`);
```

### Fallback Hierarchy

When a network binary is not found, the SDK automatically falls back:

1. **Requested network** (e.g., nextnet)
2. **Mainnet** (most stable)
3. **Testnet** (backup)
4. **Error** if none found

This ensures development continues even with missing network builds.

## Development Workflow

### For Application Developers

```bash
# 1. Build testnet for development
npm run build:networks:testnet

# 2. Develop your application
npm run dev

# 3. Test integration
npm run test:integration

# 4. Before production, build mainnet
npm run build:networks:mainnet
```

### For SDK Contributors

```bash
# 1. Build all networks for testing
npm run build:networks

# 2. Run comprehensive tests
npm run test:unit           # Fast tests with mocks
npm run test:integration    # Real FFI tests
npm run test:e2e           # Network connectivity tests

# 3. Validate on multiple platforms
npm run test:all
```

## Troubleshooting

### Common Build Errors

#### Rust Toolchain Issues

```bash
# Error: rustc not found
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Error: target not found
rustup target add x86_64-apple-darwin  # Replace with your target
```

#### Platform-Specific Issues

**macOS:**
```bash
# Error: Xcode tools not found
xcode-select --install

# Error: Security framework issues
export MACOSX_DEPLOYMENT_TARGET=10.15
```

**Linux:**
```bash
# Error: libssl not found
sudo apt-get install libssl-dev  # Ubuntu/Debian
sudo yum install openssl-devel   # RHEL/CentOS
```

**Windows:**
```bash
# Error: MSVC not found
# Install Visual Studio Build Tools 2019+
# Or install Visual Studio Community with C++ tools
```

#### Network Build Issues

```bash
# Error: Tari source not found
npm run setup:tari-source

# Error: cargo clean needed
npm run build:networks:clean
npm run build:networks

# Error: binary not found during tests
TARI_NETWORK=testnet npm run test:integration
```

### Binary Validation

Check that binaries were built correctly:

```bash
# List all built binaries
find dist/native -name "*.node" -ls

# Test binary loading
node -e "
const { loadNativeModuleForNetwork, NetworkType } = require('@tari-project/tarijs-core');
loadNativeModuleForNetwork(NetworkType.Testnet)
  .then(() => console.log('✅ Binary loads successfully'))
  .catch(err => console.error('❌ Binary load failed:', err));
"
```

### Performance Optimization

```bash
# Use parallel builds (faster but more memory)
npm run build:networks -- --parallel

# Use incremental builds (faster for development)
CLEAN_BETWEEN_BUILDS=false npm run build:networks

# Build only current platform
npm run build:networks:current
```

## Advanced Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TARI_NETWORK` | Network to build | `mainnet` |
| `BUILD_TYPE` | Build profile | `release` |
| `CLEAN_BETWEEN_BUILDS` | Clean between networks | `true` |
| `TARI_SOURCE_PATH` | Tari source location | `.tari-cache/tari-current` |

### Custom Binary Paths

```typescript
import { BinaryResolver } from '@tari-project/tarijs-core';

// Use custom search paths
const resolver = new BinaryResolver({
  searchPaths: ['/custom/path/to/binaries'],
  network: NetworkType.Testnet
});
```

### Docker Builds

```dockerfile
FROM node:18

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install dependencies
RUN apt-get update && apt-get install -y build-essential libssl-dev

# Copy and build
COPY . /workspace
WORKDIR /workspace
RUN npm install && npm run setup:tari-source && npm run build:networks
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Build Networks
on: [push, pull_request]

jobs:
  build-networks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Build Networks
        run: |
          npm install
          npm run setup:tari-source
          npm run build:networks
      - name: Test Integration
        run: npm run test:integration
        env:
          TARI_NETWORK: testnet
```

### Caching Strategy

```yaml
- name: Cache Tari Source
  uses: actions/cache@v3
  with:
    path: .tari-cache
    key: tari-source-${{ hashFiles('scripts/setup-tari.mjs') }}

- name: Cache Rust Dependencies
  uses: actions/cache@v3
  with:
    path: |
      native/target
      ~/.cargo/registry
    key: rust-${{ hashFiles('native/**/Cargo.toml') }}
```

## Best Practices

### Development

1. **Build testnet first** for faster iteration
2. **Use integration tests** to validate binaries
3. **Clean builds** when switching networks frequently
4. **Monitor build times** and optimize as needed

### Production

1. **Build mainnet binaries** in CI/CD
2. **Validate all platforms** before release
3. **Test network fallbacks** work correctly
4. **Document network requirements** for users

### Team Collaboration

1. **Share build artifacts** to avoid everyone compiling
2. **Use consistent Rust versions** across team
3. **Document platform-specific issues** 
4. **Set up shared build infrastructure** if possible

## Next Steps

- [Integration Testing Guide](../testing/integration.md)
- [Production Deployment](../deployment/production.md)  
- [Platform-Specific Setup](../platforms/setup.md)
- [Contributing to Builds](../contributing/builds.md)
