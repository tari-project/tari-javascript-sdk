# Tauri Wallet App - Development Guide

This guide covers development setup, architecture, and workflows for the Tauri wallet application example.

## Prerequisites

### Required Software

- **Node.js** 18.0.0 or higher
- **Rust** 1.70.0 or higher
- **Tauri CLI** (latest version)

### Platform-Specific Requirements

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js (via Homebrew)
brew install node

# Install Tauri CLI
cargo install tauri-cli
```

#### Windows
```powershell
# Install Rust
# Download and run rustup-init.exe from https://rustup.rs/

# Install Node.js
# Download and install from https://nodejs.org/

# Install Microsoft C++ Build Tools
# Download Visual Studio Installer and install "C++ build tools"

# Install Tauri CLI
cargo install tauri-cli
```

#### Linux (Ubuntu/Debian)
```bash
# Install system dependencies
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Tauri CLI
cargo install tauri-cli
```

## Quick Start

### 1. Setup Development Environment

```bash
# Navigate to the example directory
cd examples/tauri-wallet-app

# Install frontend dependencies
npm install

# Install Rust dependencies (automatic during first build)
# This will download and compile the Tari FFI dependencies
```

### 2. Development Mode

```bash
# Start development server with hot reload
npm run tauri:dev

# Alternative: Start components separately
npm run dev           # Frontend only (http://localhost:3000)
cargo tauri dev       # Start Tauri wrapper
```

### 3. Building for Production

```bash
# Build optimized application
npm run tauri:build

# The built application will be available in:
# - macOS: src-tauri/target/release/bundle/macos/
# - Windows: src-tauri/target/release/bundle/msi/
# - Linux: src-tauri/target/release/bundle/deb/ (or /appimage/)
```

## Project Architecture

### Frontend Architecture (React + TypeScript)

```
src/
├── components/           # React UI components
│   ├── WalletDashboard.tsx      # Main dashboard
│   ├── BalanceDisplay.tsx       # Balance information
│   ├── AddressDisplay.tsx       # Wallet address
│   ├── TransactionForm.tsx      # Send transaction form
│   ├── TransactionHistory.tsx   # Transaction list
│   ├── StorageMetrics.tsx       # Storage backend info
│   ├── LoadingSpinner.tsx       # Loading states
│   └── ErrorBoundary.tsx        # Error handling
├── hooks/               # React hooks
│   └── useWallet.ts            # Wallet state management
├── services/            # Business logic
│   └── TauriWalletService.ts   # Tauri API integration
├── types/              # TypeScript definitions
│   ├── wallet.ts              # Wallet data types
│   └── tauri.d.ts            # Tauri runtime types
├── utils/              # Utility functions
│   ├── formatting.ts          # Data formatting
│   └── validation.ts          # Input validation
├── styles/             # CSS styles
│   └── globals.css           # Global styles
├── __tests__/          # Test files
└── main.tsx           # Application entry point
```

### Backend Architecture (Rust + Tauri)

```
src-tauri/src/
├── main.rs             # Tauri application entry
├── commands.rs         # Tauri command handlers
├── wallet.rs          # Wallet logic with real FFI
├── storage.rs         # Cross-platform secure storage
└── error.rs           # Error handling and types
```

### Key Design Decisions

1. **Real FFI Integration**: Uses actual `minotari_wallet_ffi` instead of mocks
2. **Type Safety**: Comprehensive TypeScript types for all data structures
3. **Security First**: Hardware-backed storage, input validation, error sanitization
4. **Performance**: Optimized caching, batch operations, minimal bundle size
5. **Cross-Platform**: Platform-specific storage backends with unified interface

## Development Workflows

### Adding New Features

1. **Define Types** (src/types/wallet.ts)
   ```typescript
   export interface NewFeature {
     id: string;
     name: string;
     // ... other properties
   }
   ```

2. **Add Tauri Commands** (src-tauri/src/commands.rs)
   ```rust
   #[tauri::command]
   pub async fn new_feature_command(
       param: String,
       state: State<'_, AppState>,
   ) -> Result<ApiResponse<NewFeature>, String> {
       // Implementation
   }
   ```

3. **Update Service Layer** (src/services/TauriWalletService.ts)
   ```typescript
   async newFeature(param: string): Promise<NewFeature> {
     const response = await invoke<ApiResponse<NewFeature>>('new_feature_command', { param });
     // Handle response
   }
   ```

4. **Create React Components**
   ```typescript
   export function NewFeatureComponent() {
     // Component implementation
   }
   ```

5. **Add Tests**
   ```typescript
   describe('NewFeature', () => {
     it('should work correctly', () => {
       // Test implementation
     });
   });
   ```

### Testing Strategy

#### Unit Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Integration Tests
```bash
# Test Tauri commands
npm run test:tauri

# Test with real FFI (requires compiled native modules)
npm run test:integration
```

#### Manual Testing
```bash
# Start development server
npm run tauri:dev

# Test wallet initialization
# Test transaction sending
# Test address validation
# Test storage operations
```

### Debugging

#### Frontend Debugging
- Use React Developer Tools
- Console logging (automatically filtered in production)
- Chrome DevTools for network requests

#### Backend Debugging
```bash
# Enable Rust logging
RUST_LOG=debug npm run tauri:dev

# View Tauri logs
tail -f ~/.tauri/logs/com.tari.wallet.log
```

#### FFI Debugging
```bash
# Enable minotari_wallet_ffi logging
TARI_LOG_LEVEL=debug npm run tauri:dev

# Check FFI integration
cargo test --manifest-path src-tauri/Cargo.toml
```

## Security Considerations

### Frontend Security
- Input validation using Zod schemas
- XSS prevention through React's built-in escaping
- No sensitive data in console logs
- Secure clipboard operations

### Backend Security
- Command allowlisting in tauri.conf.json
- Input sanitization for all parameters
- Error message sanitization
- Rate limiting for operations
- Platform-specific secure storage

### FFI Security
- Real minotari_wallet_ffi integration
- Proper resource cleanup
- Memory safety through Rust
- No mock data in production

## Performance Optimization

### Bundle Size Optimization
```bash
# Analyze bundle size
npm run build
npx vite-bundle-analyzer dist

# Tree-shaking verification
npm run build -- --analyze
```

### Runtime Performance
- React.memo for expensive components
- useCallback for event handlers
- Efficient state updates
- Lazy loading for components

### Storage Performance
- Platform-specific optimizations
- Caching frequently accessed data
- Batch operations where possible
- Connection pooling

## Troubleshooting

### Common Issues

#### Build Errors
```bash
# Clear all caches
rm -rf node_modules dist src-tauri/target
npm install
npm run tauri:build
```

#### FFI Compilation Issues
```bash
# Update Rust toolchain
rustup update

# Clean Rust build
cargo clean --manifest-path src-tauri/Cargo.toml

# Rebuild with verbose output
cargo build --manifest-path src-tauri/Cargo.toml --verbose
```

#### Storage Backend Issues
- **macOS**: Check Keychain permissions
- **Windows**: Verify DPAPI functionality
- **Linux**: Check Secret Service availability

#### Network Issues
```bash
# Test network connectivity
curl -I https://raw.githubusercontent.com/tari-project/tari/development/Cargo.toml

# Clear DNS cache (macOS)
sudo dscacheutil -flushcache

# Reset network stack (Windows)
netsh winsock reset
```

### Debug Commands

```bash
# Check Tauri installation
cargo tauri info

# Verify Node.js setup
node --version
npm list

# Check Rust toolchain
rustc --version
cargo --version

# Test platform capabilities
npm run test:platform
```

## Contributing

### Code Style
- TypeScript: Follow existing patterns, use strict types
- Rust: Use clippy lints, follow Rust conventions
- CSS: Use CSS custom properties, mobile-first responsive design

### Commit Messages
- Use conventional commits format
- Include scope when applicable
- Reference issues when fixing bugs

### Pull Requests
- Ensure all tests pass
- Add tests for new features
- Update documentation
- Follow security guidelines

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Tari Project](https://github.com/tari-project/tari)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Rust Book](https://doc.rust-lang.org/book/)
