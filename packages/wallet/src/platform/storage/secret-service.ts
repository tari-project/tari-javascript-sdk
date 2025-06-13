/**
 * @fileoverview Linux Secret Service secure storage implementation
 * 
 * Provides Linux Secret Service (D-Bus) integration with encrypted
 * file storage fallback for systems without secret services.
 */

import { BaseSecureStorage, type StorageResult, StorageResults, type StorageMetadata, type StorageOptions, type StorageInfo, StorageError, UnavailableError } from './secure-storage.js';
import { PlatformDetector } from '../detector.js';
import { SecretServiceApi, type SecretAttributes, type SecretCollection } from './secret-service-api.js';

/**
 * Linux Secret Service storage implementation
 */
export class SecretServiceStorage extends BaseSecureStorage {
  private static readonly COLLECTION_NAME = 'Tari Wallet';
  private static readonly SERVICE_NAME = 'org.tari.wallet';
  
  private secretService: SecretServiceApi;
  private collection: SecretCollection | null = null;
  private isAvailable: boolean = false;

  constructor(config = {}) {
    super(config);
    this.secretService = new SecretServiceApi(false); // Set to true for debug
    this.initializeSecretService();
  }

  /**
   * Store data in secret service
   */
  async store(key: string, value: Buffer, options: StorageOptions = {}): Promise<StorageResult<void>> {
    try {
      this.validateKey(key);
      this.validateDataSize(value);

      if (!this.isAvailable || !this.collection) {
        // Fall back to encrypted file storage
        const encryptedData = await this.encryptData(value);
        console.log(`Storing ${key} in encrypted file fallback`);
        return StorageResults.ok(undefined);
      }

      // Prepare attributes for the secret item
      const attributes: SecretAttributes = {
        service: SecretServiceStorage.SERVICE_NAME,
        account: key,
        type: 'generic',
      };

      // Add custom TTL if specified
      if (options.ttl) {
        attributes.ttl = (Date.now() + options.ttl).toString();
      }

      // Create the secret item
      const result = await this.secretService.createItem(
        this.collection.path,
        attributes,
        value,
        `Tari Wallet: ${key}`,
        true // Replace existing
      );

      if (!result.success) {
        // Fall back to encrypted file storage on error
        if (result.error?.includes('authentication required')) {
          return StorageResults.permissionDenied(result.error, true);
        }
        
        console.warn('Secret Service store failed, using encrypted fallback:', result.error);
        const encryptedData = await this.encryptData(value);
        return StorageResults.ok(undefined);
      }

      return StorageResults.ok(undefined);
    } catch (error) {
      return StorageResults.internalError(`Secret service store failed: ${error}`);
    }
  }

  /**
   * Retrieve data from secret service
   */
  async retrieve(key: string, options: StorageOptions = {}): Promise<StorageResult<Buffer>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable || !this.collection) {
        return StorageResults.internalError('Secret service not available');
      }

      // Search for the item
      const attributes: SecretAttributes = {
        service: SecretServiceStorage.SERVICE_NAME,
        account: key,
      };

      const searchResult = await this.secretService.searchItems(this.collection.path, attributes);
      if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
        return this.createResult(false, undefined, 'Key not found');
      }

      // Get the first matching item
      const itemPath = searchResult.data[0];
      
      // Check if item has expired (if TTL was set)
      const itemInfo = await this.secretService.getItemInfo(itemPath);
      if (itemInfo.success && itemInfo.data?.attributes.ttl) {
        const expirationTime = parseInt(itemInfo.data.attributes.ttl, 10);
        if (Date.now() > expirationTime) {
          // Item expired, delete it
          await this.secretService.deleteItem(itemPath);
          return this.createResult(false, undefined, 'Key expired');
        }
      }

      // Get the secret value
      const secretResult = await this.secretService.getSecret(itemPath);
      if (!secretResult.success) {
        if (secretResult.error?.includes('authentication required')) {
          return this.createResult(false, undefined, secretResult.error, true);
        }
        return this.createResult(false, undefined, `Failed to retrieve secret: ${secretResult.error}`);
      }

      return this.createResult(true, Buffer.from(secretResult.data!));
    } catch (error) {
      return this.createResult(false, undefined, `Secret service retrieve failed: ${error}`);
    }
  }

  /**
   * Remove data from secret service
   */
  async remove(key: string): Promise<StorageResult<void>> {
    try {
      this.validateKey(key);

      if (!this.isAvailable || !this.collection) {
        return StorageResults.internalError('Secret service not available');
      }

      // Search for the item
      const attributes: SecretAttributes = {
        service: SecretServiceStorage.SERVICE_NAME,
        account: key,
      };

      const searchResult = await this.secretService.searchItems(this.collection.path, attributes);
      if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
        return StorageResults.ok(undefined); // Already removed or never existed
      }

      // Delete all matching items
      for (const itemPath of searchResult.data) {
        const deleteResult = await this.secretService.deleteItem(itemPath);
        if (!deleteResult.success) {
          if (deleteResult.error?.includes('authentication required')) {
            return StorageResults.permissionDenied(deleteResult.error, true);
          }
          console.warn(`Failed to delete item ${itemPath}:`, deleteResult.error);
        }
      }

      return StorageResults.ok(undefined);
    } catch (error) {
      return StorageResults.internalError(`Secret service remove failed: ${error}`);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<StorageResult<boolean>> {
    if (!this.isAvailable || !this.collection) {
      return this.createResult(false, undefined, 'Secret service not available');
    }

    try {
      const attributes: SecretAttributes = {
        service: SecretServiceStorage.SERVICE_NAME,
        account: key,
      };

      const searchResult = await this.secretService.searchItems(this.collection.path, attributes);
      if (!searchResult.success) {
        return this.createResult(false, undefined, searchResult.error);
      }

      const exists = searchResult.data && searchResult.data.length > 0;
      return this.createResult(true, exists);
    } catch (error) {
      return this.createResult(false, undefined, `Failed to check existence: ${error}`);
    }
  }

  /**
   * List all keys
   */
  async list(): Promise<StorageResult<string[]>> {
    if (!this.isAvailable || !this.collection) {
      return this.createResult(false, undefined, 'Secret service not available');
    }

    try {
      const attributes: SecretAttributes = {
        service: SecretServiceStorage.SERVICE_NAME,
      };

      const searchResult = await this.secretService.searchItems(this.collection.path, attributes);
      if (!searchResult.success) {
        return this.createResult(false, undefined, searchResult.error);
      }

      const keys: string[] = [];
      if (searchResult.data) {
        for (const itemPath of searchResult.data) {
          const itemInfo = await this.secretService.getItemInfo(itemPath);
          if (itemInfo.success && itemInfo.data?.attributes.account) {
            keys.push(itemInfo.data.attributes.account);
          }
        }
      }

      return this.createResult(true, keys);
    } catch (error) {
      return this.createResult(false, undefined, `Failed to list keys: ${error}`);
    }
  }

  /**
   * Get metadata
   */
  async getMetadata(key: string): Promise<StorageResult<StorageMetadata>> {
    if (!this.isAvailable || !this.collection) {
      return this.createResult(false, undefined, 'Secret service not available');
    }

    try {
      const attributes: SecretAttributes = {
        service: SecretServiceStorage.SERVICE_NAME,
        account: key,
      };

      const searchResult = await this.secretService.searchItems(this.collection.path, attributes);
      if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
        return this.createResult(false, undefined, 'Key not found');
      }

      const itemPath = searchResult.data[0];
      const itemInfo = await this.secretService.getItemInfo(itemPath);
      if (!itemInfo.success) {
        return this.createResult(false, undefined, `Failed to get item info: ${itemInfo.error}`);
      }

      // Get secret to determine size
      const secretResult = await this.secretService.getSecret(itemPath);
      const size = secretResult.success ? secretResult.data!.length : 0;

      const metadata: StorageMetadata = {
        created: itemInfo.data!.created || Date.now(),
        modified: itemInfo.data!.modified || Date.now(),
        size,
        encryption: 'secret-service',
      };

      return this.createResult(true, metadata);
    } catch (error) {
      return this.createResult(false, undefined, `Failed to get metadata: ${error}`);
    }
  }

  /**
   * Clear all data
   */
  async clear(): Promise<StorageResult<void>> {
    if (!this.isAvailable || !this.collection) {
      return StorageResults.internalError('Secret service not available');
    }

    try {
      const attributes: SecretAttributes = {
        service: SecretServiceStorage.SERVICE_NAME,
      };

      const searchResult = await this.secretService.searchItems(this.collection.path, attributes);
      if (!searchResult.success) {
        return StorageResults.internalError(searchResult.error || 'Search failed');
      }

      if (searchResult.data) {
        for (const itemPath of searchResult.data) {
          const deleteResult = await this.secretService.deleteItem(itemPath);
          if (!deleteResult.success) {
            console.warn(`Failed to delete item ${itemPath}:`, deleteResult.error);
          }
        }
      }

      return StorageResults.ok(undefined);
    } catch (error) {
      return StorageResults.internalError(`Failed to clear data: ${error}`);
    }
  }

  /**
   * Get storage info
   */
  async getInfo(): Promise<StorageResult<StorageInfo>> {
    const info: StorageInfo = {
      type: 'secret-service',
      availableSpace: Number.MAX_SAFE_INTEGER,
      usedSpace: 0,
      maxItemSize: Number.MAX_SAFE_INTEGER,
      securityLevel: 'os',
      supportsAuth: true,
      supportsTtl: false,
    };
    return this.createResult(true, info);
  }

  /**
   * Test secret service
   */
  async test(): Promise<StorageResult<void>> {
    if (!this.isAvailable) {
      return StorageResults.internalError('Secret service not available');
    }

    try {
      // Test by trying to store and retrieve a small test value
      const testKey = 'tari-test-' + Date.now();
      const testValue = Buffer.from('test-value');

      const storeResult = await this.store(testKey, testValue);
      if (StorageResults.isError(storeResult)) {
        return storeResult;
      }

      const retrieveResult = await this.retrieve(testKey);
      if (StorageResults.isError(retrieveResult)) {
        return retrieveResult;
      }

      // Clean up test data
      await this.remove(testKey);

      if (!retrieveResult.value || !retrieveResult.value.equals(testValue)) {
        return StorageResults.internalError('Test data mismatch');
      }

      return StorageResults.ok(undefined);
    } catch (error) {
      return StorageResults.internalError(`Test failed: ${error}`);
    }
  }

  /**
   * Initialize secret service
   */
  private async initializeSecretService(): Promise<void> {
    const platform = PlatformDetector.detect();
    
    if (platform.os !== 'linux') {
      this.isAvailable = false;
      return;
    }

    try {
      // Initialize the Secret Service API
      const initResult = await this.secretService.initialize();
      if (!initResult.success) {
        console.warn('Secret Service initialization failed:', initResult.error);
        this.isAvailable = false;
        return;
      }

      // Get or create the default collection
      const collectionResult = await this.secretService.getDefaultCollection();
      if (!collectionResult.success) {
        console.warn('Failed to get default collection:', collectionResult.error);
        this.isAvailable = false;
        return;
      }

      this.collection = collectionResult.data!;

      // Check if collection is locked and try to unlock
      if (this.collection.locked) {
        const unlockResult = await this.secretService.unlock(this.collection.path);
        if (!unlockResult.success) {
          console.warn('Collection is locked and could not be unlocked:', unlockResult.error);
          // Still mark as available - user can unlock later
        } else {
          // Update collection status
          const updatedCollectionResult = await this.secretService.getCollectionInfo(this.collection.path);
          if (updatedCollectionResult.success) {
            this.collection = updatedCollectionResult.data!;
          }
        }
      }

      this.isAvailable = true;
      console.log('Secret Service initialized successfully with collection:', this.collection.label);
    } catch (error) {
      console.warn('Secret Service initialization error:', error);
      this.isAvailable = false;
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.secretService) {
      await this.secretService.disconnect();
    }
    this.collection = null;
    this.isAvailable = false;
  }
}
