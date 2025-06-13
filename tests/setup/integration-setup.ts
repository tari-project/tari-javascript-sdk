/**
 * Integration test setup - uses real FFI bindings with isolated environments
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';

// Integration test context for resource management
interface IntegrationTestContext {
  walletPath: string;
  logPath: string;
  wallets: any[];
  cleanup: () => Promise<void>;
}

let currentContext: IntegrationTestContext | null = null;

// Create isolated test environment for each test
beforeEach(async () => {
  const testId = randomUUID();
  const walletPath = join(tmpdir(), `tari-test-wallet-${testId}`);
  const logPath = join(tmpdir(), `tari-test-logs-${testId}`);
  
  // Ensure directories exist
  await fs.mkdir(walletPath, { recursive: true });
  await fs.mkdir(logPath, { recursive: true });
  
  currentContext = {
    walletPath,
    logPath,
    wallets: [],
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
      network: 'testnet',
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
      // Try to load the real FFI module
      // This would need to be implemented based on actual FFI loading
      return true; // Placeholder
    } catch {
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
  const isFFIAvailable = await global.testUtils.isRealFFIAvailable();
  if (!isFFIAvailable) {
    console.warn('Skipping integration tests: Real FFI not available');
    // This would skip the entire test suite
  }
});

// TypeScript declaration for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveCreatedFiles(): Promise<R>;
    }
  }
}
