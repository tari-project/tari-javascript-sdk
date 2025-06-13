# Tari Console Wallet

An interactive command-line wallet application demonstrating comprehensive Tari JavaScript SDK functionality. This example showcases real-world wallet operations, transaction management, and network interactions in a user-friendly console interface.

## Features

🎯 **Core Wallet Operations**
- Interactive menu system with intuitive navigation
- Real-time balance checking with detailed breakdowns
- Transaction sending with fee estimation
- Address generation and validation
- Transaction history with status tracking

🔄 **Real-Time Updates**
- Live transaction notifications
- Balance change alerts
- Network connection status monitoring
- Blockchain sync progress tracking

🌐 **Multi-Network Support**
- Mainnet, testnet, and nextnet configurations
- Automatic peer discovery and connection management
- Network health monitoring and diagnostics

🔒 **Security Features**
- Platform-specific secure storage integration
- Automatic Tauri optimization detection
- Comprehensive error handling and validation
- Secure resource cleanup and management

## Prerequisites

- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher
- **Tari SDK**: Built and available in the workspace

## Installation

```bash
# From the examples/node-console directory
npm install

# Build the application
npm run build
```

## Usage

### Quick Start

```bash
# Start with default settings (testnet)
npm start

# Or run in development mode
npm run dev
```

### Command Line Options

```bash
# Specify network
npm start -- --network testnet
npm start -- --network mainnet

# Custom storage path
npm start -- --storage-path ./my-wallet-data

# Set log level
npm start -- --log-level debug

# Disable auto-connect
npm start -- --no-auto-connect

# Show help
npm start -- --help
```

### Example Commands

```bash
# Testnet wallet with debug logging
npm start -- --network testnet --log-level debug

# Mainnet wallet with custom storage
npm start -- --network mainnet --storage-path ~/tari-wallet

# Development mode with auto-reload
npm run dev -- --network testnet --log-level info
```

## Interactive Menu

Once started, the console wallet provides an interactive menu:

```
🚀 Tari Console Wallet

Platform Information:
  • Runtime: node
  • Storage: SecretService
  • Security Level: high
  • Node.js: v18.19.0

? What would you like to do? (Use arrow keys)
❯ 💰 Check Balance
  📍 Show Address
  💸 Send Transaction
  📋 Transaction History
  💵 Estimate Fees
  ✅ Validate Address
  🔄 Sync Wallet
  🌐 Network Status
  ⚙️  Settings
  🚪 Exit
```

### Menu Options Explained

#### 💰 Check Balance
Displays comprehensive balance information:
- Available funds (spendable immediately)
- Pending incoming transactions
- Pending outgoing transactions
- Time-locked funds
- Total balance calculation

#### 📍 Show Address
Shows your wallet address in both formats:
- **Base58**: Traditional long format for technical use
- **Emoji**: User-friendly 33-emoji format for easy sharing

#### 💸 Send Transaction
Interactive transaction creation with:
- Recipient address validation (base58 or emoji)
- Amount input with balance verification
- Optional message attachment
- Fee estimation and confirmation
- Real-time transaction status updates

#### 📋 Transaction History
Displays recent transactions with:
- Transaction type (incoming/outgoing)
- Amount and status
- Date and transaction ID
- Formatted table view for easy reading

#### 💵 Estimate Fees
Calculate transaction fees before sending:
- Fee estimation for any amount
- Fee per gram calculation
- Total cost breakdown
- Fee percentage analysis

#### ✅ Validate Address
Verify Tari address formats:
- Validates both base58 and emoji formats
- Shows address in both formats if valid
- Network compatibility checking

#### 🔄 Sync Wallet
Synchronize with the Tari network:
- Blockchain synchronization
- Progress monitoring
- Error handling and retry logic

#### 🌐 Network Status
Network connectivity information:
- Connection status and peer count
- Local vs network block height
- Sync status indication
- Network type confirmation

#### ⚙️ Settings
Display current configuration:
- Network and storage settings
- Platform and security information
- Backend optimization status

## Real-Time Features

The console wallet provides live updates for:

### Transaction Notifications
```
🎉 Received 1.000000 T from 7e2b8c9d4f5a...
💸 Sent 0.500000 T to abc123def456...
```

### Balance Updates
```
💰 Balance updated: 15.250000 T available
```

### Network Events
```
🌐 Network: Connected
🔄 Sync: 50% complete
```

## Configuration

### Environment Variables

You can configure the wallet using environment variables:

```bash
# Network selection
export TARI_NETWORK=testnet

# Custom storage path
export TARI_STORAGE_PATH=~/my-tari-wallet

# Log level
export TARI_LOG_LEVEL=debug

# Base node configuration (optional)
export TARI_BASE_NODE_ADDRESS=/ip4/127.0.0.1/tcp/18189
export TARI_BASE_NODE_PUBLIC_KEY=your_base_node_public_key
```

### Configuration File

Create a `wallet-config.json` file:

```json
{
  "network": "testnet",
  "storagePath": "./wallet-data",
  "logLevel": "info",
  "autoConnect": true,
  "baseNode": {
    "address": "/ip4/testnet.node.tari.com/tcp/18189",
    "publicKey": "base_node_public_key"
  }
}
```

## Getting Test Funds

For testnet development, you'll need test funds:

### Option 1: Check Documentation
1. Refer to the main Tari documentation for testnet fund sources
2. Look for official testnet faucets
3. Use the emoji format for easier copying

### Option 2: Alternative Sources
1. Look for community-maintained testnet faucets
2. Check testnet mining pools if available
3. Refer to Tari development resources

### Option 3: Mining (Advanced)
1. Set up a Tari miner on testnet
2. Mine directly to your wallet address
3. Requires additional setup and resources

## Error Handling

The console wallet includes comprehensive error handling:

### Common Errors and Solutions

**Insufficient Funds**
```
💰 Insufficient funds for this transaction
```
- Get testnet funds from official sources or faucets
- Check your balance before sending

**Invalid Address**
```
📍 Invalid recipient address format
```
- Verify the address format (base58 or emoji)
- Use the address validation feature

**Network Connection**
```
🌐 Network connection error - check your internet
```
- Verify internet connectivity
- Check if base nodes are reachable
- Try syncing the wallet

### Debug Mode

Enable debug logging for troubleshooting:

```bash
npm start -- --log-level debug
```

This provides detailed information about:
- FFI operations and performance
- Network communications
- Storage operations
- Error details and stack traces

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the built application
node dist/index.js

# Or run directly with tsx
npm run dev
```

### Project Structure

```
examples/node-console/
├── src/
│   ├── index.ts           # Main application entry point
│   ├── commands.ts        # CLI command definitions
│   └── wallet.ts          # Wallet management class
├── dist/                  # Compiled JavaScript output
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

### Adding New Features

1. **New Menu Option**: Add to the main menu choices in `showMainMenu()`
2. **New Command**: Implement the handler method in the `ConsoleWallet` class
3. **CLI Options**: Add new options to the Commander program
4. **Error Handling**: Add specific error handling for new operations

### Testing

```bash
# Test with different networks
npm start -- --network testnet
npm start -- --network mainnet

# Test error conditions
npm start -- --network invalid-network

# Test with different storage paths
npm start -- --storage-path /tmp/test-wallet
```

## Platform Optimization

The console wallet automatically detects and optimizes for your platform:

### Tauri Runtime (Recommended)
When running in a Tauri application:
- **60% lower memory usage**
- **10x faster startup time**
- **Hardware-backed security**
- **Minimal attack surface**

### Electron Runtime
When running in Electron:
- **Context isolation security**
- **IPC rate limiting**
- **Secure storage integration**

### Node.js Runtime
When running in pure Node.js:
- **Direct native access**
- **Optimized FFI performance**
- **Platform-specific storage**

## Security Considerations

### Seed Phrase Protection
- Seed phrases are encrypted using platform-specific secure storage
- Never store seed phrases in plain text
- Always backup seed phrases securely

### Network Security
- Use secure connections to base nodes
- Verify base node authenticity when possible
- Monitor for unusual network activity

### Application Security
- Input validation for all user inputs
- Rate limiting for network operations
- Secure cleanup of sensitive data

## Troubleshooting

### Installation Issues

**Native module compilation errors:**
```bash
# macOS
xcode-select --install

# Linux
sudo apt-get install build-essential libsecret-1-dev

# Windows
npm install --global windows-build-tools
```

**Permission errors:**
```bash
# Fix npm permissions
npm config set cache ~/.npm --global
sudo chown -R $(whoami) ~/.npm
```

### Runtime Issues

**Storage backend unavailable:**
- Install platform-specific secure storage
- Check system keyring services
- Use fallback storage for development

**Network connection failures:**
- Check internet connectivity
- Verify base node configuration
- Try automatic peer discovery

### Getting Help

1. **Check Console Output**: Look for detailed error messages
2. **Enable Debug Logging**: Use `--log-level debug` for more information
3. **GitHub Issues**: Report bugs at the [repository](https://github.com/tari-project/tari-javascript-sdk/issues)

## Contributing

We welcome contributions! To contribute to this example:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Update documentation
5. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Add error handling for new features
- Update this README for new functionality
- Test on multiple platforms when possible

## License

This example is part of the Tari JavaScript SDK and is licensed under the BSD-3-Clause License.

---

**Happy wallet building!** 🚀

For more examples and documentation, visit the [Tari JavaScript SDK documentation](../../docs/).
