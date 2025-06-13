# Frequently Asked Questions

Find answers to the most common questions about the Tari JavaScript SDK.

## General Questions

### What is the Tari JavaScript SDK?

The Tari JavaScript SDK is a high-performance, type-safe JavaScript library that provides access to Tari blockchain functionality through native Rust FFI bindings. It enables developers to build wallet applications, manage transactions, and integrate with the Tari network using modern JavaScript and TypeScript.

### Which platforms are supported?

The SDK supports:
- **Node.js** (18.0.0+): Server applications and CLI tools
- **Electron**: Desktop applications with enhanced security
- **Tauri**: High-performance desktop apps (recommended)
- **Browser**: Web applications (limited functionality)

### What are the system requirements?

- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher
- **TypeScript**: 5.3.0 or higher (recommended)
- **Operating System**: macOS 10.15+, Windows 10+, or modern Linux distributions

### Is the SDK production-ready?

The SDK is currently in active development. While the core infrastructure is complete, some advanced features are still being implemented. Check the [project status](../introduction.md#development-status) for current phase information.

## Installation and Setup

### How do I install the SDK?

For most applications:
```bash
npm install @tari-project/tarijs-wallet
```

For low-level integrations:
```bash
npm install @tari-project/tarijs-core
```

See the [Installation Guide](../getting-started/installation.md) for detailed instructions.

### Why do I get "engine incompatible" errors?

This occurs when your Node.js version is below 18.0.0. Upgrade using:
```bash
nvm install 18
nvm use 18
```

### Can I use the SDK with older Node.js versions?

No, the SDK requires Node.js 18.0.0 or higher due to modern JavaScript features and native dependencies. This ensures optimal performance and security.

### How do I set up TypeScript support?

The SDK includes comprehensive TypeScript definitions. Simply install TypeScript:
```bash
npm install --save-dev typescript @types/node
```

## Wallet Operations

### How do I create a new wallet?

```typescript
import { TariWallet, NetworkType, createSecureStorage } from '@tari-project/tarijs-wallet';

const storage = await createSecureStorage();
const wallet = await TariWallet.create({
  network: NetworkType.Testnet,
  storagePath: './wallet-data',
  storage: storage
});
```

### How do I restore a wallet from seed words?

```typescript
const wallet = await TariWallet.createFromSeed({
  seedWords: "your 24 seed words here",
  network: NetworkType.Testnet,
  storagePath: './restored-wallet',
  storage: await createSecureStorage()
});
```

### What are the different address formats?

Tari supports two address formats:
- **Base58**: Traditional long format (e.g., `7e2b8c9d4f5a6b3e...`)
- **Emoji**: User-friendly 33-emoji format (e.g., `🌟🎯🚀⭐🎨...`)

Both formats represent the same address and can be converted between each other.

### How do I check my wallet balance?

```typescript
const balance = await wallet.getBalance();
console.log('Available:', balance.available);
console.log('Pending:', balance.pendingIncoming);
console.log('Total:', balance.available + balance.pendingIncoming);
```

### How do I send a transaction?

```typescript
const txId = await wallet.sendTransaction(
  recipientAddress,
  1000000n, // Amount in microTari (0.001 Tari)
  { message: 'Payment for services' }
);
```

### Why are transaction amounts in microTari?

All amounts in the SDK use microTari (µT) for precision and consistency. 1 Tari = 1,000,000 microTari. Use `BigInt` for amounts to handle large numbers safely.

### How do I estimate transaction fees?

```typescript
const feeEstimate = await wallet.estimateFee(amount, {
  recipient: recipientAddress,
  message: 'Optional message'
});
console.log('Estimated fee:', feeEstimate.fee);
```

## Network and Connectivity

### Which networks are available?

- **Mainnet**: Production network for real transactions
- **Testnet**: Testing network with free test funds
- **Nextnet**: Pre-release network for latest features

Use `NetworkType.Testnet` for development and testing.

### How do I get testnet funds?

1. Join the [Tari Discord](https://discord.gg/tari)
2. Request testnet funds in the #faucet channel
3. Provide your testnet wallet address
4. Alternatively, set up a Tari miner on testnet

### Why can't my wallet connect to the network?

Common causes:
- **Network configuration**: Verify you're using the correct network type
- **Base node issues**: The configured base node may be offline
- **Firewall**: Check if outbound connections are blocked
- **Internet connectivity**: Ensure stable internet connection

Try using automatic peer discovery by not specifying a base node in the configuration.

### How long do transactions take to confirm?

Transaction times vary by network:
- **Testnet**: Usually 1-5 minutes
- **Mainnet**: Typically 2-10 minutes depending on network congestion

You can monitor transaction status using event listeners:

```typescript
wallet.on('onTransactionStatusUpdate', (update) => {
  console.log(`Transaction ${update.txId}: ${update.status}`);
});
```

## Security and Storage

### How is my wallet data stored securely?

The SDK uses platform-specific secure storage:
- **macOS**: Keychain with Touch ID/Face ID support
- **Windows**: Credential Store with DPAPI encryption
- **Linux**: Secret Service (GNOME Keyring, KDE Wallet)
- **Tauri**: Enhanced Rust-based secure storage (recommended)

### Is my seed phrase stored securely?

Yes, seed phrases are encrypted using platform-specific secure storage mechanisms. The SDK never stores seed phrases in plain text files.

### Can I backup my wallet?

Your 24-word seed phrase is your wallet backup. Store it securely offline:
- Write it down on paper and store in a safe place
- Use a hardware wallet for additional security
- Never store it digitally without encryption

### What happens if I lose my seed words?

**Seed words cannot be recovered.** If you lose them, you lose access to your wallet forever. Always keep secure backups of your seed words.

### How does Tauri provide better security?

Tauri applications offer enhanced security through:
- **Rust memory safety**: Prevents common vulnerabilities
- **Minimal attack surface**: No web technologies in the backend
- **Hardware-backed storage**: Direct OS integration
- **Permission system**: Explicit API exposure only

## Performance and Optimization

### Why is Tauri recommended over Electron?

Tauri provides significant advantages:
- **60% lower memory usage**
- **10x faster startup time**
- **3-10MB bundle size** vs 50MB+ for Electron
- **Better security** with Rust backend
- **Hardware-backed storage** integration

### How can I optimize performance?

1. **Enable caching and batching:**
   ```typescript
   const storage = await createSecureStorage({
     enableCaching: true,
     enableBatching: true
   });
   ```

2. **Use concurrent operations carefully:**
   ```typescript
   // Limit concurrent operations to avoid overwhelming the system
   const results = await Promise.all(
     operations.slice(0, 3).map(op => processOperation(op))
   );
   ```

3. **Proper resource cleanup:**
   ```typescript
   try {
     const wallet = await TariWallet.create(config);
     // Use wallet
   } finally {
     await wallet.destroy(); // Always clean up
   }
   ```

### Why are operations slow on my system?

Common causes:
- **Too many concurrent operations**: Limit concurrent FFI calls
- **No optimization**: Enable caching and batching
- **Hardware limitations**: FFI operations are CPU-intensive
- **Network issues**: Slow base node connections

## Development and Testing

### How do I test my application?

The SDK provides multiple testing approaches:

1. **Unit tests with mocks:**
   ```bash
   npm run test:unit
   ```

2. **Integration tests with real FFI:**
   ```bash
   npm run test:integration
   ```

3. **Manual testing with funded wallets:**
   ```bash
   npm run test:manual
   ```

### Can I run tests without real funds?

Yes, use unit tests with mocked FFI bindings:
```typescript
import { TariWallet } from '@tari-project/tarijs-wallet';

// Unit tests automatically use mocked implementations
const wallet = await TariWallet.create(config);
```

### How do I debug wallet issues?

1. **Enable debug logging:**
   ```typescript
   const wallet = await TariWallet.create({
     logLevel: 'debug',
     // ... other config
   });
   ```

2. **Use diagnostic tools:**
   ```typescript
   const diagnostics = await wallet.getDiagnostics();
   console.log('Wallet diagnostics:', diagnostics);
   ```

3. **Check platform capabilities:**
   ```typescript
   import { PlatformDetector } from '@tari-project/tarijs-wallet';
   const platform = PlatformDetector.detect();
   console.log('Platform info:', platform);
   ```

### How do I contribute to the SDK?

1. Fork the [GitHub repository](https://github.com/tari-project/tari-javascript-sdk)
2. Read the [Contributing Guide](https://github.com/tari-project/tari-javascript-sdk/blob/main/CONTRIBUTING.md)
3. Set up the development environment
4. Submit pull requests with tests and documentation

## Error Handling

### What are the common error types?

The SDK uses typed errors for better handling:
- **WalletError**: Wallet-specific operations
- **NetworkError**: Connectivity and sync issues
- **ValidationError**: Input validation failures
- **StorageError**: Secure storage problems

### How do I handle errors properly?

```typescript
import { TariError, ErrorCode } from '@tari-project/tarijs-wallet';

try {
  await wallet.sendTransaction(recipient, amount);
} catch (error) {
  if (error instanceof TariError) {
    switch (error.code) {
      case ErrorCode.InsufficientFunds:
        // Handle insufficient funds
        break;
      case ErrorCode.NetworkError:
        // Handle network issues
        break;
      default:
        // Handle other errors
    }
  }
}
```

### Where can I find error code reference?

Check the [Error Handling Guide](../api/error-handling.md) for complete error codes and handling strategies.

## Community and Support

### Where can I get help?

- **[Discord](https://discord.gg/tari)**: Real-time community support
- **[GitHub Issues](https://github.com/tari-project/tari-javascript-sdk/issues)**: Bug reports and feature requests
- **[Documentation](../introduction.md)**: Comprehensive guides and references
- **[Tari Forums](https://forums.tari.com/)**: Community discussions

### How do I report bugs?

1. Check [existing issues](https://github.com/tari-project/tari-javascript-sdk/issues) first
2. Create a [new issue](https://github.com/tari-project/tari-javascript-sdk/issues/new) with:
   - Clear description of the problem
   - Steps to reproduce
   - Your platform and Node.js version
   - Complete error messages
   - Minimal code example

### How do I request features?

Feature requests are welcome! Create a [GitHub issue](https://github.com/tari-project/tari-javascript-sdk/issues/new) with:
- Clear description of the feature
- Use case and motivation
- Expected behavior
- Any relevant examples

### Is there a roadmap?

Yes, check the [development phases](../introduction.md#development-status) in the introduction for current progress and upcoming features.

## Additional Resources

- **[Getting Started](../getting-started/installation.md)**: Complete setup guide
- **[API Reference](../../api/)**: Detailed method documentation
- **[Examples](../../examples/)**: Complete application examples
- **[Troubleshooting](./common-errors.md)**: Detailed error solutions
- **[Tari Project](https://www.tari.com/)**: Learn about the Tari ecosystem

---

**Can't find what you're looking for?** Join our [Discord community](https://discord.gg/tari) or create a [GitHub issue](https://github.com/tari-project/tari-javascript-sdk/issues/new) for help!
