/**
 * @fileoverview Emoji ID conversion utilities
 * 
 * Provides bidirectional conversion between Tari addresses and emoji IDs
 * with caching and validation.
 */

import {
  TariAddress as CoreTariAddress,
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type NetworkType
} from '@tari-project/tarijs-core';
import type { EmojiConversionOptions } from './types.js';

/**
 * Conversion result with metadata
 */
export interface ConversionResult {
  /** Converted value */
  result: string;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Conversion timestamp */
  convertedAt: Date;
  /** Source format */
  sourceFormat: 'address' | 'emoji';
  /** Network used for conversion */
  network: NetworkType;
}

/**
 * Conversion cache entry
 */
interface ConversionCacheEntry {
  result: string;
  timestamp: Date;
  accessCount: number;
  network: NetworkType;
}

/**
 * LRU cache for emoji conversions
 */
class EmojiConversionCache {
  private cache = new Map<string, ConversionCacheEntry>();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(maxSize = 150, ttl = 15 * 60 * 1000) { // 15 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string, network: NetworkType): string | null {
    const entry = this.cache.get(key);
    if (!entry || entry.network !== network) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp.getTime() > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;

    return entry.result;
  }

  set(key: string, result: string, network: NetworkType): void {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.findLeastRecentlyUsed();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      result,
      timestamp: new Date(),
      accessCount: 1,
      network
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; totalAccesses: number } {
    let totalAccesses = 0;
    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
    }

    return {
      size: this.cache.size,
      totalAccesses
    };
  }

  private findLeastRecentlyUsed(): string | null {
    let lruKey: string | null = null;
    let lruScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Score based on recency and access count (lower is worse)
      const score = entry.accessCount * (Date.now() - entry.timestamp.getTime());
      if (score < lruScore) {
        lruScore = score;
        lruKey = key;
      }
    }

    return lruKey;
  }
}

/**
 * Emoji ID converter with FFI integration and caching
 */
export class EmojiConverter {
  private readonly cache: EmojiConversionCache;
  private isDestroyed = false;
  private stats = {
    conversions: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0
  };

  constructor() {
    this.cache = new EmojiConversionCache();
  }

  /**
   * Convert Tari address to emoji ID
   */
  async addressToEmoji(
    address: CoreTariAddress, 
    options: EmojiConversionOptions = { network: 'testnet' }
  ): Promise<ConversionResult> {
    this.ensureNotDestroyed();

    const addressStr = address.toString();
    const cacheKey = `addr2emoji:${addressStr}`;

    // Check cache first if enabled
    if (options.useCache !== false) {
      const cached = this.cache.get(cacheKey, options.network);
      if (cached) {
        this.stats.cacheHits++;
        return {
          result: cached,
          fromCache: true,
          convertedAt: new Date(),
          sourceFormat: 'address',
          network: options.network
        };
      }
    }

    try {
      this.stats.cacheMisses++;
      this.stats.conversions++;

      // Validate input if requested
      if (options.validateInput) {
        const bindings = getFFIBindings();
        const isValid = await bindings.validateAddress(addressStr, options.network);
        if (!isValid) {
          throw new WalletError(
            WalletErrorCode.InvalidAddress,
            'Invalid address provided for emoji conversion',
            {
              severity: ErrorSeverity.Error,
              context: { 
                operation: 'addressToEmoji',
                component: 'EmojiConverter',
                addressPreview: addressStr.substring(0, 20) + '...'
              }
            }
          );
        }
      }

      // Perform FFI conversion
      const bindings = getFFIBindings();
      const emojiId = await bindings.addressToEmojiId(addressStr);

      // Cache the result
      if (options.useCache !== false) {
        this.cache.set(cacheKey, emojiId, options.network);
      }

      return {
        result: emojiId,
        fromCache: false,
        convertedAt: new Date(),
        sourceFormat: 'address',
        network: options.network
      };
    } catch (error) {
      this.stats.errors++;
      
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to convert address to emoji ID',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { 
            operation: 'addressToEmoji',
            component: 'EmojiConverter',
            network: options.network,
            hasAddress: !!address
          }
        }
      );
    }
  }

  /**
   * Convert emoji ID to Tari address
   */
  async emojiToAddress(
    emojiId: string,
    options: EmojiConversionOptions = { network: 'testnet' }
  ): Promise<ConversionResult> {
    this.ensureNotDestroyed();

    const cacheKey = `emoji2addr:${emojiId}`;

    // Check cache first if enabled
    if (options.useCache !== false) {
      const cached = this.cache.get(cacheKey, options.network);
      if (cached) {
        this.stats.cacheHits++;
        return {
          result: cached,
          fromCache: true,
          convertedAt: new Date(),
          sourceFormat: 'emoji',
          network: options.network
        };
      }
    }

    try {
      this.stats.cacheMisses++;
      this.stats.conversions++;

      // Validate emoji ID format if requested
      if (options.validateInput) {
        this.validateEmojiId(emojiId);
      }

      // Perform FFI conversion
      const bindings = getFFIBindings();
      const address = await bindings.emojiIdToAddress(emojiId, options.network);

      // Cache the result
      if (options.useCache !== false) {
        this.cache.set(cacheKey, address, options.network);
      }

      return {
        result: address,
        fromCache: false,
        convertedAt: new Date(),
        sourceFormat: 'emoji',
        network: options.network
      };
    } catch (error) {
      this.stats.errors++;
      
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to convert emoji ID to address',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { 
            operation: 'emojiToAddress',
            component: 'EmojiConverter',
            network: options.network,
            emojiLength: emojiId.length
          }
        }
      );
    }
  }

  /**
   * Validate emoji ID format
   */
  validateEmojiId(emojiId: string): boolean {
    this.ensureNotDestroyed();

    if (!emojiId || typeof emojiId !== 'string') {
      throw new WalletError(
        WalletErrorCode.InvalidEmojiId,
        'Emoji ID must be a non-empty string',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'validateEmojiId',
            component: 'EmojiConverter'
          }
        }
      );
    }

    // Check for proper emoji length (33 emoji characters)
    const emojiArray = Array.from(emojiId);
    if (emojiArray.length !== 33) {
      throw new WalletError(
        WalletErrorCode.InvalidEmojiId,
        `Emoji ID must be exactly 33 emoji characters, got ${emojiArray.length}`,
        {
          severity: ErrorSeverity.Error,
          context: { 
            operation: 'validateEmojiId',
            component: 'EmojiConverter',
            actualLength: emojiArray.length
          }
        }
      );
    }

    // Check that all characters are emoji
    const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]{33}$/u;
    if (!emojiRegex.test(emojiId)) {
      throw new WalletError(
        WalletErrorCode.InvalidEmojiId,
        'Emoji ID contains invalid characters',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'validateEmojiId',
            component: 'EmojiConverter'
          }
        }
      );
    }

    return true;
  }

  /**
   * Clear conversion cache
   */
  clearCache(): void {
    this.ensureNotDestroyed();
    this.cache.clear();
  }

  /**
   * Get conversion statistics
   */
  getStats(): typeof this.stats & { cacheStats: { size: number; totalAccesses: number } } {
    this.ensureNotDestroyed();
    
    return {
      ...this.stats,
      cacheStats: this.cache.getStats()
    };
  }

  /**
   * Get cache hit ratio
   */
  getCacheHitRatio(): number {
    this.ensureNotDestroyed();
    
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return total > 0 ? this.stats.cacheHits / total : 0;
  }

  /**
   * Destroy the converter and cleanup resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.cache.clear();
    this.isDestroyed = true;
  }

  /**
   * Check if the converter has been destroyed
   */
  get destroyed(): boolean {
    return this.isDestroyed;
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Emoji converter has been destroyed',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'emojiConverter',
            component: 'EmojiConverter'
          }
        }
      );
    }
  }
}

export type { EmojiConversionOptions };
