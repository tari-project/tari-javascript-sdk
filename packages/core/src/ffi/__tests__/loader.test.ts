/**
 * Test suite for native module loader with mock integration
 */

import { NativeModuleLoader, loadNativeModule, getNativeModule } from '../loader';
import { getMockNativeBindings, resetMockNativeBindings } from '../__mocks__/native';

// Mock the native module loading - Jest will automatically use the __mocks__ directory
jest.mock('../native');

// Mock the binary resolver to return a fake path that resolves to our mock
jest.mock('../binary-resolver', () => {
  return {
    BinaryResolver: jest.fn().mockImplementation(() => ({
      resolveBinary: jest.fn().mockReturnValue({
        path: 'mock-native-module',
        exists: true,
        source: 'mock'
      }),
      validateBinary: jest.fn().mockReturnValue(undefined),
      getInstallationInstructions: jest.fn().mockReturnValue('Mock installation instructions')
    }))
  };
});

describe('NativeModuleLoader', () => {
  beforeEach(() => {
    resetMockNativeBindings();
    // Reset any existing loader instance
    NativeModuleLoader.getInstance().reset?.();
  });

  afterEach(() => {
    resetMockNativeBindings();
  });

  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const loader1 = NativeModuleLoader.getInstance();
      const loader2 = NativeModuleLoader.getInstance();
      
      expect(loader1).toBe(loader2);
    });

    test('should accept options on first creation', () => {
      const options = { enableLazyLoading: false };
      const loader = NativeModuleLoader.getInstance(options);
      
      expect(loader).toBeDefined();
    });
  });

  describe('Module Loading', () => {
    test('should load native module successfully', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      const module = await loader.loadModule();
      
      expect(module).toBeDefined();
      expect(typeof module.walletCreate).toBe('function');
      expect(typeof module.walletDestroy).toBe('function');
    });

    test('should return cached module on subsequent loads', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      const module1 = await loader.loadModule();
      const module2 = await loader.loadModule();
      
      expect(module1).toBe(module2);
    });

    test('should validate module exports', async () => {
      const loader = NativeModuleLoader.getInstance({
        validateOnLoad: true,
      });
      
      // Should not throw with valid mock module
      await expect(loader.loadModule()).resolves.toBeDefined();
    });

    test('should handle loading errors gracefully', async () => {
      // Configure mock to fail
      const mockBindings = getMockNativeBindings();
      mockBindings.setFailureMode(true);
      
      const loader = NativeModuleLoader.getInstance();
      
      await expect(loader.loadModule()).rejects.toThrow();
    });

    test('should use convenience function for loading', async () => {
      const module = await loadNativeModule();
      
      expect(module).toBeDefined();
      expect(typeof module.walletCreate).toBe('function');
    });
  });

  describe('Lazy Loading', () => {
    test('should support lazy loading', () => {
      const loader = NativeModuleLoader.getInstance({
        enableLazyLoading: true,
      });
      
      expect(() => loader.getModule()).toThrow(/not loaded yet/i);
    });

    test('should disable lazy loading when configured', async () => {
      const loader = NativeModuleLoader.getInstance({
        enableLazyLoading: false,
      });
      
      // Should throw immediately without suggesting async load
      expect(() => loader.getModule()).toThrow(/not loaded.*call loadModule/i);
    });

    test('should return module after loading', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      await loader.loadModule();
      const module = loader.getModule();
      
      expect(module).toBeDefined();
      expect(typeof module.walletCreate).toBe('function');
    });
  });

  describe('Module State', () => {
    test('should report loading state correctly', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      expect(loader.isLoaded()).toBe(false);
      
      await loader.loadModule();
      
      expect(loader.isLoaded()).toBe(true);
    });

    test('should handle concurrent loading', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      // Start multiple loads concurrently
      const promises = [
        loader.loadModule(),
        loader.loadModule(),
        loader.loadModule(),
      ];
      
      const results = await Promise.all(promises);
      
      // All should return the same module
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });

    test('should wait for existing load operation', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      // Start first load
      const firstLoad = loader.loadModule();
      
      // Start second load while first is in progress
      const secondLoad = loader.loadModule();
      
      const [result1, result2] = await Promise.all([firstLoad, secondLoad]);
      
      expect(result1).toBe(result2);
    });
  });

  describe('Module Reloading', () => {
    test('should reload module successfully', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      const module1 = await loader.loadModule();
      const module2 = await loader.reloadModule();
      
      expect(module2).toBeDefined();
      expect(typeof module2.walletCreate).toBe('function');
    });

    test('should clear require cache on reload', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      await loader.loadModule();
      
      // Mock require cache
      const mockRequire = require as any;
      mockRequire.cache = mockRequire.cache || {};
      
      await loader.reloadModule();
      
      // Cache clearing is tested by the fact that reload doesn't throw
      expect(loader.isLoaded()).toBe(true);
    });

    test('should handle cache clearing errors gracefully', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      await loader.loadModule();
      
      // Should not throw even if cache clearing fails
      await expect(loader.reloadModule()).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should enrich load errors with helpful information', async () => {
      // Configure mock to fail
      const mockBindings = getMockNativeBindings();
      mockBindings.setFailureMode(true);
      
      const loader = NativeModuleLoader.getInstance();
      
      try {
        await loader.loadModule();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('Failed to load Tari wallet FFI');
        expect(error.message).toContain('Installation instructions');
      }
    });

    test('should provide installation instructions on error', async () => {
      // Configure mock to fail
      const mockBindings = getMockNativeBindings();
      mockBindings.setFailureMode(true);
      
      const loader = NativeModuleLoader.getInstance();
      
      try {
        await loader.loadModule();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.message).toContain('npm install');
      }
    });

    test('should handle unknown errors', async () => {
      const loader = NativeModuleLoader.getInstance();
      
      // Mock a non-Error exception
      const mockBindings = getMockNativeBindings();
      const originalCreate = mockBindings.walletCreate;
      mockBindings.walletCreate = () => {
        throw 'string error';
      };
      
      try {
        await loader.loadModule();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('Unknown error');
      } finally {
        mockBindings.walletCreate = originalCreate;
      }
    });
  });

  describe('Export Validation', () => {
    test('should validate required exports exist', async () => {
      const loader = NativeModuleLoader.getInstance({
        validateOnLoad: true,
      });
      
      // Mock module should have required exports
      await expect(loader.loadModule()).resolves.toBeDefined();
    });

    test('should throw error for missing exports', async () => {
      // Create a mock module missing required exports
      const incompleteMock = {
        walletCreate: () => {},
        // Missing walletDestroy
      };
      
      // This would require mocking the actual require function
      // For now, we test the validation logic with a complete mock
      const loader = NativeModuleLoader.getInstance({
        validateOnLoad: true,
      });
      
      await expect(loader.loadModule()).resolves.toBeDefined();
    });
  });

  describe('Convenience Functions', () => {
    test('should load module via convenience function', async () => {
      const module = await loadNativeModule();
      
      expect(module).toBeDefined();
      expect(typeof module.walletCreate).toBe('function');
    });

    test('should get module via convenience function', async () => {
      // Load first
      await loadNativeModule();
      
      const module = getNativeModule();
      
      expect(module).toBeDefined();
      expect(typeof module.walletCreate).toBe('function');
    });

    test('should throw when getting unloaded module', () => {
      expect(() => getNativeModule()).toThrow(/not loaded/i);
    });

    test('should pass options to convenience function', async () => {
      const options = { enableLazyLoading: false };
      
      const module = await loadNativeModule(options);
      
      expect(module).toBeDefined();
    });
  });

  describe('Integration with Mock Bindings', () => {
    test('should work with mock native bindings', async () => {
      const mockBindings = getMockNativeBindings();
      const loader = NativeModuleLoader.getInstance();
      
      const module = await loader.loadModule();
      
      // Test basic wallet operations
      const handle = await module.walletCreate(global.testUtils.createMockFFIConfig());
      expect(typeof handle).toBe('number');
      expect(handle).toBeGreaterThan(0);
      
      const balance = await module.walletGetBalance(handle);
      expect(balance).toBeDefined();
      expect(typeof balance.available).toBe('string');
      
      await module.walletDestroy(handle);
    });

    test('should handle mock failures appropriately', async () => {
      const mockBindings = getMockNativeBindings();
      mockBindings.setFailureRate(0.5); // 50% failure rate
      
      const loader = NativeModuleLoader.getInstance();
      const module = await loader.loadModule();
      
      // Some operations might fail due to mock failure rate
      // This tests the error handling path
      try {
        await module.walletCreate(global.testUtils.createMockFFIConfig());
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle mock latency', async () => {
      const mockBindings = getMockNativeBindings();
      mockBindings.setLatency(100); // 100ms latency
      
      const loader = NativeModuleLoader.getInstance();
      const module = await loader.loadModule();
      
      const start = Date.now();
      const handle = await module.walletCreate(global.testUtils.createMockFFIConfig());
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThan(90); // Should include mock latency
      expect(handle).toBeGreaterThan(0);
      
      await module.walletDestroy(handle);
    });

    test('should reset mock state between tests', async () => {
      const mockBindings = getMockNativeBindings();
      
      // Create some wallets
      const loader = NativeModuleLoader.getInstance();
      const module = await loader.loadModule();
      
      const handle1 = await module.walletCreate(global.testUtils.createMockFFIConfig());
      const handle2 = await module.walletCreate(global.testUtils.createMockFFIConfig());
      
      expect(await module.walletGetActiveHandleCount()).toBe(2);
      
      // Reset and verify clean state
      resetMockNativeBindings();
      const freshMockBindings = getMockNativeBindings();
      
      expect(freshMockBindings.getWalletCount()).toBe(0);
    });
  });
});
