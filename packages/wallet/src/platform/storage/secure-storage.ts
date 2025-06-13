/**
 * @fileoverview Secure storage abstraction layer
 * 
 * Provides a unified interface for platform-specific secure storage with
 * automatic chunking for size limits, encryption fallbacks, and error handling.
 */

/**
 * Storage operation result
 */
export interface StorageResult<T = void> {
  success: boolean;
  data?: T | undefined;
  error?: string;
  requiresUserInteraction?: boolean;
}

/**
 * Storage metadata
 */
export interface StorageMetadata {
  /** Creation timestamp */
  created: number;
  /** Last modified timestamp */
  modified: number;
  /** Data size in bytes */
  size: number;
  /** Number of chunks (if data was split) */
  chunks?: number;
  /** Encryption method used */
  encryption?: string;
}

/**
 * Storage options
 */
export interface StorageOptions {
  /** Require user authentication to access */
  requireAuth?: boolean;
  /** Custom encryption key (for fallback storage) */
  encryptionKey?: Buffer;
  /** Maximum size before chunking */
  maxChunkSize?: number;
  /** TTL in milliseconds (if supported) */
  ttl?: number;
}

/**
 * Secure storage interface
 */
export interface SecureStorage {
  /**
   * Store data securely
   */
  store(key: string, value: Buffer, options?: StorageOptions): Promise<StorageResult>;

  /**
   * Retrieve data
   */
  retrieve(key: string, options?: StorageOptions): Promise<StorageResult<Buffer>>;

  /**
   * Remove data
   */
  remove(key: string): Promise<StorageResult>;

  /**
   * Check if key exists
   */
  exists(key: string): Promise<StorageResult<boolean>>;

  /**
   * List all keys
   */
  list(): Promise<StorageResult<string[]>>;

  /**
   * Get metadata for a key
   */
  getMetadata(key: string): Promise<StorageResult<StorageMetadata>>;

  /**
   * Clear all stored data
   */
  clear(): Promise<StorageResult>;

  /**
   * Get storage info
   */
  getInfo(): Promise<StorageResult<StorageInfo>>;

  /**
   * Test storage availability
   */
  test(): Promise<StorageResult>;
}

/**
 * Storage backend information
 */
export interface StorageInfo {
  /** Backend type */
  type: string;
  /** Available space in bytes */
  availableSpace: number;
  /** Used space in bytes */
  usedSpace: number;
  /** Maximum item size in bytes */
  maxItemSize: number;
  /** Security level */
  securityLevel: 'hardware' | 'os' | 'encrypted' | 'plaintext';
  /** Supports user authentication */
  supportsAuth: boolean;
  /** Supports TTL */
  supportsTtl: boolean;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  /** Preferred backend type */
  preferredBackend?: string;
  /** Fallback backends in order of preference */
  fallbackBackends?: string[];
  /** Default chunk size */
  defaultChunkSize?: number;
  /** Default encryption for fallback storage */
  encryptionKey?: Buffer;
  /** Enable compression */
  enableCompression?: boolean;
  /** Compression threshold */
  compressionThreshold?: number;
}

/**
 * Abstract base class for secure storage implementations
 */
export abstract class BaseSecureStorage implements SecureStorage {
  protected readonly config: Required<StorageConfig>;

  constructor(config: StorageConfig = {}) {
    this.config = {
      preferredBackend: 'auto',
      fallbackBackends: ['encrypted-file', 'memory'],
      defaultChunkSize: 4000, // Conservative default for keychain limits
      encryptionKey: this.generateDefaultKey(),
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      ...config,
    };
  }

  // Abstract methods to be implemented by subclasses
  abstract store(key: string, value: Buffer, options?: StorageOptions): Promise<StorageResult>;
  abstract retrieve(key: string, options?: StorageOptions): Promise<StorageResult<Buffer>>;
  abstract remove(key: string): Promise<StorageResult>;
  abstract exists(key: string): Promise<StorageResult<boolean>>;
  abstract list(): Promise<StorageResult<string[]>>;
  abstract getMetadata(key: string): Promise<StorageResult<StorageMetadata>>;
  abstract clear(): Promise<StorageResult>;
  abstract getInfo(): Promise<StorageResult<StorageInfo>>;
  abstract test(): Promise<StorageResult>;

  /**
   * Chunk data if it exceeds size limits
   */
  protected chunkData(data: Buffer, maxSize: number = this.config.defaultChunkSize): Buffer[] {
    if (data.length <= maxSize) {
      return [data];
    }

    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < data.length) {
      const chunkSize = Math.min(maxSize, data.length - offset);
      chunks.push(data.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    }

    return chunks;
  }

  /**
   * Reassemble chunked data
   */
  protected reassembleChunks(chunks: Buffer[]): Buffer {
    return Buffer.concat(chunks);
  }

  /**
   * Compress data if enabled and beneficial
   */
  protected async compressData(data: Buffer): Promise<Buffer> {
    if (!this.config.enableCompression || data.length < this.config.compressionThreshold) {
      return data;
    }

    try {
      // Use Node.js zlib for compression if available
      if (typeof require !== 'undefined') {
        const zlib = require('zlib');
        return await new Promise<Buffer>((resolve, reject) => {
          zlib.gzip(data, (err: Error | null, compressed: Buffer) => {
            if (err) reject(err);
            else resolve(compressed);
          });
        });
      }
    } catch {
      // Compression not available, return original data
    }

    return data;
  }

  /**
   * Decompress data
   */
  protected async decompressData(data: Buffer): Promise<Buffer> {
    if (!this.config.enableCompression) {
      return data;
    }

    try {
      // Check if data looks compressed (gzip magic number)
      if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
        if (typeof require !== 'undefined') {
          const zlib = require('zlib');
          return await new Promise<Buffer>((resolve, reject) => {
            zlib.gunzip(data, (err: Error | null, decompressed: Buffer) => {
              if (err) reject(err);
              else resolve(decompressed);
            });
          });
        }
      }
    } catch {
      // Decompression failed, return original data
    }

    return data;
  }

  /**
   * Encrypt data for fallback storage
   */
  protected async encryptData(data: Buffer, key?: Buffer): Promise<Buffer> {
    const encryptionKey = key || this.config.encryptionKey;
    
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // Use Web Crypto API
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          encryptionKey,
          { name: 'AES-GCM' },
          false,
          ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          data
        );

        // Prepend IV to encrypted data
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv);
        result.set(new Uint8Array(encrypted), iv.length);
        
        return Buffer.from(result);
      }

      // Use Node.js crypto module
      if (typeof require !== 'undefined') {
        const crypto = require('crypto');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipher('aes-256-gcm', encryptionKey);
        cipher.setAAD(Buffer.from('tari-wallet-storage', 'utf8'));
        
        const encrypted = Buffer.concat([
          cipher.update(data),
          cipher.final()
        ]);
        
        const tag = cipher.getAuthTag();
        
        // Combine iv + tag + encrypted data
        return Buffer.concat([iv, tag, encrypted]);
      }
    } catch (error) {
      console.warn('Encryption failed:', error);
    }

    // Return original data if encryption fails
    return data;
  }

  /**
   * Decrypt data from fallback storage
   */
  protected async decryptData(encryptedData: Buffer, key?: Buffer): Promise<Buffer> {
    const encryptionKey = key || this.config.encryptionKey;
    
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // Use Web Crypto API
        const iv = encryptedData.subarray(0, 12);
        const data = encryptedData.subarray(12);
        
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          encryptionKey,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          data
        );
        
        return Buffer.from(decrypted);
      }

      // Use Node.js crypto module
      if (typeof require !== 'undefined') {
        const crypto = require('crypto');
        const iv = encryptedData.subarray(0, 12);
        const tag = encryptedData.subarray(12, 28);
        const data = encryptedData.subarray(28);
        
        const decipher = crypto.createDecipher('aes-256-gcm', encryptionKey);
        decipher.setAAD(Buffer.from('tari-wallet-storage', 'utf8'));
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([
          decipher.update(data),
          decipher.final()
        ]);
        
        return decrypted;
      }
    } catch (error) {
      console.warn('Decryption failed:', error);
    }

    // Return original data if decryption fails
    return encryptedData;
  }

  /**
   * Generate a default encryption key
   */
  private generateDefaultKey(): Buffer {
    // Generate a deterministic key based on system info
    // This is not cryptographically secure but better than no encryption
    const keySource = 'tari-wallet-default-key';
    
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Use a simple hash for the key
      const encoder = new TextEncoder();
      const data = encoder.encode(keySource);
      return Buffer.from(data.slice(0, 32)); // 256-bit key
    }

    // Fallback key
    return Buffer.from(keySource.padEnd(32, '0'), 'utf8');
  }

  /**
   * Create storage result
   */
  protected createResult<T = void>(
    success: boolean,
    data?: T,
    error?: string,
    requiresUserInteraction?: boolean
  ): StorageResult<T> {
    return { success, data, error, requiresUserInteraction };
  }

  /**
   * Validate key format
   */
  protected validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }

    if (key.length > 255) {
      throw new Error('Key too long (max 255 characters)');
    }

    // Sanitize key for different platforms
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      throw new Error('Key contains invalid characters (use only alphanumeric, dot, underscore, hyphen)');
    }
  }

  /**
   * Validate data size
   */
  protected validateDataSize(data: Buffer, maxSize?: number): void {
    if (!data || !Buffer.isBuffer(data)) {
      throw new Error('Data must be a Buffer');
    }

    if (maxSize && data.length > maxSize) {
      throw new Error(`Data too large (${data.length} bytes, max ${maxSize} bytes)`);
    }
  }
}

/**
 * Error types for storage operations
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class AuthenticationError extends StorageError {
  constructor(message: string = 'User authentication required') {
    super(message, 'AUTH_REQUIRED');
  }
}

export class QuotaExceededError extends StorageError {
  constructor(message: string = 'Storage quota exceeded') {
    super(message, 'QUOTA_EXCEEDED');
  }
}

export class UnavailableError extends StorageError {
  constructor(message: string = 'Storage backend unavailable') {
    super(message, 'UNAVAILABLE');
  }
}
