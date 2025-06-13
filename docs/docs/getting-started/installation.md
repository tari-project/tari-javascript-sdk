# Installation

This guide will help you install and set up the Tari JavaScript SDK in your project. The SDK supports multiple environments and provides optimized installations for different use cases.

## System Requirements

### Node.js Environment
- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher (or yarn 1.22.0+ / pnpm 7.0.0+)
- **TypeScript**: 5.3.0 or higher (recommended)

### Operating System Support
- **macOS**: 10.15 (Catalina) or later
- **Windows**: Windows 10 or later
- **Linux**: Ubuntu 18.04+ / CentOS 7+ / Other modern distributions

### Development Tools (Optional)
- **Rust**: 1.70.0 or higher (for building from source)
- **Git**: For cloning repositories and examples

## Package Installation

### Basic Installation

For most applications, install the main wallet package:

```bash
npm install @tari-project/tarijs-wallet
```

This includes all necessary dependencies including the core package.

### Core Package Only

For low-level integrations or minimal bundle size:

```bash
npm install @tari-project/tarijs-core
```

### TypeScript Support

The SDK includes comprehensive TypeScript definitions. For optimal development experience:

```bash
npm install --save-dev typescript @types/node
```

## Platform-Specific Setup

### Node.js Applications

```bash
# Standard Node.js application
npm install @tari-project/tarijs-wallet

# For server applications with additional security
npm install @tari-project/tarijs-wallet keytar
```

### Electron Applications

```bash
# Main Electron dependencies
npm install @tari-project/tarijs-wallet

# Electron-specific secure storage
npm install electron-store

# Development dependencies
npm install --save-dev electron electron-builder
```

### Tauri Applications

```bash
# Tauri provides the best performance and security
npm install @tari-project/tarijs-wallet

# Tauri CLI (if not already installed)
npm install --save-dev @tauri-apps/cli
cargo install tauri-cli
```

### Browser/Web Applications

```bash
# Web applications (limited functionality)
npm install @tari-project/tarijs-wallet

# Additional polyfills may be needed
npm install --save-dev @types/web
```

## Network-Specific Packages

The SDK supports multiple Tari networks with optimized builds:

### Mainnet (Production)
```bash
npm install @tari-project/tarijs-wallet
# Default configuration uses mainnet
```

### Testnet (Development)
```bash
npm install @tari-project/tarijs-wallet
# Configure for testnet in your application
```

### Nextnet (Pre-release)
```bash
npm install @tari-project/tarijs-wallet
# Configure for nextnet for testing latest features
```

## Verification

### Installation Verification

Create a test file to verify your installation:

```typescript
// test-installation.ts
import { TariWallet, NetworkType } from '@tari-project/tarijs-wallet';

async function testInstallation() {
  try {
    console.log('✅ Tari SDK imported successfully');
    
    // Test platform detection
    const { PlatformDetector } = await import('@tari-project/tarijs-wallet');
    const platform = PlatformDetector.detect();
    console.log(`✅ Platform detected: ${platform.runtime}`);
    console.log(`✅ Storage backend: ${platform.storage.primary}`);
    
    // Test network types
    console.log(`✅ Network types available: ${Object.values(NetworkType)}`);
    
    console.log('🎉 Installation verified successfully!');
  } catch (error) {
    console.error('❌ Installation verification failed:', error);
  }
}

testInstallation();
```

Run the verification:

```bash
# TypeScript
npx ts-node test-installation.ts

# JavaScript (after compilation)
node test-installation.js
```

### Platform Capability Check

```typescript
import { PlatformDetector, createSecureStorage } from '@tari-project/tarijs-wallet';

async function checkCapabilities() {
  const platform = PlatformDetector.detect();
  
  console.log('Platform Capabilities:');
  console.log(`- Runtime: ${platform.runtime}`);
  console.log(`- Security Level: ${platform.securityLevel}`);
  console.log(`- Hardware Backing: ${platform.hardwareBacked}`);
  
  if (platform.runtime === 'tauri') {
    console.log('🦀 Tauri optimization available!');
    console.log('- 60% lower memory usage');
    console.log('- 10x faster startup time');
    console.log('- Hardware-backed security');
  }
  
  // Test storage creation
  try {
    const storage = await createSecureStorage({ testBackends: true });
    console.log(`✅ Secure storage: ${storage.backend}`);
  } catch (error) {
    console.log(`⚠️  Storage setup: ${error.message}`);
  }
}
```

## Common Installation Issues

### Node.js Version Errors

**Error**: `engine "node" is incompatible`

**Solution**:
```bash
# Check your Node.js version
node --version

# Upgrade Node.js if needed
# Via nvm (recommended)
nvm install 18
nvm use 18

# Or download from nodejs.org
```

### TypeScript Configuration

**Error**: TypeScript compilation errors

**Solution**: Create or update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Native Dependencies

**Error**: Native module compilation failures

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Rebuild native modules
npm rebuild

# For Electron apps
npx electron-rebuild
```

### Platform-Specific Issues

#### macOS: Keychain Access
```bash
# May require Xcode command line tools
xcode-select --install
```

#### Linux: Secret Service
```bash
# Ubuntu/Debian
sudo apt-get install libsecret-1-dev

# CentOS/RHEL
sudo yum install libsecret-devel
```

#### Windows: Build Tools
```bash
# Install Windows Build Tools
npm install --global windows-build-tools
```

## Next Steps

Once installation is complete:

1. **[Quick Start Guide](./quick-start.md)** - Create your first wallet in 5 minutes
2. **[Configuration](./configuration.md)** - Set up networks and storage options
3. **[First Wallet](./first-wallet.md)** - Detailed wallet creation walkthrough

## Development Installation

For contributing to the SDK or building from source:

```bash
# Clone the repository
git clone https://github.com/tari-project/tari-javascript-sdk.git
cd tari-javascript-sdk

# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Link for local development
npm link
cd your-project
npm link @tari-project/tarijs-wallet
```

## Troubleshooting

If you encounter issues during installation:

1. **Check Node.js version**: Ensure you're using Node.js 18.0.0 or higher
2. **Clear caches**: Run `npm cache clean --force`
3. **Update npm**: Run `npm install -g npm@latest`
4. **Check platform support**: Verify your OS is supported
5. **Review error logs**: Look for specific error messages in npm logs

For additional help:
- 📖 [Troubleshooting Guide](../troubleshooting/common-errors.md)
- 💬 [Discord Community](https://discord.gg/tari)
- 🐛 [GitHub Issues](https://github.com/tari-project/tari-javascript-sdk/issues)

Ready to build your first wallet? Continue to the **[Quick Start Guide](./quick-start.md)**.
