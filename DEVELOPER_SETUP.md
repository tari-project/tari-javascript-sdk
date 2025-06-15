# Developer Setup Guide

Complete step-by-step guide for setting up the Tari JavaScript SDK development environment with network-specific FFI binary compilation.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Setup](#quick-setup)
- [Network-Specific Development](#network-specific-development)
- [Build System Overview](#build-system-overview)
- [Testing Setup](#testing-setup)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Node.js**: 18.0.0 or higher ([Download](https://nodejs.org/))
- **npm**: 8.0.0 or higher (included with Node.js)
- **Rust**: 1.70.0 or higher ([Install via rustup](https://rustup.rs/))
- **Git**: For cloning repositories

### Platform-Specific Dependencies

#### macOS
```bash
# Install Xcode command line tools
xcode-select --install

# Install Homebrew (optional, for additional tools)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Linux (Ubuntu/Debian)
```bash
# Install build essentials
sudo apt-get update
sudo apt-get install -y build-essential libssl-dev pkg-config curl

# Install additional dependencies for some distributions
sudo apt-get install -y clang cmake
```

#### Windows
1. Install [Visual Studio Build Tools 2019 or later](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2019)
2. Ensure "C++ build tools" workload is selected
3. Install [Git for Windows](https://git-scm.com/download/win)

### Verify Prerequisites

```bash
# Check Node.js version (should be 18+)
node --version

# Check npm version (should be 8+)
npm --version

# Check Rust version (should be 1.70+)
rustc --version

# Check Cargo
cargo --version

# Check Git
git --version
```

## Quick Setup

### 1. Clone the Repository

```bash
git clone https://github.com/tari-project/tari-javascript-sdk.git
cd tari-javascript-sdk
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
npm install
```

### 3. Setup Tari Source Code

The SDK requires Tari FFI source code for compilation:

```bash
# Fetch and cache Tari source code
npm run setup:tari-source

# This will:
# - Download Tari source for the default version (4.3.1)
# - Extract to .tari-cache/
# - Create a symlink at .tari-cache/tari-current
# - Validate the wallet FFI structure
```

**Advanced Setup Options:**
```bash
# Setup specific version and network
TARI_VERSION=4.3.0 NETWORK_TYPE=testnet npm run setup:tari-source

# Force re-download
FORCE_REFETCH=1 npm run setup:tari-source
```

### 4. Build Network-Specific FFI Binaries

**⚠️ Important**: The SDK requires network-specific FFI binaries. Choose your development network:

#### For Development (Recommended)
```bash
# Build testnet FFI binary (fastest, free test funds available)
npm run build:networks:testnet
```

#### For Production
```bash
# Build mainnet FFI binary (for production applications)
npm run build:networks:mainnet
```

#### Build All Networks
```bash
# Build binaries for all networks (takes 10-15 minutes)
npm run build:all-networks

# Or build in parallel (faster but uses more resources)
npm run build:all-networks:parallel
```

### 5. Verify Installation

```bash
# Validate all builds
npm run validate:build

# Run basic tests
npm run test:unit

# Test FFI integration
npm run test:integration
```

## Network-Specific Development

### Understanding Networks

The Tari JavaScript SDK supports three networks:

| Network | Purpose | Binary Required | Test Funds |
|---------|---------|-----------------|------------|
| **testnet** | Development & testing | `dist/native/testnet/` | Available via [Discord faucet](https://discord.gg/tari) |
| **mainnet** | Production applications | `dist/native/mainnet/` | Real Tari required |
| **nextnet** | Pre-release testing | `dist/native/nextnet/` | Limited availability |

### Network-Specific Binary Compilation

Each network requires its own compiled FFI binary:

```bash
# Build for specific network
npm run build:networks:testnet   # ~3-5 minutes
npm run build:networks:mainnet   # ~3-5 minutes  
npm run build:networks:nextnet   # ~3-5 minutes

# Clean previous builds
npm run build:networks:clean

# Build current network only (uses TARI_NETWORK env var)
TARI_NETWORK=testnet npm run build:networks:current
```

### Binary Organization

Compiled binaries are organized by network and platform:

```
dist/native/
├── testnet/
│   ├── darwin-arm64/
│   │   └── tari-wallet-ffi.node
│   ├── darwin-x64/
│   │   └── tari-wallet-ffi.node
│   ├── linux-x64/
│   │   └── tari-wallet-ffi.node
│   └── win32-x64/
│       └── tari-wallet-ffi.node
├── mainnet/
│   └── (same structure)
└── nextnet/
    └── (same structure)
```

### Network-Aware Development

**Always specify the network** in your application code:

```typescript
import { loadNativeModuleForNetwork, NetworkType } from '@tari-project/tarijs-core';
import { TariWallet } from '@tari-project/tarijs-wallet';

// STEP 1: Load network-specific FFI binary
await loadNativeModuleForNetwork(NetworkType.Testnet);

// STEP 2: Create wallet with matching network
const wallet = await TariWallet.create({
  network: NetworkType.Testnet,  // Must match loaded binary
  // ... other config
});
```

**Network Mismatch Protection:**
- The SDK validates that the loaded FFI binary matches the wallet network
- Attempting to use mismatched networks will throw an error
- Integration tests verify network-specific binary loading

## Build System Overview

### Build Scripts

| Script | Purpose | Duration |
|--------|---------|----------|
| `npm run setup:tari-source` | Fetch Tari source code | 1-2 min |
| `npm run build:networks:testnet` | Build testnet FFI binary | 3-5 min |
| `npm run build:all-networks` | Build all network binaries sequentially | 10-15 min |
| `npm run build:all-networks:parallel` | Build all networks in parallel | 5-8 min |
| `npm run validate:build` | Validate all binaries and structure | 1-2 min |

### Build Environment Variables

| Variable | Purpose | Default | Example |
|----------|---------|---------|---------|
| `TARI_NETWORK` | Target network for build | `mainnet` | `testnet` |
| `TARI_VERSION` | Tari source version | `4.3.1` | `4.3.0` |
| `TARI_SOURCE_PATH` | Custom Tari source path | Auto-detected | `/path/to/tari` |
| `NETWORK_TYPE` | Legacy network variable | `mainnet` | `testnet` |

### Build Process Flow

1. **Source Setup**: Download and cache Tari source code
2. **Environment Configuration**: Set network-specific variables
3. **Rust Compilation**: Compile FFI binary with NAPI-RS
4. **Platform Detection**: Determine target platform (darwin-arm64, etc.)
5. **Binary Placement**: Copy to `dist/native/{network}/{platform}/`
6. **Validation**: Verify binary properties and loading

## Testing Setup

### Test Configuration

The SDK uses a three-tier testing approach:

```bash
# Unit tests (mocked FFI, fastest)
npm run test:unit

# Integration tests (real FFI, network-specific)
TARI_NETWORK=testnet npm run test:integration

# End-to-end tests (funded wallets, manual)
npm run test:manual
```

### Network-Specific Testing

Integration tests automatically use network-specific binaries:

```typescript
// Integration tests automatically load correct network binary
describe('Wallet Integration Tests', () => {
  beforeAll(async () => {
    // Loads binary based on TARI_NETWORK environment variable
    await loadNativeModuleForNetwork(getTestNetwork());
  });
});
```

### Test Environment Setup

```bash
# Set test network (default: testnet)
export TARI_NETWORK=testnet

# Run network-specific integration tests
npm run test:integration

# Validate specific network
TARI_NETWORK=mainnet npm run validate:build
```

## Development Workflow

### Daily Development

1. **Start Development Session**
   ```bash
   # Ensure network binary is available
   npm run build:networks:testnet
   
   # Run integration tests to verify
   npm run test:integration
   ```

2. **Make Changes**
   - Modify TypeScript code in `packages/`
   - Add tests for new functionality
   - Update documentation as needed

3. **Validate Changes**
   ```bash
   # Type checking
   npm run type-check
   
   # Linting
   npm run lint:fix
   
   # Unit tests
   npm run test:unit
   
   # Integration tests (if FFI changes)
   npm run test:integration
   ```

4. **Build Validation**
   ```bash
   # Ensure all builds work
   npm run validate:build
   ```

### Making FFI Changes

If modifying native FFI code:

1. **Clean Previous Builds**
   ```bash
   npm run build:networks:clean
   ```

2. **Rebuild Affected Networks**
   ```bash
   npm run build:networks:testnet
   ```

3. **Validate Changes**
   ```bash
   npm run test:integration
   npm run validate:build
   ```

### Switching Networks

To switch development between networks:

1. **Build Target Network Binary**
   ```bash
   npm run build:networks:mainnet
   ```

2. **Update Application Code**
   ```typescript
   // Change network in your application
   await loadNativeModuleForNetwork(NetworkType.Mainnet);
   const wallet = await TariWallet.create({
     network: NetworkType.Mainnet,
     // ...
   });
   ```

3. **Test Network Switch**
   ```bash
   TARI_NETWORK=mainnet npm run test:integration
   ```

### Release Preparation

Before creating releases:

1. **Build All Networks**
   ```bash
   npm run build:all-networks
   ```

2. **Comprehensive Validation**
   ```bash
   npm run validate:build
   npm run test:unit
   npm run test:integration
   ```

3. **Documentation Updates**
   ```bash
   npm run docs:build
   ```

## Troubleshooting

### Common Issues

#### "FFI Binary Not Found"

**Problem**: `Error: FFI binary not found for network: testnet`

**Solution**:
```bash
# Build the missing network binary
npm run build:networks:testnet

# Verify it was created
ls -la dist/native/testnet/
```

#### "Tari Source Not Found"

**Problem**: `Tari source not found and required for build`

**Solution**:
```bash
# Setup Tari source
npm run setup:tari-source

# Verify cache
ls -la .tari-cache/tari-current
```

#### "Node.js Version Incompatible"

**Problem**: `engine incompatible` errors

**Solution**:
```bash
# Check current version
node --version

# Upgrade Node.js (using nvm)
nvm install 18
nvm use 18

# Or download from nodejs.org
```

#### "Rust Compilation Failed"

**Problem**: Rust compilation errors during build

**Solution**:
```bash
# Update Rust toolchain
rustup update

# Check Rust version
rustc --version  # Should be 1.70+

# Clean and rebuild
npm run build:networks:clean
npm run build:networks:testnet
```

#### "Permission Denied" on Scripts

**Problem**: Script execution fails on Unix systems

**Solution**:
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Re-run the command
npm run build:networks:testnet
```

### Platform-Specific Issues

#### macOS: "xcrun: error"

**Problem**: Xcode command line tools missing

**Solution**:
```bash
xcode-select --install
```

#### Linux: "libssl.so not found"

**Problem**: Missing SSL development libraries

**Solution**:
```bash
sudo apt-get install libssl-dev pkg-config
```

#### Windows: "MSVC not found"

**Problem**: Visual Studio Build Tools missing

**Solution**:
1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2019)
2. Select "C++ build tools" workload
3. Restart terminal and retry

### Getting Help

#### Check Build Status
```bash
# Comprehensive validation
npm run validate:build

# Check FFI loading
node -e "
const { loadNativeModuleForNetwork, NetworkType } = require('@tari-project/tarijs-core');
loadNativeModuleForNetwork(NetworkType.Testnet)
  .then(() => console.log('✅ FFI works'))
  .catch(err => console.error('❌ FFI failed:', err.message));
"
```

#### Enable Debug Logging
```bash
# Detailed build output
DEBUG=1 npm run build:networks:testnet

# Verbose npm logs
npm run build:networks:testnet --verbose
```

#### Community Support

- **Discord**: [Join Tari Community](https://discord.gg/tari) - Real-time help
- **GitHub Issues**: [Report bugs](https://github.com/tari-project/tari-javascript-sdk/issues)
- **Documentation**: [Complete API docs](docs/)

### Advanced Setup

#### Custom Tari Source

```bash
# Use custom Tari source location
export TARI_SOURCE_PATH=/path/to/custom/tari
npm run build:networks:testnet
```

#### Cross-Platform Building

```bash
# Build for specific target (requires cross-compilation setup)
export TARGET=aarch64-apple-darwin
npm run build:networks:testnet
```

#### CI/CD Integration

```bash
# Automated build validation
npm run setup:tari-source
npm run build:all-networks --parallel
npm run validate:build
npm run test:integration
```

---

**Next Steps**:
- [Quick Start Guide](docs/docs/getting-started/quick-start.md)
- [API Documentation](docs/docs/api/)
- [Example Applications](examples/)
- [Network Build Guide](docs/docs/development/network-builds.md)
