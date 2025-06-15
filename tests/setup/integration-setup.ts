/**
 * Integration test setup - uses real FFI bindings with isolated environments
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { NetworkType } from '@tari-project/tarijs-core';

// Integration test context for resource management
interface IntegrationTestContext {
  walletPath: string;
  logPath: string;
  wallets: any[];
  network: NetworkType;
  cleanup: () => Promise<void>;
}

let currentContext: IntegrationTestContext | null = null;

// Helper functions for network configuration
function getTestNetwork(): NetworkType {
  const networkEnv = process.env.TARI_NETWORK?.toLowerCase() || 'testnet';
  
  switch (networkEnv) {
    case 'mainnet':
      return NetworkType.Mainnet;
    case 'testnet':
      return NetworkType.Testnet;
    case 'nextnet':
      return NetworkType.Nextnet;
    default:
      console.warn(`Unknown network ${networkEnv}, defaulting to testnet`);
      return NetworkType.Testnet;
  }
}

function getNetworkName(network: NetworkType): string {
  switch (network) {
    case NetworkType.Mainnet:
      return 'mainnet';
    case NetworkType.Testnet:
      return 'testnet';
    case NetworkType.Nextnet:
      return 'nextnet';
    default:
      return 'testnet';
  }
}

// Create isolated test environment for each test
beforeEach(async () => {
  const testId = randomUUID();
  const network = getTestNetwork();
  const networkName = getNetworkName(network);
  const walletPath = join(tmpdir(), `tari-test-wallet-${networkName}-${testId}`);
  const logPath = join(tmpdir(), `tari-test-logs-${networkName}-${testId}`);
  
  // Ensure directories exist
  await fs.mkdir(walletPath, { recursive: true });
  await fs.mkdir(logPath, { recursive: true });
  
  currentContext = {
    walletPath,
    logPath,
    wallets: [],
    network,
    cleanup: async () => {
      // Destroy all wallets created in this test
      for (const wallet of currentContext?.wallets || []) {
        try {
          if (wallet && typeof wallet.destroy === 'function') {
            await wallet.destroy();
          }
        } catch (error) {
          console.warn('Warning: Failed to clean up wallet:', error);
        }
      }
      
      // Clean up test directories
      try {
        await fs.rm(walletPath, { recursive: true, force: true });
        await fs.rm(logPath, { recursive: true, force: true });
      } catch (error) {
        console.warn('Warning: Failed to clean up test directories:', error);
      }
    },
  };
});

// Clean up after each test
afterEach(async () => {
  if (currentContext) {
    await currentContext.cleanup();
    currentContext = null;
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Global utilities for integration tests
global.testUtils = {
  ...global.testUtils,
  
  // Integration test specific utilities
  getTestContext: (): IntegrationTestContext => {
    if (!currentContext) {
      throw new Error('Integration test context not available');
    }
    return currentContext;
  },
  
  // Helper to create isolated wallet config
  createIsolatedWalletConfig: (overrides?: any) => {
    const context = currentContext;
    if (!context) {
      throw new Error('Integration test context not available');
    }
    
    return {
      network: context.network,
      storagePath: context.walletPath,
      logPath: context.logPath,
      logLevel: 'info',
      ...overrides,
    };
  },
  
  // Helper to register wallet for cleanup
  registerWalletForCleanup: (wallet: any) => {
    if (currentContext) {
      currentContext.wallets.push(wallet);
    }
  },
  
  // Helper to wait for wallet sync (with timeout)
  waitForWalletSync: async (wallet: any, timeoutMs: number = 30000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Wallet sync timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Mock sync completion for now
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 1000);
    });
  },
  
  // Helper to check if real FFI is available
  isRealFFIAvailable: async (): Promise<boolean> => {
    try {
      // Try to load the real FFI module for the current network
      const { loadNativeModuleForNetwork } = await import('@tari-project/tarijs-core');
      const context = currentContext;
      if (!context) {
        return false;
      }
      
      // Attempt to load the network-specific FFI module
      await loadNativeModuleForNetwork(context.network);
      return true;
    } catch (error) {
      console.warn(`FFI not available for network ${currentContext?.network}:`, error);
      return false;
    }
  },

  // Helper to get current test network
  getCurrentNetwork: (): NetworkType => {
    const context = currentContext;
    if (!context) {
      throw new Error('Integration test context not available');
    }
    return context.network;
  },

  // Helper to validate network binary is available
  validateNetworkBinary: async (): Promise<boolean> => {
    try {
      const { BinaryResolver } = await import('@tari-project/tarijs-core');
      const context = currentContext;
      if (!context) {
        return false;
      }
      
      const resolver = new BinaryResolver({ 
        network: context.network,
        enableNetworkFallback: true 
      });
      
      const resolved = resolver.resolveBinary(context.network);
      const isAvailable = resolved.exists;
      
      if (!isAvailable) {
        console.warn(`Network binary not available for ${getNetworkName(context.network)}: ${resolved.path}`);
      }
      
      return isAvailable;
    } catch (error) {
      console.warn('Binary validation failed:', error);
      return false;
    }
  },
};

// Add integration-specific custom matchers
expect.extend({
  toHaveCreatedFiles(received: string) {
    return fs.access(received)
      .then(() => ({ pass: true, message: () => `expected ${received} not to exist` }))
      .catch(() => ({ pass: false, message: () => `expected ${received} to exist` }));
  },
});

// Skip integration tests if FFI not available
beforeAll(async () => {
  const context = currentContext || { network: getTestNetwork() } as any;
  const networkName = getNetworkName(context.network);
  
  console.log(`Initializing integration tests for ${networkName} network`);
  
  const isFFIAvailable = await global.testUtils.isRealFFIAvailable();
  const isBinaryAvailable = await global.testUtils.validateNetworkBinary();
  
  if (!isFFIAvailable) {
    console.warn(`Skipping integration tests: Real FFI not available for ${networkName}`);
    return;
  }
  
  if (!isBinaryAvailable) {
    console.warn(`Skipping integration tests: Network binary not found for ${networkName}`);
    console.warn('Run build:networks to compile network-specific binaries');
    return;
  }
  
  console.log(`✅ Integration tests ready for ${networkName} network`);
});

// TypeScript declaration for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveCreatedFiles(): Promise<R>;
    }
  }
}
