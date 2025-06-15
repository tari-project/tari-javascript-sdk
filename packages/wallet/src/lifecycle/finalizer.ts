/**
 * @fileoverview FinalizationRegistry-based automatic cleanup system
 * 
 * Provides sophisticated finalizer management with weak references,
 * automatic cleanup registration, and comprehensive leak detection.
 */

import { 
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity 
} from '@tari-project/tarijs-core';
import { 
  ResourceType, 
  type ResourceMetadata, 
  type ResourceCleanupFunction 
} from './resource-manager.js';
import { globalCleanupExecutor } from './cleanup.js';

/**
 * Finalizer configuration
 */
export interface FinalizerConfig {
  enableLogging?: boolean;
  enableWarnings?: boolean;
  trackStatistics?: boolean;
  maxCleanupAttempts?: number;
  cleanupDelayMs?: number;
}

/**
 * Finalizer statistics
 */
export interface FinalizerStats {
  registeredObjects: number;
  finalizationsCalled: number;
  successfulCleanups: number;
  failedCleanups: number;
  averageCleanupTime: number;
  resourcesByType: Record<ResourceType, number>;
}

/**
 * Held value for FinalizationRegistry
 */
interface FinalizerHeldValue {
  resourceId: string;
  resourceType: ResourceType;
  walletId: string;
  handle: any;
  metadata: ResourceMetadata;
  registeredAt: Date;
}

/**
 * Advanced finalizer with statistics and leak detection
 * 
 * This class provides comprehensive finalization management including:
 * - Automatic cleanup when objects are garbage collected
 * - Statistics tracking for memory leak detection
 * - Configurable logging and warning systems
 * - Integration with cleanup strategies
 */
export class AdvancedFinalizer {
  private static instance: AdvancedFinalizer | null = null;
  
  private readonly finalizationRegistry: FinalizationRegistry<FinalizerHeldValue>;
  private readonly config: Required<FinalizerConfig>;
  private readonly stats: FinalizerStats;
  private readonly registeredObjects = new Set<string>();
  private readonly cleanupTimes: number[] = [];

  private constructor(config: FinalizerConfig = {}) {
    this.config = {
      enableLogging: false,
      enableWarnings: true,
      trackStatistics: true,
      maxCleanupAttempts: 3,
      cleanupDelayMs: 100,
      ...config
    };

    this.stats = {
      registeredObjects: 0,
      finalizationsCalled: 0,
      successfulCleanups: 0,
      failedCleanups: 0,
      averageCleanupTime: 0,
      resourcesByType: {} as Record<ResourceType, number>
    };

    // Initialize resource type counters
    for (const type of Object.values(ResourceType)) {
      this.stats.resourcesByType[type] = 0;
    }

    // Create FinalizationRegistry with automatic cleanup
    this.finalizationRegistry = new FinalizationRegistry(
      (heldValue: FinalizerHeldValue) => {
        this.handleFinalization(heldValue);
      }
    );
  }

  /**
   * Get the singleton finalizer instance
   */
  public static getInstance(config?: FinalizerConfig): AdvancedFinalizer {
    if (!AdvancedFinalizer.instance) {
      AdvancedFinalizer.instance = new AdvancedFinalizer(config);
    }
    return AdvancedFinalizer.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    AdvancedFinalizer.instance = null;
  }

  /**
   * Register an object for automatic finalization
   */
  public register<T extends object>(
    target: T,
    resourceId: string,
    resourceType: ResourceType,
    walletId: string,
    handle: any,
    metadata: ResourceMetadata
  ): void {
    const heldValue: FinalizerHeldValue = {
      resourceId,
      resourceType,
      walletId,
      handle,
      metadata,
      registeredAt: new Date()
    };

    this.finalizationRegistry.register(target, heldValue);
    this.registeredObjects.add(resourceId);

    if (this.config.trackStatistics) {
      this.stats.registeredObjects++;
      this.stats.resourcesByType[resourceType]++;
    }

    if (this.config.enableLogging) {
      console.debug(`Finalizer registered: ${resourceId} (${resourceType}) for wallet ${walletId}`);
    }
  }

  /**
   * Manually unregister an object (when properly cleaned up)
   */
  public unregister<T extends object>(target: T, resourceId: string): void {
    this.finalizationRegistry.unregister(target);
    this.registeredObjects.delete(resourceId);

    if (this.config.enableLogging) {
      console.debug(`Finalizer unregistered: ${resourceId}`);
    }
  }

  /**
   * Get current finalizer statistics
   */
  public getStats(): FinalizerStats {
    // Update average cleanup time
    if (this.cleanupTimes.length > 0) {
      this.stats.averageCleanupTime = this.cleanupTimes.reduce((a, b) => a + b, 0) / this.cleanupTimes.length;
    }

    return { ...this.stats };
  }

  /**
   * Check if finalizer is healthy (low failed cleanup rate)
   */
  public isHealthy(): boolean {
    const totalCleanups = this.stats.successfulCleanups + this.stats.failedCleanups;
    if (totalCleanups === 0) return true;

    const failureRate = this.stats.failedCleanups / totalCleanups;
    return failureRate < 0.1; // Less than 10% failure rate
  }

  /**
   * Get memory leak indicators
   */
  public getLeakIndicators(): {
    suspiciousResources: number;
    oldestRegistration: Date | null;
    resourceTypeDistribution: Record<ResourceType, number>;
    averageAge: number;
  } {
    const now = Date.now();
    const oldestRegistration: Date | null = null;
    const totalAge = 0;
    let suspiciousCount = 0;

    // We can't directly access registered objects from FinalizationRegistry,
    // so we track separately
    const resourceCount = this.registeredObjects.size;

    // Estimate based on statistics
    for (const [type, count] of Object.entries(this.stats.resourcesByType)) {
      if (count > 100) { // More than 100 resources of one type might indicate a leak
        suspiciousCount += count;
      }
    }

    return {
      suspiciousResources: suspiciousCount,
      oldestRegistration,
      resourceTypeDistribution: { ...this.stats.resourcesByType },
      averageAge: resourceCount > 0 ? totalAge / resourceCount : 0
    };
  }

  /**
   * Force garbage collection (if available) and wait for finalizations
   */
  public async forceCleanupAndWait(timeoutMs: number = 5000): Promise<void> {
    // Force GC if available (Node.js with --expose-gc flag)
    if (global.gc) {
      global.gc();
    }

    // Wait a bit for finalizations to run
    await new Promise(resolve => setTimeout(resolve, Math.min(timeoutMs, 1000)));
  }

  /**
   * Reset statistics (useful for testing)
   */
  public resetStats(): void {
    this.stats.registeredObjects = 0;
    this.stats.finalizationsCalled = 0;
    this.stats.successfulCleanups = 0;
    this.stats.failedCleanups = 0;
    this.stats.averageCleanupTime = 0;
    
    for (const type of Object.values(ResourceType)) {
      this.stats.resourcesByType[type] = 0;
    }
    
    this.cleanupTimes.length = 0;
  }

  // Private methods

  private async handleFinalization(heldValue: FinalizerHeldValue): Promise<void> {
    const startTime = Date.now();
    
    if (this.config.trackStatistics) {
      this.stats.finalizationsCalled++;
    }

    if (this.config.enableWarnings) {
      const age = Date.now() - heldValue.registeredAt.getTime();
      console.warn(
        `FinalizationRegistry cleanup triggered for ${heldValue.resourceId} ` +
        `(${heldValue.resourceType}) - resource was not properly disposed ` +
        `(age: ${age}ms, wallet: ${heldValue.walletId})`
      );
    }

    // Attempt cleanup with retries
    let success = false;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxCleanupAttempts; attempt++) {
      try {
        const result = await globalCleanupExecutor.executeCleanup(
          heldValue.handle,
          heldValue.metadata
        );

        if (result.success) {
          success = true;
          break;
        }
        
        lastError = result.error;
      } catch (error: unknown) {
        lastError = error as Error;
      }

      // Wait before retry
      if (attempt < this.config.maxCleanupAttempts) {
        await new Promise(resolve => 
          setTimeout(resolve, this.config.cleanupDelayMs * attempt)
        );
      }
    }

    // Update statistics
    const cleanupTime = Date.now() - startTime;
    
    if (this.config.trackStatistics) {
      this.cleanupTimes.push(cleanupTime);
      
      // Keep only last 100 cleanup times for average calculation
      if (this.cleanupTimes.length > 100) {
        this.cleanupTimes.shift();
      }

      if (success) {
        this.stats.successfulCleanups++;
      } else {
        this.stats.failedCleanups++;
      }

      // Decrease resource count
      if (this.stats.resourcesByType[heldValue.resourceType] > 0) {
        this.stats.resourcesByType[heldValue.resourceType]--;
      }
    }

    // Remove from tracking
    this.registeredObjects.delete(heldValue.resourceId);

    if (this.config.enableLogging) {
      if (success) {
        console.debug(
          `Finalizer cleanup completed: ${heldValue.resourceId} (${cleanupTime}ms)`
        );
      } else {
        console.error(
          `Finalizer cleanup failed: ${heldValue.resourceId} - ${lastError?.message}`
        );
      }
    }
  }
}

/**
 * Finalizer wrapper for easy integration
 */
export class WalletFinalizer {
  private readonly finalizer: AdvancedFinalizer;

  constructor(config?: FinalizerConfig) {
    this.finalizer = AdvancedFinalizer.getInstance(config);
  }

  /**
   * Register a wallet resource for finalization
   */
  public registerWalletResource<T extends object>(
    target: T,
    resourceId: string,
    resourceType: ResourceType,
    walletId: string,
    handle: any,
    metadata: ResourceMetadata
  ): () => void {
    this.finalizer.register(target, resourceId, resourceType, walletId, handle, metadata);
    
    // Return unregister function
    return () => {
      this.finalizer.unregister(target, resourceId);
    };
  }

  /**
   * Check for potential memory leaks
   */
  public checkForLeaks(): {
    hasLeaks: boolean;
    details: ReturnType<AdvancedFinalizer['getLeakIndicators']>;
    recommendations: string[];
  } {
    const indicators = this.finalizer.getLeakIndicators();
    const stats = this.finalizer.getStats();
    
    const hasLeaks = (
      indicators.suspiciousResources > 50 ||
      stats.failedCleanups > 10 ||
      !this.finalizer.isHealthy()
    );

    const recommendations: string[] = [];
    
    if (indicators.suspiciousResources > 50) {
      recommendations.push(
        `High resource count detected (${indicators.suspiciousResources}). ` +
        `Consider reviewing resource management patterns.`
      );
    }
    
    if (stats.failedCleanups > 10) {
      recommendations.push(
        `Multiple cleanup failures detected (${stats.failedCleanups}). ` +
        `Check cleanup strategies and error handling.`
      );
    }
    
    if (!this.finalizer.isHealthy()) {
      recommendations.push(
        'Finalizer health check failed. Review resource disposal patterns.'
      );
    }

    return {
      hasLeaks,
      details: indicators,
      recommendations
    };
  }

  /**
   * Get finalizer statistics
   */
  public getStats(): FinalizerStats {
    return this.finalizer.getStats();
  }

  /**
   * Force cleanup and check for leaks
   */
  public async performLeakDetection(timeoutMs: number = 5000): Promise<void> {
    await this.finalizer.forceCleanupAndWait(timeoutMs);
    
    const leakCheck = this.checkForLeaks();
    if (leakCheck.hasLeaks) {
      console.warn('Potential memory leaks detected:', leakCheck.details);
      leakCheck.recommendations.forEach(rec => console.warn('Recommendation:', rec));
    }
  }
}

/**
 * Global finalizer instance
 */
export const globalWalletFinalizer = new WalletFinalizer({
  enableLogging: false,
  enableWarnings: true,
  trackStatistics: true
});

/**
 * Decorator for automatic finalization registration
 */
export function withFinalization(
  resourceType: ResourceType,
  getHandle?: (instance: any) => any
) {
  return function <T extends new (...args: any[]) => any>(constructor: T) {
    return class extends constructor {
      public readonly _finalizerUnregister?: () => void;

      constructor(...args: any[]) {
        super(...args);
        
        if (this.id && this.walletId) {
          const handle = getHandle ? getHandle(this) : this.handle;
          const metadata = {
            id: this.id,
            type: resourceType,
            handle,
            created: new Date(),
            lastAccessed: new Date(),
            refCount: 1,
            walletId: this.walletId
          };

          this._finalizerUnregister = globalWalletFinalizer.registerWalletResource(
            this,
            this.id,
            resourceType,
            this.walletId,
            handle,
            metadata
          );
        }
      }

      destroy() {
        if (this._finalizerUnregister) {
          this._finalizerUnregister();
        }
        
        if (super.destroy) {
          return super.destroy();
        }
      }
    };
  };
}
