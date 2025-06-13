/**
 * @fileoverview Encryption utilities for secure storage fallbacks
 * 
 * Provides cross-platform encryption utilities for securing data when
 * native secure storage is not available.
 */

/**
 * Encryption algorithm types
 */
export type EncryptionAlgorithm = 'aes-256-gcm' | 'chacha20-poly1305';

/**
 * Key derivation function types
 */
export type KdfType = 'pbkdf2' | 'scrypt' | 'argon2';

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  /** Encryption algorithm */
  algorithm: EncryptionAlgorithm;
  /** Key derivation function */
  kdf: KdfType;
  /** KDF iterations/cost parameter */
  iterations: number;
  /** Salt size in bytes */
  saltSize: number;
  /** IV/nonce size in bytes */
  ivSize: number;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  /** Encrypted payload */
  data: Buffer;
  /** Algorithm used */
  algorithm: EncryptionAlgorithm;
  /** Key derivation function used */
  kdf: KdfType;
  /** KDF parameters */
  kdfParams: {
    salt: Buffer;
    iterations: number;
  };
  /** Initialization vector/nonce */
  iv: Buffer;
  /** Authentication tag */
  tag: Buffer;
  /** Version for future compatibility */
  version: number;
}

/**
 * Encryption key material
 */
export interface KeyMaterial {
  /** Derived encryption key */
  key: Buffer;
  /** Salt used for derivation */
  salt: Buffer;
  /** KDF parameters */
  kdfParams: {
    iterations: number;
    memorySize?: number; // For scrypt/argon2
    parallelism?: number; // For argon2
  };
}

/**
 * Cross-platform encryption utilities
 */
export class EncryptionUtils {
  private static readonly DEFAULT_CONFIG: EncryptionConfig = {
    algorithm: 'aes-256-gcm',
    kdf: 'pbkdf2',
    iterations: 100000, // OWASP recommended minimum
    saltSize: 32,
    ivSize: 12, // 96 bits for GCM
  };

  /**
   * Encrypt data with password-based encryption
   */
  static async encrypt(
    data: Buffer,
    password: string,
    config: Partial<EncryptionConfig> = {}
  ): Promise<EncryptedData> {
    const cfg = { ...this.DEFAULT_CONFIG, ...config };
    
    // Generate salt and derive key
    const salt = this.generateRandomBytes(cfg.saltSize);
    const keyMaterial = await this.deriveKey(password, salt, cfg);
    
    // Generate IV
    const iv = this.generateRandomBytes(cfg.ivSize);
    
    // Encrypt data
    const { encrypted, tag } = await this.encryptWithKey(data, keyMaterial.key, iv, cfg.algorithm);
    
    return {
      data: encrypted,
      algorithm: cfg.algorithm,
      kdf: cfg.kdf,
      kdfParams: {
        salt,
        iterations: keyMaterial.kdfParams.iterations,
      },
      iv,
      tag,
      version: 1,
    };
  }

  /**
   * Decrypt password-based encrypted data
   */
  static async decrypt(encryptedData: EncryptedData, password: string): Promise<Buffer> {
    // Derive key using stored parameters
    const keyMaterial = await this.deriveKey(
      password,
      encryptedData.kdfParams.salt,
      {
        algorithm: encryptedData.algorithm,
        kdf: encryptedData.kdf,
        iterations: encryptedData.kdfParams.iterations,
        saltSize: encryptedData.kdfParams.salt.length,
        ivSize: encryptedData.iv.length,
      }
    );
    
    // Decrypt data
    return this.decryptWithKey(
      encryptedData.data,
      keyMaterial.key,
      encryptedData.iv,
      encryptedData.tag,
      encryptedData.algorithm
    );
  }

  /**
   * Encrypt data with a raw key
   */
  static async encryptWithKey(
    data: Buffer,
    key: Buffer,
    iv: Buffer,
    algorithm: EncryptionAlgorithm = 'aes-256-gcm'
  ): Promise<{ encrypted: Buffer; tag: Buffer }> {
    switch (algorithm) {
      case 'aes-256-gcm':
        return this.encryptAesGcm(data, key, iv);
      case 'chacha20-poly1305':
        return this.encryptChaCha20Poly1305(data, key, iv);
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * Decrypt data with a raw key
   */
  static async decryptWithKey(
    encryptedData: Buffer,
    key: Buffer,
    iv: Buffer,
    tag: Buffer,
    algorithm: EncryptionAlgorithm = 'aes-256-gcm'
  ): Promise<Buffer> {
    switch (algorithm) {
      case 'aes-256-gcm':
        return this.decryptAesGcm(encryptedData, key, iv, tag);
      case 'chacha20-poly1305':
        return this.decryptChaCha20Poly1305(encryptedData, key, iv, tag);
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * Derive encryption key from password
   */
  static async deriveKey(
    password: string,
    salt: Buffer,
    config: Partial<EncryptionConfig> = {}
  ): Promise<KeyMaterial> {
    const cfg = { ...this.DEFAULT_CONFIG, ...config };
    
    switch (cfg.kdf) {
      case 'pbkdf2':
        return this.deriveKeyPbkdf2(password, salt, cfg.iterations);
      case 'scrypt':
        return this.deriveKeyScrypt(password, salt, cfg.iterations);
      case 'argon2':
        return this.deriveKeyArgon2(password, salt, cfg.iterations);
      default:
        throw new Error(`Unsupported KDF: ${cfg.kdf}`);
    }
  }

  /**
   * Generate cryptographically secure random bytes
   */
  static generateRandomBytes(size: number): Buffer {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      // Browser environment
      const array = new Uint8Array(size);
      crypto.getRandomValues(array);
      return Buffer.from(array);
    }

    if (typeof require !== 'undefined') {
      try {
        const crypto = require('crypto');
        return crypto.randomBytes(size);
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback (not cryptographically secure)
    console.warn('Using insecure random number generation');
    const array = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return Buffer.from(array);
  }

  /**
   * Serialize encrypted data for storage
   */
  static serializeEncryptedData(encryptedData: EncryptedData): Buffer {
    const header = {
      version: encryptedData.version,
      algorithm: encryptedData.algorithm,
      kdf: encryptedData.kdf,
      iterations: encryptedData.kdfParams.iterations,
      saltSize: encryptedData.kdfParams.salt.length,
      ivSize: encryptedData.iv.length,
      tagSize: encryptedData.tag.length,
      dataSize: encryptedData.data.length,
    };

    const headerJson = JSON.stringify(header);
    const headerSize = Buffer.byteLength(headerJson, 'utf8');
    const headerSizeBuffer = Buffer.allocUnsafe(4);
    headerSizeBuffer.writeUInt32LE(headerSize, 0);

    return Buffer.concat([
      headerSizeBuffer,
      Buffer.from(headerJson, 'utf8'),
      encryptedData.kdfParams.salt,
      encryptedData.iv,
      encryptedData.tag,
      encryptedData.data,
    ]);
  }

  /**
   * Deserialize encrypted data from storage
   */
  static deserializeEncryptedData(serialized: Buffer): EncryptedData {
    let offset = 0;
    
    // Read header size
    const headerSize = serialized.readUInt32LE(offset);
    offset += 4;
    
    // Read header
    const headerJson = serialized.subarray(offset, offset + headerSize).toString('utf8');
    const header = JSON.parse(headerJson);
    offset += headerSize;
    
    // Read salt
    const salt = serialized.subarray(offset, offset + header.saltSize);
    offset += header.saltSize;
    
    // Read IV
    const iv = serialized.subarray(offset, offset + header.ivSize);
    offset += header.ivSize;
    
    // Read tag
    const tag = serialized.subarray(offset, offset + header.tagSize);
    offset += header.tagSize;
    
    // Read data
    const data = serialized.subarray(offset, offset + header.dataSize);
    
    return {
      data,
      algorithm: header.algorithm,
      kdf: header.kdf,
      kdfParams: {
        salt,
        iterations: header.iterations,
      },
      iv,
      tag,
      version: header.version,
    };
  }

  /**
   * AES-256-GCM encryption
   */
  private static async encryptAesGcm(
    data: Buffer,
    key: Buffer,
    iv: Buffer
  ): Promise<{ encrypted: Buffer; tag: Buffer }> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Web Crypto API
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data
      );

      // Extract tag (last 16 bytes) and data
      const encryptedArray = new Uint8Array(encrypted);
      const tag = encryptedArray.slice(-16);
      const ciphertext = encryptedArray.slice(0, -16);
      
      return {
        encrypted: Buffer.from(ciphertext),
        tag: Buffer.from(tag),
      };
    }

    if (typeof require !== 'undefined') {
      try {
        const crypto = require('crypto');
        const cipher = crypto.createCipher('aes-256-gcm', key);
        cipher.setAAD(Buffer.from('tari-wallet', 'utf8'));
        
        const encrypted = Buffer.concat([
          cipher.update(data),
          cipher.final()
        ]);
        
        const tag = cipher.getAuthTag();
        
        return { encrypted, tag };
      } catch (error) {
        throw new Error(`AES-GCM encryption failed: ${error}`);
      }
    }

    throw new Error('No encryption implementation available');
  }

  /**
   * AES-256-GCM decryption
   */
  private static async decryptAesGcm(
    encryptedData: Buffer,
    key: Buffer,
    iv: Buffer,
    tag: Buffer
  ): Promise<Buffer> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Web Crypto API
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Combine data and tag for Web Crypto
      const combined = new Uint8Array(encryptedData.length + tag.length);
      combined.set(encryptedData);
      combined.set(tag, encryptedData.length);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        combined
      );
      
      return Buffer.from(decrypted);
    }

    if (typeof require !== 'undefined') {
      try {
        const crypto = require('crypto');
        const decipher = crypto.createDecipher('aes-256-gcm', key);
        decipher.setAAD(Buffer.from('tari-wallet', 'utf8'));
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([
          decipher.update(encryptedData),
          decipher.final()
        ]);
        
        return decrypted;
      } catch (error) {
        throw new Error(`AES-GCM decryption failed: ${error}`);
      }
    }

    throw new Error('No decryption implementation available');
  }

  /**
   * ChaCha20-Poly1305 encryption (placeholder)
   */
  private static async encryptChaCha20Poly1305(
    data: Buffer,
    key: Buffer,
    iv: Buffer
  ): Promise<{ encrypted: Buffer; tag: Buffer }> {
    // ChaCha20-Poly1305 is not widely supported in Web Crypto
    // This would require a JavaScript implementation or native module
    throw new Error('ChaCha20-Poly1305 not implemented');
  }

  /**
   * ChaCha20-Poly1305 decryption (placeholder)
   */
  private static async decryptChaCha20Poly1305(
    encryptedData: Buffer,
    key: Buffer,
    iv: Buffer,
    tag: Buffer
  ): Promise<Buffer> {
    throw new Error('ChaCha20-Poly1305 not implemented');
  }

  /**
   * PBKDF2 key derivation
   */
  private static async deriveKeyPbkdf2(
    password: string,
    salt: Buffer,
    iterations: number
  ): Promise<KeyMaterial> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Web Crypto API
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        256 // 32 bytes * 8 bits
      );

      return {
        key: Buffer.from(derivedBits),
        salt,
        kdfParams: { iterations },
      };
    }

    if (typeof require !== 'undefined') {
      try {
        const crypto = require('crypto');
        const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
        
        return {
          key,
          salt,
          kdfParams: { iterations },
        };
      } catch (error) {
        throw new Error(`PBKDF2 derivation failed: ${error}`);
      }
    }

    throw new Error('No key derivation implementation available');
  }

  /**
   * Scrypt key derivation (placeholder)
   */
  private static async deriveKeyScrypt(
    password: string,
    salt: Buffer,
    cost: number
  ): Promise<KeyMaterial> {
    // Scrypt is not in Web Crypto API
    // Would need JavaScript implementation or native module
    throw new Error('Scrypt not implemented');
  }

  /**
   * Argon2 key derivation (placeholder)
   */
  private static async deriveKeyArgon2(
    password: string,
    salt: Buffer,
    iterations: number
  ): Promise<KeyMaterial> {
    // Argon2 is not in Web Crypto API
    // Would need JavaScript implementation or native module
    throw new Error('Argon2 not implemented');
  }
}

/**
 * Convenience function for encrypting data
 */
export async function encryptData(
  data: Buffer,
  password: string,
  config?: Partial<EncryptionConfig>
): Promise<Buffer> {
  const encrypted = await EncryptionUtils.encrypt(data, password, config);
  return EncryptionUtils.serializeEncryptedData(encrypted);
}

/**
 * Convenience function for decrypting data
 */
export async function decryptData(
  encryptedBuffer: Buffer,
  password: string
): Promise<Buffer> {
  const encryptedData = EncryptionUtils.deserializeEncryptedData(encryptedBuffer);
  return EncryptionUtils.decrypt(encryptedData, password);
}
