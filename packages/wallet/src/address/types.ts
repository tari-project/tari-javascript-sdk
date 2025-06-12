/**
 * @fileoverview Address service types and interfaces
 */

import type { 
  TariAddress as CoreTariAddress,
  AddressFormat, 
  NetworkType 
} from '@tari-project/tarijs-core';

/**
 * Address service configuration
 */
export interface AddressServiceConfig {
  /** Cache size limit for address entries */
  cacheSize?: number;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /** Network type for address validation */
  network: NetworkType;
  /** Enable automatic cache cleanup */
  autoCleanup?: boolean;
}

/**
 * Address formatting options
 */
export interface FormattingOptions {
  /** Target format for display */
  format: AddressFormat;
  /** Include checksum in formatted output */
  includeChecksum?: boolean;
  /** Truncate long addresses for display */
  truncate?: {
    /** Maximum display length */
    maxLength: number;
    /** Characters to show from start */
    startChars: number;
    /** Characters to show from end */
    endChars: number;
    /** Separator string */
    separator?: string;
  };
  /** Convert to uppercase */
  uppercase?: boolean;
  /** Include network prefix */
  includeNetworkPrefix?: boolean;
}

/**
 * Emoji conversion options
 */
export interface EmojiConversionOptions {
  /** Network type for conversion */
  network: NetworkType;
  /** Validate input before conversion */
  validateInput?: boolean;
  /** Use cached result if available */
  useCache?: boolean;
  /** Custom emoji set (if supported) */
  emojiSet?: string;
}

/**
 * Formatted address result
 */
export interface FormattedAddress {
  /** Original address */
  original: CoreTariAddress;
  /** Formatted display string */
  formatted: string;
  /** Format used */
  format: AddressFormat;
  /** Whether address was truncated */
  truncated: boolean;
  /** Timestamp when formatted */
  formattedAt: Date;
}

/**
 * Address cache entry
 */
export interface AddressCacheEntry {
  /** Cached address */
  address: CoreTariAddress;
  /** Cache timestamp */
  cachedAt: Date;
  /** Number of times accessed */
  accessCount: number;
  /** Last access timestamp */
  lastAccessed: Date;
  /** Entry size in bytes (estimated) */
  estimatedSize: number;
}

/**
 * Address validation context
 */
export interface AddressValidationContext {
  /** Network type for validation */
  network: NetworkType;
  /** Expected address format */
  expectedFormat?: AddressFormat;
  /** Strict validation mode */
  strict?: boolean;
  /** Include warning details */
  includeWarnings?: boolean;
}

/**
 * Address statistics for monitoring
 */
export interface AddressServiceStats {
  /** Total cache hits */
  cacheHits: number;
  /** Total cache misses */
  cacheMisses: number;
  /** Current cache size */
  cacheSize: number;
  /** Cache hit ratio */
  hitRatio: number;
  /** Total FFI calls made */
  ffiCalls: number;
  /** Total conversion errors */
  conversionErrors: number;
  /** Memory usage estimate in bytes */
  estimatedMemoryUsage: number;
}
