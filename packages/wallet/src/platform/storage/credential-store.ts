/**
 * @fileoverview Windows Credential Store secure storage implementation
 * 
 * Provides Windows Credential Manager integration with DPAPI encryption,
 * automatic chunking for size limits, and UAC handling.
 */

import { BaseSecureStorage, type StorageResult, type StorageMetadata, type StorageOptions, type StorageInfo, StorageError, AuthenticationError, QuotaExceededError } from './secure-storage.js';
import { PlatformDetector } from '../detector.js';

/**
 * Windows credential types
 */
export type CredentialType = 'generic' | 'domain_password' | 'domain_certificate';

/**
 * Windows credential persistence types
 */
export type CredentialPersist = 'session' | 'local_machine' | 'enterprise';

/**
 * Credential item for Windows
 */
export interface CredentialItem {
  /** Target name (identifier) */
  targetName: string;
  /** Credential type */
  type: CredentialType;
  /** Credential data */
  credential: Buffer;
  /** Persistence scope */
  persist: CredentialPersist;
  /** User name (optional) */
  userName?: string;
  /** Comment/description */
  comment?: string;
  /** Attributes (key-value pairs) */
  attributes?: Record<string, string>;
}

/**
 * Native Windows credential interface
 */
interface CredentialNative {
  setCredential(item: CredentialItem): Promise<void>;
  getCredential(targetName: string): Promise<Buffer | null>;
  deleteCredential(targetName: string): Promise<void>;
  enumerateCredentials(filter?: string): Promise<string[]>;
  credentialExists(targetName: string): Promise<boolean>;
  getCredentialInfo(targetName: string): Promise<any>;
  clearCredentials(filter: string): Promise<void>;
}

/**
 * DPAPI encryption interface
 */
interface DpapiNative {
  encryptData(data: Buffer, scope: 'user' | 'machine'): Promise<Buffer>;
  decryptData(encryptedData: Buffer): Promise<Buffer>;
}

/**
 * Windows Credential Store storage implementation
 */
export class CredentialStoreStorage extends BaseSecureStorage {
  private static readonly MAX_ITEM_SIZE = 2048; // 2KB conservative limit for Windows
  private static readonly TARGET_PREFIX = 'tari-wallet';
  private static readonly CHUNK_SUFFIX = '-chunk-';
  private static readonly METADATA_SUFFIX = '-meta';

  private credentials?: CredentialNative;
  private dpapi?: DpapiNative;
  private isAvailable: boolean = false;

  constructor(config = {}) {
    super(config);
    this.initializeCredentialStore();
  }

  /**
   * Store data in credential store with DPAPI encryption and chunking
   */
  async store(key: string, value: Buffer, options: StorageOptions = {}): Promise<StorageResult> {
    try {
      this.validateKey(key);
      this.validateDataSize(value);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Credential store not available');
      }

      // Compress data if beneficial
      const compressedData = await this.compressData(value);
      
      // Encrypt with DPAPI for additional security
      const encryptedData = await this.encryptWithDpapi(compressedData);
      
      // Determine chunk size
      const maxChunkSize = options.maxChunkSize || CredentialStoreStorage.MAX_ITEM_SIZE;
      const chunks = this.chunkData(encryptedData, maxChunkSize);
      
      // Store chunks
      for (let i = 0; i < chunks.length; i++) {
        const targetName = chunks.length > 1 
          ? `${CredentialStoreStorage.TARGET_PREFIX}-${key}${CredentialStoreStorage.CHUNK_SUFFIX}${i}`
          : `${CredentialStoreStorage.TARGET_PREFIX}-${key}`;
        
        const item: CredentialItem = {
          targetName,
          type: 'generic',
          credential: chunks[i],
          persist: 'local_machine',
          userName: 'tari-wallet',
          comment: chunks.length > 1 ? `Tari Wallet chunk ${i + 1}/${chunks.length}` : 'Tari Wallet data',
          attributes: {
            'app': 'tari-wallet',
            'key': key,
            'chunk': chunks.length > 1 ? `${i}` : '0',
          },
        };

        await this.credentials!.setCredential(item);
      }

      // Store metadata if chunked
      if (chunks.length > 1) {
        const metadata: StorageMetadata = {
          created: Date.now(),
          modified: Date.now(),
          size: value.length,
          chunks: chunks.length,
          encryption: 'dpapi',
        };

        const metadataItem: CredentialItem = {
          targetName: `${CredentialStoreStorage.TARGET_PREFIX}-${key}${CredentialStoreStorage.METADATA_SUFFIX}`,
          type: 'generic',
          credential: Buffer.from(JSON.stringify(metadata), 'utf8'),
          persist: 'local_machine',
          userName: 'tari-wallet',
          comment: 'Tari Wallet metadata',
          attributes: {
            'app': 'tari-wallet',
            'type': 'metadata',
            'key': key,
          },
        };

        await this.credentials!.setCredential(metadataItem);
      }

      return this.createResult(true);
    } catch (error) {
      return this.handleError(error, 'store');
    }
  }

  /**
   * Retrieve data from credential store with DPAPI decryption
   */
  async retrieve(key: string, options: StorageOptions = {}): Promise<StorageResult<Buffer>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Credential store not available');
      }

      // Try to get metadata first
      const metadataResult = await this.getStoredMetadata(key);
      
      if (metadataResult.success && metadataResult.data?.chunks) {
        // Retrieve chunked data
        const chunks: Buffer[] = [];
        const numChunks = metadataResult.data.chunks;
        
        for (let i = 0; i < numChunks; i++) {
          const targetName = `${CredentialStoreStorage.TARGET_PREFIX}-${key}${CredentialStoreStorage.CHUNK_SUFFIX}${i}`;
          const chunkData = await this.credentials!.getCredential(targetName);
          
          if (!chunkData) {
            return this.createResult(false, undefined, `Missing chunk ${i} for key ${key}`);
          }
          
          chunks.push(chunkData);
        }
        
        const reassembled = this.reassembleChunks(chunks);
        const decrypted = await this.decryptWithDpapi(reassembled);
        const decompressed = await this.decompressData(decrypted);
        
        return this.createResult(true, decompressed);
      } else {
        // Try to get single item
        const targetName = `${CredentialStoreStorage.TARGET_PREFIX}-${key}`;
        const data = await this.credentials!.getCredential(targetName);
        
        if (!data) {
          return this.createResult(false, undefined, 'Key not found');
        }
        
        const decrypted = await this.decryptWithDpapi(data);
        const decompressed = await this.decompressData(decrypted);
        return this.createResult(true, decompressed);
      }
    } catch (error) {
      return this.handleError(error, 'retrieve');
    }
  }

  /**
   * Remove data from credential store
   */
  async remove(key: string): Promise<StorageResult> {
    try {
      this.validateKey(key);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Credential store not available');
      }

      // Check if data is chunked
      const metadataResult = await this.getStoredMetadata(key);
      
      if (metadataResult.success && metadataResult.data?.chunks) {
        // Remove all chunks
        const numChunks = metadataResult.data.chunks;
        
        for (let i = 0; i < numChunks; i++) {
          const targetName = `${CredentialStoreStorage.TARGET_PREFIX}-${key}${CredentialStoreStorage.CHUNK_SUFFIX}${i}`;
          try {
            await this.credentials!.deleteCredential(targetName);
          } catch {
            // Continue removing other chunks even if one fails
          }
        }
        
        // Remove metadata
        try {
          const metadataTarget = `${CredentialStoreStorage.TARGET_PREFIX}-${key}${CredentialStoreStorage.METADATA_SUFFIX}`;
          await this.credentials!.deleteCredential(metadataTarget);
        } catch {
          // Metadata removal is not critical
        }
      } else {
        // Remove single item
        const targetName = `${CredentialStoreStorage.TARGET_PREFIX}-${key}`;
        await this.credentials!.deleteCredential(targetName);
      }

      return this.createResult(true);
    } catch (error) {
      return this.handleError(error, 'remove');
    }
  }

  /**
   * Check if key exists in credential store
   */
  async exists(key: string): Promise<StorageResult<boolean>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Credential store not available');
      }

      const targetName = `${CredentialStoreStorage.TARGET_PREFIX}-${key}`;
      const exists = await this.credentials!.credentialExists(targetName);
      return this.createResult(true, exists);
    } catch (error) {
      return this.handleError(error, 'exists');
    }
  }

  /**
   * List all keys in credential store
   */
  async list(): Promise<StorageResult<string[]>> {
    try {
      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Credential store not available');
      }

      const filter = `${CredentialStoreStorage.TARGET_PREFIX}-*`;
      const allTargets = await this.credentials!.enumerateCredentials(filter);
      
      // Extract keys from target names, filtering out chunks and metadata
      const keys = allTargets
        .filter(target => 
          !target.includes(CredentialStoreStorage.CHUNK_SUFFIX) && 
          !target.includes(CredentialStoreStorage.METADATA_SUFFIX)
        )
        .map(target => target.replace(`${CredentialStoreStorage.TARGET_PREFIX}-`, ''));

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
        return this.createResult(false, undefined, 'Credential store not available');
      }

      const result = await this.getStoredMetadata(key);
      if (result.success && result.data) {
        return this.createResult(true, result.data);
      }

      // Generate metadata for non-chunked items
      const targetName = `${CredentialStoreStorage.TARGET_PREFIX}-${key}`;
      const exists = await this.credentials!.credentialExists(targetName);
      if (exists) {
        const itemInfo = await this.credentials!.getCredentialInfo(targetName);
        const metadata: StorageMetadata = {
          created: itemInfo.created || Date.now(),
          modified: itemInfo.modified || Date.now(),
          size: itemInfo.size || 0,
          encryption: 'dpapi',
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
  async clear(): Promise<StorageResult> {
    try {
      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Credential store not available');
      }

      const filter = `${CredentialStoreStorage.TARGET_PREFIX}-*`;
      await this.credentials!.clearCredentials(filter);
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
        return this.createResult(false, undefined, 'Credential store not available');
      }

      const info: StorageInfo = {
        type: 'credential-store',
        availableSpace: Number.MAX_SAFE_INTEGER, // Windows doesn't have a hard limit
        usedSpace: 0, // Would need to calculate by enumerating items
        maxItemSize: CredentialStoreStorage.MAX_ITEM_SIZE,
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
   * Test credential store availability
   */
  async test(): Promise<StorageResult> {
    try {
      if (!this.isAvailable) {
        return this.createResult(false, undefined, 'Credential store not available');
      }

      // Test by storing and retrieving a small value
      const testKey = 'tari-test-' + Date.now();
      const testData = Buffer.from('test', 'utf8');
      
      await this.store(testKey, testData);
      const retrieved = await this.retrieve(testKey);
      await this.remove(testKey);

      if (retrieved.success && retrieved.data?.equals(testData)) {
        return this.createResult(true);
      }

      return this.createResult(false, undefined, 'Test failed');
    } catch (error) {
      return this.handleError(error, 'test');
    }
  }

  /**
   * Initialize credential store native interface
   */
  private async initializeCredentialStore(): Promise<void> {
    const platform = PlatformDetector.detect();
    
    if (platform.os !== 'win32') {
      this.isAvailable = false;
      return;
    }

    try {
      // Try to load native credential module
      const credentialModule = await this.loadCredentialModule();
      const dpapiModule = await this.loadDpapiModule();
      
      if (credentialModule && dpapiModule) {
        this.credentials = credentialModule;
        this.dpapi = dpapiModule;
        this.isAvailable = true;
      } else {
        this.isAvailable = false;
      }
    } catch (error) {
      console.warn('Failed to initialize credential store:', error);
      this.isAvailable = false;
    }
  }

  /**
   * Load native credential module
   */
  private async loadCredentialModule(): Promise<CredentialNative | null> {
    try {
      // Try to load the native module
      const native = require('../../native/windows-cred.node');
      return native;
    } catch {
      // Native module not available, use mock implementation for development
      console.warn('Native credential module not available, using mock implementation');
      return this.createMockCredential();
    }
  }

  /**
   * Load native DPAPI module
   */
  private async loadDpapiModule(): Promise<DpapiNative | null> {
    try {
      // Try to load the native module
      const native = require('../../native/windows-cred.node');
      return native; // DPAPI functions are in the same module
    } catch {
      // Native module not available, use mock implementation
      return this.createMockDpapi();
    }
  }

  /**
   * Create mock credential store for development/testing
   */
  private createMockCredential(): CredentialNative {
    const storage = new Map<string, Buffer>();

    return {
      async setCredential(item: CredentialItem): Promise<void> {
        storage.set(item.targetName, item.credential);
      },

      async getCredential(targetName: string): Promise<Buffer | null> {
        return storage.get(targetName) || null;
      },

      async deleteCredential(targetName: string): Promise<void> {
        storage.delete(targetName);
      },

      async enumerateCredentials(filter?: string): Promise<string[]> {
        const keys = Array.from(storage.keys());
        if (filter) {
          const regex = new RegExp(filter.replace('*', '.*'));
          return keys.filter(key => regex.test(key));
        }
        return keys;
      },

      async credentialExists(targetName: string): Promise<boolean> {
        return storage.has(targetName);
      },

      async getCredentialInfo(targetName: string): Promise<any> {
        const data = storage.get(targetName);
        return {
          created: Date.now(),
          modified: Date.now(),
          size: data?.length || 0,
        };
      },

      async clearCredentials(filter: string): Promise<void> {
        const regex = new RegExp(filter.replace('*', '.*'));
        const keysToDelete = Array.from(storage.keys()).filter(key => regex.test(key));
        keysToDelete.forEach(key => storage.delete(key));
      },
    };
  }

  /**
   * Create mock DPAPI for development/testing
   */
  private createMockDpapi(): DpapiNative {
    return {
      async encryptData(data: Buffer, scope: 'user' | 'machine'): Promise<Buffer> {
        // Mock encryption - just add a prefix for identification
        const prefix = Buffer.from('MOCK_DPAPI:', 'utf8');
        return Buffer.concat([prefix, data]);
      },

      async decryptData(encryptedData: Buffer): Promise<Buffer> {
        // Mock decryption - remove the prefix
        const prefix = Buffer.from('MOCK_DPAPI:', 'utf8');
        if (encryptedData.startsWith(prefix)) {
          return encryptedData.subarray(prefix.length);
        }
        return encryptedData;
      },
    };
  }

  /**
   * Encrypt data with DPAPI
   */
  private async encryptWithDpapi(data: Buffer): Promise<Buffer> {
    if (this.dpapi) {
      try {
        return await this.dpapi.encryptData(data, 'user');
      } catch (error) {
        console.warn('DPAPI encryption failed, using fallback:', error);
      }
    }
    
    // Fallback to base encryption
    return this.encryptData(data);
  }

  /**
   * Decrypt data with DPAPI
   */
  private async decryptWithDpapi(encryptedData: Buffer): Promise<Buffer> {
    if (this.dpapi) {
      try {
        return await this.dpapi.decryptData(encryptedData);
      } catch (error) {
        console.warn('DPAPI decryption failed, using fallback:', error);
      }
    }
    
    // Fallback to base decryption
    return this.decryptData(encryptedData);
  }

  /**
   * Get stored metadata for a key
   */
  private async getStoredMetadata(key: string): Promise<StorageResult<StorageMetadata>> {
    try {
      const metadataTarget = `${CredentialStoreStorage.TARGET_PREFIX}-${key}${CredentialStoreStorage.METADATA_SUFFIX}`;
      const metadataBuffer = await this.credentials!.getCredential(metadataTarget);
      
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
   * Handle credential store-specific errors
   */
  private handleError(error: any, operation: string): StorageResult {
    if (error.code === 'ERROR_CANCELLED' || error.message?.includes('cancelled')) {
      return this.createResult(false, undefined, 'User cancelled operation', true);
    }

    if (error.code === 'ERROR_ACCESS_DENIED' || error.message?.includes('access denied')) {
      throw new AuthenticationError('Access denied to credential store');
    }

    if (error.code === 'ERROR_ALREADY_EXISTS' || error.message?.includes('already exists')) {
      return this.createResult(false, undefined, 'Credential already exists');
    }

    if (error.message?.includes('quota') || error.message?.includes('space')) {
      throw new QuotaExceededError('Credential store full');
    }

    console.warn(`Credential store ${operation} error:`, error);
    return this.createResult(false, undefined, `Credential operation failed: ${error.message}`);
  }
}
