/**
 * @fileoverview macOS Keychain secure storage implementation
 * 
 * Provides macOS Keychain integration with automatic chunking for size limits,
 * user authentication handling, and error management.
 */

import { BaseSecureStorage, type StorageResult, type StorageMetadata, type StorageOptions, type StorageInfo, StorageError, AuthenticationError, QuotaExceededError } from './secure-storage.js';
import { StorageResults } from './types/storage-result.js';
import { PlatformDetector } from '../detector.js';

/**
 * Keychain access control options
 */
export interface KeychainAccessControl {
  /** Require user presence (Touch ID, password, etc.) */
  requireUserPresence?: boolean;
  /** Allow access when device is unlocked */
  allowWhenUnlocked?: boolean;
  /** Allow access after first unlock */
  allowAfterFirstUnlock?: boolean;
  /** Application-specific access */
  applicationAccess?: boolean;
}

/**
 * Keychain item attributes
 */
export interface KeychainItem {
  /** Service name (identifier) */
  service: string;
  /** Account name (key) */
  account: string;
  /** Data payload */
  data: Buffer;
  /** Access control settings */
  accessControl?: KeychainAccessControl;
  /** Label for user display */
  label?: string;
  /** Comment/description */
  comment?: string;
}

/**
 * Native keychain interface (will be implemented by native module)
 */
interface KeychainNative {
  setItem(item: KeychainItem): Promise<void>;
  getItem(service: string, account: string): Promise<Buffer | null>;
  deleteItem(service: string, account: string): Promise<void>;
  findItems(service: string): Promise<string[]>;
  itemExists(service: string, account: string): Promise<boolean>;
  getItemInfo(service: string, account: string): Promise<any>;
  clearService(service: string): Promise<void>;
}

/**
 * macOS Keychain storage implementation
 */
export class KeychainStorage extends BaseSecureStorage {
  private static readonly MAX_ITEM_SIZE = 4000; // 4KB conservative limit
  private static readonly SERVICE_NAME = 'com.tari.wallet';
  private static readonly CHUNK_SUFFIX = '_chunk_';
  private static readonly METADATA_SUFFIX = '_meta';

  private keychain?: KeychainNative;
  private isAvailable: boolean = false;

  constructor(config = {}) {
    super(config);
    this.initializeKeychain();
  }

  /**
   * Store data in keychain with automatic chunking
   */
  async store(key: string, value: Buffer, options: StorageOptions = {}): Promise<StorageResult<void>> {
    try {
      this.validateKey(key);
      this.validateDataSize(value);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      // Compress data if beneficial
      const compressedData = await this.compressData(value);
      
      // Determine chunk size
      const maxChunkSize = options.maxChunkSize || KeychainStorage.MAX_ITEM_SIZE;
      const chunks = this.chunkData(compressedData, maxChunkSize);
      
      // Store chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunkKey = chunks.length > 1 ? `${key}${KeychainStorage.CHUNK_SUFFIX}${i}` : key;
        
        const item: KeychainItem = {
          service: KeychainStorage.SERVICE_NAME,
          account: chunkKey,
          data: chunks[i],
          accessControl: {
            requireUserPresence: options.requireAuth,
            allowWhenUnlocked: true,
            applicationAccess: true,
          },
          label: `Tari Wallet - ${key}`,
          comment: chunks.length > 1 ? `Chunk ${i + 1} of ${chunks.length}` : undefined,
        };

        await this.keychain!.setItem(item);
      }

      // Store metadata if chunked
      if (chunks.length > 1) {
        const metadata: StorageMetadata = {
          created: Date.now(),
          modified: Date.now(),
          size: value.length,
          chunks: chunks.length,
          encryption: 'none',
        };

        const metadataItem: KeychainItem = {
          service: KeychainStorage.SERVICE_NAME,
          account: `${key}${KeychainStorage.METADATA_SUFFIX}`,
          data: Buffer.from(JSON.stringify(metadata), 'utf8'),
          accessControl: {
            allowWhenUnlocked: true,
            applicationAccess: true,
          },
          label: `Tari Wallet Metadata - ${key}`,
        };

        await this.keychain!.setItem(metadataItem);
      }

      return this.createResult(true);
    } catch (error) {
      return this.handleError(error, 'store');
    }
  }

  /**
   * Retrieve data from keychain with automatic chunk reassembly
   */
  async retrieve(key: string, options: StorageOptions = {}): Promise<StorageResult<Buffer>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      // Try to get metadata first
      const metadataResult = await this.getStoredMetadata(key);
      
      if (StorageResults.isOk(metadataResult) && metadataResult.value?.chunks) {
        // Retrieve chunked data
        const chunks: Buffer[] = [];
        const numChunks = metadataResult.value.chunks;
        
        for (let i = 0; i < numChunks; i++) {
          const chunkKey = `${key}${KeychainStorage.CHUNK_SUFFIX}${i}`;
          const chunkData = await this.keychain!.getItem(KeychainStorage.SERVICE_NAME, chunkKey);
          
          if (!chunkData) {
            return this.createResult(false, undefined, `Missing chunk ${i} for key ${key}`);
          }
          
          chunks.push(chunkData);
        }
        
        const reassembled = this.reassembleChunks(chunks);
        const decompressed = await this.decompressData(reassembled);
        
        return this.createResult(true, decompressed);
      } else {
        // Try to get single item
        const data = await this.keychain!.getItem(KeychainStorage.SERVICE_NAME, key);
        
        if (!data) {
          return this.createResult(false, undefined, 'Key not found');
        }
        
        const decompressed = await this.decompressData(data);
        return this.createResult(true, decompressed);
      }
    } catch (error) {
      return this.handleError(error, 'retrieve');
    }
  }

  /**
   * Remove data from keychain
   */
  async remove(key: string): Promise<StorageResult<void>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      // Check if data is chunked
      const metadataResult = await this.getStoredMetadata(key);
      
      if (StorageResults.isOk(metadataResult) && metadataResult.value?.chunks) {
        // Remove all chunks
        const numChunks = metadataResult.value.chunks;
        
        for (let i = 0; i < numChunks; i++) {
          const chunkKey = `${key}${KeychainStorage.CHUNK_SUFFIX}${i}`;
          try {
            await this.keychain!.deleteItem(KeychainStorage.SERVICE_NAME, chunkKey);
          } catch {
            // Continue removing other chunks even if one fails
          }
        }
        
        // Remove metadata
        try {
          await this.keychain!.deleteItem(KeychainStorage.SERVICE_NAME, `${key}${KeychainStorage.METADATA_SUFFIX}`);
        } catch {
          // Metadata removal is not critical
        }
      } else {
        // Remove single item
        await this.keychain!.deleteItem(KeychainStorage.SERVICE_NAME, key);
      }

      return this.createResult(true);
    } catch (error) {
      return this.handleError(error, 'remove');
    }
  }

  /**
   * Check if key exists in keychain
   */
  async exists(key: string): Promise<StorageResult<boolean>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      const exists = await this.keychain!.itemExists(KeychainStorage.SERVICE_NAME, key);
      return this.createResult(true, exists);
    } catch (error) {
      return this.handleError(error, 'exists');
    }
  }

  /**
   * List all keys in keychain
   */
  async list(): Promise<StorageResult<string[]>> {
    try {
      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      const allItems = await this.keychain!.findItems(KeychainStorage.SERVICE_NAME);
      
      // Filter out chunk and metadata keys
      const keys = allItems.filter(item => 
        !item.includes(KeychainStorage.CHUNK_SUFFIX) && 
        !item.includes(KeychainStorage.METADATA_SUFFIX)
      );

      return this.createResult(true, keys);
    } catch (error) {
      return this.handleError(error, 'list');
    }
  }

  /**
   * Get metadata for a key
   */
  async getMetadata(key: string): Promise<StorageResult<StorageMetadata>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      const result = await this.getStoredMetadata(key);
      if (StorageResults.isOk(result) && result.value) {
        return this.createResult(true, result.value);
      }

      // Generate metadata for non-chunked items
      const exists = await this.keychain!.itemExists(KeychainStorage.SERVICE_NAME, key);
      if (exists) {
        const itemInfo = await this.keychain!.getItemInfo(KeychainStorage.SERVICE_NAME, key);
        const metadata: StorageMetadata = {
          created: itemInfo.created || Date.now(),
          modified: itemInfo.modified || Date.now(),
          size: itemInfo.size || 0,
          encryption: 'none',
        };
        
        return this.createResult(true, metadata);
      }

      return this.createResult(false, undefined, 'Key not found');
    } catch (error) {
      return this.handleError(error, 'getMetadata');
    }
  }

  /**
   * Clear all stored data
   */
  async clear(): Promise<StorageResult<void>> {
    try {
      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      await this.keychain!.clearService(KeychainStorage.SERVICE_NAME);
      return this.createResult(true);
    } catch (error) {
      return this.handleError(error, 'clear');
    }
  }

  /**
   * Get storage information
   */
  async getInfo(): Promise<StorageResult<StorageInfo>> {
    try {
      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      const info: StorageInfo = {
        type: 'keychain',
        availableSpace: Number.MAX_SAFE_INTEGER, // Keychain doesn't have a hard limit
        usedSpace: 0, // Would need to calculate by enumerating items
        maxItemSize: KeychainStorage.MAX_ITEM_SIZE,
        securityLevel: 'os',
        supportsAuth: true,
        supportsTtl: false,
      };

      return this.createResult(true, info);
    } catch (error) {
      return this.handleError(error, 'getInfo');
    }
  }

  /**
   * Test keychain availability
   */
  async test(): Promise<StorageResult<void>> {
    try {
      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Keychain not available');
      }

      // Test by storing and retrieving a small value
      const testKey = 'tari-test-' + Date.now();
      const testData = Buffer.from('test', 'utf8');
      
      await this.store(testKey, testData);
      const retrieved = await this.retrieve(testKey);
      await this.remove(testKey);

      if (StorageResults.isOk(retrieved) && retrieved.value?.equals(testData)) {
        return this.createResult(true);
      }

      return this.createResult(false, undefined, 'Test failed');
    } catch (error) {
      return this.handleError(error, 'test');
    }
  }

  /**
   * Initialize keychain native interface
   */
  private async initializeKeychain(): Promise<void> {
    const platform = PlatformDetector.detect();
    
    if (platform.os !== 'darwin') {
      this.isAvailable = false;
      return;
    }

    try {
      // Try to load native keychain module
      const keychainModule = await this.loadKeychainModule();
      if (keychainModule) {
        this.keychain = keychainModule;
        this.isAvailable = true;
      } else {
        this.isAvailable = false;
      }
    } catch (error) {
      console.warn('Failed to initialize keychain:', error);
      this.isAvailable = false;
    }
  }

  /**
   * Load native keychain module
   */
  private async loadKeychainModule(): Promise<KeychainNative | null> {
    try {
      // Try to load the native module
      // This would be compiled from native/keychain-bridge.rs
      const native = require('../../native/keychain-bridge.node');
      return native;
    } catch {
      // Native module not available, use mock implementation for development
      console.warn('Native keychain module not available, using mock implementation');
      return this.createMockKeychain();
    }
  }

  /**
   * Create mock keychain for development/testing
   */
  private createMockKeychain(): KeychainNative {
    const storage = new Map<string, Buffer>();

    return {
      async setItem(item: KeychainItem): Promise<void> {
        const key = `${item.service}:${item.account}`;
        storage.set(key, item.data);
      },

      async getItem(service: string, account: string): Promise<Buffer | null> {
        const key = `${service}:${account}`;
        return storage.get(key) || null;
      },

      async deleteItem(service: string, account: string): Promise<void> {
        const key = `${service}:${account}`;
        storage.delete(key);
      },

      async findItems(service: string): Promise<string[]> {
        const keys: string[] = [];
        for (const [key] of storage) {
          if (key.startsWith(`${service}:`)) {
            keys.push(key.substring(service.length + 1));
          }
        }
        return keys;
      },

      async itemExists(service: string, account: string): Promise<boolean> {
        const key = `${service}:${account}`;
        return storage.has(key);
      },

      async getItemInfo(service: string, account: string): Promise<any> {
        const key = `${service}:${account}`;
        const data = storage.get(key);
        return {
          created: Date.now(),
          modified: Date.now(),
          size: data?.length || 0,
        };
      },

      async clearService(service: string): Promise<void> {
        const keysToDelete: string[] = [];
        for (const [key] of storage) {
          if (key.startsWith(`${service}:`)) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => storage.delete(key));
      },
    };
  }

  /**
   * Get stored metadata for a key
   */
  private async getStoredMetadata(key: string): Promise<StorageResult<StorageMetadata>> {
    try {
      const metadataKey = `${key}${KeychainStorage.METADATA_SUFFIX}`;
      const metadataBuffer = await this.keychain!.getItem(KeychainStorage.SERVICE_NAME, metadataKey);
      
      if (metadataBuffer) {
        const metadata = JSON.parse(metadataBuffer.toString('utf8'));
        return this.createResult(true, metadata);
      }
      
      return this.createResult(false, undefined, 'No metadata found');
    } catch (error) {
      return this.createResult(false, undefined, `Failed to get metadata: ${error}`);
    }
  }

  /**
   * Handle keychain-specific errors
   */
  private handleError<T>(error: any, operation: string): StorageResult<T> {
    if (error.code === 'errSecUserCancel' || error.message?.includes('user cancel')) {
      return this.createResult(false, undefined, 'User cancelled authentication', true) as StorageResult<T>;
    }

    if (error.code === 'errSecAuthFailed' || error.message?.includes('authentication')) {
      throw new AuthenticationError('Keychain authentication failed');
    }

    if (error.code === 'errSecDuplicateItem' || error.message?.includes('duplicate')) {
      return this.createResult(false, undefined, 'Item already exists') as StorageResult<T>;
    }

    if (error.message?.includes('quota') || error.message?.includes('space')) {
      throw new QuotaExceededError('Keychain storage full');
    }

    console.warn(`Keychain ${operation} error:`, error);
    return this.createResult(false, undefined, `Keychain operation failed: ${error.message}`) as StorageResult<T>;
  }
}
