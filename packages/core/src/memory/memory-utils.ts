import { SecureBuffer } from './secure-buffer';

/**
 * Memory management utilities for the Tari SDK
 */
export class MemoryUtils {
  /**
   * Get current memory usage information
   */
  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Get heap statistics
   */
  static getHeapStatistics(): {
    totalHeapSize: number;
    totalHeapSizeExecutable: number;
    totalPhysicalSize: number;
    totalAvailableSize: number;
    usedHeapSize: number;
    heapSizeLimit: number;
    mallocedMemory: number;
    peakMallocedMemory: number;
    doesZapGarbage: number;
    numberOfNativeContexts: number;
    numberOfDetachedContexts: number;
  } {
    const v8 = require('v8');
    return v8.getHeapStatistics();
  }

  /**
   * Calculate memory usage ratio
   */
  static getMemoryPressure(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / usage.heapTotal;
  }

  /**
   * Force garbage collection if available
   */
  static forceGarbageCollection(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * Check if memory pressure is high
   */
  static isMemoryPressureHigh(threshold: number = 0.8): boolean {
    return this.getMemoryPressure() > threshold;
  }

  /**
   * Get memory usage formatted for logging
   */
  static formatMemoryUsage(): string {
    const usage = process.memoryUsage();
    const formatBytes = (bytes: number) => {
      const mb = bytes / 1024 / 1024;
      return `${mb.toFixed(2)}MB`;
    };

    return [
      `RSS: ${formatBytes(usage.rss)}`,
      `Heap Used: ${formatBytes(usage.heapUsed)}`,
      `Heap Total: ${formatBytes(usage.heapTotal)}`,
      `External: ${formatBytes(usage.external)}`,
      `Array Buffers: ${formatBytes(usage.arrayBuffers)}`
    ].join(', ');
  }

  /**
   * Monitor memory usage over time
   */
  static createMemoryMonitor(
    intervalMs: number = 5000,
    callback: (usage: NodeJS.MemoryUsage) => void
  ): () => void {
    const interval = setInterval(() => {
      callback(process.memoryUsage());
    }, intervalMs);

    return () => clearInterval(interval);
  }

  /**
   * Create a memory usage snapshot
   */
  static createSnapshot(): MemorySnapshot {
    return new MemorySnapshot();
  }

  /**
   * Estimate object size in memory (rough approximation)
   */
  static estimateObjectSize(obj: any): number {
    const seen = new WeakSet();
    
    function calculateSize(obj: any): number {
      if (obj === null || typeof obj !== 'object') {
        return typeof obj === 'string' ? obj.length * 2 : 8; // Rough estimate
      }
      
      if (seen.has(obj)) {
        return 0; // Avoid circular references
      }
      
      seen.add(obj);
      
      let size = 0;
      
      if (Buffer.isBuffer(obj)) {
        return obj.length;
      }
      
      if (obj instanceof SecureBuffer) {
        return obj.length;
      }
      
      if (Array.isArray(obj)) {
        size += obj.length * 8; // Array overhead
        for (const item of obj) {
          size += calculateSize(item);
        }
      } else {
        const keys = Object.keys(obj);
        size += keys.length * 8; // Object overhead
        for (const key of keys) {
          size += key.length * 2; // Key string
          size += calculateSize(obj[key]); // Value
        }
      }
      
      return size;
    }
    
    return calculateSize(obj);
  }

  /**
   * Create a weak reference with optional cleanup callback
   */
  static createWeakRef<T extends object>(
    target: T,
    cleanupCallback?: () => void
  ): WeakRef<T> {
    const ref = new WeakRef(target);
    
    if (cleanupCallback) {
      // Note: FinalizationRegistry is available in Node.js 14+
      if (typeof FinalizationRegistry !== 'undefined') {
        const registry = new FinalizationRegistry(cleanupCallback);
        registry.register(target, undefined);
      }
    }
    
    return ref;
  }

  /**
   * Batch process items to avoid memory spikes
   */
  static async batchProcess<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 100,
    delayMs: number = 0
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
      
      // Optional delay between batches to allow GC
      if (delayMs > 0 && i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }
}

/**
 * Memory usage snapshot for comparison
 */
export class MemorySnapshot {
  private readonly timestamp: number;
  private readonly usage: NodeJS.MemoryUsage;

  constructor() {
    this.timestamp = Date.now();
    this.usage = process.memoryUsage();
  }

  /**
   * Get the timestamp when snapshot was taken
   */
  get createdAt(): number {
    return this.timestamp;
  }

  /**
   * Get age of snapshot in milliseconds
   */
  get age(): number {
    return Date.now() - this.timestamp;
  }

  /**
   * Get memory usage at time of snapshot
   */
  get memoryUsage(): NodeJS.MemoryUsage {
    return { ...this.usage };
  }

  /**
   * Compare with current memory usage
   */
  compare(): MemoryComparison {
    const current = process.memoryUsage();
    return new MemoryComparison(this.usage, current);
  }

  /**
   * Compare with another snapshot
   */
  compareWith(other: MemorySnapshot): MemoryComparison {
    return new MemoryComparison(this.usage, other.usage);
  }

  /**
   * Format snapshot for logging
   */
  toString(): string {
    const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;
    
    return [
      `Memory Snapshot (${new Date(this.timestamp).toISOString()}):`,
      `  RSS: ${formatBytes(this.usage.rss)}`,
      `  Heap Used: ${formatBytes(this.usage.heapUsed)}`,
      `  Heap Total: ${formatBytes(this.usage.heapTotal)}`,
      `  External: ${formatBytes(this.usage.external)}`
    ].join('\n');
  }
}

/**
 * Memory usage comparison result
 */
export class MemoryComparison {
  constructor(
    private readonly before: NodeJS.MemoryUsage,
    private readonly after: NodeJS.MemoryUsage
  ) {}

  /**
   * Get difference in RSS memory
   */
  get rssDifference(): number {
    return this.after.rss - this.before.rss;
  }

  /**
   * Get difference in heap used
   */
  get heapUsedDifference(): number {
    return this.after.heapUsed - this.before.heapUsed;
  }

  /**
   * Get difference in heap total
   */
  get heapTotalDifference(): number {
    return this.after.heapTotal - this.before.heapTotal;
  }

  /**
   * Get difference in external memory
   */
  get externalDifference(): number {
    return this.after.external - this.before.external;
  }

  /**
   * Check if memory usage increased significantly
   */
  hasSignificantIncrease(thresholdMB: number = 10): boolean {
    const thresholdBytes = thresholdMB * 1024 * 1024;
    return this.heapUsedDifference > thresholdBytes;
  }

  /**
   * Check if memory was freed significantly
   */
  hasSignificantDecrease(thresholdMB: number = 10): boolean {
    const thresholdBytes = thresholdMB * 1024 * 1024;
    return this.heapUsedDifference < -thresholdBytes;
  }

  /**
   * Format comparison for logging
   */
  toString(): string {
    const formatDiff = (bytes: number) => {
      const mb = bytes / 1024 / 1024;
      const sign = mb >= 0 ? '+' : '';
      return `${sign}${mb.toFixed(2)}MB`;
    };

    return [
      'Memory Usage Comparison:',
      `  RSS: ${formatDiff(this.rssDifference)}`,
      `  Heap Used: ${formatDiff(this.heapUsedDifference)}`,
      `  Heap Total: ${formatDiff(this.heapTotalDifference)}`,
      `  External: ${formatDiff(this.externalDifference)}`
    ].join('\n');
  }
}

/**
 * Memory leak detector utility
 */
export class MemoryLeakDetector {
  private snapshots: MemorySnapshot[] = [];
  private readonly maxSnapshots: number;

  constructor(maxSnapshots: number = 10) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Take a memory snapshot
   */
  snapshot(): MemorySnapshot {
    const snapshot = new MemorySnapshot();
    this.snapshots.push(snapshot);
    
    // Remove old snapshots
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    
    return snapshot;
  }

  /**
   * Analyze memory trends
   */
  analyze(): MemoryTrend | null {
    if (this.snapshots.length < 2) {
      return null;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const comparison = first.compareWith(last);
    
    const timeSpan = last.createdAt - first.createdAt;
    const growthRate = comparison.heapUsedDifference / timeSpan; // bytes per ms

    return {
      timeSpan,
      totalGrowth: comparison.heapUsedDifference,
      growthRate: growthRate * 1000, // bytes per second
      isLikeLeak: growthRate > 1000, // More than 1KB/second growth
      snapshots: this.snapshots.length,
      comparison
    };
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots = [];
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }
}

/**
 * Memory trend analysis result
 */
export interface MemoryTrend {
  timeSpan: number;
  totalGrowth: number;
  growthRate: number;
  isLikeLeak: boolean;
  snapshots: number;
  comparison: MemoryComparison;
}
