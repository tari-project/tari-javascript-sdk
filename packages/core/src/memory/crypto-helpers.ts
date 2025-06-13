import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { SecureBuffer } from './secure-buffer';

/**
 * Cryptographic helpers for secure memory operations
 */
export class CryptoHelpers {
  /**
   * Generate cryptographically secure random bytes
   */
  static randomBytes(size: number): SecureBuffer {
    return new SecureBuffer(randomBytes(size));
  }

  /**
   * Generate a secure random string using base64url encoding
   */
  static randomString(length: number): string {
    const bytes = Math.ceil(length * 3 / 4); // base64url overhead
    return randomBytes(bytes).toString('base64url').slice(0, length);
  }

  /**
   * Generate a secure random hex string
   */
  static randomHex(length: number): string {
    const bytes = Math.ceil(length / 2);
    return randomBytes(bytes).toString('hex').slice(0, length);
  }

  /**
   * Hash data using SHA-256
   */
  static sha256(data: Buffer | SecureBuffer | string): SecureBuffer {
    const hash = createHash('sha256');
    
    if (data instanceof SecureBuffer) {
      hash.update(data.copy());
    } else if (Buffer.isBuffer(data)) {
      hash.update(data);
    } else {
      hash.update(data, 'utf8');
    }
    
    return new SecureBuffer(hash.digest());
  }

  /**
   * Hash data using SHA-512
   */
  static sha512(data: Buffer | SecureBuffer | string): SecureBuffer {
    const hash = createHash('sha512');
    
    if (data instanceof SecureBuffer) {
      hash.update(data.copy());
    } else if (Buffer.isBuffer(data)) {
      hash.update(data);
    } else {
      hash.update(data, 'utf8');
    }
    
    return new SecureBuffer(hash.digest());
  }

  /**
   * Compute HMAC-SHA256
   */
  static hmacSha256(key: Buffer | SecureBuffer, data: Buffer | SecureBuffer | string): SecureBuffer {
    const keyBuffer = key instanceof SecureBuffer ? key.copy() : key;
    const hmac = createHmac('sha256', keyBuffer);
    
    if (data instanceof SecureBuffer) {
      hmac.update(data.copy());
    } else if (Buffer.isBuffer(data)) {
      hmac.update(data);
    } else {
      hmac.update(data, 'utf8');
    }
    
    return new SecureBuffer(hmac.digest());
  }

  /**
   * Compute HMAC-SHA512
   */
  static hmacSha512(key: Buffer | SecureBuffer, data: Buffer | SecureBuffer | string): SecureBuffer {
    const keyBuffer = key instanceof SecureBuffer ? key.copy() : key;
    const hmac = createHmac('sha512', keyBuffer);
    
    if (data instanceof SecureBuffer) {
      hmac.update(data.copy());
    } else if (Buffer.isBuffer(data)) {
      hmac.update(data);
    } else {
      hmac.update(data, 'utf8');
    }
    
    return new SecureBuffer(hmac.digest());
  }

  /**
   * Derive key using PBKDF2 with SHA-256
   */
  static pbkdf2(
    password: Buffer | SecureBuffer | string,
    salt: Buffer | SecureBuffer,
    iterations: number,
    keyLength: number
  ): SecureBuffer {
    const crypto = require('crypto');
    
    const passwordBuffer = password instanceof SecureBuffer 
      ? password.copy() 
      : Buffer.isBuffer(password) 
        ? password 
        : Buffer.from(password, 'utf8');
    
    const saltBuffer = salt instanceof SecureBuffer ? salt.copy() : salt;
    
    return new SecureBuffer(
      crypto.pbkdf2Sync(passwordBuffer, saltBuffer, iterations, keyLength, 'sha256')
    );
  }

  /**
   * Derive key using PBKDF2 with SHA-512
   */
  static pbkdf2Sha512(
    password: Buffer | SecureBuffer | string,
    salt: Buffer | SecureBuffer,
    iterations: number,
    keyLength: number
  ): SecureBuffer {
    const crypto = require('crypto');
    
    const passwordBuffer = password instanceof SecureBuffer 
      ? password.copy() 
      : Buffer.isBuffer(password) 
        ? password 
        : Buffer.from(password, 'utf8');
    
    const saltBuffer = salt instanceof SecureBuffer ? salt.copy() : salt;
    
    return new SecureBuffer(
      crypto.pbkdf2Sync(passwordBuffer, saltBuffer, iterations, keyLength, 'sha512')
    );
  }

  /**
   * Timing-safe equality comparison
   */
  static timingSafeEqual(a: Buffer | SecureBuffer, b: Buffer | SecureBuffer): boolean {
    const bufferA = a instanceof SecureBuffer ? a.copy() : a;
    const bufferB = b instanceof SecureBuffer ? b.copy() : b;
    
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    
    return timingSafeEqual(bufferA, bufferB);
  }

  /**
   * XOR two buffers of equal length
   */
  static xor(a: Buffer | SecureBuffer, b: Buffer | SecureBuffer): SecureBuffer {
    const bufferA = a instanceof SecureBuffer ? a.copy() : a;
    const bufferB = b instanceof SecureBuffer ? b.copy() : b;
    
    if (bufferA.length !== bufferB.length) {
      throw new Error('Buffers must have equal length for XOR operation');
    }
    
    const result = Buffer.alloc(bufferA.length);
    for (let i = 0; i < bufferA.length; i++) {
      result[i] = bufferA[i] ^ bufferB[i];
    }
    
    return new SecureBuffer(result);
  }

  /**
   * Generate a salt for password hashing
   */
  static generateSalt(size: number = 32): SecureBuffer {
    return this.randomBytes(size);
  }

  /**
   * Hash a password with salt using PBKDF2
   */
  static hashPassword(
    password: string | SecureBuffer,
    salt?: SecureBuffer,
    iterations: number = 100000,
    keyLength: number = 64
  ): { hash: SecureBuffer; salt: SecureBuffer } {
    const actualSalt = salt || this.generateSalt();
    const hash = this.pbkdf2Sha512(password, actualSalt, iterations, keyLength);
    
    return { hash, salt: actualSalt };
  }

  /**
   * Verify a password against a hash
   */
  static verifyPassword(
    password: string | SecureBuffer,
    hash: SecureBuffer,
    salt: SecureBuffer,
    iterations: number = 100000,
    keyLength: number = 64
  ): boolean {
    const computedHash = this.pbkdf2Sha512(password, salt, iterations, keyLength);
    return this.timingSafeEqual(hash, computedHash);
  }

  /**
   * Generate a secure random ID
   */
  static generateId(length: number = 32): string {
    return this.randomString(length);
  }

  /**
   * Generate a UUID v4
   */
  static generateUUID(): string {
    const bytes = randomBytes(16);
    
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    
    const hex = bytes.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  static encrypt(
    data: Buffer | SecureBuffer | string,
    key: SecureBuffer,
    additionalData?: Buffer
  ): EncryptionResult {
    const crypto = require('crypto');
    
    if (key.length !== 32) {
      throw new Error('Key must be 32 bytes for AES-256');
    }
    
    const iv = randomBytes(12); // GCM recommended IV size
    const cipher = crypto.createCipherGCM('aes-256-gcm', key.copy(), iv);
    
    if (additionalData) {
      cipher.setAAD(additionalData);
    }
    
    let encrypted: Buffer;
    if (data instanceof SecureBuffer) {
      encrypted = cipher.update(data.copy());
    } else if (Buffer.isBuffer(data)) {
      encrypted = cipher.update(data);
    } else {
      encrypted = cipher.update(data, 'utf8');
    }
    
    cipher.final();
    const tag = cipher.getAuthTag();
    
    return {
      encrypted: new SecureBuffer(encrypted),
      iv: new SecureBuffer(iv),
      tag: new SecureBuffer(tag),
      additionalData: additionalData ? new SecureBuffer(additionalData) : undefined
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  static decrypt(
    encryptionResult: EncryptionResult,
    key: SecureBuffer
  ): SecureBuffer {
    const crypto = require('crypto');
    
    if (key.length !== 32) {
      throw new Error('Key must be 32 bytes for AES-256');
    }
    
    const decipher = crypto.createDecipherGCM(
      'aes-256-gcm',
      key.copy(),
      encryptionResult.iv.copy()
    );
    
    if (encryptionResult.additionalData) {
      decipher.setAAD(encryptionResult.additionalData.copy());
    }
    
    decipher.setAuthTag(encryptionResult.tag.copy());
    
    const decrypted = decipher.update(encryptionResult.encrypted.copy());
    decipher.final();
    
    return new SecureBuffer(decrypted);
  }

  /**
   * Wipe sensitive data from memory
   */
  static wipeMemory(buffer: Buffer): void {
    if (Buffer.isBuffer(buffer)) {
      // Fill with random data first
      try {
        randomBytes(buffer.length).copy(buffer);
      } catch {
        // Fallback to zeros if random fails
      }
      
      // Then zero out
      buffer.fill(0);
    }
  }
}

/**
 * Result of encryption operation
 */
export interface EncryptionResult {
  encrypted: SecureBuffer;
  iv: SecureBuffer;
  tag: SecureBuffer;
  additionalData?: SecureBuffer;
}

/**
 * Key derivation function utilities
 */
export class KDF {
  /**
   * HKDF (HMAC-based Key Derivation Function) implementation
   */
  static hkdf(
    ikm: SecureBuffer,        // Input Keying Material
    salt: SecureBuffer,       // Salt
    info: Buffer | string,    // Context info
    length: number            // Desired output length
  ): SecureBuffer {
    // Extract phase
    const prk = CryptoHelpers.hmacSha256(salt, ikm);
    
    // Expand phase
    const infoBuffer = Buffer.isBuffer(info) ? info : Buffer.from(info, 'utf8');
    const n = Math.ceil(length / 32); // SHA-256 output length
    
    let okm = Buffer.alloc(0);
    let t = Buffer.alloc(0);
    
    for (let i = 1; i <= n; i++) {
      const input = Buffer.concat([t, infoBuffer, Buffer.from([i])]);
      t = CryptoHelpers.hmacSha256(prk, input).copy();
      okm = Buffer.concat([okm, t]);
    }
    
    return new SecureBuffer(okm.slice(0, length));
  }

  /**
   * Scrypt key derivation function
   */
  static scrypt(
    password: string | SecureBuffer,
    salt: SecureBuffer,
    keyLength: number,
    options: {
      N?: number;  // CPU/memory cost parameter
      r?: number;  // Block size parameter
      p?: number;  // Parallelization parameter
    } = {}
  ): SecureBuffer {
    const crypto = require('crypto');
    
    const { N = 16384, r = 8, p = 1 } = options;
    
    const passwordBuffer = password instanceof SecureBuffer 
      ? password.copy() 
      : Buffer.from(password, 'utf8');
    
    const result = crypto.scryptSync(passwordBuffer, salt.copy(), keyLength, { N, r, p });
    return new SecureBuffer(result);
  }
}
