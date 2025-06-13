import { DisposableResource } from './disposable';

/**
 * Heap statistics collector and analyzer
 * Provides detailed heap analysis and memory usage insights
 */

/**
 * Heap space information
 */
export interface HeapSpace {
  name: string;
  size: number;
  used: number;
  available: number;
  physicalSize: number;
}

/**
 * Heap statistics snapshot
 */
export interface HeapSnapshot {
  timestamp: number;
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
  spaces: HeapSpace[];
  processMemory: NodeJS.MemoryUsage;
}

/**
 * Heap analysis result
 */
export interface HeapAnalysis {
  fragmentation: number;
  utilization: number;
  growthRate: number;
  pressure: number;
  efficiency: number;
  recommendations: string[];
  trends: HeapTrends;
}

/**
 * Heap trends analysis
 */
export interface HeapTrends {
  memoryGrowth: TrendData;
  fragmentationTrend: TrendData;
  gcFrequency: TrendData;
  allocationsRate: TrendData;
}

/**
 * Trend data for a specific metric
 */
export interface TrendData {
  direction: 'increasing' | 'decreasing' | 'stable';
  rate: number;
  confidence: number;
  duration: number;
}

/**
 * Heap statistics configuration
 */
export interface HeapStatsConfig {
  /** Collection interval in milliseconds */
  interval: number;
  /** Maximum snapshots to keep */
  maxSnapshots: number;
  /** Enable detailed space analysis */
  enableSpaceAnalysis: boolean;
  /** Enable trend analysis */
  enableTrendAnalysis: boolean;
  /** Trend analysis window in milliseconds */
  trendWindow: number;
}

/**
 * Heap statistics collector
 */
export class HeapStatsCollector extends DisposableResource {
  private readonly config: HeapStatsConfig;
  private readonly snapshots: HeapSnapshot[] = [];
  private collectionTimer?: NodeJS.Timeout;
  private isCollecting = false;
  private v8: any;

  constructor(config: Partial<HeapStatsConfig> = {}) {
    super();
    
    this.config = {
      interval: 30000, // 30 seconds
      maxSnapshots: 200,
      enableSpaceAnalysis: true,
      enableTrendAnalysis: true,
      trendWindow: 600000, // 10 minutes
      ...config
    };

    try {
      this.v8 = require('v8');
    } catch (error) {
      console.warn('V8 module not available, heap statistics will be limited');
    }
  }

  /**
   * Start collecting heap statistics
   */
  start(): void {
    if (this.isCollecting) return;
    
    this.isCollecting = true;
    this.scheduleCollection();
  }

  /**
   * Stop collecting heap statistics
   */
  stop(): void {
    if (!this.isCollecting) return;
    
    this.isCollecting = false;
    if (this.collectionTimer) {
      clearTimeout(this.collectionTimer);
      this.collectionTimer = undefined;
    }
  }

  /**
   * Take a manual snapshot
   */
  takeSnapshot(): HeapSnapshot {
    const snapshot = this.createSnapshot();
    this.addSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Get all collected snapshots
   */
  getSnapshots(): HeapSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get latest snapshot
   */
  getLatestSnapshot(): HeapSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * Get snapshots within time range
   */
  getSnapshotsInRange(startTime: number, endTime: number): HeapSnapshot[] {
    return this.snapshots.filter(s => 
      s.timestamp >= startTime && s.timestamp <= endTime
    );
  }

  /**
   * Analyze current heap state
   */
  analyzeHeap(): HeapAnalysis {
    const snapshot = this.getLatestSnapshot();
    if (!snapshot) {
      throw new Error('No heap snapshots available for analysis');
    }

    return this.performAnalysis(snapshot);
  }

  /**
   * Get heap fragmentation percentage
   */
  getFragmentation(): number {
    const snapshot = this.getLatestSnapshot();
    if (!snapshot) return 0;

    return this.calculateFragmentation(snapshot);
  }

  /**
   * Get heap utilization percentage
   */
  getUtilization(): number {
    const snapshot = this.getLatestSnapshot();
    if (!snapshot) return 0;

    return (snapshot.usedHeapSize / snapshot.totalHeapSize) * 100;
  }

  /**
   * Get memory growth rate (bytes per second)
   */
  getGrowthRate(): number {
    if (this.snapshots.length < 2) return 0;

    const latest = this.snapshots[this.snapshots.length - 1];
    const previous = this.snapshots[this.snapshots.length - 2];
    
    const timeDiff = (latest.timestamp - previous.timestamp) / 1000; // seconds
    const memoryDiff = latest.usedHeapSize - previous.usedHeapSize;
    
    return timeDiff > 0 ? memoryDiff / timeDiff : 0;
  }

  /**
   * Get trend analysis for specified duration
   */
  getTrends(durationMs?: number): HeapTrends | null {
    if (!this.config.enableTrendAnalysis || this.snapshots.length < 5) {
      return null;
    }

    const duration = durationMs || this.config.trendWindow;
    const cutoff = Date.now() - duration;
    const relevantSnapshots = this.snapshots.filter(s => s.timestamp >= cutoff);
    
    if (relevantSnapshots.length < 3) return null;

    return {
      memoryGrowth: this.analyzeTrend(
        relevantSnapshots.map(s => ({ x: s.timestamp, y: s.usedHeapSize }))
      ),
      fragmentationTrend: this.analyzeTrend(
        relevantSnapshots.map(s => ({ x: s.timestamp, y: this.calculateFragmentation(s) }))
      ),
      gcFrequency: this.calculateGCFrequencyTrend(relevantSnapshots),
      allocationsRate: this.calculateAllocationRateTrend(relevantSnapshots)
    };
  }

  /**
   * Export snapshots to JSON
   */
  exportSnapshots(): string {
    return JSON.stringify({
      config: this.config,
      snapshots: this.snapshots,
      exportTime: Date.now()
    }, null, 2);
  }

  /**
   * Import snapshots from JSON
   */
  importSnapshots(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.snapshots && Array.isArray(parsed.snapshots)) {
        this.snapshots.splice(0, this.snapshots.length, ...parsed.snapshots);
      }
    } catch (error) {
      throw new Error(`Invalid snapshot data: ${error}`);
    }
  }

  /**
   * Clear all collected snapshots
   */
  clearSnapshots(): void {
    this.snapshots.length = 0;
  }

  /**
   * Schedule next collection
   */
  private scheduleCollection(): void {
    if (!this.isCollecting) return;
    
    this.collectionTimer = setTimeout(() => {
      try {
        this.takeSnapshot();
      } catch (error) {
        console.error('Error collecting heap snapshot:', error);
      }
      
      this.scheduleCollection();
    }, this.config.interval);
  }

  /**
   * Create a heap snapshot
   */
  private createSnapshot(): HeapSnapshot {
    const processMemory = process.memoryUsage();
    let heapStats: any = {};
    let spaces: HeapSpace[] = [];

    // Get V8 heap statistics if available
    if (this.v8) {
      try {
        heapStats = this.v8.getHeapStatistics();
        
        if (this.config.enableSpaceAnalysis) {
          spaces = this.collectHeapSpaces();
        }
      } catch (error) {
        console.warn('Error getting V8 heap statistics:', error);
      }
    }

    return {
      timestamp: Date.now(),
      totalHeapSize: heapStats.totalHeapSize || processMemory.heapTotal,
      totalHeapSizeExecutable: heapStats.totalHeapSizeExecutable || 0,
      totalPhysicalSize: heapStats.totalPhysicalSize || 0,
      totalAvailableSize: heapStats.totalAvailableSize || 0,
      usedHeapSize: heapStats.usedHeapSize || processMemory.heapUsed,
      heapSizeLimit: heapStats.heapSizeLimit || 0,
      mallocedMemory: heapStats.mallocedMemory || 0,
      peakMallocedMemory: heapStats.peakMallocedMemory || 0,
      doesZapGarbage: heapStats.doesZapGarbage || 0,
      numberOfNativeContexts: heapStats.numberOfNativeContexts || 0,
      numberOfDetachedContexts: heapStats.numberOfDetachedContexts || 0,
      spaces,
      processMemory
    };
  }

  /**
   * Collect heap space information
   */
  private collectHeapSpaces(): HeapSpace[] {
    if (!this.v8?.getHeapSpaceStatistics) return [];

    try {
      return this.v8.getHeapSpaceStatistics().map((space: any) => ({
        name: space.spaceName,
        size: space.spaceSize,
        used: space.spaceUsedSize,
        available: space.spaceAvailableSize,
        physicalSize: space.physicalSpaceSize
      }));
    } catch (error) {
      console.warn('Error getting heap space statistics:', error);
      return [];
    }
  }

  /**
   * Add snapshot to collection
   */
  private addSnapshot(snapshot: HeapSnapshot): void {
    this.snapshots.push(snapshot);
    
    // Maintain maximum snapshots limit
    while (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Perform comprehensive heap analysis
   */
  private performAnalysis(snapshot: HeapSnapshot): HeapAnalysis {
    const fragmentation = this.calculateFragmentation(snapshot);
    const utilization = (snapshot.usedHeapSize / snapshot.totalHeapSize) * 100;
    const growthRate = this.getGrowthRate();
    const pressure = this.calculateMemoryPressure(snapshot);
    const efficiency = this.calculateHeapEfficiency(snapshot);
    
    const recommendations = this.generateRecommendations({
      fragmentation,
      utilization,
      growthRate,
      pressure,
      efficiency,
      snapshot
    });

    const trends = this.getTrends() || {
      memoryGrowth: this.createEmptyTrend(),
      fragmentationTrend: this.createEmptyTrend(),
      gcFrequency: this.createEmptyTrend(),
      allocationsRate: this.createEmptyTrend()
    };

    return {
      fragmentation,
      utilization,
      growthRate,
      pressure,
      efficiency,
      recommendations,
      trends
    };
  }

  /**
   * Calculate heap fragmentation percentage
   */
  private calculateFragmentation(snapshot: HeapSnapshot): number {
    if (snapshot.totalHeapSize === 0) return 0;
    
    const overhead = snapshot.totalHeapSize - snapshot.usedHeapSize;
    return (overhead / snapshot.totalHeapSize) * 100;
  }

  /**
   * Calculate memory pressure (0-100)
   */
  private calculateMemoryPressure(snapshot: HeapSnapshot): number {
    if (snapshot.heapSizeLimit === 0) {
      // Fallback calculation using process memory
      return (snapshot.processMemory.heapUsed / snapshot.processMemory.heapTotal) * 100;
    }
    
    return (snapshot.usedHeapSize / snapshot.heapSizeLimit) * 100;
  }

  /**
   * Calculate heap efficiency score (0-100)
   */
  private calculateHeapEfficiency(snapshot: HeapSnapshot): number {
    let score = 100;
    
    // Deduct for high fragmentation
    const fragmentation = this.calculateFragmentation(snapshot);
    score -= fragmentation * 0.5;
    
    // Deduct for low utilization
    const utilization = (snapshot.usedHeapSize / snapshot.totalHeapSize) * 100;
    if (utilization < 50) {
      score -= (50 - utilization) * 0.3;
    }
    
    // Deduct for high number of detached contexts
    if (snapshot.numberOfDetachedContexts > 0) {
      score -= snapshot.numberOfDetachedContexts * 2;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(analysis: {
    fragmentation: number;
    utilization: number;
    growthRate: number;
    pressure: number;
    efficiency: number;
    snapshot: HeapSnapshot;
  }): string[] {
    const recommendations: string[] = [];
    
    if (analysis.fragmentation > 30) {
      recommendations.push('High heap fragmentation detected - consider triggering garbage collection');
    }
    
    if (analysis.utilization < 30) {
      recommendations.push('Low heap utilization - heap size may be over-allocated');
    }
    
    if (analysis.growthRate > 1024 * 1024) { // 1MB/s
      recommendations.push('High memory growth rate detected - investigate for memory leaks');
    }
    
    if (analysis.pressure > 85) {
      recommendations.push('High memory pressure - consider reducing memory usage or increasing heap limit');
    }
    
    if (analysis.snapshot.numberOfDetachedContexts > 5) {
      recommendations.push('Multiple detached contexts detected - check for closure memory leaks');
    }
    
    if (analysis.efficiency < 60) {
      recommendations.push('Low heap efficiency - consider memory optimization strategies');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Heap appears to be operating efficiently');
    }
    
    return recommendations;
  }

  /**
   * Analyze trend for a data series
   */
  private analyzeTrend(data: Array<{ x: number; y: number }>): TrendData {
    if (data.length < 3) {
      return this.createEmptyTrend();
    }

    // Linear regression
    const n = data.length;
    const sumX = data.reduce((sum, point) => sum + point.x, 0);
    const sumY = data.reduce((sum, point) => sum + point.y, 0);
    const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumX2 = data.reduce((sum, point) => sum + point.x * point.x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssTotal = data.reduce((sum, point) => sum + Math.pow(point.y - yMean, 2), 0);
    const ssRes = data.reduce((sum, point) => {
      const predicted = slope * point.x + (sumY - slope * sumX) / n;
      return sum + Math.pow(point.y - predicted, 2);
    }, 0);
    
    const rSquared = ssTotal > 0 ? 1 - (ssRes / ssTotal) : 0;
    const confidence = Math.max(0, Math.min(1, rSquared));
    
    let direction: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(slope) < 0.1) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }
    
    const duration = data[data.length - 1].x - data[0].x;
    
    return {
      direction,
      rate: Math.abs(slope),
      confidence,
      duration
    };
  }

  /**
   * Calculate GC frequency trend
   */
  private calculateGCFrequencyTrend(snapshots: HeapSnapshot[]): TrendData {
    // This would require GC event tracking
    // For now, return empty trend
    return this.createEmptyTrend();
  }

  /**
   * Calculate allocation rate trend
   */
  private calculateAllocationRateTrend(snapshots: HeapSnapshot[]): TrendData {
    if (snapshots.length < 2) {
      return this.createEmptyTrend();
    }

    const rates = [];
    for (let i = 1; i < snapshots.length; i++) {
      const timeDiff = (snapshots[i].timestamp - snapshots[i - 1].timestamp) / 1000;
      const memoryDiff = snapshots[i].usedHeapSize - snapshots[i - 1].usedHeapSize;
      rates.push({ x: snapshots[i].timestamp, y: memoryDiff / timeDiff });
    }

    return this.analyzeTrend(rates);
  }

  /**
   * Create empty trend data
   */
  private createEmptyTrend(): TrendData {
    return {
      direction: 'stable',
      rate: 0,
      confidence: 0,
      duration: 0
    };
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    this.stop();
    this.snapshots.length = 0;
  }
}

/**
 * Heap statistics utilities
 */
export class HeapStatsUtils {
  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Compare two snapshots
   */
  static compareSnapshots(
    before: HeapSnapshot,
    after: HeapSnapshot
  ): {
    memoryDelta: number;
    timeDelta: number;
    growthRate: number;
    fragmentationChange: number;
  } {
    const memoryDelta = after.usedHeapSize - before.usedHeapSize;
    const timeDelta = after.timestamp - before.timestamp;
    const growthRate = timeDelta > 0 ? (memoryDelta / timeDelta) * 1000 : 0; // bytes per second
    
    const beforeFrag = (before.totalHeapSize - before.usedHeapSize) / before.totalHeapSize * 100;
    const afterFrag = (after.totalHeapSize - after.usedHeapSize) / after.totalHeapSize * 100;
    const fragmentationChange = afterFrag - beforeFrag;
    
    return {
      memoryDelta,
      timeDelta,
      growthRate,
      fragmentationChange
    };
  }

  /**
   * Get heap summary from snapshot
   */
  static getHeapSummary(snapshot: HeapSnapshot): string {
    const utilization = (snapshot.usedHeapSize / snapshot.totalHeapSize * 100).toFixed(1);
    const fragmentation = ((snapshot.totalHeapSize - snapshot.usedHeapSize) / snapshot.totalHeapSize * 100).toFixed(1);
    
    return [
      `Heap Usage: ${this.formatBytes(snapshot.usedHeapSize)} / ${this.formatBytes(snapshot.totalHeapSize)} (${utilization}%)`,
      `Fragmentation: ${fragmentation}%`,
      `RSS: ${this.formatBytes(snapshot.processMemory.rss)}`,
      `External: ${this.formatBytes(snapshot.processMemory.external)}`,
      `Native Contexts: ${snapshot.numberOfNativeContexts}`,
      `Detached Contexts: ${snapshot.numberOfDetachedContexts}`
    ].join('\n');
  }
}

/**
 * Global heap statistics collector
 */
let globalHeapStats: HeapStatsCollector | undefined;

/**
 * Get or create global heap statistics collector
 */
export function getGlobalHeapStats(): HeapStatsCollector {
  if (!globalHeapStats) {
    globalHeapStats = new HeapStatsCollector();
    globalHeapStats.start();
  }
  return globalHeapStats;
}

/**
 * Set custom global heap statistics collector
 */
export function setGlobalHeapStats(collector: HeapStatsCollector): void {
  if (globalHeapStats) {
    globalHeapStats[Symbol.dispose]();
  }
  globalHeapStats = collector;
}
