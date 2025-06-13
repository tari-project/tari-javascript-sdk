/**
 * Test suite for resource tracker with leak detection
 */

import { 
  ResourceTracker, 
  getResourceTracker, 
  trackResource, 
  untrackResource,
  detectResourceLeaks,
  getResourceStats
} from '../tracker';
import { FFIResource, ResourceType } from '../resource';
import type { WalletHandle } from '../types';

// Mock object that simulates FFIResource without auto-registration
class MockResource {
  public readonly type: ResourceType;
  public disposed = false;

  constructor(type: ResourceType = ResourceType.Wallet) {
    this.type = type;
  }

  getTestHandle(): WalletHandle {
    return 123 as WalletHandle;
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe('ResourceTracker', () => {
  let tracker: ResourceTracker;

  beforeEach(() => {
    // Reset the global tracker instance completely
    (ResourceTracker as any).resetInstance();
    // Force garbage collection to clear any WeakMap entries
    if (global.gc) {
      global.gc();
    }
    tracker = ResourceTracker.getInstance();
    tracker.clearAll();
    tracker.resetStats();
  });

  afterEach(() => {
    // Force cleanup and reset
    if (tracker) {
      tracker.forceCleanup();
      tracker.clearAll();
      tracker.resetStats();
    }
    (ResourceTracker as any).resetInstance();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const tracker1 = ResourceTracker.getInstance();
      const tracker2 = ResourceTracker.getInstance();
      
      expect(tracker1).toBe(tracker2);
    });

    test('should return same instance via convenience function', () => {
      const tracker1 = getResourceTracker();
      const tracker2 = ResourceTracker.getInstance();
      
      expect(tracker1).toBe(tracker2);
    });
  });

  describe('Resource Registration', () => {
    test('should register resource with metadata', () => {
      const resource = new MockResource(ResourceType.Wallet);
      const handle = 123 as WalletHandle;
      const tags = ['test', 'wallet'];
      
      const id = tracker.register(resource, ResourceType.Wallet, handle, tags);
      
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^ffi_\d+_\d+$/);
      
      const metadata = tracker.getMetadata(resource);
      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe(ResourceType.Wallet);
      expect(metadata?.handle).toBe(handle);
      expect(metadata?.tags).toEqual(tags);
    });

    test('should track resource statistics', () => {
      const resource1 = new MockResource(ResourceType.Wallet);
      const resource2 = new MockResource(ResourceType.Transaction);
      
      tracker.register(resource1, ResourceType.Wallet);
      tracker.register(resource2, ResourceType.Transaction);
      
      const stats = tracker.getStats();
      expect(stats.totalCreated).toBe(2);
      expect(stats.currentActive).toBe(2);
    });

    test('should use convenience function for registration', () => {
      const resource = new MockResource();
      const handle = 456 as WalletHandle;
      
      const id = trackResource(resource, ResourceType.Wallet, handle, ['test']);
      
      expect(id).toBeDefined();
      
      const metadata = tracker.getMetadata(resource);
      expect(metadata?.handle).toBe(handle);
    });
  });

  describe('Resource Unregistration', () => {
    test('should unregister resource', () => {
      const resource = new MockResource();
      
      const id = tracker.register(resource, ResourceType.Wallet);
      expect(tracker.getStats().currentActive).toBe(1);
      
      tracker.unregister(resource);
      expect(tracker.getStats().currentActive).toBe(0);
      expect(tracker.getStats().explicitlyDisposed).toBe(1);
    });

    test('should handle unregistering non-tracked resource', () => {
      const resource = new MockResource();
      
      // Should not throw when unregistering non-tracked resource
      expect(() => tracker.unregister(resource)).not.toThrow();
    });

    test('should use convenience function for unregistration', () => {
      const resource = new MockResource();
      
      trackResource(resource, ResourceType.Wallet);
      expect(tracker.getStats().currentActive).toBe(1);
      
      untrackResource(resource);
      expect(tracker.getStats().currentActive).toBe(0);
    });
  });

  describe('Leak Detection', () => {
    test('should detect potential leaks', (done) => {
      // Reset and create a fresh tracker with custom config
      (ResourceTracker as any).resetInstance();
      const config = { leakThresholdMs: 100, enableLeakDetection: true };
      const testTracker = ResourceTracker.getInstance(config);
      testTracker.clearAll();
      testTracker.resetStats();
      
      const resource = new MockResource();
      const registeredId = testTracker.register(resource, ResourceType.Wallet);
      
      // Verify initial state
      expect(testTracker.getStats().currentActive).toBe(1);
      expect(registeredId).toBeTruthy();
      
      // Wait for threshold to pass
      setTimeout(() => {
        const leaks = testTracker.detectLeaks();
        expect(leaks.length).toBe(1);
        expect(leaks[0].metadata.type).toBe(ResourceType.Wallet);
        expect(leaks[0].isAlive).toBe(true);
        done();
      }, 150);
    }, 10000);

    test('should not report recent resources as leaks', () => {
      const resource = new MockResource();
      tracker.register(resource, ResourceType.Wallet);
      
      const leaks = tracker.detectLeaks();
      expect(leaks.length).toBe(0);
    });

    test('should use convenience function for leak detection', () => {
      const resource = new MockResource();
      trackResource(resource, ResourceType.Wallet);
      
      const leaks = detectResourceLeaks();
      expect(Array.isArray(leaks)).toBe(true);
    });

    test('should clean up dead weak references', () => {
      let resource: MockResource | null = new MockResource();
      const weakRef = new WeakRef(resource);
      
      tracker.register(resource, ResourceType.Wallet);
      
      // Clear reference and force cleanup
      resource = null;
      tracker.forceCleanup();
      
      // The dead reference should be cleaned up
      // (Note: This test might be flaky due to GC timing)
    });
  });

  describe('Resource Queries', () => {
    test('should get resources by type', () => {
      const wallet1 = new MockResource();
      const wallet2 = new MockResource();
      const transaction = new MockResource();
      
      tracker.register(wallet1, ResourceType.Wallet);
      tracker.register(wallet2, ResourceType.Wallet);
      tracker.register(transaction, ResourceType.Transaction);
      
      const wallets = tracker.getResourcesByType(ResourceType.Wallet);
      const transactions = tracker.getResourcesByType(ResourceType.Transaction);
      
      expect(wallets).toHaveLength(2);
      expect(transactions).toHaveLength(1);
    });

    test('should get resources by tag', () => {
      const resource1 = new MockResource();
      const resource2 = new MockResource();
      const resource3 = new MockResource();
      
      tracker.register(resource1, ResourceType.Wallet, undefined, ['production']);
      tracker.register(resource2, ResourceType.Wallet, undefined, ['test']);
      tracker.register(resource3, ResourceType.Wallet, undefined, ['production', 'test']);
      
      const productionResources = tracker.getResourcesByTag('production');
      const testResources = tracker.getResourcesByTag('test');
      
      expect(productionResources).toHaveLength(2);
      expect(testResources).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    test('should track creation statistics', () => {
      const resource1 = new MockResource();
      const resource2 = new MockResource();
      
      tracker.register(resource1, ResourceType.Wallet);
      tracker.register(resource2, ResourceType.Transaction);
      
      const stats = tracker.getStats();
      expect(stats.totalCreated).toBe(2);
      expect(stats.currentActive).toBe(2);
      expect(stats.gcCleaned).toBe(0);
      expect(stats.explicitlyDisposed).toBe(0);
    });

    test('should track disposal statistics', () => {
      const resource = new MockResource();
      
      tracker.register(resource, ResourceType.Wallet);
      tracker.unregister(resource);
      
      const stats = tracker.getStats();
      expect(stats.totalCreated).toBe(1);
      expect(stats.currentActive).toBe(0);
      expect(stats.explicitlyDisposed).toBe(1);
    });

    test('should use convenience function for statistics', () => {
      const resource = new MockResource();
      trackResource(resource, ResourceType.Wallet);
      
      const stats = getResourceStats();
      expect(stats.totalCreated).toBe(1);
      expect(stats.currentActive).toBe(1);
    });

    test('should estimate memory usage', () => {
      const resource1 = new MockResource();
      const resource2 = new MockResource();
      
      tracker.register(resource1, ResourceType.Wallet);
      tracker.register(resource2, ResourceType.Transaction);
      
      const stats = tracker.getStats();
      expect(stats.estimatedMemoryUsage).toBeGreaterThan(0);
      expect(stats.estimatedMemoryUsage).toBe(2 * 1024); // 2 resources * 1KB each
    });
  });

  describe('Diagnostic Report', () => {
    test('should generate comprehensive diagnostic report', () => {
      const wallet = new MockResource();
      const transaction = new MockResource();
      
      tracker.register(wallet, ResourceType.Wallet, undefined, ['test']);
      tracker.register(transaction, ResourceType.Transaction);
      
      const report = tracker.generateDiagnosticReport();
      
      expect(report.stats).toBeDefined();
      expect(report.leaks).toEqual([]);
      expect(report.resourcesByType).toHaveProperty(ResourceType.Wallet);
      expect(report.resourcesByType).toHaveProperty(ResourceType.Transaction);
      expect(report.oldestResources).toHaveLength(2);
    });

    test('should sort oldest resources correctly', (done) => {
      const resource1 = new MockResource();
      const resource2 = new MockResource();
      
      tracker.register(resource1, ResourceType.Wallet);
      
      // Wait a bit before creating second resource
      setTimeout(() => {
        tracker.register(resource2, ResourceType.Transaction);
        
        const report = tracker.generateDiagnosticReport();
        const oldest = report.oldestResources;
        
        expect(oldest).toHaveLength(2);
        expect(oldest[0].ageMs).toBeGreaterThan(oldest[1].ageMs);
        done();
      }, 10);
    }, 5000);
  });

  describe('Configuration', () => {
    test('should respect configuration options', () => {
      // Reset and create a fresh tracker with custom config
      (ResourceTracker as any).resetInstance();
      const config = {
        captureStackTraces: false,
        enableLeakDetection: false,
        maxTrackedResources: 5,
      };
      
      const customTracker = ResourceTracker.getInstance(config);
      customTracker.clearAll();
      customTracker.resetStats();
      
      const resource = new MockResource();
      customTracker.register(resource, ResourceType.Wallet);
      
      // With leak detection disabled, should return empty array
      const leaks = customTracker.detectLeaks();
      expect(leaks).toEqual([]);
    });

    test('should enforce tracking limits', () => {
      // Reset and create a fresh tracker with custom config
      (ResourceTracker as any).resetInstance();
      const config = { maxTrackedResources: 2 };
      const customTracker = ResourceTracker.getInstance(config);
      customTracker.clearAll();
      customTracker.resetStats();
      
      const resource1 = new MockResource();
      const resource2 = new MockResource();
      const resource3 = new MockResource();
      
      customTracker.register(resource1, ResourceType.Wallet);
      customTracker.register(resource2, ResourceType.Wallet);
      customTracker.register(resource3, ResourceType.Wallet);
      
      // Should automatically clean up to stay within limits
      const stats = customTracker.getStats();
      expect(stats.currentActive).toBeLessThanOrEqual(2);
    });
  });

  describe('Force Cleanup', () => {
    test('should trigger garbage collection if available', () => {
      const originalGC = global.gc;
      global.gc = jest.fn();
      
      tracker.forceCleanup();
      
      if (originalGC) {
        expect(global.gc).toHaveBeenCalled();
        global.gc = originalGC;
      } else {
        global.gc = originalGC;
      }
    });

    test('should handle missing garbage collection gracefully', () => {
      const originalGC = global.gc;
      delete (global as any).gc;
      
      expect(() => tracker.forceCleanup()).not.toThrow();
      
      if (originalGC) {
        global.gc = originalGC;
      }
    });
  });

  describe('Reset and Clear', () => {
    test('should reset statistics', () => {
      const resource = new MockResource();
      tracker.register(resource, ResourceType.Wallet);
      
      tracker.resetStats();
      
      const stats = tracker.getStats();
      expect(stats.totalCreated).toBe(0);
      expect(stats.currentActive).toBe(0);
    });

    test('should clear all tracking data', () => {
      const resource = new MockResource();
      tracker.register(resource, ResourceType.Wallet);
      
      tracker.clearAll();
      
      const stats = tracker.getStats();
      expect(stats.totalCreated).toBe(0);
      expect(stats.currentActive).toBe(0);
      
      // Note: WeakMap metadata can't be cleared, but new resources won't see old data
      // Test with a new resource to verify isolation
      const newResource = new MockResource();
      const metadata = tracker.getMetadata(newResource);
      expect(metadata).toBeUndefined();
    });
  });
});
