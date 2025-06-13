/**
 * @fileoverview Secret Service API implementation for Linux D-Bus
 * 
 * Implements the org.freedesktop.secrets specification with session
 * negotiation, collection management, and proper error handling.
 */

import { DbusClient, createSecretServiceClient, createCollectionClient, createItemClient } from './dbus-client.js';

/**
 * Secret Service session information
 */
export interface SecretSession {
  /** Session object path */
  path: string;
  /** Encryption algorithm */
  algorithm: string;
  /** Session output (encryption key or empty) */
  output: Uint8Array;
}

/**
 * Secret item attributes
 */
export interface SecretAttributes {
  [key: string]: string;
}

/**
 * Secret value with session context
 */
export interface SecretValue {
  /** Session object path */
  session: string;
  /** Parameters (IV for encrypted sessions) */
  parameters: Uint8Array;
  /** Secret data (encrypted or plain) */
  value: Uint8Array;
  /** Content type */
  contentType: string;
}

/**
 * Secret item properties
 */
export interface SecretItem {
  /** Item object path */
  path: string;
  /** Item attributes */
  attributes: SecretAttributes;
  /** Item label */
  label: string;
  /** Creation timestamp */
  created?: number;
  /** Modification timestamp */
  modified?: number;
  /** Whether item is locked */
  locked?: boolean;
}

/**
 * Collection properties
 */
export interface SecretCollection {
  /** Collection object path */
  path: string;
  /** Collection label */
  label: string;
  /** Whether collection is locked */
  locked: boolean;
  /** Creation timestamp */
  created?: number;
  /** Modification timestamp */
  modified?: number;
}

/**
 * Secret Service API result
 */
export interface SecretServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  promptPath?: string;
}

/**
 * Secret Service API client
 */
export class SecretServiceApi {
  private serviceClient: DbusClient;
  private session: SecretSession | null = null;
  private collections: Map<string, DbusClient> = new Map();
  private isAvailable: boolean = false;

  constructor(debug: boolean = false) {
    this.serviceClient = createSecretServiceClient(debug);
    
    // Set up event handlers
    this.serviceClient.on('error', (error) => {
      console.warn('Secret Service error:', error);
      this.isAvailable = false;
    });

    this.serviceClient.on('disconnect', () => {
      this.session = null;
      this.collections.clear();
      this.isAvailable = false;
    });
  }

  /**
   * Initialize the Secret Service connection
   */
  async initialize(): Promise<SecretServiceResult> {
    try {
      // Test D-Bus connection
      const connectResult = await this.serviceClient.connect();
      if (!connectResult.success) {
        return {
          success: false,
          error: 'Cannot connect to D-Bus: ' + connectResult.error,
        };
      }

      // Open session with plain encryption (most compatible)
      const sessionResult = await this.openSession('plain');
      if (!sessionResult.success) {
        return {
          success: false,
          error: 'Cannot open Secret Service session: ' + sessionResult.error,
        };
      }

      this.isAvailable = true;
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Open a session with the Secret Service
   */
  async openSession(algorithm: string = 'plain'): Promise<SecretServiceResult<SecretSession>> {
    try {
      const input = new Uint8Array(0); // Empty for plain algorithm
      
      const result = await this.serviceClient.call('OpenSession', algorithm, input);
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to open session: ' + result.error,
        };
      }

      const [output, sessionPath] = result.data;
      this.session = {
        path: sessionPath,
        algorithm,
        output: new Uint8Array(output),
      };

      return {
        success: true,
        data: this.session,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown session error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the default collection
   */
  async getDefaultCollection(): Promise<SecretServiceResult<SecretCollection>> {
    try {
      const result = await this.serviceClient.call('ReadAlias', 'default');
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to get default collection: ' + result.error,
        };
      }

      const collectionPath = result.data;
      if (collectionPath === '/') {
        // No default collection, create one
        return await this.createCollection('Tari Wallet', 'default');
      }

      return await this.getCollectionInfo(collectionPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown collection error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a new collection
   */
  async createCollection(label: string, alias?: string): Promise<SecretServiceResult<SecretCollection>> {
    try {
      const properties = {
        'org.freedesktop.Secret.Collection.Label': label,
      };

      const result = await this.serviceClient.call('CreateCollection', properties, alias || '');
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to create collection: ' + result.error,
        };
      }

      const [collectionPath, promptPath] = result.data;
      
      if (promptPath !== '/') {
        return {
          success: false,
          error: 'User authentication required',
          promptPath,
        };
      }

      return await this.getCollectionInfo(collectionPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown collection creation error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get collection information
   */
  async getCollectionInfo(collectionPath: string): Promise<SecretServiceResult<SecretCollection>> {
    try {
      const collectionClient = createCollectionClient(collectionPath);
      
      const labelResult = await collectionClient.getProperty('Label');
      const lockedResult = await collectionClient.getProperty('Locked');
      
      if (!labelResult.success || !lockedResult.success) {
        return {
          success: false,
          error: 'Failed to get collection properties',
        };
      }

      const collection: SecretCollection = {
        path: collectionPath,
        label: labelResult.data,
        locked: lockedResult.data,
      };

      // Cache collection client
      this.collections.set(collectionPath, collectionClient);

      return {
        success: true,
        data: collection,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown collection info error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create an item in a collection
   */
  async createItem(
    collectionPath: string,
    attributes: SecretAttributes,
    secretValue: Uint8Array,
    label: string,
    replace: boolean = true
  ): Promise<SecretServiceResult<SecretItem>> {
    try {
      if (!this.session) {
        return {
          success: false,
          error: 'No active session',
        };
      }

      const collectionClient = this.collections.get(collectionPath) || createCollectionClient(collectionPath);
      
      const properties = {
        'org.freedesktop.Secret.Item.Label': label,
        'org.freedesktop.Secret.Item.Attributes': attributes,
      };

      const secret: SecretValue = {
        session: this.session.path,
        parameters: new Uint8Array(0),
        value: secretValue,
        contentType: 'text/plain',
      };

      const result = await collectionClient.call('CreateItem', properties, secret, replace);
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to create item: ' + result.error,
        };
      }

      const [itemPath, promptPath] = result.data;
      
      if (promptPath !== '/') {
        return {
          success: false,
          error: 'User authentication required',
          promptPath,
        };
      }

      return await this.getItemInfo(itemPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown item creation error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Search for items in a collection
   */
  async searchItems(collectionPath: string, attributes: SecretAttributes): Promise<SecretServiceResult<string[]>> {
    try {
      const collectionClient = this.collections.get(collectionPath) || createCollectionClient(collectionPath);
      
      const result = await collectionClient.call('SearchItems', attributes);
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to search items: ' + result.error,
        };
      }

      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown search error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get item information
   */
  async getItemInfo(itemPath: string): Promise<SecretServiceResult<SecretItem>> {
    try {
      const itemClient = createItemClient(itemPath);
      
      const [labelResult, attributesResult, lockedResult] = await Promise.all([
        itemClient.getProperty('Label'),
        itemClient.getProperty('Attributes'),
        itemClient.getProperty('Locked'),
      ]);

      if (!labelResult.success || !attributesResult.success) {
        return {
          success: false,
          error: 'Failed to get item properties',
        };
      }

      const item: SecretItem = {
        path: itemPath,
        label: labelResult.data,
        attributes: attributesResult.data,
        locked: lockedResult.success ? lockedResult.data : false,
      };

      return {
        success: true,
        data: item,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown item info error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get item secret value
   */
  async getSecret(itemPath: string): Promise<SecretServiceResult<Uint8Array>> {
    try {
      if (!this.session) {
        return {
          success: false,
          error: 'No active session',
        };
      }

      const itemClient = createItemClient(itemPath);
      
      const result = await itemClient.call('GetSecret', this.session.path);
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to get secret: ' + result.error,
        };
      }

      const secretValue: SecretValue = result.data;
      return {
        success: true,
        data: secretValue.value,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown secret retrieval error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Delete an item
   */
  async deleteItem(itemPath: string): Promise<SecretServiceResult> {
    try {
      const itemClient = createItemClient(itemPath);
      
      const result = await itemClient.call('Delete');
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to delete item: ' + result.error,
        };
      }

      const promptPath = result.data;
      if (promptPath !== '/') {
        return {
          success: false,
          error: 'User authentication required',
          promptPath,
        };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown deletion error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Unlock a collection or item
   */
  async unlock(objectPath: string): Promise<SecretServiceResult<string[]>> {
    try {
      const result = await this.serviceClient.call('Unlock', [objectPath]);
      if (!result.success) {
        return {
          success: false,
          error: 'Failed to unlock: ' + result.error,
        };
      }

      const [unlockedPaths, promptPath] = result.data;
      
      if (promptPath !== '/') {
        return {
          success: false,
          error: 'User authentication required',
          promptPath,
        };
      }

      return {
        success: true,
        data: unlockedPaths,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown unlock error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if Secret Service is available
   */
  isSecretServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Disconnect from Secret Service
   */
  async disconnect(): Promise<void> {
    this.collections.clear();
    this.session = null;
    this.isAvailable = false;
    await this.serviceClient.disconnect();
  }

  /**
   * Get current session
   */
  getSession(): SecretSession | null {
    return this.session;
  }
}
