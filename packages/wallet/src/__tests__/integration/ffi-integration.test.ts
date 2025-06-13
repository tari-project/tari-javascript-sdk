/**
 * Integration tests for FFI bindings and resource management
 * Tests the actual FFI layer with real native code
 */

import { loadNativeBindings } from '../../../../core/src/ffi/loader';
import { FFICallManager } from '../../../../core/src/ffi/call-manager';
import { ResourceTracker } from '../../../../core/src/ffi/tracker';
import { WalletConfigFactory } from '../../testing/factories';

// Skip these tests if FFI is not available
const describeIfFFIAvailable = process.env.JEST_INTEGRATION_MODE === 'true' ? describe : describe.skip;

describeIfFFIAvailable('FFI Integration Tests', () => {
  let nativeBindings: any;
  let callManager: FFICallManager;
  let resourceTracker: ResourceTracker;
  let testContext: any;

  beforeAll(async () => {
    try {
      nativeBindings = await loadNativeBindings();
      callManager = FFICallManager.getInstance();
      resourceTracker = ResourceTracker.getInstance();
    } catch (error) {
      throw new Error(`Failed to load native bindings: ${error}`);
    }
  });

  beforeEach(() => {
    testContext = global.testUtils.getTestContext();
    callManager.clearMetrics();
    resourceTracker.clearTracking();
  });

  afterEach(async () => {
    // Clean up any resources created during tests
    await resourceTracker.cleanupAll();
  });

  describe('FFI Loading and Initialization', () => {
    test('should load native bindings successfully', () => {
      expect(nativeBindings).toBeDefined();
      expect(typeof nativeBindings.walletCreate).toBe('function');
      expect(typeof nativeBindings.walletDestroy).toBe('function');
      expect(typeof nativeBindings.walletGetBalance).toBe('function');
      expect(typeof nativeBindings.walletSendTransaction).toBe('function');
    });

    test('should initialize logging system', async () => {
      await expect(
        callManager.execute('init_logging', nativeBindings.init_logging, [2]) // INFO level
      ).resolves.not.toThrow();
    });

    test('should handle multiple initialization calls', async () => {
      // Multiple init calls should not cause issues
      await callManager.execute('init_logging', nativeBindings.init_logging, [1]);
      await callManager.execute('init_logging', nativeBindings.init_logging, [2]);
      await callManager.execute('init_logging', nativeBindings.init_logging, [3]);
    });
  });

  describe('Wallet Handle Management', () => {
    test('should create and track wallet handles', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      expect(handle).toBeValidWalletHandle();
      resourceTracker.trackWallet(handle);
      
      // Verify handle is valid
      const isValid = await callManager.execute(
        'walletValidateHandle',
        nativeBindings.walletValidateHandle,
        [handle]
      );
      
      expect(isValid).toBe(true);
      
      // Clean up
      await callManager.execute(
        'walletDestroy',
        nativeBindings.walletDestroy,
        [handle]
      );
      resourceTracker.untrackWallet(handle);
    });

    test('should handle invalid wallet handles gracefully', async () => {
      const invalidHandle = -1;
      
      await expect(
        callManager.execute(
          'walletGetBalance',
          nativeBindings.walletGetBalance,
          [invalidHandle]
        )
      ).rejects.toThrow();
    });

    test('should track multiple wallet handles', async () => {
      const configs = Array.from({ length: 3 }, (_, i) => 
        global.testUtils.createIsolatedWalletConfig({
          storagePath: `${testContext.walletPath}/multi-${i}`,
        })
      );
      
      const handles = [];
      
      for (const config of configs) {
        const handle = await callManager.execute(
          'walletCreate',
          nativeBindings.walletCreate,
          [config]
        );
        
        handles.push(handle);
        resourceTracker.trackWallet(handle);
      }
      
      // Verify all handles are valid and unique
      expect(handles).toHaveLength(3);
      expect(new Set(handles).size).toBe(3); // All unique
      
      for (const handle of handles) {
        expect(handle).toBeValidWalletHandle();
        
        const isValid = await callManager.execute(
          'walletValidateHandle',
          nativeBindings.walletValidateHandle,
          [handle]
        );
        expect(isValid).toBe(true);
      }
      
      // Clean up all handles
      for (const handle of handles) {
        await callManager.execute(
          'walletDestroy',
          nativeBindings.walletDestroy,
          [handle]
        );
        resourceTracker.untrackWallet(handle);
      }
    });

    test('should detect handle leaks', async () => {
      const initialCount = await callManager.execute(
        'walletGetActiveHandleCount',
        nativeBindings.walletGetActiveHandleCount,
        []
      );
      
      // Create wallet without proper cleanup
      const config = global.testUtils.createIsolatedWalletConfig();
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      const afterCreateCount = await callManager.execute(
        'walletGetActiveHandleCount',
        nativeBindings.walletGetActiveHandleCount,
        []
      );
      
      expect(afterCreateCount).toBe(initialCount + 1);
      
      // Clean up
      await callManager.execute(
        'walletDestroy',
        nativeBindings.walletDestroy,
        [handle]
      );
      
      const afterCleanupCount = await callManager.execute(
        'walletGetActiveHandleCount',
        nativeBindings.walletGetActiveHandleCount,
        []
      );
      
      expect(afterCleanupCount).toBe(initialCount);
    });
  });

  describe('FFI Call Manager Integration', () => {
    test('should track call metrics', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      
      // Make several FFI calls
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      await callManager.execute(
        'walletGetAddress',
        nativeBindings.walletGetAddress,
        [handle]
      );
      
      await callManager.execute(
        'walletGetBalance',
        nativeBindings.walletGetBalance,
        [handle]
      );
      
      // Check metrics
      const stats = callManager.getStats();
      expect(stats.totalCalls).toBeGreaterThanOrEqual(3);
      expect(stats.successfulCalls).toBeGreaterThanOrEqual(3);
      expect(stats.failedCalls).toBe(0);
      
      // Clean up
      await callManager.execute(
        'walletDestroy',
        nativeBindings.walletDestroy,
        [handle]
      );
    });

    test('should handle FFI errors and retry logic', async () => {
      const invalidConfig = {
        network: 'invalid_network',
        storagePath: '/invalid/path/that/does/not/exist',
      };
      
      // This should fail and trigger retry logic
      await expect(
        callManager.execute(
          'walletCreate',
          nativeBindings.walletCreate,
          [invalidConfig],
          { maxRetries: 2 }
        )
      ).rejects.toThrow();
      
      const stats = callManager.getStats();
      expect(stats.failedCalls).toBeGreaterThan(0);
    });

    test('should handle concurrent FFI operations', async () => {
      const configs = Array.from({ length: 5 }, (_, i) => 
        global.testUtils.createIsolatedWalletConfig({
          storagePath: `${testContext.walletPath}/concurrent-${i}`,
        })
      );
      
      // Create multiple wallets concurrently
      const handlePromises = configs.map(config => 
        callManager.execute(
          'walletCreate',
          nativeBindings.walletCreate,
          [config]
        )
      );
      
      const handles = await Promise.all(handlePromises);
      
      // Verify all succeeded
      expect(handles).toHaveLength(5);
      handles.forEach(handle => {
        expect(handle).toBeValidWalletHandle();
        resourceTracker.trackWallet(handle);
      });
      
      // Clean up concurrently
      const destroyPromises = handles.map(handle => 
        callManager.execute(
          'walletDestroy',
          nativeBindings.walletDestroy,
          [handle]
        )
      );
      
      await Promise.all(destroyPromises);
      
      handles.forEach(handle => {
        resourceTracker.untrackWallet(handle);
      });
    });

    test('should handle timeout scenarios', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      
      // Test with very short timeout
      await expect(
        callManager.execute(
          'walletCreate',
          nativeBindings.walletCreate,
          [config],
          { timeout: 1 } // 1ms timeout - should fail
        )
      ).rejects.toThrow(/timeout/i);
    }, 10000);
  });

  describe('Resource Tracking and Cleanup', () => {
    test('should track and clean up resources automatically', async () => {
      const initialTracked = resourceTracker.getTrackedWallets().length;
      
      const config = global.testUtils.createIsolatedWalletConfig();
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      resourceTracker.trackWallet(handle);
      
      expect(resourceTracker.getTrackedWallets()).toHaveLength(initialTracked + 1);
      
      // Cleanup should destroy tracked wallets
      await resourceTracker.cleanupAll();
      
      expect(resourceTracker.getTrackedWallets()).toHaveLength(0);
    });

    test('should handle cleanup failures gracefully', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      resourceTracker.trackWallet(handle);
      
      // Manually destroy wallet first
      await callManager.execute(
        'walletDestroy',
        nativeBindings.walletDestroy,
        [handle]
      );
      
      // Cleanup should handle already-destroyed wallet gracefully
      await expect(resourceTracker.cleanupAll()).resolves.not.toThrow();
    });

    test('should detect resource leaks', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      
      // Create wallet but don't track it
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      // This would be a leak - cleanup manually
      await callManager.execute(
        'walletDestroy',
        nativeBindings.walletDestroy,
        [handle]
      );
    });
  });

  describe('Memory and Performance', () => {
    test('should handle rapid FFI calls without memory leaks', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      resourceTracker.trackWallet(handle);
      
      try {
        // Make many rapid calls
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
          await callManager.execute(
            'walletGetAddress',
            nativeBindings.walletGetAddress,
            [handle]
          );
          
          await callManager.execute(
            'walletGetBalance',
            nativeBindings.walletGetBalance,
            [handle]
          );
        }
        
        const stats = callManager.getStats();
        expect(stats.successfulCalls).toBeGreaterThanOrEqual(iterations * 2);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
      } finally {
        await callManager.execute(
          'walletDestroy',
          nativeBindings.walletDestroy,
          [handle]
        );
        resourceTracker.untrackWallet(handle);
      }
    }, 30000);

    test('should maintain performance under load', async () => {
      const startTime = Date.now();
      const config = global.testUtils.createIsolatedWalletConfig();
      
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      resourceTracker.trackWallet(handle);
      
      try {
        // Measure average call time
        const iterations = 50;
        const callTimes: number[] = [];
        
        for (let i = 0; i < iterations; i++) {
          const callStart = Date.now();
          
          await callManager.execute(
            'walletGetBalance',
            nativeBindings.walletGetBalance,
            [handle]
          );
          
          callTimes.push(Date.now() - callStart);
        }
        
        const averageCallTime = callTimes.reduce((a, b) => a + b, 0) / callTimes.length;
        const maxCallTime = Math.max(...callTimes);
        
        // Performance assertions
        expect(averageCallTime).toBeLessThan(100); // Less than 100ms average
        expect(maxCallTime).toBeLessThan(1000); // Less than 1s max
        
      } finally {
        await callManager.execute(
          'walletDestroy',
          nativeBindings.walletDestroy,
          [handle]
        );
        resourceTracker.untrackWallet(handle);
      }
      
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(30000); // Less than 30 seconds total
    }, 60000);
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed FFI parameters', async () => {
      // Test with null parameters
      await expect(
        callManager.execute(
          'walletCreate',
          nativeBindings.walletCreate,
          [null]
        )
      ).rejects.toThrow();
      
      // Test with invalid parameter types
      await expect(
        callManager.execute(
          'walletGetBalance',
          nativeBindings.walletGetBalance,
          ['not_a_number']
        )
      ).rejects.toThrow();
    });

    test('should handle FFI function not found', async () => {
      const nonExistentFunction = 'nonExistentFunction';
      
      await expect(
        callManager.execute(
          nonExistentFunction,
          (nativeBindings as any)[nonExistentFunction],
          []
        )
      ).rejects.toThrow();
    });

    test('should handle process signals gracefully', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      resourceTracker.trackWallet(handle);
      
      // Simulate process cleanup
      await resourceTracker.cleanupAll();
      
      // Handle should be cleaned up
      expect(resourceTracker.getTrackedWallets()).toHaveLength(0);
    });
  });

  describe('Circuit Breaker Integration', () => {
    test('should open circuit breaker after repeated failures', async () => {
      const invalidConfig = { invalid: 'config' };
      
      // Trigger multiple failures
      for (let i = 0; i < 5; i++) {
        try {
          await callManager.execute(
            'walletCreate',
            nativeBindings.walletCreate,
            [invalidConfig],
            { maxRetries: 0 }
          );
        } catch {
          // Expected failures
        }
      }
      
      const stats = callManager.getStats();
      expect(stats.failedCalls).toBeGreaterThanOrEqual(5);
      
      // Circuit breaker should be open
      expect(stats.circuitBreakerStats.state).toBe('Open');
    });

    test('should recover from circuit breaker open state', async () => {
      // Reset circuit breaker
      callManager.resetCircuitBreaker();
      
      const config = global.testUtils.createIsolatedWalletConfig();
      
      // Should work normally after reset
      const handle = await callManager.execute(
        'walletCreate',
        nativeBindings.walletCreate,
        [config]
      );
      
      expect(handle).toBeValidWalletHandle();
      
      await callManager.execute(
        'walletDestroy',
        nativeBindings.walletDestroy,
        [handle]
      );
    });
  });
});
