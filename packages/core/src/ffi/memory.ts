/**
 * Memory monitoring and pressure handling for FFI operations
 * Provides proactive memory management and cleanup strategies
 */

import { EventEmitter } from 'node:events';
import { TariError, ErrorCode } from '../errors/index.js';
import { getPlatformManager } from './platform-utils.js';
import { getResourceTracker } from './tracker.js';

/**
 * Memory usage information
 */
export interface MemoryUsage {
  /** Resident set size (physical memory) */
  rss: number;
  /** Total heap allocated */
  heapTotal: number;
  /** Heap currently used */
  heapUsed: number;
  /** External memory (C++ objects bound to JS) */
  external: number;
  /** Array buffers allocated */
  arrayBuffers: number;
  /** Memory usage as percentage of system memory */
  systemPercentage?: number;
  /** Timestamp of measurement */
  timestamp: Date;
}

/**
 * Memory pressure levels
 */
export enum MemoryPressureLevel {
  Low = 'low',
  Moderate = 'moderate',
  High = 'high',
  Critical = 'critical',
}

/**
 * Memory pressure information
 */
export interface MemoryPressureInfo {
  /** Current pressure level */
  level: MemoryPressureLevel;
  /** Current memory usage */
  usage: MemoryUsage;
  /** Recommended actions */
  actions: string[];
  /** Whether garbage collection is recommended */
  recommendGC: boolean;
  /** Whether resource cleanup is needed */
  needsCleanup: boolean;
}

/**
 * Memory monitoring configuration
 */
export interface MemoryMonitorConfig {
  /** Monitoring interval in milliseconds */
  interval: number;
  /** Memory pressure thresholds (MB) */
  thresholds: {
    moderate: number;
    high: number;
    critical: number;
  };
  /** Enable automatic garbage collection */
  autoGC: boolean;
  /** GC trigger threshold (MB above baseline) */
  gcThreshold: number;
  /** Enable automatic resource cleanup */
  autoCleanup: boolean;
  /** History retention (number of samples) */
  historySize: number;
}

/**
 * Memory statistics for analysis
 */
export interface MemoryStats {
  /** Current usage */
  current: MemoryUsage;
  /** Peak usage since monitoring started */
  peak: MemoryUsage;
  /** Average usage over history */
  average: MemoryUsage;
  /** Memory growth rate (MB/sec) */
  growthRate: number;
  /** Number of GC triggers */
  gcCount: number;
  /** Number of cleanup operations */
  cleanupCount: number;
  /** Monitoring duration (ms) */
  monitoringDuration: number;
}

/**
 * Memory event types
 */
export interface MemoryEvents {
  'pressure-change': [info: MemoryPressureInfo];
  'gc-triggered': [usage: MemoryUsage];
  'cleanup-triggered': [resourceCount: number];
  'memory-leak-detected': [growthRate: number];
  'stats-updated': [stats: MemoryStats];
}

/**
 * Memory monitor with proactive pressure handling
 */
export class MemoryMonitor extends EventEmitter<MemoryEvents> {
  private static instance: MemoryMonitor | null = null;
  
  private readonly config: MemoryMonitorConfig;
  private readonly history: MemoryUsage[] = [];
  private intervalId?: NodeJS.Timeout;
  private running = false;
  private startTime = 0;
  private gcCount = 0;
  private cleanupCount = 0;
  private lastPressureLevel = MemoryPressureLevel.Low;

  private constructor(config?: Partial<MemoryMonitorConfig>) {
    super();
    
    // Get platform-specific defaults
    const platformManager = getPlatformManager();
    const platformOpts = platformManager.getOptimizations();
    
    this.config = {
      interval: 5000, // 5 seconds
      thresholds: {
        moderate: Math.floor(platformOpts.memoryPressureThreshold * 0.6),
        high: Math.floor(platformOpts.memoryPressureThreshold * 0.8),
        critical: platformOpts.memoryPressureThreshold,
      },
      autoGC: process.env.NODE_ENV === 'production',
      gcThreshold: 100, // 100MB above baseline
      autoCleanup: true,
      historySize: 120, // 10 minutes at 5-second intervals
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MemoryMonitorConfig>): MemoryMonitor {
    if (!this.instance) {
      this.instance = new MemoryMonitor(config);
    }
    return this.instance;
  }

  /**
   * Start memory monitoring
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.startTime = Date.now();
    
    // Take initial reading
    this.recordMemoryUsage();
    
    // Start periodic monitoring
    this.intervalId = setInterval(() => {
      this.recordMemoryUsage();
      this.analyzeMemoryPressure();
    }, this.config.interval);
  }

  /**
   * Stop memory monitoring
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Get current memory usage
   */
  getCurrentUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      timestamp: new Date(),
    };
  }

  /**
   * Get memory statistics
   */
  getStats(): MemoryStats {
    if (this.history.length === 0) {
      const current = this.getCurrentUsage();
      return {
        current,
        peak: current,
        average: current,
        growthRate: 0,
        gcCount: this.gcCount,
        cleanupCount: this.cleanupCount,
        monitoringDuration: Date.now() - this.startTime,
      };
    }

    const current = this.history[this.history.length - 1];
    const peak = this.calculatePeak();
    const average = this.calculateAverage();
    const growthRate = this.calculateGrowthRate();

    return {
      current,
      peak,
      average,
      growthRate,
      gcCount: this.gcCount,
      cleanupCount: this.cleanupCount,
      monitoringDuration: Date.now() - this.startTime,
    };
  }

  /**
   * Force garbage collection if available
   */
  async forceGC(): Promise<boolean> {
    if (global.gc) {
      const beforeUsage = this.getCurrentUsage();
      global.gc();
      
      // Wait a bit for GC to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const afterUsage = this.getCurrentUsage();
      this.gcCount++;
      
      this.emit('gc-triggered', afterUsage);
      
      return afterUsage.heapUsed < beforeUsage.heapUsed;
    }
    
    return false;
  }

  /**
   * Trigger resource cleanup
   */
  async triggerCleanup(): Promise<number> {
    const tracker = getResourceTracker();
    
    // Force cleanup of dead references
    tracker.forceCleanup();
    
    // Get resource count for reporting
    const stats = tracker.getStats();
    this.cleanupCount++;
    
    this.emit('cleanup-triggered', stats.currentActive);
    
    return stats.currentActive;
  }

  /**
   * Analyze current memory pressure and take action
   */
  async handleMemoryPressure(): Promise<MemoryPressureInfo> {
    const current = this.getCurrentUsage();
    const level = this.calculatePressureLevel(current);
    const actions: string[] = [];
    let recommendGC = false;
    let needsCleanup = false;

    // Determine recommended actions
    switch (level) {
      case MemoryPressureLevel.Critical:
        actions.push('Immediate garbage collection required');
        actions.push('Emergency resource cleanup needed');
        actions.push('Consider reducing concurrent operations');
        recommendGC = true;
        needsCleanup = true;
        break;

      case MemoryPressureLevel.High:
        actions.push('Garbage collection recommended');
        actions.push('Resource cleanup advised');
        actions.push('Monitor for memory leaks');
        recommendGC = this.config.autoGC;
        needsCleanup = this.config.autoCleanup;
        break;

      case MemoryPressureLevel.Moderate:
        actions.push('Monitor memory usage closely');
        actions.push('Consider proactive cleanup');
        needsCleanup = this.config.autoCleanup && this.shouldTriggerCleanup();
        break;

      case MemoryPressureLevel.Low:
        actions.push('Memory usage is normal');
        break;
    }

    // Take automatic actions if configured
    if (recommendGC && this.config.autoGC) {
      await this.forceGC();
    }

    if (needsCleanup && this.config.autoCleanup) {
      await this.triggerCleanup();
    }

    const info: MemoryPressureInfo = {
      level,
      usage: current,
      actions,
      recommendGC,
      needsCleanup,
    };

    // Emit event if pressure level changed
    if (level !== this.lastPressureLevel) {
      this.lastPressureLevel = level;
      this.emit('pressure-change', info);
    }

    return info;
  }

  /**
   * Check for memory leaks
   */
  detectMemoryLeaks(): { 
    leakDetected: boolean; 
    growthRate: number; 
    recommendations: string[]; 
  } {
    const stats = this.getStats();
    const growthRate = stats.growthRate;
    const recommendations: string[] = [];
    
    // Consider leak if growth rate > 10MB/minute consistently
    const leakThreshold = (10 * 1024 * 1024) / 60; // 10MB per minute in bytes per second
    const leakDetected = growthRate > leakThreshold;

    if (leakDetected) {
      recommendations.push('Memory leak detected - investigate resource disposal');
      recommendations.push('Check for unclosed handles and references');
      recommendations.push('Review resource tracking diagnostics');
      recommendations.push('Consider heap snapshot analysis');
      
      this.emit('memory-leak-detected', growthRate);
    }

    return {
      leakDetected,
      growthRate,
      recommendations,
    };
  }

  /**
   * Get memory usage history
   */
  getHistory(): MemoryUsage[] {
    return [...this.history];
  }

  /**
   * Record current memory usage
   */
  private recordMemoryUsage(): void {
    const usage = this.getCurrentUsage();
    
    this.history.push(usage);
    
    // Maintain history size
    if (this.history.length > this.config.historySize) {
      this.history.splice(0, this.history.length - this.config.historySize);
    }
  }

  /**
   * Analyze memory pressure and emit events
   */
  private async analyzeMemoryPressure(): Promise<void> {
    try {
      await this.handleMemoryPressure();
      
      // Emit stats update
      const stats = this.getStats();
      this.emit('stats-updated', stats);
      
      // Check for leaks periodically (every 5 readings)
      if (this.history.length % 5 === 0) {
        this.detectMemoryLeaks();
      }
    } catch (error) {
      console.error('Error analyzing memory pressure:', error);
    }
  }

  /**
   * Calculate memory pressure level
   */
  private calculatePressureLevel(usage: MemoryUsage): MemoryPressureLevel {
    const heapUsedMB = usage.heapUsed / (1024 * 1024);
    
    if (heapUsedMB >= this.config.thresholds.critical) {
      return MemoryPressureLevel.Critical;
    }
    
    if (heapUsedMB >= this.config.thresholds.high) {
      return MemoryPressureLevel.High;
    }
    
    if (heapUsedMB >= this.config.thresholds.moderate) {
      return MemoryPressureLevel.Moderate;
    }
    
    return MemoryPressureLevel.Low;
  }

  /**
   * Calculate peak memory usage
   */
  private calculatePeak(): MemoryUsage {
    return this.history.reduce((peak, current) => ({
      rss: Math.max(peak.rss, current.rss),
      heapTotal: Math.max(peak.heapTotal, current.heapTotal),
      heapUsed: Math.max(peak.heapUsed, current.heapUsed),
      external: Math.max(peak.external, current.external),
      arrayBuffers: Math.max(peak.arrayBuffers, current.arrayBuffers),
      timestamp: current.timestamp,
    }));
  }

  /**
   * Calculate average memory usage
   */
  private calculateAverage(): MemoryUsage {
    const count = this.history.length;
    if (count === 0) {
      return this.getCurrentUsage();
    }

    const totals = this.history.reduce((acc, usage) => ({
      rss: acc.rss + usage.rss,
      heapTotal: acc.heapTotal + usage.heapTotal,
      heapUsed: acc.heapUsed + usage.heapUsed,
      external: acc.external + usage.external,
      arrayBuffers: acc.arrayBuffers + usage.arrayBuffers,
    }), {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });

    return {
      rss: totals.rss / count,
      heapTotal: totals.heapTotal / count,
      heapUsed: totals.heapUsed / count,
      external: totals.external / count,
      arrayBuffers: totals.arrayBuffers / count,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate memory growth rate (bytes per second)
   */
  private calculateGrowthRate(): number {
    if (this.history.length < 2) {
      return 0;
    }

    const recent = this.history.slice(-10); // Last 10 readings
    if (recent.length < 2) {
      return 0;
    }

    const first = recent[0];
    const last = recent[recent.length - 1];
    const timeDiff = (last.timestamp.getTime() - first.timestamp.getTime()) / 1000; // seconds
    const memoryDiff = last.heapUsed - first.heapUsed; // bytes

    return timeDiff > 0 ? memoryDiff / timeDiff : 0;
  }

  /**
   * Check if cleanup should be triggered
   */
  private shouldTriggerCleanup(): boolean {
    if (this.history.length < 2) {
      return false;
    }

    const baseline = this.history[0];
    const current = this.history[this.history.length - 1];
    const growth = current.heapUsed - baseline.heapUsed;

    return growth > this.config.gcThreshold * 1024 * 1024; // Convert MB to bytes
  }
}

/**
 * Convenience functions for memory monitoring
 */

/**
 * Get memory monitor instance
 */
export function getMemoryMonitor(): MemoryMonitor {
  return MemoryMonitor.getInstance();
}

/**
 * Get current memory usage
 */
export function getCurrentMemoryUsage(): MemoryUsage {
  return getMemoryMonitor().getCurrentUsage();
}

/**
 * Get memory statistics
 */
export function getMemoryStats(): MemoryStats {
  return getMemoryMonitor().getStats();
}

/**
 * Start memory monitoring
 */
export function startMemoryMonitoring(config?: Partial<MemoryMonitorConfig>): void {
  const monitor = getMemoryMonitor();
  monitor.start();
}

/**
 * Stop memory monitoring
 */
export function stopMemoryMonitoring(): void {
  getMemoryMonitor().stop();
}

/**
 * Force garbage collection
 */
export async function forceGarbageCollection(): Promise<boolean> {
  return getMemoryMonitor().forceGC();
}

/**
 * Check memory pressure
 */
export async function checkMemoryPressure(): Promise<MemoryPressureInfo> {
  return getMemoryMonitor().handleMemoryPressure();
}

/**
 * Detect memory leaks
 */
export function detectMemoryLeaks() {
  return getMemoryMonitor().detectMemoryLeaks();
}
