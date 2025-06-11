/**
 * Global resource tracking with WeakMap and leak detection diagnostics
 * Provides non-intrusive resource monitoring with garbage collection awareness
 */

import { TariError, ErrorCode } from '../errors/index.js';
import type { FFIResource, ResourceType } from './resource.js';
import type { WalletHandle } from './types.js';

/**
 * Resource metadata for tracking and debugging
 */
export interface ResourceMetadata {
  /** Unique resource identifier */
  id: string;
  /** Resource type */
  type: ResourceType;
  /** Native handle (if applicable) */
  handle?: WalletHandle;
  /** Creation timestamp */
  createdAt: Date;
  /** Creation stack trace (development only) */
  stack?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Resource leak information for diagnostics
 */
export interface LeakInfo {
  /** Resource metadata */
  metadata: ResourceMetadata;
  /** How long the resource has been alive */
  ageMs: number;
  /** Whether the resource is still reachable */
  isAlive: boolean;
  /** Weak reference to the resource */
  weakRef: WeakRef<FFIResource>;
}

/**
 * Resource tracking statistics
 */
export interface TrackingStats {
  /** Total resources created */
  totalCreated: number;
  /** Currently active resources */
  currentActive: number;
  /** Resources cleaned up by GC */
  gcCleaned: number;
  /** Resources explicitly disposed */
  explicitlyDisposed: number;
  /** Detected leaks */
  leaksDetected: number;
  /** Memory usage estimate (bytes) */
  estimatedMemoryUsage: number;
}

/**
 * Configuration for the resource tracker
 */
export interface TrackerConfig {
  /** Enable stack trace capture (performance impact) */
  captureStackTraces?: boolean;
  /** Maximum age before considering a resource a leak (ms) */
  leakThresholdMs?: number;
  /** Maximum number of resources to track */
  maxTrackedResources?: number;
  /** Enable automatic leak detection */
  enableLeakDetection?: boolean;
}

/**
 * Global FFI resource tracker with leak detection and diagnostics
 * 
 * Uses WeakMap for metadata storage without preventing garbage collection,
 * FinalizationRegistry for cleanup callbacks, and WeakRef tracking for
 * leak detection. Provides comprehensive diagnostics and resource monitoring.
 */
export class ResourceTracker {
  private static instance: ResourceTracker | null = null;
  
  // Core tracking data structures
  private readonly resourceMetadata = new WeakMap<FFIResource, ResourceMetadata>();
  private readonly leakTracking = new Map<string, {
    weakRef: WeakRef<FFIResource>;
    metadata: ResourceMetadata;
  }>();
  
  // Finalization registry for GC cleanup
  private readonly finalizer = new FinalizationRegistry<{
    id: string;
    type: ResourceType;
    handle?: WalletHandle;
  }>((heldValue) => {
    this.handleFinalization(heldValue);
  });

  // Configuration and statistics
  private readonly config: Required<TrackerConfig>;
  private readonly stats: TrackingStats = {
    totalCreated: 0,
    currentActive: 0,
    gcCleaned: 0,
    explicitlyDisposed: 0,
    leaksDetected: 0,
    estimatedMemoryUsage: 0,
  };

  // Resource ID generation
  private resourceCounter = 0;

  private constructor(config: TrackerConfig = {}) {
    this.config = {
      captureStackTraces: config.captureStackTraces ?? (process.env.NODE_ENV === 'development'),
      leakThresholdMs: config.leakThresholdMs ?? 300000, // 5 minutes
      maxTrackedResources: config.maxTrackedResources ?? 10000,
      enableLeakDetection: config.enableLeakDetection ?? true,
    };
  }

  /**
   * Get the global tracker instance
   */
  static getInstance(config?: TrackerConfig): ResourceTracker {
    if (!this.instance) {
      this.instance = new ResourceTracker(config);
    }
    return this.instance;
  }

  /**
   * Register a new FFI resource for tracking
   */
  register(
    resource: FFIResource,
    type: ResourceType,
    handle?: WalletHandle,
    tags?: string[]
  ): string {
    const id = this.generateResourceId();
    const metadata: ResourceMetadata = {
      id,
      type,
      handle,
      createdAt: new Date(),
      stack: this.config.captureStackTraces ? this.captureStack() : undefined,
      tags,
    };

    // Store metadata using WeakMap (won't prevent GC)
    this.resourceMetadata.set(resource, metadata);

    // Track for leak detection if enabled
    if (this.config.enableLeakDetection) {
      this.leakTracking.set(id, {
        weakRef: new WeakRef(resource),
        metadata,
      });
    }

    // Register for finalization
    this.finalizer.register(resource, {
      id,
      type,
      handle,
    }, resource);

    // Update statistics
    this.stats.totalCreated++;
    this.stats.currentActive++;
    this.updateMemoryEstimate();

    // Enforce tracking limits
    this.enforceTrackingLimits();

    return id;
  }

  /**
   * Unregister a resource (called on explicit disposal)
   */
  unregister(resource: FFIResource): void {
    const metadata = this.resourceMetadata.get(resource);
    if (!metadata) {
      return; // Resource not tracked
    }

    // Remove from leak tracking
    this.leakTracking.delete(metadata.id);

    // Unregister from finalizer
    this.finalizer.unregister(resource);

    // Update statistics
    this.stats.explicitlyDisposed++;
    this.stats.currentActive = Math.max(0, this.stats.currentActive - 1);
    this.updateMemoryEstimate();
  }

  /**
   * Get metadata for a resource
   */
  getMetadata(resource: FFIResource): ResourceMetadata | undefined {
    return this.resourceMetadata.get(resource);
  }

  /**
   * Perform leak detection and return potential leaks
   */
  detectLeaks(): LeakInfo[] {
    if (!this.config.enableLeakDetection) {
      return [];
    }

    const leaks: LeakInfo[] = [];
    const now = Date.now();
    const threshold = this.config.leakThresholdMs;

    for (const [id, tracked] of this.leakTracking.entries()) {
      const resource = tracked.weakRef.deref();
      const ageMs = now - tracked.metadata.createdAt.getTime();

      if (resource) {
        // Resource is still alive
        if (ageMs > threshold) {
          leaks.push({
            metadata: tracked.metadata,
            ageMs,
            isAlive: true,
            weakRef: tracked.weakRef,
          });
        }
      } else {
        // Resource was GC'd but not properly cleaned up from tracking
        this.leakTracking.delete(id);
      }
    }

    this.stats.leaksDetected = leaks.length;
    return leaks;
  }

  /**
   * Get current tracking statistics
   */
  getStats(): TrackingStats {
    return { ...this.stats };
  }

  /**
   * Get resources by type
   */
  getResourcesByType(type: ResourceType): FFIResource[] {
    const resources: FFIResource[] = [];
    
    for (const tracked of this.leakTracking.values()) {
      if (tracked.metadata.type === type) {
        const resource = tracked.weakRef.deref();
        if (resource) {
          resources.push(resource);
        }
      }
    }

    return resources;
  }

  /**
   * Get resources by tag
   */
  getResourcesByTag(tag: string): FFIResource[] {
    const resources: FFIResource[] = [];
    
    for (const tracked of this.leakTracking.values()) {
      if (tracked.metadata.tags?.includes(tag)) {
        const resource = tracked.weakRef.deref();
        if (resource) {
          resources.push(resource);
        }
      }
    }

    return resources;
  }

  /**
   * Force garbage collection (if available) and clean up tracking
   */
  forceCleanup(): void {
    // Trigger GC if available (mainly for testing)
    if (global.gc) {
      global.gc();
    }

    // Clean up dead weak references
    this.cleanupDeadReferences();
  }

  /**
   * Reset tracker statistics (for testing)
   */
  resetStats(): void {
    this.stats.totalCreated = 0;
    this.stats.currentActive = 0;
    this.stats.gcCleaned = 0;
    this.stats.explicitlyDisposed = 0;
    this.stats.leaksDetected = 0;
    this.stats.estimatedMemoryUsage = 0;
  }

  /**
   * Clear all tracking data (for testing)
   */
  clearAll(): void {
    this.leakTracking.clear();
    this.resetStats();
  }

  /**
   * Generate diagnostic report
   */
  generateDiagnosticReport(): {
    stats: TrackingStats;
    leaks: LeakInfo[];
    resourcesByType: Record<ResourceType, number>;
    oldestResources: Array<{ metadata: ResourceMetadata; ageMs: number }>;
  } {
    const leaks = this.detectLeaks();
    const resourcesByType = {} as Record<ResourceType, number>;
    const allResources: Array<{ metadata: ResourceMetadata; ageMs: number }> = [];
    const now = Date.now();

    // Count resources by type and collect all resources
    for (const tracked of this.leakTracking.values()) {
      const resource = tracked.weakRef.deref();
      if (resource) {
        const type = tracked.metadata.type;
        resourcesByType[type] = (resourcesByType[type] || 0) + 1;
        
        allResources.push({
          metadata: tracked.metadata,
          ageMs: now - tracked.metadata.createdAt.getTime(),
        });
      }
    }

    // Sort by age and take the oldest 10
    const oldestResources = allResources
      .sort((a, b) => b.ageMs - a.ageMs)
      .slice(0, 10);

    return {
      stats: this.getStats(),
      leaks,
      resourcesByType,
      oldestResources,
    };
  }

  /**
   * Handle finalization callback from FinalizationRegistry
   */
  private handleFinalization(heldValue: {
    id: string;
    type: ResourceType;
    handle?: WalletHandle;
  }): void {
    // Remove from leak tracking
    this.leakTracking.delete(heldValue.id);

    // Update statistics
    this.stats.gcCleaned++;
    this.stats.currentActive = Math.max(0, this.stats.currentActive - 1);
    this.updateMemoryEstimate();

    // Log finalization in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `FFI Resource finalized: ${heldValue.type} (${heldValue.id})`,
        heldValue.handle ? `handle: ${heldValue.handle}` : ''
      );
    }
  }

  /**
   * Generate unique resource ID
   */
  private generateResourceId(): string {
    return `ffi_${Date.now()}_${++this.resourceCounter}`;
  }

  /**
   * Capture stack trace for debugging
   */
  private captureStack(): string {
    const stack = new Error().stack;
    return stack ? stack.split('\n').slice(2, 12).join('\n') : 'Stack trace unavailable';
  }

  /**
   * Update memory usage estimate
   */
  private updateMemoryEstimate(): void {
    // Rough estimate: 1KB per tracked resource
    this.stats.estimatedMemoryUsage = this.stats.currentActive * 1024;
  }

  /**
   * Enforce tracking limits to prevent memory growth
   */
  private enforceTrackingLimits(): void {
    if (this.leakTracking.size > this.config.maxTrackedResources) {
      this.cleanupDeadReferences();
      
      // If still over limit, remove oldest resources
      if (this.leakTracking.size > this.config.maxTrackedResources) {
        const toRemove = this.leakTracking.size - this.config.maxTrackedResources;
        const entries = Array.from(this.leakTracking.entries());
        
        // Sort by creation time and remove oldest
        entries
          .sort((a, b) => a[1].metadata.createdAt.getTime() - b[1].metadata.createdAt.getTime())
          .slice(0, toRemove)
          .forEach(([id]) => this.leakTracking.delete(id));
      }
    }
  }

  /**
   * Clean up dead weak references
   */
  private cleanupDeadReferences(): void {
    for (const [id, tracked] of this.leakTracking.entries()) {
      if (!tracked.weakRef.deref()) {
        this.leakTracking.delete(id);
      }
    }
  }
}

/**
 * Convenience functions for global resource tracking
 */

/**
 * Get the global resource tracker instance
 */
export function getResourceTracker(): ResourceTracker {
  return ResourceTracker.getInstance();
}

/**
 * Register a resource with the global tracker
 */
export function trackResource(
  resource: FFIResource,
  type: ResourceType,
  handle?: WalletHandle,
  tags?: string[]
): string {
  return getResourceTracker().register(resource, type, handle, tags);
}

/**
 * Unregister a resource from the global tracker
 */
export function untrackResource(resource: FFIResource): void {
  getResourceTracker().unregister(resource);
}

/**
 * Perform global leak detection
 */
export function detectResourceLeaks(): LeakInfo[] {
  return getResourceTracker().detectLeaks();
}

/**
 * Get global resource statistics
 */
export function getResourceStats(): TrackingStats {
  return getResourceTracker().getStats();
}

/**
 * Generate global diagnostic report
 */
export function generateResourceDiagnostics() {
  return getResourceTracker().generateDiagnosticReport();
}
