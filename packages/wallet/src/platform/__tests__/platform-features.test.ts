/**
 * @fileoverview Platform-specific feature tests
 * 
 * Tests platform detection, capability assessment, and platform-specific
 * functionality across macOS, Windows, and Linux environments.
 */

import { PlatformDetector, type PlatformInfo } from '../detector.js';
import { getCapabilitiesManager, type CapabilityAssessment } from '../capabilities.js';
import { StorageFactory } from '../storage/storage-factory.js';

describe('Platform Detection and Capabilities', () => {
  let platform: PlatformInfo;
  let capabilities: CapabilityAssessment;

  beforeAll(async () => {
    platform = PlatformDetector.detect();
    await getCapabilitiesManager().initialize();
    capabilities = getCapabilitiesManager().getCapabilityAssessment();
    
    console.log('Platform Info:', platform);
    console.log('Capabilities:', capabilities);
  });

  describe('Platform Detection', () => {
    test('should correctly identify the current platform', () => {
      expect(platform).toBeDefined();
      expect(platform.os).toBeDefined();
      expect(['darwin', 'win32', 'linux', 'freebsd', 'openbsd'].includes(platform.os)).toBe(true);
      
      expect(platform.arch).toBeDefined();
      expect(['x64', 'arm64', 'ia32', 'arm'].includes(platform.arch)).toBe(true);
      
      expect(typeof platform.isElectron).toBe('boolean');
      expect(typeof platform.isNode).toBe('boolean');
    });

    test('should provide consistent platform information', () => {
      const secondDetection = PlatformDetector.detect();
      expect(secondDetection).toEqual(platform);
    });

    test('should detect container environments', () => {
      // This will vary based on test environment
      expect(typeof platform.isContainer).toBe('boolean');
      
      // In CI/Docker, this might be true
      if (process.env.CI || process.env.DOCKER) {
        console.log('Running in CI/Container environment');
      }
    });
  });

  describe('Capability Assessment', () => {
    test('should assess secure storage capabilities', () => {
      expect(capabilities.secureStorage).toBeDefined();
      expect(typeof capabilities.secureStorage.available).toBe('boolean');
      expect(Array.isArray(capabilities.secureStorage.backends)).toBe(true);
      expect(typeof capabilities.secureStorage.preferredBackend).toBe('string');
    });

    test('should assess file system capabilities', () => {
      expect(capabilities.fileSystem).toBeDefined();
      expect(typeof capabilities.fileSystem.available).toBe('boolean');
      expect(typeof capabilities.fileSystem.writable).toBe('boolean');
      expect(typeof capabilities.fileSystem.persistent).toBe('boolean');
    });

    test('should assess network capabilities', () => {
      expect(capabilities.network).toBeDefined();
      expect(typeof capabilities.network.available).toBe('boolean');
      expect(typeof capabilities.network.httpSupported).toBe('boolean');
      expect(typeof capabilities.network.httpsSupported).toBe('boolean');
    });

    test('should assess cryptographic capabilities', () => {
      expect(capabilities.crypto).toBeDefined();
      expect(typeof capabilities.crypto.available).toBe('boolean');
      expect(typeof capabilities.crypto.hardwareSupported).toBe('boolean');
      expect(Array.isArray(capabilities.crypto.algorithms)).toBe(true);
    });

    test('should identify platform-specific features', () => {
      switch (platform.os) {
        case 'darwin':
          expect(capabilities.secureStorage.backends).toContain('keychain');
          break;
        case 'win32':
          expect(capabilities.secureStorage.backends).toContain('credential-store');
          break;
        case 'linux':
          expect(
            capabilities.secureStorage.backends.includes('secret-service') ||
            capabilities.secureStorage.backends.includes('encrypted-file')
          ).toBe(true);
          break;
      }
    });
  });

  describe('Platform-Specific Storage Features', () => {
    test('macOS Keychain features', async () => {
      if (platform.os !== 'darwin') {
        console.log('Skipping macOS tests on', platform.os);
        return;
      }

      const availableBackends = StorageFactory.getAvailableBackends();
      const keychainBackend = availableBackends.find(b => b.type === 'keychain');
      
      expect(keychainBackend).toBeDefined();
      if (keychainBackend?.available) {
        expect(keychainBackend.securityLevel).toBe('os');
        expect(keychainBackend.limitations).toContain('4KB size limit');
      }
    });

    test('Windows Credential Store features', async () => {
      if (platform.os !== 'win32') {
        console.log('Skipping Windows tests on', platform.os);
        return;
      }

      const availableBackends = StorageFactory.getAvailableBackends();
      const credentialBackend = availableBackends.find(b => b.type === 'credential-store');
      
      expect(credentialBackend).toBeDefined();
      if (credentialBackend?.available) {
        expect(credentialBackend.securityLevel).toBe('os');
        expect(credentialBackend.limitations).toContain('2.5KB size limit');
      }
    });

    test('Linux Secret Service features', async () => {
      if (platform.os !== 'linux') {
        console.log('Skipping Linux tests on', platform.os);
        return;
      }

      const availableBackends = StorageFactory.getAvailableBackends();
      const secretServiceBackend = availableBackends.find(b => b.type === 'secret-service');
      
      // Secret Service might not be available in all Linux environments
      if (secretServiceBackend?.available) {
        expect(secretServiceBackend.securityLevel).toBe('os');
        expect(secretServiceBackend.limitations).toContain('Requires D-Bus');
      }

      // But encrypted file should always be available
      const encryptedFileBackend = availableBackends.find(b => b.type === 'encrypted-file');
      expect(encryptedFileBackend?.available).toBe(true);
    });
  });

  describe('Environment-Specific Tests', () => {
    test('should handle headless environments', async () => {
      const isHeadless = !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
      
      if (isHeadless && platform.os === 'linux') {
        console.log('Testing headless Linux environment');
        
        // In headless environments, certain backends might not be available
        const availableBackends = StorageFactory.getAvailableBackends();
        const secretServiceBackend = availableBackends.find(b => b.type === 'secret-service');
        
        if (!secretServiceBackend?.available) {
          // Should fall back to encrypted file storage
          const encryptedFileBackend = availableBackends.find(b => b.type === 'encrypted-file');
          expect(encryptedFileBackend?.available).toBe(true);
        }
      }
    });

    test('should handle container environments', async () => {
      if (platform.isContainer) {
        console.log('Testing container environment');
        
        // In containers, OS-level secure storage might not be available
        const availableBackends = StorageFactory.getAvailableBackends();
        const osBackends = availableBackends.filter(b => 
          b.securityLevel === 'os' && b.available
        );
        
        // Should have at least encrypted file or memory storage
        const fallbackBackends = availableBackends.filter(b => 
          (b.type === 'encrypted-file' || b.type === 'memory') && b.available
        );
        
        expect(fallbackBackends.length).toBeGreaterThan(0);
      }
    });

    test('should handle CI environments', async () => {
      if (process.env.CI) {
        console.log('Testing CI environment');
        
        // In CI, GUI-based secure storage is typically not available
        const storage = await StorageFactory.create({
          testBackends: true,
          allowFallbacks: true,
        });
        
        // Should create some form of storage
        expect(storage).toBeDefined();
        
        const testResult = await storage.test();
        expect(testResult.success).toBe(true);
      }
    });
  });

  describe('Cross-Platform Compatibility', () => {
    test('should provide consistent API across platforms', async () => {
      const storage = await StorageFactory.create({
        testBackends: true,
        allowFallbacks: true,
      });

      // All platforms should support these basic operations
      const key = 'cross-platform-test';
      const data = Buffer.from('test-data');

      const storeResult = await storage.store(key, data);
      expect(storeResult.success).toBe(true);

      const retrieveResult = await storage.retrieve(key);
      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.data).toEqual(data);

      const existsResult = await storage.exists(key);
      expect(existsResult.success).toBe(true);
      expect(existsResult.data).toBe(true);

      const removeResult = await storage.remove(key);
      expect(removeResult.success).toBe(true);

      const existsAfterRemove = await storage.exists(key);
      expect(existsAfterRemove.success).toBe(true);
      expect(existsAfterRemove.data).toBe(false);
    });

    test('should handle platform-specific data size limits', async () => {
      const storage = await StorageFactory.create({
        testBackends: false, // Don't test, use what's available
        allowFallbacks: true,
      });

      const info = await storage.getInfo();
      console.log('Storage info:', info);

      // Test with different data sizes
      const sizes = [1024, 4096, 8192, 16384]; // 1KB, 4KB, 8KB, 16KB
      
      for (const size of sizes) {
        const key = `size-test-${size}`;
        const data = Buffer.alloc(size, 'x');
        
        const result = await storage.store(key, data);
        if (result.success) {
          // If storage succeeded, retrieval should work
          const retrieveResult = await storage.retrieve(key);
          expect(retrieveResult.success).toBe(true);
          expect(retrieveResult.data).toEqual(data);
          
          await storage.remove(key);
        } else {
          // If storage failed, it might be due to size limits
          console.log(`Storage failed for ${size} bytes: ${result.error}`);
        }
      }
    });
  });

  describe('Feature Detection', () => {
    test('should detect hardware security features', () => {
      // This is platform and hardware dependent
      if (platform.os === 'darwin') {
        // macOS might have Secure Enclave
        console.log('macOS hardware security features available');
      } else if (platform.os === 'win32') {
        // Windows might have TPM
        console.log('Windows hardware security features available');
      } else if (platform.os === 'linux') {
        // Linux might have various hardware security modules
        console.log('Linux hardware security features available');
      }
      
      expect(typeof capabilities.crypto.hardwareSupported).toBe('boolean');
    });

    test('should detect available encryption algorithms', () => {
      expect(Array.isArray(capabilities.crypto.algorithms)).toBe(true);
      expect(capabilities.crypto.algorithms.length).toBeGreaterThan(0);
      
      // Common algorithms that should be available
      const commonAlgorithms = ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'];
      const availableAlgorithms = capabilities.crypto.algorithms;
      
      const supportedCommon = commonAlgorithms.filter(alg => 
        availableAlgorithms.includes(alg)
      );
      
      expect(supportedCommon.length).toBeGreaterThan(0);
    });
  });

  describe('Platform Integration Points', () => {
    test('should integrate with platform notification systems', () => {
      // This would test notification capabilities
      // For now, just verify the structure exists
      expect(capabilities).toHaveProperty('notifications');
    });

    test('should integrate with platform file associations', () => {
      // This would test file association capabilities
      expect(capabilities).toHaveProperty('fileSystem');
      expect(capabilities.fileSystem).toHaveProperty('available');
    });

    test('should integrate with platform security frameworks', () => {
      // This verifies platform-specific security integration
      expect(capabilities.secureStorage.backends.length).toBeGreaterThan(0);
      
      const hasOSIntegration = capabilities.secureStorage.backends.some(backend =>
        ['keychain', 'credential-store', 'secret-service'].includes(backend)
      );
      
      const hasFallback = capabilities.secureStorage.backends.some(backend =>
        ['encrypted-file', 'memory'].includes(backend)
      );
      
      // Should have either OS integration or fallback (or both)
      expect(hasOSIntegration || hasFallback).toBe(true);
    });
  });
});

/**
 * Performance benchmarking across platforms
 */
describe('Cross-Platform Performance', () => {
  test('should benchmark storage operations across backends', async () => {
    const backends = StorageFactory.getAvailableBackends().filter(b => b.available);
    const results: Record<string, { store: number; retrieve: number; remove: number }> = {};
    
    for (const backendInfo of backends) {
      try {
        const storage = await StorageFactory.create({
          forceBackend: backendInfo.type,
          testBackends: true,
        });
        
        const key = `benchmark-${backendInfo.type}`;
        const data = Buffer.alloc(1024, 'x'); // 1KB test data
        
        // Benchmark store
        const storeStart = performance.now();
        await storage.store(key, data);
        const storeTime = performance.now() - storeStart;
        
        // Benchmark retrieve
        const retrieveStart = performance.now();
        await storage.retrieve(key);
        const retrieveTime = performance.now() - retrieveStart;
        
        // Benchmark remove
        const removeStart = performance.now();
        await storage.remove(key);
        const removeTime = performance.now() - removeStart;
        
        results[backendInfo.type] = {
          store: storeTime,
          retrieve: retrieveTime,
          remove: removeTime,
        };
        
      } catch (error) {
        console.warn(`Benchmark failed for ${backendInfo.type}:`, error);
      }
    }
    
    console.log('Performance benchmarks:', results);
    
    // Verify that at least one backend was benchmarked
    expect(Object.keys(results).length).toBeGreaterThan(0);
  });
});
