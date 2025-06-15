import { createHash } from 'crypto';

/**
 * Cache key generation utilities for complex queries
 * Provides consistent, collision-resistant keys for caching
 */

/**
 * Key generation options
 */
export interface KeyOptions {
  /** Include timestamp in key (for time-sensitive queries) */
  includeTimestamp?: boolean;
  /** Timestamp granularity in milliseconds */
  timestampGranularity?: number;
  /** Maximum key length */
  maxLength?: number;
  /** Enable key compression */
  compress?: boolean;
  /** Custom prefix for the key */
  prefix?: string;
  /** Custom suffix for the key */
  suffix?: string;
}

/**
 * Key component for building complex cache keys
 */
export interface KeyComponent {
  name: string;
  value: any;
  sensitive?: boolean; // If true, value will be hashed
}

/**
 * Cache key builder for complex scenarios
 */
export class CacheKeyBuilder {
  private components: KeyComponent[] = [];
  private options: KeyOptions = {};

  constructor(options: KeyOptions = {}) {
    this.options = {
      includeTimestamp: false,
      timestampGranularity: 60000, // 1 minute
      maxLength: 250,
      compress: false,
      ...options
    };
  }

  /**
   * Add a component to the key
   */
  add(name: string, value: any, sensitive: boolean = false): this {
    this.components.push({ name, value, sensitive });
    return this;
  }

  /**
   * Add multiple components at once
   */
  addAll(components: Record<string, any>, sensitiveKeys: string[] = []): this {
    for (const [name, value] of Object.entries(components)) {
      this.add(name, value, sensitiveKeys.includes(name));
    }
    return this;
  }

  /**
   * Add a function name component
   */
  function(name: string): this {
    return this.add('function', name);
  }

  /**
   * Add user/wallet identifier
   */
  user(userId: string): this {
    return this.add('user', userId, true);
  }

  /**
   * Add query parameters
   */
  params(params: Record<string, any>): this {
    return this.add('params', params);
  }

  /**
   * Add filter criteria
   */
  filter(filter: Record<string, any>): this {
    return this.add('filter', filter);
  }

  /**
   * Add pagination info
   */
  pagination(page: number, limit: number): this {
    return this.add('pagination', { page, limit });
  }

  /**
   * Add time-based component
   */
  timeWindow(windowMs: number): this {
    if (this.options.includeTimestamp) {
      const window = Math.floor(Date.now() / windowMs) * windowMs;
      return this.add('timeWindow', window);
    }
    return this;
  }

  /**
   * Build the final cache key
   */
  build(): string {
    const keyParts: string[] = [];

    // Add prefix if specified
    if (this.options.prefix) {
      keyParts.push(this.options.prefix);
    }

    // Process components
    for (const component of this.components) {
      const part = this.processComponent(component);
      if (part) {
        keyParts.push(part);
      }
    }

    // Add timestamp if requested
    if (this.options.includeTimestamp && this.options.timestampGranularity) {
      const timestamp = Math.floor(Date.now() / this.options.timestampGranularity);
      keyParts.push(`t:${timestamp}`);
    }

    // Add suffix if specified
    if (this.options.suffix) {
      keyParts.push(this.options.suffix);
    }

    let key = keyParts.join(':');

    // Apply compression if needed
    if (this.options.compress || (this.options.maxLength && key.length > this.options.maxLength)) {
      key = this.compressKey(key);
    }

    // Ensure key doesn't exceed max length
    if (this.options.maxLength && key.length > this.options.maxLength) {
      key = key.substring(0, this.options.maxLength);
    }

    return key;
  }

  /**
   * Process a single component
   */
  private processComponent(component: KeyComponent): string {
    const { name, value, sensitive } = component;

    if (value === null || value === undefined) {
      return '';
    }

    let stringValue: string;

    if (typeof value === 'object') {
      stringValue = JSON.stringify(this.sortObject(value));
    } else {
      stringValue = String(value);
    }

    // Hash sensitive values
    if (sensitive) {
      stringValue = this.hashValue(stringValue);
    }

    return `${name}:${stringValue}`;
  }

  /**
   * Sort object keys for consistent serialization
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object' || obj instanceof Date) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObject(obj[key]);
    }

    return sorted;
  }

  /**
   * Hash a value for sensitive data
   */
  private hashValue(value: string): string {
    return createHash('sha256')
      .update(value)
      .digest('hex')
      .substring(0, 16); // Use first 16 characters for brevity
  }

  /**
   * Compress a key using hash
   */
  private compressKey(key: string): string {
    if (key.length <= 32) return key;
    
    // Keep a readable prefix and compress the rest
    const prefix = key.split(':')[0];
    const hash = createHash('sha256').update(key).digest('hex').substring(0, 24);
    
    return `${prefix}:${hash}`;
  }
}

/**
 * Utility functions for common cache key patterns
 */
export class CacheKeys {
  /**
   * Generate key for balance queries
   */
  static balance(walletId: string, includeUnconfirmed: boolean = false): string {
    return new CacheKeyBuilder({ prefix: 'balance' })
      .user(walletId)
      .add('unconfirmed', includeUnconfirmed)
      .timeWindow(30000) // 30 second windows
      .build();
  }

  /**
   * Generate key for transaction queries
   */
  static transactions(
    walletId: string,
    filter: { status?: string; limit?: number; offset?: number } = {}
  ): string {
    return new CacheKeyBuilder({ prefix: 'txns' })
      .user(walletId)
      .filter(filter)
      .build();
  }

  /**
   * Generate key for transaction history queries
   */
  static transactionHistory(
    walletId: string,
    page: number,
    limit: number,
    filters: Record<string, any> = {}
  ): string {
    return new CacheKeyBuilder({ prefix: 'txn-history' })
      .user(walletId)
      .pagination(page, limit)
      .filter(filters)
      .build();
  }

  /**
   * Generate key for contact queries
   */
  static contacts(walletId: string, searchTerm?: string): string {
    const builder = new CacheKeyBuilder({ prefix: 'contacts' })
      .user(walletId);
    
    if (searchTerm) {
      builder.add('search', searchTerm);
    }
    
    return builder.build();
  }

  /**
   * Generate key for specific contact
   */
  static contact(walletId: string, contactId: string): string {
    return new CacheKeyBuilder({ prefix: 'contact' })
      .user(walletId)
      .add('id', contactId)
      .build();
  }

  /**
   * Generate key for UTXO queries
   */
  static utxos(
    walletId: string,
    filter: {
      status?: string[];
      minValue?: number;
      maxValue?: number;
      features?: string[];
    } = {}
  ): string {
    return new CacheKeyBuilder({ prefix: 'utxos' })
      .user(walletId)
      .filter(filter)
      .build();
  }

  /**
   * Generate key for UTXO statistics
   */
  static utxoStats(walletId: string): string {
    return new CacheKeyBuilder({ prefix: 'utxo-stats' })
      .user(walletId)
      .timeWindow(60000) // 1 minute windows
      .build();
  }

  /**
   * Generate key for fee estimation
   */
  static feeEstimate(
    txType: string,
    priority: string,
    outputs: number
  ): string {
    return new CacheKeyBuilder({ 
      prefix: 'fee-estimate',
      includeTimestamp: true,
      timestampGranularity: 300000 // 5 minutes
    })
      .add('type', txType)
      .add('priority', priority)
      .add('outputs', outputs)
      .build();
  }

  /**
   * Generate key for network info
   */
  static networkInfo(): string {
    return new CacheKeyBuilder({ 
      prefix: 'network-info',
      includeTimestamp: true,
      timestampGranularity: 60000 // 1 minute
    }).build();
  }

  /**
   * Generate key for node status
   */
  static nodeStatus(nodeId?: string): string {
    const builder = new CacheKeyBuilder({ 
      prefix: 'node-status',
      includeTimestamp: true,
      timestampGranularity: 30000 // 30 seconds
    });
    
    if (nodeId) {
      builder.add('node', nodeId);
    }
    
    return builder.build();
  }

  /**
   * Generate key for wallet info
   */
  static walletInfo(walletId: string): string {
    return new CacheKeyBuilder({ prefix: 'wallet-info' })
      .user(walletId)
      .timeWindow(300000) // 5 minute windows
      .build();
  }

  /**
   * Generate key for sync status
   */
  static syncStatus(walletId: string): string {
    return new CacheKeyBuilder({ 
      prefix: 'sync-status',
      includeTimestamp: true,
      timestampGranularity: 10000 // 10 seconds
    })
      .user(walletId)
      .build();
  }

  /**
   * Generate key for coin split/join operations
   */
  static coinOperation(
    walletId: string,
    operation: 'split' | 'join',
    params: Record<string, any>
  ): string {
    return new CacheKeyBuilder({ prefix: `coin-${operation}` })
      .user(walletId)
      .params(params)
      .build();
  }
}

/**
 * Key pattern matcher for cache invalidation
 */
export class KeyPatternMatcher {
  /**
   * Create pattern for exact key match
   */
  static exact(key: string): { type: 'exact'; pattern: string } {
    return { type: 'exact', pattern: key };
  }

  /**
   * Create pattern for prefix match
   */
  static prefix(prefix: string): { type: 'prefix'; pattern: string } {
    return { type: 'prefix', pattern: prefix };
  }

  /**
   * Create pattern for user-specific keys
   */
  static user(walletId: string): { type: 'contains'; pattern: string } {
    const hashedId = createHash('sha256').update(walletId).digest('hex').substring(0, 16);
    return { type: 'contains', pattern: hashedId };
  }

  /**
   * Create pattern for wallet-specific keys
   */
  static wallet(walletId: string): { type: 'regex'; pattern: string } {
    const hashedId = createHash('sha256').update(walletId).digest('hex').substring(0, 16);
    return { type: 'regex', pattern: `.*user:${hashedId}.*` };
  }

  /**
   * Create pattern for function-specific keys
   */
  static function(functionName: string): { type: 'contains'; pattern: string } {
    return { type: 'contains', pattern: `function:${functionName}` };
  }

  /**
   * Create pattern for time-sensitive keys older than specified time
   */
  static olderThan(ageMs: number): { type: 'regex'; pattern: string } {
    const cutoffTimestamp = Math.floor((Date.now() - ageMs) / 60000);
    return { type: 'regex', pattern: `.*t:([0-9]+).*` };
  }

  /**
   * Create compound pattern (AND logic)
   */
  static and(patterns: Array<{ type: string; pattern: string }>): { type: 'regex'; pattern: string } {
    const regexParts = patterns.map(p => {
      switch (p.type) {
        case 'exact': return `^${this.escapeRegex(p.pattern)}$`;
        case 'prefix': return `^${this.escapeRegex(p.pattern)}`;
        case 'suffix': return `${this.escapeRegex(p.pattern)}$`;
        case 'contains': return `.*${this.escapeRegex(p.pattern)}.*`;
        case 'regex': return p.pattern;
        default: return this.escapeRegex(p.pattern);
      }
    });
    
    return { type: 'regex', pattern: `^(?=.*${regexParts.join(')(?=.*')}).*$` };
  }

  /**
   * Create compound pattern (OR logic)
   */
  static or(patterns: Array<{ type: string; pattern: string }>): { type: 'regex'; pattern: string } {
    const regexParts = patterns.map(p => {
      switch (p.type) {
        case 'exact': return `^${this.escapeRegex(p.pattern)}$`;
        case 'prefix': return `^${this.escapeRegex(p.pattern)}`;
        case 'suffix': return `${this.escapeRegex(p.pattern)}$`;
        case 'contains': return `.*${this.escapeRegex(p.pattern)}.*`;
        case 'regex': return p.pattern;
        default: return this.escapeRegex(p.pattern);
      }
    });
    
    return { type: 'regex', pattern: `(${regexParts.join('|')})` };
  }

  /**
   * Escape special regex characters
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Cache key validator
 */
export class CacheKeyValidator {
  private static readonly MAX_KEY_LENGTH = 250;
  private static readonly VALID_CHARS = /^[a-zA-Z0-9:_\-\.]+$/;

  /**
   * Validate a cache key
   */
  static validate(key: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!key || key.length === 0) {
      errors.push('Key cannot be empty');
    }

    if (key.length > this.MAX_KEY_LENGTH) {
      errors.push(`Key exceeds maximum length of ${this.MAX_KEY_LENGTH} characters`);
    }

    if (!this.VALID_CHARS.test(key)) {
      errors.push('Key contains invalid characters (only alphanumeric, :, _, -, . allowed)');
    }

    if (key.startsWith(':') || key.endsWith(':')) {
      errors.push('Key cannot start or end with colon');
    }

    if (key.includes('::')) {
      errors.push('Key cannot contain consecutive colons');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize a key to make it valid
   */
  static sanitize(key: string): string {
    if (!key) return 'default';

    // Replace invalid characters
    let sanitized = key.replace(/[^a-zA-Z0-9:_\-\.]/g, '_');
    
    // Remove consecutive colons
    sanitized = sanitized.replace(/:+/g, ':');
    
    // Remove leading/trailing colons
    sanitized = sanitized.replace(/^:+|:+$/g, '');
    
    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'default';
    }
    
    // Truncate if too long
    if (sanitized.length > this.MAX_KEY_LENGTH) {
      sanitized = sanitized.substring(0, this.MAX_KEY_LENGTH);
    }
    
    return sanitized;
  }
}
