import { MemoryDisposableResource as DisposableResource } from '@tari-project/tarijs-core';

/**
 * TTL (Time To Live) manager for sophisticated cache expiration strategies
 * Supports dynamic TTL adjustment, sliding expiration, and dependency-based invalidation
 */

/**
 * TTL strategy types
 */
export type TTLStrategy = 
  | 'fixed'          // Fixed TTL from creation
  | 'sliding'        // TTL resets on access
  | 'adaptive'       // TTL adjusts based on usage patterns
  | 'dependency'     // TTL based on dependencies
  | 'conditional';   // TTL based on conditions

/**
 * TTL configuration for different strategies
 */
export interface TTLConfig {
  strategy: TTLStrategy;
  baseTTL: number;
  maxTTL?: number;
  minTTL?: number;
  slidingWindow?: number;
  adaptiveParams?: AdaptiveParams;
  dependencies?: string[];
  conditions?: TTLCondition[];
}

/**
 * Adaptive TTL parameters
 */
export interface AdaptiveParams {
  /** Minimum access count to start adaptation */
  minAccesses: number;
  /** Access frequency threshold for extending TTL */
  frequencyThreshold: number;
  /** Hit ratio threshold for extending TTL */
  hitRatioThreshold: number;
  /** Multiplier for extending TTL */
  extensionMultiplier: number;
  /** Multiplier for reducing TTL */
  reductionMultiplier: number;
}

/**
 * TTL condition for conditional expiration
 */
export interface TTLCondition {
  type: 'time' | 'access' | 'memory' | 'custom';
  condition: string | ((entry: TTLEntry) => boolean);
  ttlMultiplier: number;
}

/**
 * TTL entry tracking
 */
export interface TTLEntry {
  key: string;
  created: number;
  lastAccessed: number;
  accessCount: number;
  hitCount: number;
  missCount: number;
  baseTTL: number;
  currentTTL: number;
  strategy: TTLStrategy;
  dependencies: string[];
  size: number;
  metadata: Record<string, any>;
}

/**
 * TTL statistics
 */
export interface TTLStats {
  totalEntries: number;
  strategyCounts: Record<TTLStrategy, number>;
  avgTTL: number;
  avgAccesses: number;
  avgHitRatio: number;
  expiredEntries: number;
  adaptedEntries: number;
}

/**
 * TTL manager implementation
 */
export class TTLManager extends DisposableResource {
  private readonly entries = new Map<string, TTLEntry>();
  private readonly dependencyGraph = new Map<string, Set<string>>();
  private readonly expirationQueue = new Map<number, Set<string>>();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly cleanupInterval: number;

  constructor(cleanupInterval: number = 60000) {
    super();
    this.cleanupInterval = cleanupInterval;
    this.startCleanupTimer();
  }

  /**
   * Register a new entry with TTL configuration
   */
  register(key: string, config: TTLConfig, size: number = 0, metadata: Record<string, any> = {}): TTLEntry {
    this.checkDisposed();

    const now = Date.now();
    const entry: TTLEntry = {
      key,
      created: now,
      lastAccessed: now,
      accessCount: 0,
      hitCount: 0,
      missCount: 0,
      baseTTL: config.baseTTL,
      currentTTL: config.baseTTL,
      strategy: config.strategy,
      dependencies: config.dependencies || [],
      size,
      metadata: { ...metadata }
    };

    // Remove existing entry if present
    if (this.entries.has(key)) {
      this.unregister(key);
    }

    this.entries.set(key, entry);
    this.updateDependencies(entry);
    this.scheduleExpiration(key, now + entry.currentTTL);

    return entry;
  }

  /**
   * Unregister an entry
   */
  unregister(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    this.entries.delete(key);
    this.removeDependencies(entry);
    this.removeFromExpirationQueue(key);

    return true;
  }

  /**
   * Check if an entry is expired
   */
  isExpired(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return true;

    const now = Date.now();
    return this.calculateExpiration(entry, now) <= now;
  }

  /**
   * Get TTL remaining for an entry
   */
  getTTLRemaining(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;

    const now = Date.now();
    const expiration = this.calculateExpiration(entry, now);
    return Math.max(0, expiration - now);
  }

  /**
   * Record access to an entry
   */
  recordAccess(key: string, hit: boolean = true): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    const now = Date.now();
    entry.lastAccessed = now;
    entry.accessCount++;
    
    if (hit) {
      entry.hitCount++;
    } else {
      entry.missCount++;
    }

    // Update TTL based on strategy
    this.updateTTL(entry, now);
  }

  /**
   * Get entry information
   */
  getEntry(key: string): TTLEntry | undefined {
    return this.entries.get(key);
  }

  /**
   * Get all entries
   */
  getAllEntries(): TTLEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get expired entries
   */
  getExpiredEntries(): string[] {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.entries) {
      if (this.calculateExpiration(entry, now) <= now) {
        expired.push(key);
      }
    }

    return expired;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): string[] {
    const expired = this.getExpiredEntries();
    
    for (const key of expired) {
      this.unregister(key);
    }

    // Clean up expired entries from expiration queue
    const now = Date.now();
    for (const [expiration, keys] of this.expirationQueue) {
      if (expiration <= now) {
        this.expirationQueue.delete(expiration);
      }
    }

    return expired;
  }

  /**
   * Invalidate entries based on dependency
   */
  invalidateDependency(dependency: string): string[] {
    const invalidated: string[] = [];
    const dependents = this.dependencyGraph.get(dependency);
    
    if (dependents) {
      for (const key of dependents) {
        if (this.unregister(key)) {
          invalidated.push(key);
        }
      }
      this.dependencyGraph.delete(dependency);
    }

    return invalidated;
  }

  /**
   * Get TTL statistics
   */
  getStats(): TTLStats {
    const entries = Array.from(this.entries.values());
    const strategyCounts: Record<TTLStrategy, number> = {
      fixed: 0,
      sliding: 0,
      adaptive: 0,
      dependency: 0,
      conditional: 0
    };

    let totalTTL = 0;
    let totalAccesses = 0;
    let totalHits = 0;
    let totalRequests = 0;
    let expiredCount = 0;
    let adaptedCount = 0;

    const now = Date.now();

    for (const entry of entries) {
      strategyCounts[entry.strategy]++;
      totalTTL += entry.currentTTL;
      totalAccesses += entry.accessCount;
      totalHits += entry.hitCount;
      totalRequests += entry.hitCount + entry.missCount;

      if (this.calculateExpiration(entry, now) <= now) {
        expiredCount++;
      }

      if (entry.currentTTL !== entry.baseTTL) {
        adaptedCount++;
      }
    }

    return {
      totalEntries: entries.length,
      strategyCounts,
      avgTTL: entries.length > 0 ? totalTTL / entries.length : 0,
      avgAccesses: entries.length > 0 ? totalAccesses / entries.length : 0,
      avgHitRatio: totalRequests > 0 ? totalHits / totalRequests : 0,
      expiredEntries: expiredCount,
      adaptedEntries: adaptedCount
    };
  }

  /**
   * Calculate expiration time for an entry
   */
  private calculateExpiration(entry: TTLEntry, now: number): number {
    switch (entry.strategy) {
      case 'fixed':
        return entry.created + entry.currentTTL;
      
      case 'sliding':
        return entry.lastAccessed + entry.currentTTL;
      
      case 'adaptive':
      case 'dependency':
      case 'conditional':
        // These use the updated currentTTL
        return entry.lastAccessed + entry.currentTTL;
      
      default:
        return entry.created + entry.currentTTL;
    }
  }

  /**
   * Update TTL based on strategy and usage patterns
   */
  private updateTTL(entry: TTLEntry, now: number): void {
    switch (entry.strategy) {
      case 'sliding':
        // TTL resets on each access
        this.rescheduleExpiration(entry.key, now + entry.currentTTL);
        break;
      
      case 'adaptive':
        this.updateAdaptiveTTL(entry, now);
        break;
      
      case 'conditional':
        this.updateConditionalTTL(entry, now);
        break;
      
      // Fixed and dependency strategies don't change on access
    }
  }

  /**
   * Update TTL for adaptive strategy
   */
  private updateAdaptiveTTL(entry: TTLEntry, now: number): void {
    const params = entry.metadata.adaptiveParams as AdaptiveParams;
    if (!params || entry.accessCount < params.minAccesses) {
      return;
    }

    const timeSinceCreated = now - entry.created;
    const accessFrequency = entry.accessCount / (timeSinceCreated / 1000); // accesses per second
    const hitRatio = entry.hitCount / (entry.hitCount + entry.missCount);

    let multiplier = 1;

    // Extend TTL for frequently accessed entries with good hit ratio
    if (accessFrequency >= params.frequencyThreshold && hitRatio >= params.hitRatioThreshold) {
      multiplier = params.extensionMultiplier;
    }
    // Reduce TTL for infrequently accessed entries
    else if (accessFrequency < params.frequencyThreshold * 0.5) {
      multiplier = params.reductionMultiplier;
    }

    const newTTL = Math.min(
      Math.max(entry.baseTTL * multiplier, entry.metadata.minTTL || entry.baseTTL * 0.1),
      entry.metadata.maxTTL || entry.baseTTL * 10
    );

    if (newTTL !== entry.currentTTL) {
      entry.currentTTL = newTTL;
      this.rescheduleExpiration(entry.key, now + newTTL);
    }
  }

  /**
   * Update TTL for conditional strategy
   */
  private updateConditionalTTL(entry: TTLEntry, now: number): void {
    const conditions = entry.metadata.conditions as TTLCondition[];
    if (!conditions) return;

    let totalMultiplier = 1;

    for (const condition of conditions) {
      if (this.evaluateCondition(condition, entry)) {
        totalMultiplier *= condition.ttlMultiplier;
      }
    }

    const newTTL = Math.min(
      Math.max(entry.baseTTL * totalMultiplier, entry.metadata.minTTL || entry.baseTTL * 0.1),
      entry.metadata.maxTTL || entry.baseTTL * 10
    );

    if (newTTL !== entry.currentTTL) {
      entry.currentTTL = newTTL;
      this.rescheduleExpiration(entry.key, now + newTTL);
    }
  }

  /**
   * Evaluate a TTL condition
   */
  private evaluateCondition(condition: TTLCondition, entry: TTLEntry): boolean {
    switch (condition.type) {
      case 'time':
        const timeCondition = condition.condition as string;
        const hour = new Date().getHours();
        return eval(timeCondition.replace(/hour/g, hour.toString()));
      
      case 'access':
        const accessCondition = condition.condition as string;
        return eval(accessCondition.replace(/count/g, entry.accessCount.toString()));
      
      case 'memory':
        const memoryUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
        const memoryCondition = condition.condition as string;
        return eval(memoryCondition.replace(/usage/g, memoryUsage.toString()));
      
      case 'custom':
        if (typeof condition.condition === 'function') {
          return condition.condition(entry);
        }
        return false;
      
      default:
        return false;
    }
  }

  /**
   * Update dependency relationships
   */
  private updateDependencies(entry: TTLEntry): void {
    for (const dependency of entry.dependencies) {
      if (!this.dependencyGraph.has(dependency)) {
        this.dependencyGraph.set(dependency, new Set());
      }
      this.dependencyGraph.get(dependency)!.add(entry.key);
    }
  }

  /**
   * Remove dependency relationships
   */
  private removeDependencies(entry: TTLEntry): void {
    for (const dependency of entry.dependencies) {
      const dependents = this.dependencyGraph.get(dependency);
      if (dependents) {
        dependents.delete(entry.key);
        if (dependents.size === 0) {
          this.dependencyGraph.delete(dependency);
        }
      }
    }
  }

  /**
   * Schedule expiration for an entry
   */
  private scheduleExpiration(key: string, expiration: number): void {
    if (!this.expirationQueue.has(expiration)) {
      this.expirationQueue.set(expiration, new Set());
    }
    this.expirationQueue.get(expiration)!.add(key);
  }

  /**
   * Reschedule expiration for an entry
   */
  private rescheduleExpiration(key: string, newExpiration: number): void {
    this.removeFromExpirationQueue(key);
    this.scheduleExpiration(key, newExpiration);
  }

  /**
   * Remove entry from expiration queue
   */
  private removeFromExpirationQueue(key: string): void {
    for (const [expiration, keys] of this.expirationQueue) {
      if (keys.has(key)) {
        keys.delete(key);
        if (keys.size === 0) {
          this.expirationQueue.delete(expiration);
        }
        break;
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup();
      } catch (error) {
        console.warn('Error during TTL cleanup:', error);
      }
    }, this.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    this.stopCleanupTimer();
    this.entries.clear();
    this.dependencyGraph.clear();
    this.expirationQueue.clear();
  }
}

/**
 * Factory for creating TTL configurations
 */
export class TTLConfigFactory {
  /**
   * Create fixed TTL configuration
   */
  static fixed(ttl: number): TTLConfig {
    return {
      strategy: 'fixed',
      baseTTL: ttl
    };
  }

  /**
   * Create sliding TTL configuration
   */
  static sliding(ttl: number, maxTTL?: number): TTLConfig {
    return {
      strategy: 'sliding',
      baseTTL: ttl,
      maxTTL
    };
  }

  /**
   * Create adaptive TTL configuration
   */
  static adaptive(
    baseTTL: number,
    params: Partial<AdaptiveParams> = {}
  ): TTLConfig {
    const adaptiveParams: AdaptiveParams = {
      minAccesses: 5,
      frequencyThreshold: 0.1, // 0.1 accesses per second
      hitRatioThreshold: 0.8,
      extensionMultiplier: 2,
      reductionMultiplier: 0.5,
      ...params
    };

    return {
      strategy: 'adaptive',
      baseTTL,
      maxTTL: baseTTL * 10,
      minTTL: baseTTL * 0.1,
      adaptiveParams
    };
  }

  /**
   * Create dependency-based TTL configuration
   */
  static dependency(ttl: number, dependencies: string[]): TTLConfig {
    return {
      strategy: 'dependency',
      baseTTL: ttl,
      dependencies
    };
  }

  /**
   * Create conditional TTL configuration
   */
  static conditional(ttl: number, conditions: TTLCondition[]): TTLConfig {
    return {
      strategy: 'conditional',
      baseTTL: ttl,
      conditions
    };
  }

  /**
   * Create TTL configuration for balance queries
   */
  static forBalance(): TTLConfig {
    return this.adaptive(30000, { // 30 seconds base
      frequencyThreshold: 0.05, // 1 access per 20 seconds
      hitRatioThreshold: 0.9,
      extensionMultiplier: 3
    });
  }

  /**
   * Create TTL configuration for transactions
   */
  static forTransactions(): TTLConfig {
    return this.sliding(300000); // 5 minutes, slides on access
  }

  /**
   * Create TTL configuration for contacts
   */
  static forContacts(): TTLConfig {
    return this.fixed(600000); // 10 minutes fixed
  }

  /**
   * Create TTL configuration for UTXO data
   */
  static forUtxos(): TTLConfig {
    return this.dependency(120000, ['balance', 'transactions']); // 2 minutes, depends on balance/txns
  }

  /**
   * Create TTL configuration for fee estimates
   */
  static forFeeEstimates(): TTLConfig {
    return this.conditional(300000, [ // 5 minutes base
      {
        type: 'time',
        condition: 'hour >= 9 && hour <= 17', // Business hours
        ttlMultiplier: 0.5 // Shorter TTL during business hours
      }
    ]);
  }
}
