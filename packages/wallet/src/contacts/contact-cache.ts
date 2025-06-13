/**
 * @fileoverview Contact Cache Service for Tari Wallet
 * 
 * Provides in-memory caching for frequently accessed contacts
 * with automatic cache invalidation and performance optimization.
 */

import {
  Contact,
  ContactFilter,
  WalletError,
  WalletErrorCode
} from '@tari-project/tarijs-core';

/**
 * Cache configuration options
 */
export interface ContactCacheConfig {
  /** Maximum number of contacts to cache */
  maxSize?: number;
  
  /** Cache TTL in milliseconds */
  ttl?: number;
  
  /** Enable cache statistics */
  enableStats?: boolean;
  
  /** Cache eviction strategy */
  evictionStrategy?: 'lru' | 'lfu' | 'ttl';
}

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  /** Cached contact */
  contact: Contact;
  
  /** Entry creation time */
  createdAt: number;
  
  /** Last access time */
  lastAccessed: number;
  
  /** Access count */
  accessCount: number;
  
  /** Entry TTL override */
  ttl?: number;
}

/**
 * Cache statistics
 */
export interface ContactCacheStats {
  /** Total cache hits */
  hits: number;
  
  /** Total cache misses */
  misses: number;
  
  /** Hit ratio (0-1) */
  hitRatio: number;
  
  /** Current cache size */
  size: number;
  
  /** Maximum cache size */
  maxSize: number;
  
  /** Total evictions */
  evictions: number;
  
  /** Memory usage estimate in bytes */
  memoryUsage: number;
}

/**
 * Contact cache service with LRU eviction and TTL support
 */
export class ContactCache {
  private readonly config: Required<ContactCacheConfig>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly aliasIndex = new Map<string, string>(); // alias -> id
  private readonly addressIndex = new Map<string, string>(); // address -> id
  
  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(config?: Partial<ContactCacheConfig>) {
    this.config = {
      maxSize: 1000,
      ttl: 300000, // 5 minutes
      enableStats: true,
      evictionStrategy: 'lru',
      ...config
    };
  }

  /**
   * Get a contact by ID
   */
  public get(contactId: string): Contact | null {
    const entry = this.cache.get(contactId);
    
    if (!entry) {
      this.recordMiss();
      return null;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.remove(contactId);
      this.recordMiss();
      return null;
    }

    // Update access metadata
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    
    this.recordHit();
    return entry.contact;
  }

  /**
   * Get a contact by alias
   */
  public getByAlias(alias: string): Contact | null {
    const contactId = this.aliasIndex.get(alias.toLowerCase());
    return contactId ? this.get(contactId) : null;
  }

  /**
   * Get a contact by address
   */
  public getByAddress(address: string): Contact | null {
    const contactId = this.addressIndex.get(address);
    return contactId ? this.get(contactId) : null;
  }

  /**
   * Store a contact in cache
   */
  public set(contact: Contact, ttl?: number): void {
    // Remove existing entry if present
    this.remove(contact.id);

    // Check cache size and evict if necessary
    if (this.cache.size >= this.config.maxSize) {
      this.evict();
    }

    // Create cache entry
    const entry: CacheEntry = {
      contact,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      ttl
    };

    // Add to cache and indexes
    this.cache.set(contact.id, entry);
    this.aliasIndex.set(contact.alias.toLowerCase(), contact.id);
    this.addressIndex.set(contact.address, contact.id);
  }

  /**
   * Store multiple contacts in cache
   */
  public setMany(contacts: Contact[]): void {
    for (const contact of contacts) {
      this.set(contact);
    }
  }

  /**
   * Remove a contact from cache
   */
  public remove(contactId: string): boolean {
    const entry = this.cache.get(contactId);
    
    if (!entry) {
      return false;
    }

    // Remove from cache and indexes
    this.cache.delete(contactId);
    this.aliasIndex.delete(entry.contact.alias.toLowerCase());
    this.addressIndex.delete(entry.contact.address);
    
    return true;
  }

  /**
   * Check if contact exists in cache
   */
  public has(contactId: string): boolean {
    const entry = this.cache.get(contactId);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Get all cached contacts
   */
  public getAll(): Contact[] {
    const contacts: Contact[] = [];
    const now = Date.now();
    
    for (const [contactId, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.remove(contactId);
        continue;
      }
      
      contacts.push(entry.contact);
    }
    
    return contacts;
  }

  /**
   * Search cached contacts
   */
  public search(filter: ContactFilter): Contact[] {
    const allContacts = this.getAll();
    
    return allContacts.filter(contact => {
      // Simple search implementation - alias search only for now
      if (filter.aliasSearch) {
        const searchTerm = filter.aliasSearch.toLowerCase();
        return contact.alias.toLowerCase().includes(searchTerm);
      }
      
      return true;
    });
  }

  /**
   * Clear all cached contacts
   */
  public clear(): void {
    this.cache.clear();
    this.aliasIndex.clear();
    this.addressIndex.clear();
    
    if (this.config.enableStats) {
      this.stats = { hits: 0, misses: 0, evictions: 0 };
    }
  }

  /**
   * Invalidate expired entries
   */
  public cleanup(): number {
    let removedCount = 0;
    const now = Date.now();
    
    for (const [contactId, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.remove(contactId);
        removedCount++;
      }
    }
    
    return removedCount;
  }

  /**
   * Get cache statistics
   */
  public getStats(): ContactCacheStats {
    if (!this.config.enableStats) {
      throw new WalletError(
        'Cache statistics not enabled',
        WalletErrorCode.FeatureNotEnabled
      );
    }

    const total = this.stats.hits + this.stats.misses;
    const hitRatio = total > 0 ? this.stats.hits / total : 0;
    
    // Estimate memory usage (rough calculation)
    const memoryUsage = this.cache.size * 1024; // ~1KB per contact estimate
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatio,
      size: this.cache.size,
      maxSize: this.config.maxSize,
      evictions: this.stats.evictions,
      memoryUsage
    };
  }

  /**
   * Reset cache statistics
   */
  public resetStats(): void {
    if (this.config.enableStats) {
      this.stats = { hits: 0, misses: 0, evictions: 0 };
    }
  }

  /**
   * Get cache configuration
   */
  public getConfig(): Readonly<Required<ContactCacheConfig>> {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  public updateConfig(newConfig: Partial<ContactCacheConfig>): void {
    Object.assign(this.config, newConfig);
    
    // Apply new max size immediately
    if (newConfig.maxSize !== undefined) {
      while (this.cache.size > this.config.maxSize) {
        this.evict();
      }
    }
  }

  /**
   * Preload contacts into cache
   */
  public preload(contacts: Contact[], highPriority = false): void {
    const sortedContacts = highPriority 
      ? contacts.sort((a, b) => (b.metadata.transactionCount || 0) - (a.metadata.transactionCount || 0))
      : contacts;
      
    this.setMany(sortedContacts);
  }

  /**
   * Get most accessed contacts
   */
  public getMostAccessed(limit = 10): Array<{ contact: Contact; accessCount: number }> {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
      
    return entries.map(entry => ({
      contact: entry.contact,
      accessCount: entry.accessCount
    }));
  }

  /**
   * Get recently accessed contacts
   */
  public getRecentlyAccessed(limit = 10): Array<{ contact: Contact; lastAccessed: number }> {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, limit);
      
    return entries.map(entry => ({
      contact: entry.contact,
      lastAccessed: entry.lastAccessed
    }));
  }

  // Private helper methods

  private isExpired(entry: CacheEntry): boolean {
    const ttl = entry.ttl || this.config.ttl;
    return Date.now() - entry.createdAt > ttl;
  }

  private evict(): void {
    if (this.cache.size === 0) {
      return;
    }

    let victimId: string;
    
    switch (this.config.evictionStrategy) {
      case 'lru':
        victimId = this.findLRUVictim();
        break;
        
      case 'lfu':
        victimId = this.findLFUVictim();
        break;
        
      case 'ttl':
        victimId = this.findTTLVictim();
        break;
        
      default:
        victimId = this.findLRUVictim();
    }

    this.remove(victimId);
    
    if (this.config.enableStats) {
      this.stats.evictions++;
    }
  }

  private findLRUVictim(): string {
    let oldestTime = Date.now();
    let victimId = '';
    
    for (const [contactId, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        victimId = contactId;
      }
    }
    
    return victimId;
  }

  private findLFUVictim(): string {
    let lowestCount = Infinity;
    let victimId = '';
    
    for (const [contactId, entry] of this.cache) {
      if (entry.accessCount < lowestCount) {
        lowestCount = entry.accessCount;
        victimId = contactId;
      }
    }
    
    return victimId;
  }

  private findTTLVictim(): string {
    let oldestCreation = Date.now();
    let victimId = '';
    
    for (const [contactId, entry] of this.cache) {
      if (entry.createdAt < oldestCreation) {
        oldestCreation = entry.createdAt;
        victimId = contactId;
      }
    }
    
    return victimId;
  }

  private recordHit(): void {
    if (this.config.enableStats) {
      this.stats.hits++;
    }
  }

  private recordMiss(): void {
    if (this.config.enableStats) {
      this.stats.misses++;
    }
  }
}
