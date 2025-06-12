/**
 * @fileoverview Address formatting utilities for display
 * 
 * Provides formatted address output for different use cases including
 * truncation, uppercase conversion, and network prefix handling.
 */

import {
  TariAddress as CoreTariAddress,
  AddressFormat,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type NetworkType
} from '@tari-project/tarijs-core';
import type { FormattingOptions, FormattedAddress } from './types.js';

/**
 * Cache for formatted address strings
 */
class FormattingCache {
  private cache = new Map<string, { result: string; timestamp: Date }>();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(maxSize = 200, ttl = 10 * 60 * 1000) { // 10 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp.getTime() > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  set(key: string, result: string): void {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      result,
      timestamp: new Date()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp.getTime() < oldestTime) {
        oldestTime = entry.timestamp.getTime();
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}

/**
 * Address formatter with caching and multiple display options
 */
export class AddressFormatter {
  private readonly formattingCache: FormattingCache;
  private isDestroyed = false;

  constructor() {
    this.formattingCache = new FormattingCache();
  }

  /**
   * Format address for display with options
   */
  format(address: CoreTariAddress, options: FormattingOptions): FormattedAddress {
    this.ensureNotDestroyed();

    try {
      const cacheKey = this.createCacheKey(address, options);
      const cached = this.formattingCache.get(cacheKey);
      
      if (cached) {
        return {
          original: address,
          formatted: cached,
          format: options.format,
          truncated: this.isTruncated(cached, options),
          formattedAt: new Date()
        };
      }

      const formatted = this.formatAddress(address, options);
      this.formattingCache.set(cacheKey, formatted);

      return {
        original: address,
        formatted,
        format: options.format,
        truncated: this.isTruncated(formatted, options),
        formattedAt: new Date()
      };
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to format address',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { 
            operation: 'formatAddress',
            component: 'AddressFormatter',
            format: options.format,
            hasAddress: !!address
          }
        }
      );
    }
  }

  /**
   * Format address as emoji ID
   */
  formatAsEmoji(address: CoreTariAddress, network: NetworkType): FormattedAddress {
    return this.format(address, {
      format: AddressFormat.Emoji,
      includeNetworkPrefix: true
    });
  }

  /**
   * Format address as base58 with truncation for UI display
   */
  formatForUI(address: CoreTariAddress, maxLength = 20): FormattedAddress {
    return this.format(address, {
      format: AddressFormat.Base58,
      truncate: {
        maxLength,
        startChars: 8,
        endChars: 8,
        separator: '...'
      }
    });
  }

  /**
   * Format address for QR code generation
   */
  formatForQR(address: CoreTariAddress, network: NetworkType): FormattedAddress {
    return this.format(address, {
      format: AddressFormat.Base58,
      includeNetworkPrefix: true,
      uppercase: false
    });
  }

  /**
   * Format address for export/sharing
   */
  formatForExport(address: CoreTariAddress): FormattedAddress {
    return this.format(address, {
      format: AddressFormat.Base58,
      includeChecksum: true,
      includeNetworkPrefix: true
    });
  }

  /**
   * Clear formatting cache
   */
  clearCache(): void {
    this.ensureNotDestroyed();
    this.formattingCache.clear();
  }

  /**
   * Destroy the formatter and cleanup resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.formattingCache.clear();
    this.isDestroyed = true;
  }

  /**
   * Check if the formatter has been destroyed
   */
  get destroyed(): boolean {
    return this.isDestroyed;
  }

  private formatAddress(address: CoreTariAddress, options: FormattingOptions): string {
    // Get the address string in the desired format
    let addressStr: string;
    
    switch (options.format) {
      case AddressFormat.Emoji:
        addressStr = address.emoji;
        break;
      case AddressFormat.Base58:
        addressStr = address.base58;
        break;
      case AddressFormat.Hex:
        addressStr = address.hex;
        break;
      default:
        addressStr = address.toString();
    }

    // Apply transformations
    if (options.uppercase) {
      addressStr = addressStr.toUpperCase();
    }

    // Add network prefix if requested
    if (options.includeNetworkPrefix) {
      // Note: Core TariAddress doesn't expose network directly
      // For now, we'll use a default network format
      addressStr = `tari://testnet/${addressStr}`;
    }

    // Apply truncation if specified
    if (options.truncate && addressStr.length > options.truncate.maxLength) {
      const { startChars, endChars, separator = '...' } = options.truncate;
      const start = addressStr.substring(0, startChars);
      const end = addressStr.substring(addressStr.length - endChars);
      addressStr = `${start}${separator}${end}`;
    }

    return addressStr;
  }

  private createCacheKey(address: CoreTariAddress, options: FormattingOptions): string {
    const addressKey = address.toString();
    const optionsKey = JSON.stringify(options);
    return `${addressKey}:${optionsKey}`;
  }

  private isTruncated(formatted: string, options: FormattingOptions): boolean {
    return !!(options.truncate && formatted.includes(options.truncate.separator || '...'));
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Address formatter has been destroyed',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'addressFormatter',
            component: 'AddressFormatter'
          }
        }
      );
    }
  }
}

export type { FormattingOptions };
