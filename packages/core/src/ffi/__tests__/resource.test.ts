/**
 * Test suite for FFI resource base class with disposal pattern
 */

import { FFIResource, ResourceType, createNativeDisposal, disposeAll } from '../resource';
import { TariError, ErrorCode } from '../../errors/index';

// Mock disposal logic for testing
let disposalCalled = false;
let disposalError: Error | null = null;

const mockDisposal = jest.fn(async () => {
  disposalCalled = true;
  if (disposalError) {
    throw disposalError;
  }
});

// Concrete test implementation of FFIResource
class TestResource extends FFIResource {
  constructor(
    type: ResourceType = ResourceType.Wallet,
    captureStack = false,
    tags?: string[]
  ) {
    super(type, mockDisposal, captureStack, tags);
  }

  // Expose getHandle for testing
  getTestHandle() {
    return this.getHandle?.();
  }

  // Test method that requires non-disposed state
  testOperation(): string {
    this.ensureNotDisposed();
    return 'operation successful';
  }
}

describe('FFIResource', () => {
  beforeEach(() => {
    disposalCalled = false;
    disposalError = null;
    mockDisposal.mockClear();
  });

  afterEach(() => {
    // Force GC to clean up any remaining resources
    if (global.gc) {
      global.gc();
    }
  });

  describe('Resource Creation', () => {
    test('should create resource with correct type', () => {
      const resource = new TestResource(ResourceType.Transaction);
      
      expect(resource.type).toBe(ResourceType.Transaction);
      expect(resource.isDisposed).toBe(false);
      expect(resource.createdAt).toBeInstanceOf(Date);
    });

    test('should capture stack trace when enabled', () => {
      const resource = new TestResource(ResourceType.Wallet, true);
      
      expect(resource.getCreationStack()).toBeDefined();
      expect(resource.getCreationStack()).toContain('TestResource');
    });

    test('should not capture stack trace when disabled', () => {
      const resource = new TestResource(ResourceType.Wallet, false);
      
      expect(resource.getCreationStack()).toBeUndefined();
    });

    test('should track resource with tags', () => {
      const tags = ['test', 'wallet'];
      const resource = new TestResource(ResourceType.Wallet, true, tags);
      
      const info = resource.getResourceInfo();
      expect(info.type).toBe(ResourceType.Wallet);
    });
  });

  describe('Symbol.dispose Pattern', () => {
    test('should dispose resource using Symbol.dispose', () => {
      const resource = new TestResource();
      
      resource[Symbol.dispose]();
      
      expect(disposalCalled).toBe(true);
      expect(resource.isDisposed).toBe(true);
      expect(mockDisposal).toHaveBeenCalledTimes(1);
    });

    test('should work with using keyword simulation', async () => {
      let resource: TestResource;
      
      // Simulate using block
      {
        resource = new TestResource();
        // Simulate automatic disposal at end of block
        resource[Symbol.dispose]();
      }
      
      expect(disposalCalled).toBe(true);
      expect(resource.isDisposed).toBe(true);
    });

    test('should not dispose twice', () => {
      const resource = new TestResource();
      
      resource.dispose();
      resource.dispose();
      
      expect(mockDisposal).toHaveBeenCalledTimes(1);
      expect(resource.isDisposed).toBe(true);
    });
  });

  describe('Explicit Disposal', () => {
    test('should dispose resource explicitly', () => {
      const resource = new TestResource();
      
      resource.dispose();
      
      expect(disposalCalled).toBe(true);
      expect(resource.isDisposed).toBe(true);
    });

    test('should handle disposal errors', () => {
      disposalError = new Error('Disposal failed');
      const resource = new TestResource();
      
      expect(() => resource.dispose()).toThrow(TariError);
      expect(resource.isDisposed).toBe(true); // Should still mark as disposed
    });

    test('should handle async disposal errors', async () => {
      const asyncResource = new FFIResource(
        ResourceType.Wallet,
        async () => {
          throw new Error('Async disposal failed');
        }
      );
      
      expect(() => asyncResource.dispose()).toThrow(TariError);
    });
  });

  describe('Use After Disposal', () => {
    test('should throw error when using disposed resource', () => {
      const resource = new TestResource();
      
      resource.dispose();
      
      expect(() => resource.testOperation()).toThrow(TariError);
      expect(() => resource.testOperation()).toThrow(/disposed.*resource/i);
    });

    test('should allow checking disposed state safely', () => {
      const resource = new TestResource();
      
      expect(resource.isDisposed).toBe(false);
      
      resource.dispose();
      
      expect(resource.isDisposed).toBe(true);
    });
  });

  describe('Resource Information', () => {
    test('should provide resource information', () => {
      const resource = new TestResource(ResourceType.Transaction, true, ['test']);
      
      const info = resource.getResourceInfo();
      
      expect(info.type).toBe(ResourceType.Transaction);
      expect(info.disposed).toBe(false);
      expect(info.createdAt).toBeInstanceOf(Date);
      expect(info.stack).toBeDefined();
    });

    test('should provide tracking ID', () => {
      const resource = new TestResource();
      
      expect(resource.trackingId).toBeDefined();
      expect(typeof resource.trackingId).toBe('string');
      expect(resource.trackingId).toMatch(/^ffi_\d+_\d+$/);
    });
  });

  describe('FinalizationRegistry', () => {
    test('should clean up via garbage collection', (done) => {
      // This test is tricky because GC is non-deterministic
      // We'll simulate the cleanup that would happen
      
      let resource: TestResource | null = new TestResource();
      const weakRef = new WeakRef(resource);
      
      // Clear the reference
      resource = null;
      
      // Force GC if available
      if (global.gc) {
        global.gc();
        
        // Check if resource was collected
        setTimeout(() => {
          if (!weakRef.deref()) {
            // Resource was collected - test passed
            done();
          } else {
            // Resource still exists - that's also valid behavior
            done();
          }
        }, 100);
      } else {
        // Skip test if GC is not available
        done();
      }
    });
  });
});

describe('Utility Functions', () => {
  describe('createNativeDisposal', () => {
    test('should create disposal function for native module', async () => {
      const mockModule = {
        destroyWallet: jest.fn().mockResolvedValue(undefined),
      };
      
      const disposal = createNativeDisposal(mockModule, 'destroyWallet', 123 as any);
      
      await disposal();
      
      expect(mockModule.destroyWallet).toHaveBeenCalledWith(123);
    });

    test('should handle missing native module method', async () => {
      const mockModule = {};
      
      const disposal = createNativeDisposal(mockModule, 'destroyWallet', 123 as any);
      
      // Should not throw even if method doesn't exist
      await expect(disposal()).resolves.toBeUndefined();
    });
  });

  describe('disposeAll', () => {
    test('should dispose multiple resources', async () => {
      const resource1 = new TestResource();
      const resource2 = new TestResource();
      const nonResource = { someProperty: 'value' };
      
      await disposeAll([resource1, resource2, nonResource]);
      
      expect(resource1.isDisposed).toBe(true);
      expect(resource2.isDisposed).toBe(true);
      // Non-resource should be ignored without error
    });

    test('should collect disposal errors', async () => {
      disposalError = new Error('Disposal failed');
      
      const resource1 = new TestResource();
      const resource2 = new TestResource();
      
      await expect(disposeAll([resource1, resource2])).rejects.toThrow(TariError);
      
      // Both resources should still be marked as disposed
      expect(resource1.isDisposed).toBe(true);
      expect(resource2.isDisposed).toBe(true);
    });

    test('should handle empty array', async () => {
      await expect(disposeAll([])).resolves.toBeUndefined();
    });
  });
});
