# Tari SDK Examples

This directory contains example applications demonstrating how to use the Tari JavaScript SDK in various scenarios.

## Examples Overview

### 🏪 exchange-basic
A simple exchange integration showing:
- Wallet creation and connection
- Deposit address generation for users
- Real-time deposit monitoring
- Basic balance tracking
- Event-driven transaction handling

**Perfect for:** Learning the basics, simple payment processors

### 🏛️ exchange-advanced
A complete exchange implementation featuring:
- SQLite database integration
- REST API for deposits/withdrawals
- WebSocket for real-time updates
- Withdrawal queue management
- Docker deployment ready
- Production-grade error handling

**Perfect for:** Real exchanges, comprehensive integrations

### 💻 wallet-cli
Interactive command-line wallet with:
- Full wallet management
- Transaction history
- Address book functionality
- QR code generation for addresses
- Import/export capabilities

**Perfect for:** Desktop applications, power users

### ⛏️ mining-pool
Basic mining pool implementation:
- Miner registration and management
- Share submission tracking
- Automatic payout calculation
- Pool statistics API
- Real-time mining dashboard

**Perfect for:** Mining operations, pool operators

## Quick Start

### Running Any Example

1. **Install dependencies in the root:**
   ```bash
   pnpm install
   ```

2. **Navigate to an example:**
   ```bash
   cd examples/exchange-basic
   ```

3. **Install example dependencies:**
   ```bash
   npm install
   ```

4. **Set up configuration:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. **Run the example:**
   ```bash
   npm start
   ```

### Running All Examples (from root)

```bash
# Basic exchange
pnpm run example:exchange-basic

# Advanced exchange
pnpm run example:exchange-advanced

# CLI wallet
pnpm run example:wallet-cli

# Mining pool
pnpm run example:mining-pool
```

## Common Configuration

All examples support these environment variables:

```bash
# Network (testnet recommended for development)
TARI_NETWORK=testnet

# Wallet seed words (NEVER use real ones in development!)
SEED_WORDS="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"

# Data directory
TARI_DATA_DIR=./wallet-data

# Optional custom base node
TARI_BASE_NODE_ADDRESS=tcp://testnet.tari.com:18142
TARI_BASE_NODE_PUBLIC_KEY=testnet_public_key

# Logging
LOG_LEVEL=info
```

## Development Tips

### 1. Use Testnet First
Always start with testnet for development:
```javascript
const wallet = TariWallet.builder()
  .network(Network.Testnet)  // Safe for testing
  .build();
```

### 2. Never Commit Real Seed Words
```bash
# ❌ BAD - Real seed words in code
SEED_WORDS="real words from actual wallet"

# ✅ GOOD - Test seed words for development
SEED_WORDS="abandon abandon abandon ... art"
```

### 3. Handle Errors Gracefully
```javascript
try {
  await wallet.sendTransaction({...});
} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    // Handle insufficient funds
  } else if (error.code === 'NETWORK_ERROR') {
    // Handle network issues
  }
}
```

### 4. Clean Up Resources
```javascript
process.on('SIGINT', async () => {
  await wallet.close();
  process.exit(0);
});
```

## Example Comparison

| Feature | Basic Exchange | Advanced Exchange | Wallet CLI | Mining Pool |
|---------|----------------|------------------|------------|-------------|
| Difficulty | Beginner | Intermediate | Intermediate | Advanced |
| Database | No | SQLite | No | Yes |
| API | No | REST + WebSocket | No | REST |
| UI | Console | Web Dashboard | CLI | Web Dashboard |
| Docker | No | Yes | No | Yes |
| Withdrawals | No | Yes | Yes | Yes |
| Mining | No | No | No | Yes |

## Getting Testnet Funds

To test the examples, you'll need testnet Tari:

1. **Faucet** (if available): Check the Tari Discord for testnet faucet links
2. **Mining**: Use the mining-pool example to mine testnet coins
3. **Community**: Ask in the Tari Discord for testnet funds

## Troubleshooting

### Common Issues

**Connection Errors:**
```
Error: Cannot connect to base node
```
Solution: Check network connectivity and try alternative base nodes

**Native Module Errors:**
```
Error: Cannot find module 'tari_wallet_ffi.node'
```
Solution: Rebuild native modules:
```bash
npm rebuild @tari/wallet
```

**Permission Errors:**
```
Error: EACCES: permission denied
```
Solution: Check data directory permissions:
```bash
chmod 755 ./wallet-data
```

### Debug Mode

Enable detailed logging:
```bash
LOG_LEVEL=debug npm start
```

Or in code:
```javascript
import { setLogLevel, LogLevel } from '@tari/wallet';
setLogLevel(LogLevel.Debug);
```

## Contributing

Want to add an example or improve existing ones?

1. **Fork the repository**
2. **Create a new example directory**
3. **Follow the existing structure:**
   ```
   examples/your-example/
   ├── package.json
   ├── index.js (or src/)
   ├── README.md
   ├── .env.example
   └── docker-compose.yml (if applicable)
   ```
4. **Update this README**
5. **Submit a pull request**

### Example Template

Use this template for new examples:

```javascript
const { TariWallet, Network } = require('@tari/wallet');

async function main() {
  console.log('🚀 Starting Your Example...');
  
  const wallet = TariWallet.builder()
    .network(Network.Testnet)
    .seedWords(process.env.SEED_WORDS)
    .build();
  
  try {
    await wallet.connect();
    console.log('✅ Connected!');
    
    // Your example code here
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await wallet.close();
  }
}

main().catch(console.error);
```

## Resources

- **📚 API Documentation**: [../docs/api-reference.md](../docs/api-reference.md)
- **🚀 Getting Started**: [../docs/getting-started.md](../docs/getting-started.md)
- **💬 Discord Community**: https://discord.gg/tari
- **🐛 Issues**: https://github.com/tari-project/tari-js-sdk/issues
- **📖 Tari Documentation**: https://docs.tari.com

## License

All examples are licensed under BSD-3-Clause, same as the main SDK.
