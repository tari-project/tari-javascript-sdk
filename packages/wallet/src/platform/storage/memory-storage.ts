/**
 * @fileoverview In-memory storage implementation
 * 
 * Provides volatile in-memory storage for development and testing,
 * or as a last resort when no persistent storage is available.
 */

import { BaseSecureStorage, type StorageResult, type StorageMetadata, type StorageOptions, type StorageInfo } from './secure-storage.js';
import { StorageResults } from './types/storage-result.js';

/**
 * In-memory storage implementation
 */
export class MemoryStorage extends BaseSecureStorage {
  private readonly storage = new Map<string, Buffer>();
  private readonly metadata = new Map<string, StorageMetadata>();

  constructor(config = {}) {
    super(config);
  }

  /**
   * Store data in memory
   */
  async store(key: string, value: Buffer, options: StorageOptions = {}): Promise<StorageResult<void>> {
    try {
      this.validateKey(key);
      this.validateDataSize(value);

      // Store the data
      this.storage.set(key, Buffer.from(value));

      // Store metadata
      const metadata: StorageMetadata = {
        created: Date.now(),
        modified: Date.now(),
        size: value.length,
        encryption: 'none',
      };
      this.metadata.set(key, metadata);

      return this.createResult(true);
    } catch (error) {
      return this.createResult(false, undefined, `Memory storage error: ${error}`);
    }
  }

  /**
   * Retrieve data from memory
   */
  async retrieve(key: string, options: StorageOptions = {}): Promise<StorageResult<Buffer>> {
    try {
      this.validateKey(key);

      const data = this.storage.get(key);
      if (!data) {
        return this.createResult(false, undefined, 'Key not found');
      }

      // Return a copy to prevent external modification
      return this.createResult(true, Buffer.from(data));
    } catch (error) {
      return this.createResult(false, undefined, `Memory retrieval error: ${error}`);
    }
  }

  /**
   * Remove data from memory
   */
  async remove(key: string): Promise<StorageResult<void>> {
    try {
      this.validateKey(key);

      const existed = this.storage.delete(key);
      this.metadata.delete(key);

      if (!existed) {
        return this.createResult(false, undefined, 'Key not found');
      }

      return this.createResult(true);
    } catch (error) {
      return this.createResult(false, undefined, `Memory removal error: ${error}`);
    }
  }

  /**
   * Check if key exists in memory
   */
  async exists(key: string): Promise<StorageResult<boolean>> {
    try {
      this.validateKey(key);
      const exists = this.storage.has(key);
      return this.createResult(true, exists);
    } catch (error) {
      return this.createResult(false, undefined, `Memory check error: ${error}`);
    }
  }

  /**
   * List all keys in memory
   */
  async list(): Promise<StorageResult<string[]>> {
    try {
      const keys = Array.from(this.storage.keys());
      return this.createResult(true, keys);
    } catch (error) {
      return this.createResult(false, undefined, `Memory listing error: ${error}`);
    }
  }

  /**
   * Get metadata for a key
   */
  async getMetadata(key: string): Promise<StorageResult<StorageMetadata>> {
    try {
      this.validateKey(key);

      const metadata = this.metadata.get(key);
      if (!metadata) {
        return this.createResult(false, undefined, 'Key not found');
      }

      return this.createResult(true, { ...metadata });
    } catch (error) {
      return this.createResult(false, undefined, `Memory metadata error: ${error}`);
    }
  }

  /**
   * Clear all data from memory
   */
  async clear(): Promise<StorageResult<void>> {
    try {
      this.storage.clear();
      this.metadata.clear();
      return this.createResult(true);
    } catch (error) {
      return this.createResult(false, undefined, `Memory clear error: ${error}`);
    }
  }

  /**
   * Get storage information
   */
  async getInfo(): Promise<StorageResult<StorageInfo>> {
    try {
      let usedSpace = 0;
      for (const data of this.storage.values()) {
        usedSpace += data.length;
      }

      const info: StorageInfo = {
        type: 'memory',
        availableSpace: Number.MAX_SAFE_INTEGER, // Limited by available RAM
        usedSpace,
        maxItemSize: Number.MAX_SAFE_INTEGER,
        securityLevel: 'plaintext',
        supportsAuth: false,
        supportsTtl: false,
      };

      return this.createResult(true, info);
    } catch (error) {
      return this.createResult(false, undefined, `Memory info error: ${error}`);
    }
  }

  /**
   * Test memory storage
   */
  async test(): Promise<StorageResult<void>> {
    try {
      const testKey = 'test-' + Date.now();
      const testData = Buffer.from('test', 'utf8');
      
      await this.store(testKey, testData);
      const retrieved = await this.retrieve(testKey);
      await this.remove(testKey);

      if (StorageResults.isOk(retrieved) && retrieved.value?.equals(testData)) {
        return this.createResult(true);
      }

      return this.createResult(false, undefined, 'Test failed');
    } catch (error) {
      return this.createResult(false, undefined, `Memory test error: ${error}`);
    }
  }
}
