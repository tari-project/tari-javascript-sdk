/**
 * @fileoverview TypeScript Tauri storage interface using invoke
 * 
 * Provides secure storage operations through Tauri's invoke system with 
 * type-safe commands and comprehensive error handling for wallet security.
 */

import type { SecureStorage, StorageResult } from '../platform/storage/secure-storage.js';
import type { TauriStorageCommand, TauriStorageResponse, TauriPlatformInfo } from '../types/tauri.js';

/**
 * Storage metadata interface
 */
export interface TauriStorageMetadata {
  createdAt: Date;
  modifiedAt: Date;
  size: number;
  encrypted: boolean;
}

/**
 * Storage information interface
 */
export interface TauriStorageInfo {
  backendType: string;
  platform: string;
  secure: boolean;
  available: boolean;
  limitations: string[];
}

/**
 * Configuration options for Tauri storage
 */
export interface TauriStorageConfig {
  /** Enable command validation */
  enableValidation?: boolean;
  /** Command timeout in milliseconds */
  commandTimeout?: number;
  /** Enable operation logging */
  enableLogging?: boolean;
  /** Maximum retry attempts for failed operations */
  maxRetries?: number;
  /** Encryption mode for data serialization */
  encryptionMode?: 'none' | 'base64' | 'aes';
}

/**
 * Tauri secure storage implementation using invoke commands
 */
export class TauriStorage implements SecureStorage {
  private readonly config: Required<TauriStorageConfig>;
  private operationCount = 0;

  constructor(config: TauriStorageConfig = {}) {
    this.config = {
      enableValidation: true,
      commandTimeout: 5000,
      enableLogging: false,
      maxRetries: 3,
      encryptionMode: 'base64',
      ...config,
    };

    if (this.config.enableLogging) {
      console.log('TauriStorage initialized with config:', this.config);
    }
  }

  /**
   * Store data securely
   */
  async store(key: string, value: Buffer, options?: any): Promise<StorageResult> {
    this.validateKey(key);
    this.validateValue(value);

    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Storing key "${key}"`);
      }

      // Convert Buffer to number array for Tauri serialization
      const serializedValue = Array.from(value);

      const response = await this.invokeWithRetry<void>(
        'secure_storage_store',
        {
          key,
          value: serializedValue,
        }
      );

      return this.processResponse(response, operationId);

    } catch (error) {
      return this.handleError(error, operationId, 'store');
    }
  }

  /**
   * Retrieve data securely
   */
  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    this.validateKey(key);

    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Retrieving key "${key}"`);
      }

      const response = await this.invokeWithRetry<number[]>(
        'secure_storage_retrieve',
        { key }
      );

      if (response.success && response.data) {
        // Convert number array back to Buffer
        const buffer = Buffer.from(response.data);
        return {
          success: true,
          data: buffer,
        };
      } else {
        return {
          success: false,
          error: response.error || 'Failed to retrieve data',
        };
      }

    } catch (error) {
      return this.handleError(error, operationId, 'retrieve');
    }
  }

  /**
   * Remove data securely
   */
  async remove(key: string): Promise<StorageResult> {
    this.validateKey(key);

    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Removing key "${key}"`);
      }

      const response = await this.invokeWithRetry<void>(
        'secure_storage_remove',
        { key }
      );

      return this.processResponse(response, operationId);

    } catch (error) {
      return this.handleError(error, operationId, 'remove');
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<StorageResult<boolean>> {
    this.validateKey(key);

    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Checking existence of key "${key}"`);
      }

      const response = await this.invokeWithRetry<boolean>(
        'secure_storage_exists',
        { key }
      );

      return {
        success: response.success,
        data: response.data,
        error: response.error,
      };

    } catch (error) {
      return this.handleError(error, operationId, 'exists');
    }
  }

  /**
   * List all keys
   */
  async list(): Promise<StorageResult<string[]>> {
    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Listing all keys`);
      }

      const response = await this.invokeWithRetry<string[]>(
        'secure_storage_list'
      );

      return {
        success: response.success,
        data: response.data,
        error: response.error,
      };

    } catch (error) {
      return this.handleError(error, operationId, 'list');
    }
  }

  /**
   * Get metadata for a key
   */
  async getMetadata(key: string): Promise<StorageResult<any>> {
    this.validateKey(key);

    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Getting metadata for key "${key}"`);
      }

      const response = await this.invokeWithRetry<TauriStorageMetadata>(
        'secure_storage_get_metadata',
        { key }
      );

      if (response.success && response.data) {
        // Convert timestamp strings to Date objects if needed
        const metadata = {
          ...response.data,
          createdAt: new Date(response.data.createdAt),
          modifiedAt: new Date(response.data.modifiedAt),
        };

        return {
          success: true,
          data: metadata,
        };
      } else {
        return {
          success: false,
          error: response.error,
        };
      }

    } catch (error) {
      return this.handleError(error, operationId, 'getMetadata');
    }
  }

  /**
   * Clear all data
   */
  async clear(): Promise<StorageResult> {
    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Clearing all data`);
      }

      const response = await this.invokeWithRetry<void>(
        'secure_storage_clear'
      );

      return this.processResponse(response, operationId);

    } catch (error) {
      return this.handleError(error, operationId, 'clear');
    }
  }

  /**
   * Get storage information
   */
  async getInfo(): Promise<StorageResult<any>> {
    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Getting storage info`);
      }

      const response = await this.invokeWithRetry<TauriStorageInfo>(
        'secure_storage_get_info'
      );

      return {
        success: response.success,
        data: response.data,
        error: response.error,
      };

    } catch (error) {
      return this.handleError(error, operationId, 'getInfo');
    }
  }

  /**
   * Test storage functionality
   */
  async test(): Promise<StorageResult> {
    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Testing storage functionality`);
      }

      const response = await this.invokeWithRetry<void>(
        'secure_storage_test'
      );

      return this.processResponse(response, operationId);

    } catch (error) {
      return this.handleError(error, operationId, 'test');
    }
  }

  /**
   * Execute unified storage command
   */
  async executeCommand(command: TauriStorageCommand): Promise<StorageResult<any>> {
    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Executing command "${command.operation}"`);
      }

      const response = await this.invokeWithRetry<any>(
        'secure_storage_command',
        command
      );

      return {
        success: response.success,
        data: response.data,
        error: response.error,
      };

    } catch (error) {
      return this.handleError(error, operationId, 'executeCommand');
    }
  }

  /**
   * Get Tauri platform information
   */
  async getPlatformInfo(): Promise<StorageResult<TauriPlatformInfo>> {
    const operationId = this.generateOperationId();
    
    try {
      if (this.config.enableLogging) {
        console.log(`TauriStorage[${operationId}]: Getting platform info`);
      }

      const response = await this.invokeWithRetry<TauriPlatformInfo>(
        'get_platform_info'
      );

      return {
        success: response.success,
        data: response.data,
        error: response.error,
      };

    } catch (error) {
      return this.handleError(error, operationId, 'getPlatformInfo');
    }
  }

  /**
   * Invoke Tauri command with retry logic
   */
  private async invokeWithRetry<T>(
    command: string,
    args?: any,
    attempt = 1
  ): Promise<TauriStorageResponse<T>> {
    try {
      if (!window.__TAURI__?.invoke) {
        throw new Error('Tauri invoke not available - not running in Tauri environment');
      }

      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Command timeout after ${this.config.commandTimeout}ms`));
        }, this.config.commandTimeout);
      });

      // Execute command with timeout
      const commandPromise = window.__TAURI__.invoke<TauriStorageResponse<T>>(command, args);
      const response = await Promise.race([commandPromise, timeoutPromise]);

      return response;

    } catch (error) {
      if (attempt < this.config.maxRetries) {
        if (this.config.enableLogging) {
          console.warn(`TauriStorage: Retrying command "${command}" (attempt ${attempt + 1})`);
        }
        
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 100);
        return this.invokeWithRetry(command, args, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Process Tauri response
   */
  private processResponse<T>(response: TauriStorageResponse<T>, operationId: string): StorageResult<T> {
    if (this.config.enableLogging) {
      console.log(`TauriStorage[${operationId}]: Response:`, response);
    }

    return {
      success: response.success,
      data: response.data,
      error: response.error,
    };
  }

  /**
   * Handle operation errors
   */
  private handleError(error: unknown, operationId: string, operation: string): StorageResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (this.config.enableLogging) {
      console.error(`TauriStorage[${operationId}]: ${operation} failed:`, error);
    }

    return {
      success: false,
      error: `Tauri storage ${operation} failed: ${errorMessage}`,
    };
  }

  /**
   * Validate storage key
   */
  private validateKey(key: string): void {
    if (!this.config.enableValidation) return;

    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }

    if (key.length > 1000) {
      throw new Error('Invalid key: maximum length is 1000 characters');
    }

    // Prevent directory traversal and other security issues
    if (key.includes('../') || key.includes('..\\')) {
      throw new Error('Invalid key: contains directory traversal patterns');
    }
  }

  /**
   * Validate storage value
   */
  private validateValue(value: Buffer): void {
    if (!this.config.enableValidation) return;

    if (!Buffer.isBuffer(value)) {
      throw new Error('Invalid value: must be a Buffer');
    }

    // Check for reasonable size limits (adjust as needed)
    if (value.length > 10 * 1024 * 1024) { // 10MB limit
      throw new Error('Invalid value: maximum size is 10MB');
    }
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `tauri-${Date.now()}-${++this.operationCount}`;
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): TauriStorageConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TauriStorageConfig>): void {
    Object.assign(this.config, updates);
    
    if (this.config.enableLogging) {
      console.log('TauriStorage: Configuration updated:', this.config);
    }
  }
}

/**
 * Create a new Tauri storage instance
 */
export function createTauriStorage(config?: TauriStorageConfig): TauriStorage {
  return new TauriStorage(config);
}

/**
 * Check if Tauri storage is available
 */
export function isTauriStorageAvailable(): boolean {
  return typeof window !== 'undefined' && 
         window.__TAURI__ !== undefined &&
         typeof window.__TAURI__.invoke === 'function';
}

/**
 * Validate Tauri environment for storage operations
 */
export async function validateTauriEnvironment(): Promise<{ valid: boolean; error?: string }> {
  if (!isTauriStorageAvailable()) {
    return {
      valid: false,
      error: 'Tauri runtime not available',
    };
  }

  try {
    // Test basic invoke functionality
    const storage = new TauriStorage({ enableLogging: false });
    const result = await storage.test();
    
    return {
      valid: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}
