import { randomFillSync } from 'crypto';
import { DisposableResource } from './disposable';

/**
 * SecureBuffer class for handling sensitive data like seeds, passwords, and private keys
 * Automatically zeros memory on disposal and prevents accidental exposure
 */
export class SecureBuffer extends DisposableResource {
  private buffer: Buffer;
  private cleared = false;
  private readonly originalLength: number;
  private readonly createdAt: number;

  constructor(data: Buffer | string | Uint8Array) {
    super();
    
    // Convert input to Buffer
    if (Buffer.isBuffer(data)) {
      this.buffer = Buffer.from(data);
    } else if (typeof data === 'string') {
      this.buffer = Buffer.from(data, 'utf8');
    } else if (data instanceof Uint8Array) {
      this.buffer = Buffer.from(data);
    } else {
      throw new Error('Invalid data type for SecureBuffer');
    }
    
    this.originalLength = this.buffer.length;
    this.createdAt = Date.now();

    // Attempt to lock memory pages (platform-specific, may fail silently)
    this.tryLockMemory();
  }

  /**
   * Create SecureBuffer from string
   */
  static fromString(str: string): SecureBuffer {
    return new SecureBuffer(str);
  }

  /**
   * Create SecureBuffer from hex string
   */
  static fromHex(hex: string): SecureBuffer {
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
      throw new Error('Invalid hex string');
    }
    return new SecureBuffer(Buffer.from(hex, 'hex'));
  }

  /**
   * Create SecureBuffer from base64 string
   */
  static fromBase64(base64: string): SecureBuffer {
    return new SecureBuffer(Buffer.from(base64, 'base64'));
  }

  /**
   * Create empty SecureBuffer of specified size
   */
  static alloc(size: number): SecureBuffer {
    if (size < 0 || !Number.isInteger(size)) {
      throw new Error('Size must be a non-negative integer');
    }
    return new SecureBuffer(Buffer.alloc(size));
  }

  /**
   * Create SecureBuffer filled with random data
   */
  static random(size: number): SecureBuffer {
    if (size < 0 || !Number.isInteger(size)) {
      throw new Error('Size must be a non-negative integer');
    }
    const buffer = Buffer.alloc(size);
    randomFillSync(buffer);
    return new SecureBuffer(buffer);
  }

  /**
   * Get the length of the buffer
   */
  get length(): number {
    this.checkDisposed();
    return this.cleared ? 0 : this.buffer.length;
  }

  /**
   * Check if the buffer has been cleared
   */
  get isCleared(): boolean {
    return this.cleared;
  }

  /**
   * Get creation timestamp
   */
  get createdAt(): number {
    return this.createdAt;
  }

  /**
   * Get age in milliseconds
   */
  get age(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Get a copy of the buffer data (creates new Buffer)
   * WARNING: This creates unprotected memory
   */
  copy(): Buffer {
    this.checkDisposed();
    if (this.cleared) {
      throw new Error('Cannot copy cleared SecureBuffer');
    }
    return Buffer.from(this.buffer);
  }

  /**
   * Get buffer as hex string
   * WARNING: Creates unprotected string in memory
   */
  toHex(): string {
    this.checkDisposed();
    if (this.cleared) {
      throw new Error('Cannot convert cleared SecureBuffer to hex');
    }
    return this.buffer.toString('hex');
  }

  /**
   * Get buffer as base64 string
   * WARNING: Creates unprotected string in memory
   */
  toBase64(): string {
    this.checkDisposed();
    if (this.cleared) {
      throw new Error('Cannot convert cleared SecureBuffer to base64');
    }
    return this.buffer.toString('base64');
  }

  /**
   * Get buffer as UTF-8 string
   * WARNING: Creates unprotected string in memory
   */
  toString(): string {
    this.checkDisposed();
    if (this.cleared) {
      return '[SecureBuffer: cleared]';
    }
    return '[SecureBuffer: ***]';
  }

  /**
   * Get buffer as UTF-8 string (unsafe)
   * WARNING: Creates unprotected string in memory
   */
  toStringUnsafe(): string {
    this.checkDisposed();
    if (this.cleared) {
      throw new Error('Cannot convert cleared SecureBuffer to string');
    }
    return this.buffer.toString('utf8');
  }

  /**
   * Compare with another SecureBuffer using constant-time comparison
   */
  equals(other: SecureBuffer): boolean {
    this.checkDisposed();
    other.checkDisposed();
    
    if (this.cleared || other.cleared) {
      return false;
    }
    
    if (this.buffer.length !== other.buffer.length) {
      return false;
    }
    
    // Constant-time comparison
    let result = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      result |= this.buffer[i] ^ other.buffer[i];
    }
    
    return result === 0;
  }

  /**
   * Compare with raw buffer using constant-time comparison
   */
  equalsBuffer(other: Buffer): boolean {
    this.checkDisposed();
    
    if (this.cleared) {
      return false;
    }
    
    if (this.buffer.length !== other.length) {
      return false;
    }
    
    // Constant-time comparison
    let result = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      result |= this.buffer[i] ^ other[i];
    }
    
    return result === 0;
  }

  /**
   * Slice the buffer (creates new SecureBuffer)
   */
  slice(start?: number, end?: number): SecureBuffer {
    this.checkDisposed();
    if (this.cleared) {
      throw new Error('Cannot slice cleared SecureBuffer');
    }
    return new SecureBuffer(this.buffer.slice(start, end));
  }

  /**
   * Concatenate with another SecureBuffer
   */
  concat(other: SecureBuffer): SecureBuffer {
    this.checkDisposed();
    other.checkDisposed();
    
    if (this.cleared || other.cleared) {
      throw new Error('Cannot concatenate cleared SecureBuffer');
    }
    
    return new SecureBuffer(Buffer.concat([this.buffer, other.buffer]));
  }

  /**
   * Fill buffer with specified value
   */
  fill(value: number | string | Buffer): this {
    this.checkDisposed();
    if (this.cleared) {
      throw new Error('Cannot fill cleared SecureBuffer');
    }
    this.buffer.fill(value);
    return this;
  }

  /**
   * Manually clear the buffer (same as dispose)
   */
  clear(): void {
    this[Symbol.dispose]();
  }

  /**
   * Synchronous disposal implementation
   */
  protected disposeSync(): void {
    if (!this.cleared && this.buffer) {
      try {
        // Fill with random data first
        randomFillSync(this.buffer);
        
        // Then zero out
        this.buffer.fill(0);
        
        // Mark as cleared
        this.cleared = true;
        
        if (process.env.NODE_ENV === 'development') {
          console.debug(`SecureBuffer cleared (${this.originalLength} bytes, age: ${this.age}ms)`);
        }
      } catch (error) {
        console.error('Error clearing SecureBuffer:', error);
        // Ensure we still mark as cleared even if randomFill fails
        this.cleared = true;
      }
    }
  }

  /**
   * Attempt to lock memory pages (platform-specific)
   */
  private tryLockMemory(): void {
    // This is a no-op in Node.js as there's no direct mlock equivalent
    // In a real implementation, you might use native addons for this
    // For now, we just document the intent
  }

  /**
   * Custom inspection for debugging (doesn't reveal contents)
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    if (this.cleared) {
      return 'SecureBuffer [cleared]';
    }
    return `SecureBuffer [${this.buffer.length} bytes, age: ${this.age}ms]`;
  }
}

/**
 * Utility functions for secure memory operations
 */
export class SecureMemoryUtils {
  /**
   * Securely compare two buffers using constant-time comparison
   */
  static constantTimeEquals(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    
    return result === 0;
  }

  /**
   * Securely zero a buffer
   */
  static secureZero(buffer: Buffer): void {
    try {
      // Fill with random data first
      randomFillSync(buffer);
      
      // Then zero out
      buffer.fill(0);
    } catch (error) {
      console.error('Error in secureZero:', error);
      // Fallback to just zeroing
      buffer.fill(0);
    }
  }

  /**
   * Create a secure copy of a buffer
   */
  static secureCopy(source: Buffer): SecureBuffer {
    return new SecureBuffer(source);
  }

  /**
   * XOR two buffers (for masking operations)
   */
  static xor(a: Buffer, b: Buffer): Buffer {
    if (a.length !== b.length) {
      throw new Error('Buffers must have the same length for XOR operation');
    }
    
    const result = Buffer.alloc(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    
    return result;
  }

  /**
   * Generate secure random bytes
   */
  static randomBytes(size: number): SecureBuffer {
    return SecureBuffer.random(size);
  }
}
