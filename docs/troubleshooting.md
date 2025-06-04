# Troubleshooting Guide

## Build Issues

### Native module fails to load

**Error**: `Error: Cannot find module '../native/index.node'`

**Solution**:
1. Ensure you've built the native module: `npm run build:native`
2. Check that your platform is supported
3. Try building from source: `npm install --build-from-source`

### Cross-compilation fails on Linux ARM64

**Error**: `error: linker 'aarch64-linux-gnu-gcc' not found`

**Solution**:
```bash
sudo apt-get update
sudo apt-get install -y gcc-aarch64-linux-gnu g++-aarch64-linux-gnu
```

### Windows build fails

**Error**: `error: Microsoft Visual C++ 14.0 or greater is required`

**Solution**:
1. Install Visual Studio 2019 or later
2. Install "Desktop development with C++" workload
3. Restart your terminal

## Runtime Issues

### Wallet connection fails

**Error**: `Error: Failed to connect wallet: Network error`

**Solution**:
1. Check your internet connection
2. Verify base node address and public key
3. Ensure firewall isn't blocking connections
4. Try using a different base node

### Insufficient balance error

**Error**: `Error: Insufficient balance for transaction`

**Solution**:
1. Check wallet balance: `wallet.getBalance()`
2. Ensure UTXOs are confirmed
3. Account for transaction fees
4. Run UTXO scan: `wallet.scanForUtxos()`

## Platform-Specific Issues

### macOS: Library not loaded

**Error**: `dyld: Library not loaded`

**Solution**:
```bash
# Install Xcode command line tools
xcode-select --install

# Rebuild native module
npm run build:native
```

### Linux: GLIBC version error

**Error**: `version 'GLIBC_2.28' not found`

**Solution**:
Use the musl build or upgrade your system:
```bash
# Use Alpine-based Docker image
docker run -it node:18-alpine npm install @tari-project/wallet
```

### Windows: Missing DLL

**Error**: `The specified module could not be found`

**Solution**:
1. Install Visual C++ Redistributable
2. Ensure PATH includes Node.js binary directory
3. Restart your terminal/IDE

## Development Setup

### Rust toolchain issues

Ensure you have the correct Rust version:
```bash
rustup update
rustup install 1.75.0
rustup default 1.75.0
```

### Node version compatibility

The SDK requires Node.js 16 or later:
```bash
node --version  # Should be >= 16.0.0
```

## Getting Help

If you're still experiencing issues:

1. Check existing issues: https://github.com/fluffypony/tari-javascript-sdk/issues
2. Join our Discord: https://discord.gg/tari
3. Create a new issue with:
   - Your platform (OS, architecture)
   - Node.js version
   - Error messages
   - Steps to reproduce
