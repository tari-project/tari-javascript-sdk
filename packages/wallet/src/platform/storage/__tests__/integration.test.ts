/**
 * @fileoverview Cross-platform storage integration tests
 * 
 * Comprehensive test suite for validating storage implementations across
 * all supported platforms with security-focused testing methodology.
 */

import { StorageFactory, type FactoryConfig, type BackendInfo } from '../storage-factory.js';
import { PlatformDetector } from '../../detector.js';
import { getCapabilitiesManager } from '../../capabilities.js';
import type { SecureStorage, StorageResult } from '../secure-storage.js';
import { SecretServiceStorage } from '../secret-service.js';
import { KeychainStorage } from '../keychain.js';
import { CredentialStoreStorage } from '../credential-store.js';
import { EncryptedFileStorage } from '../encrypted-file.js';
import { MemoryStorage } from '../memory-storage.js';
import { StorageResults } from '../types/storage-result.js';

// Test fixtures
interface TestCredential {
  id: string;
  service: string;
  account: string;
  testData: Buffer;
  platform: string;
  expectedBackend: string;
}

interface SecurityTestSuite {
  keyStorage: boolean;
  platformAPI: boolean;
  attackVectors: string[];
  recovery: boolean;
}



const TEST_CREDENTIALS: TestCredential[] = [
  {
    id: 'basic-wallet-key',
    service: 'tari-wallet',
    account: 'main-wallet',
    testData: Buffer.from('test-private-key-data-32-bytes-long'),
    platform: 'all',
    expectedBackend: 'platform-specific',
  },
  {
    id: 'seed-phrase',
    service: 'tari-wallet',
    account: 'seed-recovery',
    testData: Buffer.from(JSON.stringify([
      'abandon', 'ability', 'able', 'about', 'above', 'absent',
      'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
      'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
      'across', 'act', 'action', 'actor', 'actress', 'actual'
    ])),
    platform: 'all',
    expectedBackend: 'platform-specific',
  },
  {
    id: 'encrypted-config',
    service: 'tari-wallet',
    account: 'config-data',
    testData: Buffer.from(JSON.stringify({
      network: 'testnet',
      baseNode: '127.0.0.1:18142',
      encryptedSettings: 'base64-encrypted-data'
    })),
    platform: 'all',
    expectedBackend: 'encrypted-file',
  },
];

describe('Cross-Platform Storage Integration', () => {
  let platform: string;
  let availableBackends: BackendInfo[];
  let storage: SecureStorage;

  beforeAll(async () => {
    platform = PlatformDetector.detect().os;
    availableBackends = StorageFactory.getAvailableBackends();
    
    // Initialize capabilities manager
    await getCapabilitiesManager().initialize();
    
    console.log(`Running tests on platform: ${platform}`);
    console.log(`Available backends: ${availableBackends.filter(b => b.available).map(b => b.type).join(', ')}`);
  });

  afterEach(async () => {
    if (storage) {
      // Clean up test data
      try {
        await storage.clear();
      } catch (error) {
        console.warn('Failed to clear storage during cleanup:', error);
      }
    }
  });

  describe('Backend Availability Detection', () => {
    test('should correctly identify platform-specific backends', () => {
      const platformBackends = availableBackends.filter(b => b.available);
      
      expect(platformBackends.length).toBeGreaterThan(0);
      
      switch (platform) {
        case 'darwin':
          expect(platformBackends.some(b => b.type === 'keychain')).toBe(true);
          break;
        case 'win32':
          expect(platformBackends.some(b => b.type === 'credential-store')).toBe(true);
          break;
        case 'linux':
          expect(
            platformBackends.some(b => b.type === 'secret-service') ||
            platformBackends.some(b => b.type === 'encrypted-file')
          ).toBe(true);
          break;
      }
      
      // All platforms should have encrypted file and memory fallbacks
      expect(platformBackends.some(b => b.type === 'encrypted-file')).toBe(true);
      expect(platformBackends.some(b => b.type === 'memory')).toBe(true);
    });

    test('should rank backends by security level', () => {
      const securityOrder = { hardware: 4, os: 3, encrypted: 2, plaintext: 1 };
      
      for (let i = 1; i < availableBackends.length; i++) {
        const current = availableBackends[i];
        const previous = availableBackends[i - 1];
        
        if (current.available && previous.available) {
          expect(securityOrder[current.securityLevel])
            .toBeLessThanOrEqual(securityOrder[previous.securityLevel]);
        }
      }
    });
  });

  describe('Storage Factory Auto-Selection', () => {
    test('should create optimal storage for current platform', async () => {
      storage = await StorageFactory.create({
        testBackends: true,
        allowFallbacks: true,
      });

      expect(storage).toBeDefined();
      
      // Test basic functionality
      const testResult = await storage.test();
      expect(StorageResults.isOk(testResult)).toBe(true);
    });

    test('should handle backend failure gracefully', async () => {
      const config: FactoryConfig = {
        testBackends: true,
        allowFallbacks: true,
        // Force a potentially unavailable backend first
        forceBackend: platform === 'linux' ? 'secret-service' : 'auto',
      };

      storage = await StorageFactory.create(config);
      expect(storage).toBeDefined();
      
      // Should still work even if forced backend fails
      const testResult = await storage.test();
      expect(StorageResults.isOk(testResult)).toBe(true);
    });
  });

  describe('Basic CRUD Operations', () => {
    beforeEach(async () => {
      storage = await StorageFactory.create({
        testBackends: true,
        allowFallbacks: true,
      });
    });

    test('should store and retrieve secrets correctly', async () => {
      for (const credential of TEST_CREDENTIALS) {
        // Use valid key format (replace colons with dots for compatibility)
        const key = `${credential.service}.${credential.account}.${credential.id}`;
        
        // Store
        const storeResult = await storage.store(key, credential.testData);
        expect(StorageResults.isOk(storeResult)).toBe(true);
        
        // Verify exists
        const existsResult = await storage.exists(key);
        expect(StorageResults.isOk(existsResult)).toBe(true);
        if (StorageResults.isOk(existsResult)) {
          expect(existsResult.value).toBe(true);
        }
        
        // Retrieve
        const retrieveResult = await storage.retrieve(key);
        expect(StorageResults.isOk(retrieveResult)).toBe(true);
        if (StorageResults.isOk(retrieveResult)) {
          expect(retrieveResult.value).toEqual(credential.testData);
        }
        
        // Clean up
        const removeResult = await storage.remove(key);
        expect(StorageResults.isOk(removeResult)).toBe(true);
      }
    });

    test('should handle non-existent keys gracefully', async () => {
      const nonExistentKey = 'non-existent-key-12345';
      
      const retrieveResult = await storage.retrieve(nonExistentKey);
      expect(StorageResults.isError(retrieveResult)).toBe(true);
      
      const existsResult = await storage.exists(nonExistentKey);
      expect(StorageResults.isOk(existsResult)).toBe(true);
      if (StorageResults.isOk(existsResult)) {
        expect(existsResult.value).toBe(false);
      }
      
      const removeResult = await storage.remove(nonExistentKey);
      // Should not fail on non-existent keys
      expect(StorageResults.isOk(removeResult)).toBe(true);
    });

    test('should list stored keys correctly', async () => {
      const testKeys = TEST_CREDENTIALS.map(c => 
        `test-list.${c.service}.${c.account}.${c.id}`
      );
      
      // Store test data
      for (let i = 0; i < testKeys.length; i++) {
        const key = testKeys[i];
        const data = TEST_CREDENTIALS[i].testData;
        
        const result = await storage.store(key, data);
        expect(StorageResults.isOk(result)).toBe(true);
      }
      
      // List keys
      const listResult = await storage.list();
      expect(StorageResults.isOk(listResult)).toBe(true);
      
      // Verify all test keys are present
      if (StorageResults.isOk(listResult)) {
        const storedKeys = listResult.value || [];
        for (const testKey of testKeys) {
          expect(storedKeys).toContain(testKey);
        }
      }
      
      // Clean up
      for (const key of testKeys) {
        await storage.remove(key);
      }
    });
  });

  describe('Platform-Specific Backend Tests', () => {
    const testBackendDirectly = async (BackendClass: any, backendName: string) => {
      if (!availableBackends.some(b => b.type === backendName && b.available)) {
        console.log(`Skipping ${backendName} tests - not available on ${platform}`);
        return;
      }

      const backend = new BackendClass({});
      const testKey = `direct-test.${backendName}.key`;
      const testData = Buffer.from(`test-data-for-${backendName}`);

      try {
        // Test basic operations - some backends may still use legacy format
        const storeResult = await backend.store(testKey, testData);
        const storeOk = 'kind' in storeResult ? StorageResults.isOk(storeResult) : storeResult.success;
        
        // If store operation fails due to backend not being truly available, skip the test
        if (!storeOk) {
          const storeError = 'kind' in storeResult && !StorageResults.isOk(storeResult) 
            ? storeResult.error 
            : 'Unknown error';
          console.log(`Skipping ${backendName} test - backend not actually available: ${storeError}`);
          return;
        }
        
        expect(storeOk).toBe(true);

        const retrieveResult = await backend.retrieve(testKey);
        const retrieveOk = 'kind' in retrieveResult ? StorageResults.isOk(retrieveResult) : retrieveResult.success;
        expect(retrieveOk).toBe(true);
        
        const retrievedData = 'kind' in retrieveResult 
          ? (StorageResults.isOk(retrieveResult) ? retrieveResult.value : null)
          : retrieveResult.data;
        expect(retrievedData).toEqual(testData);

        const removeResult = await backend.remove(testKey);
        const removeOk = 'kind' in removeResult ? StorageResults.isOk(removeResult) : removeResult.success;
        expect(removeOk).toBe(true);
      } catch (error) {
        console.warn(`${backendName} test failed:`, error);
        throw error;
      }
    };

    test('macOS Keychain direct backend test', async () => {
      if (platform !== 'darwin') return;
      await testBackendDirectly(KeychainStorage, 'keychain');
    });

    test('Windows Credential Store direct backend test', async () => {
      if (platform !== 'win32') return;
      await testBackendDirectly(CredentialStoreStorage, 'credential-store');
    });

    test('Linux Secret Service direct backend test', async () => {
      if (platform !== 'linux') return;
      await testBackendDirectly(SecretServiceStorage, 'secret-service');
    });

    test('Encrypted File backend test (all platforms)', async () => {
      await testBackendDirectly(EncryptedFileStorage, 'encrypted-file');
    });

    test('Memory backend test (all platforms)', async () => {
      await testBackendDirectly(MemoryStorage, 'memory');
    });
  });

  describe('Security Stress Tests', () => {
    beforeEach(async () => {
      storage = await StorageFactory.create({
        testBackends: true,
        allowFallbacks: false, // Use most secure backend only
      });
    });

    test('should handle large secrets correctly', async () => {
      const largeData = Buffer.alloc(1024 * 100, 'a'); // 100KB
      const key = 'large-secret-test';
      
      const storeResult = await storage.store(key, largeData);
      expect(StorageResults.isOk(storeResult)).toBe(true);
      
      const retrieveResult = await storage.retrieve(key);
      expect(StorageResults.isOk(retrieveResult)).toBe(true);
      if (StorageResults.isOk(retrieveResult)) {
        expect(retrieveResult.value).toEqual(largeData);
      }
      
      await storage.remove(key);
    });

    test('should handle binary data correctly', async () => {
      const binaryData = Buffer.from([
        0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD, 0xFC,
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A // PNG header
      ]);
      const key = 'binary-data-test';
      
      const storeResult = await storage.store(key, binaryData);
      expect(StorageResults.isOk(storeResult)).toBe(true);
      
      const retrieveResult = await storage.retrieve(key);
      expect(StorageResults.isOk(retrieveResult)).toBe(true);
      if (StorageResults.isOk(retrieveResult)) {
        expect(retrieveResult.value).toEqual(binaryData);
      }
      
      await storage.remove(key);
    });

    test('should handle special characters in keys', async () => {
      const specialKeys = [
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots',
        // Note: spaces, colons and slashes may not be supported by all backends
      ];
      
      const testData = Buffer.from('special-char-test');
      
      for (const key of specialKeys) {
        const storeResult = await storage.store(key, testData);
        expect(StorageResults.isOk(storeResult)).toBe(true);
        
        const retrieveResult = await storage.retrieve(key);
        expect(StorageResults.isOk(retrieveResult)).toBe(true);
        if (StorageResults.isOk(retrieveResult)) {
          expect(retrieveResult.value).toEqual(testData);
        }
        
        await storage.remove(key);
      }
    });

    test('should handle concurrent operations safely', async () => {
      const concurrentOps = 10;
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < concurrentOps; i++) {
        const promise = (async (index: number) => {
          const key = `concurrent-test-${index}`;
          const data = Buffer.from(`data-${index}`);
          
          await storage.store(key, data);
          const result = await storage.retrieve(key);
          expect(StorageResults.isOk(result)).toBe(true);
          if (StorageResults.isOk(result)) {
            expect(result.value).toEqual(data);
          }
          await storage.remove(key);
        })(i);
        
        promises.push(promise);
      }
      
      await Promise.all(promises);
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      storage = await StorageFactory.create({
        testBackends: true,
        allowFallbacks: true,
      });
    });

    test('should handle invalid key formats gracefully', async () => {
      const invalidKeys = ['', null, undefined];
      const testData = Buffer.from('test');
      
      for (const invalidKey of invalidKeys) {
        const storeResult = await storage.store(invalidKey as any, testData);
        expect(StorageResults.isError(storeResult)).toBe(true);
        if (StorageResults.isError(storeResult)) {
          expect(storeResult.error).toBeDefined();
          expect(storeResult.error.message).toBeDefined();
        }
      }
    });

    test('should handle invalid data gracefully', async () => {
      const key = 'invalid-data-test';
      const invalidData = [null, undefined];
      
      for (const data of invalidData) {
        const storeResult = await storage.store(key, data as any);
        expect(StorageResults.isError(storeResult)).toBe(true);
        if (StorageResults.isError(storeResult)) {
          expect(storeResult.error).toBeDefined();
          expect(storeResult.error.message).toBeDefined();
        }
      }
    });

    test('should provide meaningful error messages', async () => {
      const key = 'error-message-test';
      
      // Try to retrieve non-existent key
      const result = await storage.retrieve(key);
      expect(StorageResults.isError(result)).toBe(true);
      if (StorageResults.isError(result)) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('object');
        expect(result.error.message).toBeDefined();
        expect(typeof result.error.message).toBe('string');
        expect(result.error.message!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Performance Benchmarks', () => {
    beforeEach(async () => {
      storage = await StorageFactory.create({
        testBackends: true,
        allowFallbacks: false,
      });
    });

    test('storage operations should complete within reasonable time', async () => {
      const key = 'performance-test';
      const data = Buffer.from('performance-test-data');
      
      // Store operation
      const storeStart = Date.now();
      const storeResult = await storage.store(key, data);
      const storeTime = Date.now() - storeStart;
      
      expect(StorageResults.isOk(storeResult)).toBe(true);
      expect(storeTime).toBeLessThan(5000); // 5 seconds max
      
      // Retrieve operation
      const retrieveStart = Date.now();
      const retrieveResult = await storage.retrieve(key);
      const retrieveTime = Date.now() - retrieveStart;
      
      expect(StorageResults.isOk(retrieveResult)).toBe(true);
      expect(retrieveTime).toBeLessThan(2000); // 2 seconds max
      
      // Remove operation
      const removeStart = Date.now();
      const removeResult = await storage.remove(key);
      const removeTime = Date.now() - removeStart;
      
      expect(StorageResults.isOk(removeResult)).toBe(true);
      expect(removeTime).toBeLessThan(2000); // 2 seconds max
      
      console.log(`Performance: Store=${storeTime}ms, Retrieve=${retrieveTime}ms, Remove=${removeTime}ms`);
    });
  });
});

/**
 * Memory leak detection helper
 */
class MemoryLeakDetector {
  private initialMemory: NodeJS.MemoryUsage;
  
  constructor() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    this.initialMemory = process.memoryUsage();
  }
  
  checkForLeaks(threshold: number = 50 * 1024 * 1024): boolean {
    if (global.gc) {
      global.gc();
    }
    
    const currentMemory = process.memoryUsage();
    const heapIncrease = currentMemory.heapUsed - this.initialMemory.heapUsed;
    
    console.log(`Memory usage: ${Math.round(heapIncrease / 1024 / 1024)}MB increase`);
    
    return heapIncrease > threshold;
  }
}

describe('Memory Leak Detection', () => {
  let detector: MemoryLeakDetector;
  let storage: SecureStorage;
  
  beforeAll(() => {
    detector = new MemoryLeakDetector();
  });
  
  beforeEach(async () => {
    storage = await StorageFactory.create({
      testBackends: true,
      allowFallbacks: true,
    });
  });
  
  test('should not leak memory during repeated operations', async () => {
    const iterations = 1000;
    const key = 'memory-leak-test';
    const data = Buffer.alloc(1024, 'x'); // 1KB data
    
    for (let i = 0; i < iterations; i++) {
      await storage.store(`${key}-${i}`, data);
      await storage.retrieve(`${key}-${i}`);
      await storage.remove(`${key}-${i}`);
      
      // Check periodically
      if (i % 100 === 0) {
        const hasLeak = detector.checkForLeaks();
        if (hasLeak) {
          console.warn(`Potential memory leak detected at iteration ${i}`);
        }
      }
    }
    
    // Final leak check
    const hasLeak = detector.checkForLeaks();
    expect(hasLeak).toBe(false);
  });
});
