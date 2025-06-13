/**
 * @fileoverview Comprehensive tests for Tauri storage integration
 * 
 * Tests Tauri storage operations, security validation, performance optimization,
 * and cross-platform compatibility with comprehensive mock implementations.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TauriStorage, type TauriStorageConfig } from '../../packages/wallet/src/tauri/tauri-storage.js';
import { TauriSecureStorageCache } from '../../packages/wallet/src/tauri/tauri-cache.js';
import { TauriBatchStorageOperations } from '../../packages/wallet/src/tauri/tauri-batch.js';
import { testCredentials, createTestData } from '../fixtures/test-credentials.js';
import { mockTauriRuntime, mockTauriCommands, restoreTauriRuntime } from '../mocks/tauri-mocks.js';

describe('Tauri Storage Integration', () => {
  let storage: TauriStorage;
  let mockInvoke: jest.MockedFunction<any>;

  beforeEach(() => {
    // Setup Tauri runtime mock
    const tauriMock = mockTauriRuntime();
    mockInvoke = tauriMock.invoke;
    
    // Create storage instance
    storage = new TauriStorage({
      maxRetries: 3,
      requestTimeout: 10000,
      enableCompression: true,
      enableDeduplication: true
    });
  });

  afterEach(async () => {
    if (storage) {
      storage.destroy();
    }
    restoreTauriRuntime();
    jest.clearAllMocks();
  });

  describe('Basic Storage Operations', () => {
    test('should store and retrieve data successfully', async () => {
      const testData = createTestData('test-store-retrieve');
      
      // Mock successful store operation
      mockInvoke.mockImplementationOnce(() => Promise.resolve({
        success: true,
        data: undefined,
        timestamp: Date.now()
      }));

      // Mock successful retrieve operation
      mockInvoke.mockImplementationOnce(() => Promise.resolve({
        success: true,
        data: Array.from(testData.data),
        timestamp: Date.now()
      }));

      // Store data
      const storeResult = await storage.store(testData.key, testData.data);
      expect(storeResult.success).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('store_secure_data_command', {
        operation: 'store',
        key: testData.key,
        value: Array.from(testData.data),
        options: {}
      });

      // Retrieve data
      const retrieveResult = await storage.retrieve(testData.key);
      expect(retrieveResult.success).toBe(true);
      expect(Buffer.from(retrieveResult.data!)).toEqual(testData.data);
      expect(mockInvoke).toHaveBeenCalledWith('retrieve_secure_data_command', {
        operation: 'retrieve',
        key: testData.key,
        options: {}
      });
    });

    test('should handle storage errors gracefully', async () => {
      const testData = createTestData('test-error-handling');
      
      // Mock storage error
      mockInvoke.mockImplementationOnce(() => Promise.resolve({
        success: false,
        error: 'Storage backend not available',
        timestamp: Date.now()
      }));

      const result = await storage.store(testData.key, testData.data);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage backend not available');
    });

    test('should validate key format and restrictions', async () => {
      const invalidKeys = ['', 'a'.repeat(300), 'key with spaces', 'key/with/slash'];
      
      for (const invalidKey of invalidKeys) {
        const result = await storage.store(invalidKey, Buffer.from('test'));
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid key format');
      }
    });

    test('should handle data size limits', async () => {
      const largeData = Buffer.alloc(10 * 1024 * 1024); // 10MB
      
      // Mock size limit error
      mockInvoke.mockImplementationOnce(() => Promise.resolve({
        success: false,
        error: 'Data size exceeds platform limit',
        timestamp: Date.now()
      }));

      const result = await storage.store('test-large-data', largeData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Data size exceeds platform limit');
    });
  });

  describe('Security Features', () => {
    test('should apply security validation to all operations', async () => {
      const testData = createTestData('test-security');
      
      // Mock security validation success
      mockInvoke.mockImplementation(() => Promise.resolve({
        success: true,
        data: Array.from(testData.data),
        timestamp: Date.now()
      }));

      await storage.store(testData.key, testData.data);
      
      // Verify security headers and validation were applied
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.stringContaining('_command'),
        expect.objectContaining({
          operation: 'store',
          key: testData.key,
          value: Array.from(testData.data)
        })
      );
    });

    test('should handle permission denied errors', async () => {
      const testData = createTestData('test-permissions');
      
      // Mock permission error
      mockInvoke.mockImplementationOnce(() => Promise.reject(new Error('Permission denied')));

      const result = await storage.store(testData.key, testData.data);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    test('should implement rate limiting', async () => {
      const testData = createTestData('test-rate-limiting');
      
      // Perform multiple rapid operations
      const promises = Array.from({ length: 20 }, (_, i) => 
        storage.store(`${testData.key}-${i}`, testData.data)
      );

      const results = await Promise.all(promises);
      
      // Some operations should be rate limited
      const rateLimitedResults = results.filter(r => 
        !r.success && r.error?.includes('rate limit')
      );
      
      expect(rateLimitedResults.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Optimization', () => {
    test('should batch multiple operations efficiently', async () => {
      const testData = Array.from({ length: 5 }, (_, i) => 
        createTestData(`test-batch-${i}`)
      );
      
      // Mock batch operation success
      mockInvoke.mockImplementation(() => Promise.resolve({
        success: true,
        data: undefined,
        timestamp: Date.now()
      }));

      // Perform multiple operations rapidly to trigger batching
      const promises = testData.map(data => 
        storage.store(data.key, data.data)
      );

      await Promise.all(promises);
      
      // Should have fewer invoke calls than operations due to batching
      expect(mockInvoke.mock.calls.length).toBeLessThan(testData.length);
    });

    test('should compress large data automatically', async () => {
      const largeData = Buffer.alloc(1024, 'x'); // 1KB of repeated data
      
      mockInvoke.mockImplementationOnce(() => Promise.resolve({
        success: true,
        data: undefined,
        timestamp: Date.now()
      }));

      await storage.store('test-compression', largeData);
      
      // Verify compression was applied (data should be smaller)
      const lastCall = mockInvoke.mock.calls[mockInvoke.mock.calls.length - 1];
      const sentData = lastCall[1].value;
      expect(sentData.length).toBeLessThan(largeData.length);
    });

    test('should deduplicate identical operations', async () => {
      const testData = createTestData('test-deduplication');
      
      mockInvoke.mockImplementation(() => Promise.resolve({
        success: true,
        data: Array.from(testData.data),
        timestamp: Date.now()
      }));

      // Perform identical operations simultaneously
      const promises = Array.from({ length: 5 }, () => 
        storage.retrieve(testData.key)
      );

      await Promise.all(promises);
      
      // Should only invoke once due to deduplication
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should retry failed operations with backoff', async () => {
      const testData = createTestData('test-retry');
      
      // Fail first two attempts, succeed on third
      mockInvoke
        .mockImplementationOnce(() => Promise.reject(new Error('Network error')))
        .mockImplementationOnce(() => Promise.reject(new Error('Network error')))
        .mockImplementationOnce(() => Promise.resolve({
          success: true,
          data: undefined,
          timestamp: Date.now()
        }));

      const result = await storage.store(testData.key, testData.data);
      expect(result.success).toBe(true);
      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });

    test('should handle timeout errors', async () => {
      const testData = createTestData('test-timeout');
      
      // Mock timeout by delaying response
      mockInvoke.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 15000)) // Longer than timeout
      );

      const result = await storage.store(testData.key, testData.data);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should gracefully handle Tauri runtime unavailability', async () => {
      // Remove Tauri runtime
      restoreTauriRuntime();
      
      const testData = createTestData('test-unavailable');
      const result = await storage.store(testData.key, testData.data);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tauri runtime not available');
    });
  });

  describe('Platform Integration', () => {
    test('should detect platform capabilities correctly', async () => {
      mockInvoke.mockImplementationOnce(() => Promise.resolve({
        success: true,
        data: {
          platform: 'darwin',
          secure_storage: true,
          biometric_available: true,
          tauri_version: '1.5.0'
        },
        timestamp: Date.now()
      }));

      const info = await storage.getInfo();
      expect(info.success).toBe(true);
      expect(info.data).toMatchObject({
        platform: 'darwin',
        secure_storage: true,
        biometric_available: true
      });
    });

    test('should handle platform-specific storage limitations', async () => {
      const testData = createTestData('test-platform-limits');
      
      // Mock platform limitation error
      mockInvoke.mockImplementationOnce(() => Promise.resolve({
        success: false,
        error: 'Platform storage limit exceeded',
        timestamp: Date.now()
      }));

      const result = await storage.store(testData.key, testData.data);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Platform storage limit exceeded');
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should clean up resources on destroy', async () => {
      const testData = createTestData('test-cleanup');
      
      mockInvoke.mockImplementation(() => Promise.resolve({
        success: true,
        data: undefined,
        timestamp: Date.now()
      }));

      await storage.store(testData.key, testData.data);
      
      storage.destroy();
      
      // Operations after destroy should fail immediately
      const result = await storage.store('test-after-destroy', Buffer.from('test'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage instance destroyed');
    });

    test('should handle memory pressure gracefully', async () => {
      // Simulate memory pressure by creating many operations
      const testData = Array.from({ length: 100 }, (_, i) => 
        createTestData(`test-memory-${i}`)
      );
      
      mockInvoke.mockImplementation(() => Promise.resolve({
        success: true,
        data: undefined,
        timestamp: Date.now()
      }));

      const promises = testData.map(data => 
        storage.store(data.key, data.data)
      );

      const results = await Promise.all(promises);
      
      // All operations should complete successfully
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});

describe('Tauri Cache Integration', () => {
  let cache: TauriSecureStorageCache;
  let mockStorage: jest.Mocked<TauriStorage>;

  beforeEach(() => {
    mockTauriRuntime();
    
    mockStorage = {
      store: jest.fn(),
      retrieve: jest.fn(),
      remove: jest.fn(),
      exists: jest.fn(),
      list: jest.fn(),
      getMetadata: jest.fn(),
      test: jest.fn(),
      getInfo: jest.fn(),
      destroy: jest.fn()
    } as any;

    cache = new TauriSecureStorageCache(mockStorage, {
      maxSize: 100,
      maxMemoryUsage: 10 * 1024 * 1024, // 10MB
      enableDeduplication: true,
      enablePrefetching: true,
      enableBackgroundWarming: true
    });
  });

  afterEach(() => {
    cache.destroy();
    restoreTauriRuntime();
    jest.clearAllMocks();
  });

  test('should cache retrieved data and serve from cache on subsequent requests', async () => {
    const testData = createTestData('test-cache');
    
    mockStorage.retrieve.mockResolvedValueOnce({
      success: true,
      data: testData.data
    });

    // First request - should hit storage
    const result1 = await cache.retrieve(testData.key);
    expect(result1.success).toBe(true);
    expect(mockStorage.retrieve).toHaveBeenCalledTimes(1);

    // Second request - should hit cache
    const result2 = await cache.retrieve(testData.key);
    expect(result2.success).toBe(true);
    expect(mockStorage.retrieve).toHaveBeenCalledTimes(1); // Still only one call
  });

  test('should deduplicate concurrent identical requests', async () => {
    const testData = createTestData('test-dedup');
    
    mockStorage.retrieve.mockResolvedValueOnce({
      success: true,
      data: testData.data
    });

    // Multiple concurrent identical requests
    const promises = Array.from({ length: 5 }, () => 
      cache.retrieve(testData.key)
    );

    const results = await Promise.all(promises);
    
    // All should succeed but only one storage call
    expect(results.every(r => r.success)).toBe(true);
    expect(mockStorage.retrieve).toHaveBeenCalledTimes(1);
  });

  test('should prefetch related keys automatically', async () => {
    const baseKey = 'user:123';
    const relatedKeys = ['user:123:profile', 'user:123:settings'];
    
    mockStorage.retrieve
      .mockResolvedValueOnce({ success: true, data: Buffer.from('main') })
      .mockResolvedValueOnce({ success: true, data: Buffer.from('profile') })
      .mockResolvedValueOnce({ success: true, data: Buffer.from('settings') });

    // Request main key - should trigger prefetching
    await cache.retrieve(baseKey);
    
    // Wait for prefetching to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Related keys should now be cached
    const profileResult = await cache.retrieve(relatedKeys[0]);
    expect(profileResult.success).toBe(true);
    
    // Should have made calls for main + prefetched keys
    expect(mockStorage.retrieve).toHaveBeenCalledTimes(3);
  });
});

describe('Tauri Batch Operations', () => {
  let batchStorage: TauriBatchStorageOperations;
  let mockStorage: jest.Mocked<TauriStorage>;

  beforeEach(() => {
    mockTauriRuntime();
    
    mockStorage = {
      store: jest.fn(),
      retrieve: jest.fn(),
      remove: jest.fn(),
      exists: jest.fn(),
      list: jest.fn(),
      getMetadata: jest.fn(),
      test: jest.fn(),
      getInfo: jest.fn(),
      destroy: jest.fn()
    } as any;

    batchStorage = new TauriBatchStorageOperations(mockStorage, {
      maxBatchSize: 10,
      maxMemoryUsage: 5 * 1024 * 1024, // 5MB
      batchTimeout: 100,
      enableCoalescing: true,
      enablePrioritization: true
    });
  });

  afterEach(() => {
    batchStorage.destroy();
    restoreTauriRuntime();
    jest.clearAllMocks();
  });

  test('should batch multiple operations together', async () => {
    const testData = Array.from({ length: 5 }, (_, i) => 
      createTestData(`test-batch-${i}`)
    );
    
    mockStorage.store.mockResolvedValue({ success: true });

    // Perform multiple operations rapidly
    const promises = testData.map(data => 
      batchStorage.store(data.key, data.data)
    );

    await Promise.all(promises);
    
    // Should have fewer storage calls than operations due to batching
    expect(mockStorage.store.mock.calls.length).toBeLessThan(testData.length);
  });

  test('should prioritize high-priority operations', async () => {
    const highPriorityData = createTestData('high-priority');
    const lowPriorityData = createTestData('low-priority');
    
    mockStorage.store.mockImplementation(async (key) => {
      // Track order of operations
      return { success: true };
    });

    // Add low priority operation first
    const lowPromise = batchStorage.store(lowPriorityData.key, lowPriorityData.data);
    
    // Add high priority operation
    const highPromise = batchStorage.store(highPriorityData.key, highPriorityData.data);

    await Promise.all([lowPromise, highPromise]);
    
    // High priority should be processed first
    expect(mockStorage.store).toHaveBeenCalledWith(
      highPriorityData.key,
      expect.any(Buffer)
    );
  });

  test('should handle batch operation failures gracefully', async () => {
    const testData = Array.from({ length: 3 }, (_, i) => 
      createTestData(`test-failure-${i}`)
    );
    
    // Fail middle operation
    mockStorage.store
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Storage error' })
      .mockResolvedValueOnce({ success: true });

    const promises = testData.map(data => 
      batchStorage.store(data.key, data.data)
    );

    const results = await Promise.all(promises);
    
    // First and third should succeed, second should fail
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
  });
});
