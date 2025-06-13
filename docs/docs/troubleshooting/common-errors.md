# Common Errors

This guide covers the most frequently encountered errors when using the Tari JavaScript SDK and provides solutions to resolve them quickly.

## Installation Errors

### Error: `engine "node" is incompatible`

**Symptoms:**
```bash
npm ERR! engine Unsupported engine: "node" 18.19.0
npm ERR! engine Not compatible with your version of node/npm
```

**Cause:** Your Node.js version is below the minimum required version (18.0.0).

**Solutions:**

1. **Check your current Node.js version:**
   ```bash
   node --version
   ```

2. **Upgrade using Node Version Manager (Recommended):**
   ```bash
   # Install nvm if not already installed
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   
   # Restart your terminal or source your profile
   source ~/.bashrc
   
   # Install and use Node.js 18
   nvm install 18
   nvm use 18
   nvm alias default 18
   ```

3. **Or download from official website:**
   Visit [nodejs.org](https://nodejs.org/) and download Node.js 18 LTS or later.

### Error: `Cannot resolve dependency`

**Symptoms:**
```bash
npm ERR! peer dep missing: @tari-project/tarijs-core@^0.0.1
```

**Cause:** Missing peer dependencies or version conflicts.

**Solutions:**

1. **Clear npm cache:**
   ```bash
   npm cache clean --force
   ```

2. **Delete node_modules and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Install missing peer dependencies:**
   ```bash
   npm install @tari-project/tarijs-core
   ```

### Error: Native module compilation failed

**Symptoms:**
```bash
gyp ERR! build error
node-gyp: command failed
```

**Platform-specific solutions:**

**macOS:**
```bash
# Install Xcode command line tools
xcode-select --install

# Install required dependencies
brew install python3
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install build-essential python3-dev libsecret-1-dev
```

**Linux (CentOS/RHEL):**
```bash
sudo yum groupinstall "Development Tools"
sudo yum install python3-devel libsecret-devel
```

**Windows:**
```bash
# Install Windows Build Tools
npm install --global windows-build-tools

# Or install Visual Studio Build Tools manually
```

## Wallet Creation Errors

### Error: `WalletError: Storage backend unavailable (2003)`

**Symptoms:**
```typescript
WalletError: No secure storage backend available on this platform
    at StorageFactory.create
```

**Cause:** No secure storage backend is available on your platform.

**Solutions:**

1. **Check platform support:**
   ```typescript
   import { PlatformDetector } from '@tari-project/tarijs-wallet';
   
   const platform = PlatformDetector.detect();
   console.log('Platform:', platform.runtime);
   console.log('Storage:', platform.storage);
   ```

2. **Install platform-specific dependencies:**

   **Electron:**
   ```bash
   npm install electron-store
   ```

   **Linux (if missing Secret Service):**
   ```bash
   sudo apt-get install gnome-keyring
   # or
   sudo apt-get install libsecret-1-0
   ```

3. **Use fallback storage (development only):**
   ```typescript
   import { createSecureStorage } from '@tari-project/tarijs-wallet';
   
   const storage = await createSecureStorage({
     allowFallback: true,  // Enable fallback to file storage
     testBackends: false   // Skip backend testing
   });
   ```

### Error: `WalletError: Invalid network configuration (2001)`

**Symptoms:**
```typescript
WalletError: Network configuration is invalid or unsupported
```

**Cause:** Invalid network type or configuration parameters.

**Solutions:**

1. **Use correct network types:**
   ```typescript
   import { NetworkType } from '@tari-project/tarijs-wallet';
   
   // Correct usage
   const wallet = await TariWallet.create({
     network: NetworkType.Testnet,  // Use enum values
     // not: network: 'testnet'      // Don't use strings
   });
   ```

2. **Verify network configuration:**
   ```typescript
   const config = {
     network: NetworkType.Testnet,
     baseNode: {
       publicKey: 'valid_public_key_here',
       address: '/ip4/127.0.0.1/tcp/18189'
     }
   };
   ```

### Error: `WalletError: Seed words validation failed (2002)`

**Symptoms:**
```typescript
WalletError: Invalid seed words format or checksum
```

**Cause:** Incorrect seed words format, count, or invalid words.

**Solutions:**

1. **Verify seed word count:**
   ```typescript
   const seedWords = "word1 word2 ... word24"; // Must be exactly 24 words
   const words = seedWords.split(' ');
   console.log('Word count:', words.length); // Should be 24
   ```

2. **Check for invalid characters:**
   ```typescript
   // Remove extra spaces and non-alphabetic characters
   const cleanedSeed = seedWords
     .trim()
     .toLowerCase()
     .replace(/[^a-z\s]/g, '')  // Remove non-letters except spaces
     .replace(/\s+/g, ' ');     // Replace multiple spaces with single space
   ```

3. **Validate individual words:**
   ```typescript
   import { validateSeedWords } from '@tari-project/tarijs-wallet';
   
   try {
     const isValid = await validateSeedWords(seedWords);
     console.log('Seed valid:', isValid);
   } catch (error) {
     console.error('Invalid seed:', error.message);
   }
   ```

## Transaction Errors

### Error: `WalletError: Insufficient funds (3001)`

**Symptoms:**
```typescript
WalletError: Not enough funds for transaction amount plus fees
```

**Cause:** Wallet balance is too low to cover the transaction amount and fees.

**Solutions:**

1. **Check wallet balance:**
   ```typescript
   const balance = await wallet.getBalance();
   console.log('Available:', balance.available);
   console.log('Pending:', balance.pendingIncoming);
   console.log('Total:', balance.available + balance.pendingIncoming);
   ```

2. **Estimate fees before sending:**
   ```typescript
   const amount = 1000000n; // 0.001 Tari
   const feeEstimate = await wallet.estimateFee(amount, {
     recipient: recipientAddress
   });
   
   const totalCost = amount + feeEstimate.fee;
   console.log('Transaction cost:', totalCost);
   console.log('Available balance:', balance.available);
   
   if (balance.available < totalCost) {
     console.error('Insufficient funds');
   }
   ```

3. **Get testnet funds:**
   - Join [Tari Discord](https://discord.gg/tari) and request testnet funds
   - Use the testnet faucet (if available)
   - Mine testnet Tari directly to your wallet

### Error: `WalletError: Invalid address format (3002)`

**Symptoms:**
```typescript
WalletError: Recipient address is not valid Tari address format
```

**Cause:** The recipient address is not a valid Tari address.

**Solutions:**

1. **Validate address format:**
   ```typescript
   import { TariAddress } from '@tari-project/tarijs-wallet';
   
   try {
     const address = await TariAddress.fromString(recipientAddress);
     console.log('Address valid:', address.toString());
   } catch (error) {
     console.error('Invalid address:', error.message);
   }
   ```

2. **Check address format:**
   ```typescript
   // Valid base58 address format
   const base58Address = "7e2b8c9d4f5a6b3e8c1d9f2a5b8c4e7f1a2b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f";
   
   // Valid emoji address format (exactly 33 emojis)
   const emojiAddress = "🌟🎯🚀⭐🎨🌙✨🎭🎪🎨🌟🎯🚀⭐🎨🌙✨🎭🎪🎨🌟🎯🚀⭐🎨🌙✨🎭🎪🎨🌟🎯🚀";
   ```

3. **Convert between formats:**
   ```typescript
   const address = await TariAddress.fromString(base58Address);
   console.log('Base58:', address.toString());
   console.log('Emoji:', address.toEmojiId());
   ```

### Error: `WalletError: Transaction timeout (3003)`

**Symptoms:**
```typescript
WalletError: Transaction failed to complete within timeout period
```

**Cause:** Network congestion, connectivity issues, or base node problems.

**Solutions:**

1. **Check network connectivity:**
   ```typescript
   const status = await wallet.getConnectionStatus();
   console.log('Connected:', status.connected);
   console.log('Peers:', status.peerCount);
   ```

2. **Increase timeout values:**
   ```typescript
   const txId = await wallet.sendTransaction(
     recipientAddress,
     amount,
     {
       timeout: 300000,  // 5 minutes instead of default
       retryAttempts: 3
     }
   );
   ```

3. **Monitor transaction manually:**
   ```typescript
   const txId = await wallet.sendTransaction(recipientAddress, amount);
   
   // Set up status monitoring
   wallet.on('onTransactionStatusUpdate', (update) => {
     if (update.txId.equals(txId)) {
       console.log('Status:', update.status);
     }
   });
   ```

## Network and Connectivity Errors

### Error: `WalletError: Base node connection failed (4001)`

**Symptoms:**
```typescript
WalletError: Unable to connect to base node
```

**Cause:** Base node is unreachable, incorrect configuration, or network issues.

**Solutions:**

1. **Check base node configuration:**
   ```typescript
   const wallet = await TariWallet.create({
     network: NetworkType.Testnet,
     baseNode: {
       address: '/ip4/testnet.node.tari.com/tcp/18189',  // Use official nodes
       publicKey: 'valid_public_key'
     }
   });
   ```

2. **Use automatic peer discovery:**
   ```typescript
   const wallet = await TariWallet.create({
     network: NetworkType.Testnet,
     // Don't specify baseNode to use automatic discovery
   });
   ```

3. **Test connectivity manually:**
   ```bash
   # Test if base node is reachable
   telnet testnet.node.tari.com 18189
   ```

### Error: `WalletError: Sync failed (4002)`

**Symptoms:**
```typescript
WalletError: Blockchain sync failed or timed out
```

**Cause:** Network connectivity issues, base node problems, or corrupted local data.

**Solutions:**

1. **Force resync:**
   ```typescript
   await wallet.resync({ 
     deleteLocalData: true,  // Remove corrupted local data
     timeout: 600000         // Increase timeout to 10 minutes
   });
   ```

2. **Monitor sync progress:**
   ```typescript
   wallet.on('onSyncProgress', (progress) => {
     console.log(`Sync: ${progress.percentage}% (${progress.current}/${progress.total})`);
   });
   
   await wallet.startSync();
   ```

3. **Check for network issues:**
   ```typescript
   const networkInfo = await wallet.getNetworkInfo();
   console.log('Network height:', networkInfo.blockHeight);
   console.log('Local height:', networkInfo.localHeight);
   console.log('Sync difference:', networkInfo.blockHeight - networkInfo.localHeight);
   ```

## Performance Issues

### Error: High memory usage

**Symptoms:** Application using excessive memory (>1GB for simple operations).

**Solutions:**

1. **Enable Tauri optimization (if available):**
   ```typescript
   import { PlatformDetector } from '@tari-project/tarijs-wallet';
   
   const platform = PlatformDetector.detect();
   if (platform.runtime === 'tauri') {
     console.log('🦀 Tauri optimization active - memory usage reduced by 60%');
   }
   ```

2. **Use batch operations:**
   ```typescript
   // Instead of multiple individual calls
   const storage = await createSecureStorage({
     enableBatching: true,     // Group operations together
     enableCaching: true,      // Cache frequently accessed data
     cacheTimeout: 300000      // 5-minute cache timeout
   });
   ```

3. **Proper resource cleanup:**
   ```typescript
   try {
     const wallet = await TariWallet.create(config);
     // ... use wallet
   } finally {
     await wallet.destroy();  // Always clean up resources
   }
   ```

### Error: Slow FFI operations

**Symptoms:** Wallet operations taking >5 seconds to complete.

**Solutions:**

1. **Check for concurrent operations:**
   ```typescript
   // Avoid too many concurrent operations
   const concurrencyLimit = 3;
   const operations = [];
   
   for (let i = 0; i < transactions.length; i += concurrencyLimit) {
     const batch = transactions.slice(i, i + concurrencyLimit);
     const results = await Promise.all(
       batch.map(tx => wallet.sendTransaction(tx.recipient, tx.amount))
     );
     operations.push(...results);
   }
   ```

2. **Use intelligent caching:**
   ```typescript
   const storage = await createSecureStorage({
     enableCaching: true,
     cacheSize: 1000,          // Increase cache size
     cacheTTL: 600000          // 10-minute cache lifetime
   });
   ```

3. **Monitor performance:**
   ```typescript
   const startTime = performance.now();
   await wallet.getBalance();
   const endTime = performance.now();
   console.log(`Operation took ${endTime - startTime} ms`);
   ```

## Debug Information

When reporting issues, include this debug information:

```typescript
import { TariWallet, PlatformDetector } from '@tari-project/tarijs-wallet';

async function getDebugInfo() {
  const platform = PlatformDetector.detect();
  
  console.log('=== Debug Information ===');
  console.log('Node.js version:', process.version);
  console.log('Platform:', process.platform);
  console.log('Architecture:', process.arch);
  console.log('Runtime:', platform.runtime);
  console.log('Storage backend:', platform.storage.primary);
  console.log('Security level:', platform.securityLevel);
  console.log('SDK version:', require('@tari-project/tarijs-wallet/package.json').version);
  
  try {
    const storage = await createSecureStorage({ testBackends: true });
    console.log('Storage test: PASSED');
  } catch (error) {
    console.log('Storage test: FAILED -', error.message);
  }
}
```

## Getting Help

If you're still experiencing issues after trying these solutions:

1. **Check the [FAQ](./faq.md)** for more specific questions
2. **Search [GitHub Issues](https://github.com/tari-project/tari-javascript-sdk/issues)** for similar problems
3. **Join [Discord](https://discord.gg/tari)** for real-time community support
4. **Create a [new issue](https://github.com/tari-project/tari-javascript-sdk/issues/new)** with debug information

Remember to include:
- Your platform and Node.js version
- Complete error messages
- Code that reproduces the issue
- Debug information from the script above
