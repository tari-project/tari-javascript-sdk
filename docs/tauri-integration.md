# Tauri Integration Guide

The Tari JavaScript SDK provides first-class support for Tauri applications, offering enhanced security, performance, and cross-platform compatibility through Tauri's Rust-based architecture.

## Overview

Tauri integration provides the highest priority storage backend with superior security and performance characteristics compared to Electron or browser-based applications.

### Key Features

- **🔒 Security-First**: Default-secure with explicit API exposure and permission system
- **⚡ High Performance**: 60% lower memory footprint, 3-10x faster startup vs Electron
- **🛡️ Memory Safety**: Rust's ownership model prevents common vulnerabilities
- **📦 Minimal Bundle**: 3-10MB applications vs 50MB+ Electron apps
- **🎯 Platform Native**: Direct OS integration for secure storage

## Quick Start

### 1. Installation

```bash
# Install the Tari wallet package
npm install @tari-project/tarijs-wallet

# For Tauri applications, also install Tauri dependencies
npm install @tauri-apps/api
```

### 2. Basic Usage

```typescript
import { TariWallet, createSecureStorage } from '@tari-project/tarijs-wallet';

// Create wallet with automatic Tauri optimization
const wallet = await TariWallet.create({
  network: 'testnet',
  storagePath: './wallet-data',
  
  // Storage will automatically use Tauri backend when available
  storage: await createSecureStorage({
    enableCaching: true,      // Uses TauriSecureStorageCache
    enableBatching: true,     // Uses TauriBatchStorageOperations
    testBackends: true,       // Verify Tauri backend availability
  })
});

// All wallet operations automatically benefit from Tauri optimizations
const balance = await wallet.getBalance();
const address = await wallet.getAddress();
```

### 3. Tauri Configuration

Add the required permissions to your `tauri.conf.json`:

```json
{
  "tauri": {
    "allowlist": {
      "all": false,
      "storage": {
        "all": true
      },
      "invoke": {
        "all": false,
        "allowlist": [
          "store_secure_data_command",
          "retrieve_secure_data_command",
          "remove_secure_data_command",
          "exists_secure_data_command",
          "list_secure_keys_command",
          "get_storage_metadata_command",
          "test_storage_backend_command",
          "get_tauri_platform_info_command",
          "batch_storage_operations_command"
        ]
      }
    },
    "security": {
      "csp": "default-src 'self' tauri: asset: https://asset.localhost"
    }
  }
}
```

## Platform Integration

### Automatic Backend Selection

The SDK automatically detects and prioritizes Tauri runtime:

```typescript
import { PlatformDetector, getCapabilitiesManager } from '@tari-project/tarijs-wallet';

// Detect runtime environment
const platform = PlatformDetector.detect();
console.log('Runtime:', platform.runtime); // 'tauri'

// Get Tauri-enhanced capabilities
const capabilities = getCapabilitiesManager().getCapabilityAssessment();
console.log('Security level:', capabilities.secureStorage.level); // 'hardware'
console.log('Performance tier:', capabilities.performance.tier); // 'high'
```

### Backend Priority Order

1. **Tauri** (highest priority) - Hardware-backed security, high performance
2. **Keychain/Credential Store** - OS-level security
3. **Secret Service** - Linux secure storage
4. **Encrypted File** - Software encryption
5. **Memory** - Development/testing only

## Advanced Configuration

### Tauri-Specific Options

```typescript
import { createSecureStorage } from '@tari-project/tarijs-wallet';

const storage = await createSecureStorage({
  // Force Tauri backend (optional)
  forceBackend: 'tauri',
  
  // Tauri-specific cache configuration
  tauriCacheConfig: {
    maxSize: 1000,                    // Cache up to 1000 items
    maxMemoryUsage: 50 * 1024 * 1024, // 50MB memory limit
    enableDeduplication: true,         // Deduplicate IPC calls
    enablePrefetching: true,           // Prefetch related keys
    enableBackgroundWarming: true,     // Background cache warming
    optimizeSerialization: true,       // Tauri serialization optimization
    maxConcurrentOperations: 10,       // Concurrent IPC limit
  },
  
  // Tauri-specific batch configuration
  tauriBatchConfig: {
    maxBatchSize: 50,                 // Batch up to 50 operations
    maxMemoryUsage: 10 * 1024 * 1024, // 10MB batch memory limit
    batchTimeout: 100,                // 100ms batch timeout
    enableCoalescing: true,           // Coalesce similar operations
    useUnifiedCommand: true,          // Use single batch command
    enablePrioritization: true,       // Priority-based execution
    maxSerializationSize: 1024 * 1024, // 1MB serialization limit
    enableCompression: true,          // Compress large batches
    maxConcurrentInvokes: 5,          // Concurrent invoke limit
  }
});
```

### Security Configuration

```typescript
import { SecureInvoker } from '@tari-project/tarijs-wallet/tauri';

// Create secure invoker with custom security settings
const secureInvoker = new SecureInvoker({
  enableValidation: true,        // Enable payload validation
  enableRateLimiting: true,      // Enable rate limiting
  maxRequestsPerSecond: 100,     // Rate limit threshold
  timeout: 30000,                // Operation timeout (30s)
  maxPayloadSize: 10 * 1024 * 1024, // 10MB payload limit
  
  // Command allowlist for security
  allowedCommands: [
    'store_secure_data_command',
    'retrieve_secure_data_command',
    'remove_secure_data_command',
    'exists_secure_data_command',
    'list_secure_keys_command'
  ]
});
```

## Performance Optimization

### Caching Layer

The Tauri cache provides significant performance improvements:

```typescript
import { TauriSecureStorageCache } from '@tari-project/tarijs-wallet/tauri';

// Wrap storage with Tauri-optimized cache
const cachedStorage = new TauriSecureStorageCache(baseStorage, {
  maxSize: 500,                    // Cache 500 items
  defaultTTL: 300000,              // 5-minute TTL
  enableDeduplication: true,       // Deduplicate IPC calls
  enablePrefetching: true,         // Automatic prefetching
  enableBackgroundWarming: true,   // Background cache updates
  maxConcurrentOperations: 20,     // High concurrency
});

// Cache automatically optimizes repeated operations
const data1 = await cachedStorage.retrieve('user-profile'); // IPC call
const data2 = await cachedStorage.retrieve('user-profile'); // From cache
```

### Batch Operations

Batch operations reduce IPC overhead:

```typescript
import { TauriBatchStorageOperations } from '@tari-project/tarijs-wallet/tauri';

// Wrap storage with batch processing
const batchStorage = new TauriBatchStorageOperations(baseStorage, {
  maxBatchSize: 25,               // Batch up to 25 operations
  batchTimeout: 50,               // 50ms batch window
  enableCoalescing: true,         // Coalesce similar operations
  enablePrioritization: true,     // Priority-based execution
});

// Multiple operations automatically batched
const promises = [
  batchStorage.store('key1', data1),
  batchStorage.store('key2', data2),
  batchStorage.store('key3', data3),
];

// Executed as single batch operation
await Promise.all(promises);
```

## Security Features

### Permission System

Tauri's permission system provides fine-grained control:

```json
{
  "tauri": {
    "allowlist": {
      "storage": {
        "read": true,
        "write": true,
        "delete": false  // Disable deletion for security
      }
    }
  }
}
```

### Secure IPC

All storage operations use validated IPC:

```typescript
// Automatic payload validation and sanitization
const result = await storage.store('user-data', sensitiveData);

if (!result.success) {
  console.error('Storage failed:', result.error); // Sanitized error message
}
```

### Rate Limiting

Built-in protection against abuse:

```typescript
// Automatic rate limiting per operation type
for (let i = 0; i < 1000; i++) {
  const result = await storage.store(`key-${i}`, data);
  
  if (!result.success && result.error?.includes('rate limit')) {
    console.log('Rate limited, backing off...');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

## Cross-Platform Support

### Platform Detection

```typescript
import { TauriAdapter } from '@tari-project/tarijs-wallet/tauri';

const adapter = new TauriAdapter();
const capabilities = await adapter.getCapabilities();

console.log('Platform:', capabilities.platform);
console.log('Secure storage:', capabilities.secureStorage.available);
console.log('Biometric auth:', capabilities.biometricAuth?.available);

// Platform-specific optimizations
switch (capabilities.platform) {
  case 'darwin':
    console.log('Using macOS Keychain via Tauri');
    break;
  case 'windows':
    console.log('Using Windows Credential Store via Tauri');
    break;
  case 'linux':
    console.log('Using Linux Secret Service via Tauri');
    break;
}
```

### Capability Assessment

```typescript
import { getCapabilitiesManager } from '@tari-project/tarijs-wallet';

const capabilities = getCapabilitiesManager().getCapabilityAssessment();

// Tauri-enhanced security levels
console.log('Security details:', capabilities.secureStorage.details);
// "Tauri-enhanced macOS Keychain with Rust security boundary and permission system"

console.log('IPC details:', capabilities.ipc.details);
// "Tauri invoke system with type-safe Rust commands and explicit permission allowlist"
```

## Error Handling

### Graceful Degradation

```typescript
import { createSecureStorage } from '@tari-project/tarijs-wallet';

try {
  // Attempt Tauri backend first
  const storage = await createSecureStorage({
    forceBackend: 'tauri',
    testBackends: true
  });
  
  console.log('Using Tauri backend');
} catch (error) {
  // Fallback to next best backend
  console.warn('Tauri unavailable, using fallback:', error.message);
  
  const storage = await createSecureStorage({
    allowFallbacks: true
  });
}
```

### Error Recovery

```typescript
// Automatic retry with exponential backoff
const storage = await createSecureStorage({
  tauriCacheConfig: {
    maxRetries: 3,
    retryBackoff: 'exponential'
  }
});

// Operations automatically retry on transient failures
const result = await storage.store('important-data', data);
```

## Testing

### Mock Tauri Environment

```typescript
import { mockTauriRuntime, restoreTauriRuntime } from '@tari-project/tarijs-wallet/test-utils';

describe('Tauri Integration', () => {
  beforeEach(() => {
    mockTauriRuntime(); // Setup mock Tauri environment
  });
  
  afterEach(() => {
    restoreTauriRuntime(); // Cleanup
  });
  
  test('should use Tauri backend when available', async () => {
    const storage = await createSecureStorage();
    expect(storage.constructor.name).toBe('TauriStorage');
  });
});
```

### Security Testing

```bash
# Run Tauri-specific security tests
npm run test -- tests/tauri/tauri-security.test.ts

# Run performance benchmarks
npm run test -- tests/tauri/tauri-storage.test.ts --testNamePattern="Performance"

# Run cross-platform tests
./scripts/test-tauri.sh --platform
```

## Performance Metrics

### Benchmark Results

| Metric | Electron | Tauri | Improvement |
|--------|----------|-------|-------------|
| Bundle Size | ~50MB | ~3-10MB | 80-94% smaller |
| Memory Usage | ~100MB | ~40MB | 60% reduction |
| Startup Time | ~2-5s | ~0.2-0.5s | 10x faster |
| IPC Latency | ~1-2ms | ~0.1-0.3ms | 7x faster |
| Security Score | Medium | High | Enhanced |

### Cache Performance

```typescript
// Measure cache effectiveness
const metrics = await storage.getCacheMetrics();
console.log('Cache hit rate:', metrics.hitRate);        // ~85-95%
console.log('IPC operations saved:', metrics.ipcSaved); // ~80% reduction
console.log('Memory efficiency:', metrics.compression); // ~60% compression
```

## Migration Guide

### From Electron to Tauri

1. **Update Dependencies**:
```bash
npm uninstall electron
npm install @tauri-apps/api @tauri-apps/cli
```

2. **Update Storage Configuration**:
```typescript
// Before (Electron)
const storage = await createSecureStorage({
  forceBackend: 'keychain' // Platform-specific
});

// After (Tauri)
const storage = await createSecureStorage({
  // Automatic Tauri optimization
  enableCaching: true,
  enableBatching: true
});
```

3. **Update Security Configuration**:
```json
// tauri.conf.json
{
  "tauri": {
    "allowlist": {
      "storage": { "all": true },
      "invoke": {
        "allowlist": ["store_secure_data_command", "retrieve_secure_data_command"]
      }
    }
  }
}
```

## Best Practices

### Security

1. **Minimize Permissions**: Only enable required Tauri commands
2. **Validate Inputs**: Use built-in payload validation
3. **Rate Limiting**: Enable rate limiting for all operations
4. **Error Sanitization**: Errors are automatically sanitized

### Performance

1. **Enable Caching**: Use Tauri-optimized cache for frequent operations
2. **Batch Operations**: Group related operations for efficiency
3. **Monitor Memory**: Use memory pressure monitoring
4. **Optimize Serialization**: Enable compression for large data

### Development

1. **Test Early**: Use mock Tauri environment for testing
2. **Profile Performance**: Monitor cache hit rates and IPC usage
3. **Handle Fallbacks**: Always provide graceful degradation
4. **Document Permissions**: Clearly document required Tauri permissions

## Troubleshooting

### Common Issues

#### Tauri Runtime Not Available
```typescript
// Check if Tauri is available
if (typeof window !== 'undefined' && window.__TAURI__) {
  console.log('Tauri available');
} else {
  console.log('Tauri not available, using fallback');
}
```

#### Permission Denied
```json
// Add required permissions to tauri.conf.json
{
  "tauri": {
    "allowlist": {
      "invoke": {
        "allowlist": ["missing_command_here"]
      }
    }
  }
}
```

#### Performance Issues
```typescript
// Enable performance monitoring
const storage = await createSecureStorage({
  tauriCacheConfig: {
    enableMetrics: true,
    logPerformance: true
  }
});

// Check metrics periodically
setInterval(() => {
  const metrics = storage.getMetrics();
  console.log('Performance:', metrics);
}, 5000);
```

## Examples

### Complete Tauri Wallet Application

```typescript
import { TariWallet, createSecureStorage, PlatformDetector } from '@tari-project/tarijs-wallet';

class TauriWalletApp {
  private wallet?: TariWallet;
  
  async initialize() {
    // Verify Tauri environment
    const platform = PlatformDetector.detect();
    if (platform.runtime !== 'tauri') {
      throw new Error('This application requires Tauri runtime');
    }
    
    // Create optimized storage
    const storage = await createSecureStorage({
      enableCaching: true,
      enableBatching: true,
      enableHealthMonitoring: true,
      
      tauriCacheConfig: {
        maxSize: 1000,
        enableDeduplication: true,
        enablePrefetching: true
      },
      
      tauriBatchConfig: {
        maxBatchSize: 50,
        batchTimeout: 100,
        enableCoalescing: true
      }
    });
    
    // Create wallet with Tauri optimization
    this.wallet = await TariWallet.create({
      network: 'testnet',
      storagePath: './wallet-data',
      storage,
      
      // Tauri-specific optimizations
      enablePerformanceMonitoring: true,
      enableSecurityValidation: true
    });
    
    console.log('Tauri wallet initialized successfully');
  }
  
  async performOperations() {
    if (!this.wallet) throw new Error('Wallet not initialized');
    
    // All operations benefit from Tauri optimizations
    const address = await this.wallet.getAddress();
    const balance = await this.wallet.getBalance();
    
    console.log('Address:', address.toString());
    console.log('Balance:', balance.available);
    
    // Operations are automatically cached and batched
    const transactions = await this.wallet.getTransactions();
    console.log('Transactions:', transactions.length);
  }
  
  async cleanup() {
    if (this.wallet) {
      await this.wallet.destroy();
    }
  }
}

// Usage
const app = new TauriWalletApp();
await app.initialize();
await app.performOperations();
await app.cleanup();
```

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Tari JavaScript SDK API Reference](../packages/wallet/README.md)

## Support

For Tauri integration issues:

1. Check [GitHub Issues](https://github.com/tari-project/tari-javascript-sdk/issues)
2. Review [Troubleshooting Guide](#troubleshooting)
3. Submit detailed bug reports with Tauri version and platform information
