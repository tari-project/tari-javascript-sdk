import { DisposableResource } from './disposable';
import { MemoryUtils, MemorySnapshot } from './memory-utils';
import { ProcessDetection } from '../utils/process-detection';
import { EventEmitter } from 'events';

/**
 * Memory pressure monitoring system
 * Monitors memory usage and triggers appropriate responses to memory pressure
 */

/**
 * Memory pressure levels
 */
export type MemoryPressureLevel = 'normal' | 'moderate' | 'high' | 'critical';

/**
 * Memory pressure event types
 */
export interface MemoryPressureEvents {
  pressureChange: (level: MemoryPressureLevel, metrics: MemoryMetrics) => void;
  threshold: (threshold: string, metrics: MemoryMetrics) => void;
  leak: (detection: MemoryLeakDetection) => void;
  cleanup: (cleaned: number, metrics: MemoryMetrics) => void;
}

/**
 * Memory metrics
 */
export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  heapUsageRatio: number;
  pressureLevel: MemoryPressureLevel;
  timestamp: number;
}

/**
 * Memory pressure thresholds
 */
export interface MemoryThresholds {
  moderate: number;    // 0.7 = 70% heap usage
  high: number;        // 0.85 = 85% heap usage
  critical: number;    // 0.95 = 95% heap usage
  rssLimit?: number;   // Absolute RSS limit in bytes
  heapLimit?: number;  // Absolute heap limit in bytes
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  /** Monitoring interval in milliseconds */
  interval: number;
  /** Memory thresholds */
  thresholds: MemoryThresholds;
  /** Enable leak detection */
  enableLeakDetection: boolean;
  /** Leak detection window in milliseconds */
  leakDetectionWindow: number;
  /** Automatic cleanup on pressure */
  enableAutoCleanup: boolean;
  /** History size for trend analysis */
  historySize: number;
}

/**
 * Memory leak detection result
 */
export interface MemoryLeakDetection {
  detected: boolean;
  growthRate: number; // bytes per second
  trend: 'increasing' | 'stable' | 'decreasing';
  confidence: number; // 0-1
  suggestions: string[];
}

/**
 * Cleanup handler function
 */
export type CleanupHandler = (pressureLevel: MemoryPressureLevel, metrics: MemoryMetrics) => Promise<number>;

/**
 * Memory pressure monitor implementation
 */
export class MemoryPressureMonitor extends DisposableResource {
  private readonly config: MonitorConfig;
  private readonly emitter = new EventEmitter();
  private readonly history: MemoryMetrics[] = [];
  private readonly cleanupHandlers: CleanupHandler[] = [];
  private monitorTimer?: NodeJS.Timeout;
  private currentLevel: MemoryPressureLevel = 'normal';
  private lastCleanup = 0;
  private isMonitoring = false;

  constructor(config: Partial<MonitorConfig> = {}) {
    super();
    
    this.config = {
      interval: 5000, // 5 seconds
      thresholds: {
        moderate: 0.7,
        high: 0.85,
        critical: 0.95
      },
      enableLeakDetection: true,
      leakDetectionWindow: 300000, // 5 minutes
      enableAutoCleanup: true,
      historySize: 100,
      ...config
    };

    this.setupProcessHandlers();
  }

  /**
   * Start monitoring memory pressure
   */
  start(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.scheduleNextCheck();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.monitorTimer) {
      clearTimeout(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  /**
   * Register event listener
   */
  on<K extends keyof MemoryPressureEvents>(
    event: K,
    listener: MemoryPressureEvents[K]
  ): void {
    this.emitter.on(event, listener);
  }

  /**
   * Unregister event listener
   */
  off<K extends keyof MemoryPressureEvents>(
    event: K,
    listener: MemoryPressureEvents[K]
  ): void {
    this.emitter.off(event, listener);
  }

  /**
   * Register cleanup handler
   */
  addCleanupHandler(handler: CleanupHandler): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Remove cleanup handler
   */
  removeCleanupHandler(handler: CleanupHandler): void {
    const index = this.cleanupHandlers.indexOf(handler);
    if (index >= 0) {
      this.cleanupHandlers.splice(index, 1);
    }
  }

  /**
   * Get current memory metrics
   */
  getCurrentMetrics(): MemoryMetrics {
    const usage = ProcessDetection.getMemoryUsage();
    if (!usage) {
      // Return default metrics for non-Node.js environments
      return {
        heapUsed: 0,
        heapTotal: 0,
        rss: 0,
        external: 0,
        arrayBuffers: 0,
        heapUsageRatio: 0,
        pressureLevel: 'normal',
        timestamp: Date.now()
      };
    }
    const heapUsageRatio = usage.heapUsed / usage.heapTotal;
    
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      heapUsageRatio,
      pressureLevel: this.calculatePressureLevel(heapUsageRatio, usage),
      timestamp: Date.now()
    };
  }

  /**
   * Get current pressure level
   */
  getCurrentPressureLevel(): MemoryPressureLevel {
    return this.currentLevel;
  }

  /**
   * Get memory usage history
   */
  getHistory(): MemoryMetrics[] {
    return [...this.history];
  }

  /**
   * Manually trigger cleanup
   */
  async triggerCleanup(): Promise<number> {
    const metrics = this.getCurrentMetrics();
    return await this.performCleanup(metrics);
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): boolean {
    return MemoryUtils.forceGarbageCollection();
  }

  /**
   * Detect memory leaks
   */
  detectLeaks(): MemoryLeakDetection | null {
    if (!this.config.enableLeakDetection || this.history.length < 10) {
      return null;
    }

    const windowStart = Date.now() - this.config.leakDetectionWindow;
    const relevantHistory = this.history.filter(m => m.timestamp >= windowStart);
    
    if (relevantHistory.length < 5) {
      return null;
    }

    return this.analyzeMemoryTrend(relevantHistory);
  }

  /**
   * Get configuration
   */
  getConfig(): MonitorConfig {
    return { ...this.config };
  }

  /**
   * Update thresholds
   */
  updateThresholds(thresholds: Partial<MemoryThresholds>): void {
    Object.assign(this.config.thresholds, thresholds);
  }

  /**
   * Schedule next memory check
   */
  private scheduleNextCheck(): void {
    if (!this.isMonitoring) return;
    
    this.monitorTimer = setTimeout(() => {
      this.performCheck();
      this.scheduleNextCheck();
    }, this.config.interval);
  }

  /**
   * Perform memory check
   */
  private async performCheck(): Promise<void> {
    try {
      const metrics = this.getCurrentMetrics();
      
      // Add to history
      this.addToHistory(metrics);
      
      // Check for pressure level changes
      if (metrics.pressureLevel !== this.currentLevel) {
        const previousLevel = this.currentLevel;
        this.currentLevel = metrics.pressureLevel;
        
        this.emitter.emit('pressureChange', this.currentLevel, metrics);
        
        // Trigger cleanup on pressure increase
        if (this.config.enableAutoCleanup && this.shouldTriggerCleanup(previousLevel, this.currentLevel)) {
          await this.performCleanup(metrics);
        }
      }
      
      // Check specific thresholds
      this.checkThresholds(metrics);
      
      // Detect memory leaks
      if (this.config.enableLeakDetection) {
        const leakDetection = this.detectLeaks();
        if (leakDetection?.detected) {
          this.emitter.emit('leak', leakDetection);
        }
      }
    } catch (error) {
      console.error('Error during memory pressure check:', error);
    }
  }

  /**
   * Add metrics to history
   */
  private addToHistory(metrics: MemoryMetrics): void {
    this.history.push(metrics);
    
    // Maintain history size
    while (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }

  /**
   * Calculate pressure level
   */
  private calculatePressureLevel(heapRatio: number, usage: NodeJS.MemoryUsage): MemoryPressureLevel {
    const { thresholds } = this.config;
    
    // Check absolute limits first
    if (thresholds.rssLimit && usage.rss >= thresholds.rssLimit) {
      return 'critical';
    }
    
    if (thresholds.heapLimit && usage.heapUsed >= thresholds.heapLimit) {
      return 'critical';
    }
    
    // Check ratio-based thresholds
    if (heapRatio >= thresholds.critical) {
      return 'critical';
    } else if (heapRatio >= thresholds.high) {
      return 'high';
    } else if (heapRatio >= thresholds.moderate) {
      return 'moderate';
    } else {
      return 'normal';
    }
  }

  /**
   * Check if cleanup should be triggered
   */
  private shouldTriggerCleanup(previous: MemoryPressureLevel, current: MemoryPressureLevel): boolean {
    const levels = ['normal', 'moderate', 'high', 'critical'];
    const previousIndex = levels.indexOf(previous);
    const currentIndex = levels.indexOf(current);
    
    // Trigger if pressure increased
    return currentIndex > previousIndex && currentIndex >= 2; // high or critical
  }

  /**
   * Check specific thresholds
   */
  private checkThresholds(metrics: MemoryMetrics): void {
    const { thresholds } = this.config;
    
    if (metrics.heapUsageRatio >= thresholds.critical) {
      this.emitter.emit('threshold', 'critical', metrics);
    } else if (metrics.heapUsageRatio >= thresholds.high) {
      this.emitter.emit('threshold', 'high', metrics);
    } else if (metrics.heapUsageRatio >= thresholds.moderate) {
      this.emitter.emit('threshold', 'moderate', metrics);
    }
    
    if (thresholds.rssLimit && metrics.rss >= thresholds.rssLimit) {
      this.emitter.emit('threshold', 'rss-limit', metrics);
    }
    
    if (thresholds.heapLimit && metrics.heapUsed >= thresholds.heapLimit) {
      this.emitter.emit('threshold', 'heap-limit', metrics);
    }
  }

  /**
   * Perform cleanup using registered handlers
   */
  private async performCleanup(metrics: MemoryMetrics): Promise<number> {
    const now = Date.now();
    
    // Avoid too frequent cleanups
    if (now - this.lastCleanup < 30000) { // 30 seconds minimum
      return 0;
    }
    
    this.lastCleanup = now;
    let totalCleaned = 0;
    
    // Run cleanup handlers
    for (const handler of this.cleanupHandlers) {
      try {
        const cleaned = await handler(this.currentLevel, metrics);
        totalCleaned += cleaned;
      } catch (error) {
        console.warn('Error in cleanup handler:', error);
      }
    }
    
    // Force GC if available
    if (this.currentLevel === 'critical') {
      this.forceGC();
    }
    
    this.emitter.emit('cleanup', totalCleaned, metrics);
    return totalCleaned;
  }

  /**
   * Analyze memory trend for leak detection
   */
  private analyzeMemoryTrend(history: MemoryMetrics[]): MemoryLeakDetection {
    if (history.length < 5) {
      return {
        detected: false,
        growthRate: 0,
        trend: 'stable',
        confidence: 0,
        suggestions: []
      };
    }

    // Calculate linear regression
    const n = history.length;
    const sumX = history.reduce((sum, _, i) => sum + i, 0);
    const sumY = history.reduce((sum, m) => sum + m.heapUsed, 0);
    const sumXY = history.reduce((sum, m, i) => sum + i * m.heapUsed, 0);
    const sumX2 = history.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const timeSpan = history[n - 1].timestamp - history[0].timestamp;
    const growthRate = (slope * 1000) / (timeSpan / n); // bytes per second
    
    // Determine trend
    let trend: 'increasing' | 'stable' | 'decreasing';
    if (Math.abs(growthRate) < 1000) { // Less than 1KB/s growth
      trend = 'stable';
    } else if (growthRate > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }
    
    // Calculate confidence based on R-squared
    const yMean = sumY / n;
    const ssTotal = history.reduce((sum, m) => sum + Math.pow(m.heapUsed - yMean, 2), 0);
    const ssRes = history.reduce((sum, m, i) => {
      const predicted = slope * i + (sumY - slope * sumX) / n;
      return sum + Math.pow(m.heapUsed - predicted, 2);
    }, 0);
    
    const rSquared = 1 - (ssRes / ssTotal);
    const confidence = Math.max(0, Math.min(1, rSquared));
    
    // Detect leak
    const detected = trend === 'increasing' && 
                    growthRate > 5000 && // More than 5KB/s growth
                    confidence > 0.7;
    
    // Generate suggestions
    const suggestions: string[] = [];
    if (detected) {
      suggestions.push('Consider reviewing recent code changes for memory leaks');
      suggestions.push('Check for unclosed resources or event listeners');
      suggestions.push('Review cache implementations for unbounded growth');
      
      if (growthRate > 50000) { // 50KB/s
        suggestions.push('Critical: Memory leak detected - immediate investigation required');
      }
    }

    return {
      detected,
      growthRate,
      trend,
      confidence,
      suggestions
    };
  }

  /**
   * Setup process-level memory event handlers
   */
  private setupProcessHandlers(): void {
    const proc = ProcessDetection.getProcess();
    if (!proc) {
      return; // Skip process handlers in non-Node.js environments
    }

    // Handle process warnings
    proc.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning' || 
          warning.message?.includes('memory')) {
        const metrics = this.getCurrentMetrics();
        this.emitter.emit('threshold', 'process-warning', metrics);
      }
    });

    // Handle uncaught exceptions that might indicate memory issues
    proc.on('uncaughtException', (error) => {
      if (error.message?.includes('out of memory') || 
          error.message?.includes('heap')) {
        const metrics = this.getCurrentMetrics();
        this.emitter.emit('threshold', 'oom-error', metrics);
      }
    });
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    this.stop();
    this.cleanupHandlers.length = 0;
    this.history.length = 0;
    this.emitter.removeAllListeners();
  }
}

/**
 * Default cleanup handlers
 */
export class DefaultCleanupHandlers {
  /**
   * Basic GC cleanup handler
   */
  static gcCleanup: CleanupHandler = async (level, metrics) => {
    if (level === 'critical' || level === 'high') {
      const beforeUsage = ProcessDetection.getMemoryUsage();
      if (!beforeUsage) {
        return 0; // Cannot measure GC effect without memory info
      }
      
      const beforeGC = beforeUsage.heapUsed;
      const gcForced = MemoryUtils.forceGarbageCollection();
      
      if (gcForced) {
        // Wait a bit for GC to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterUsage = ProcessDetection.getMemoryUsage();
        if (!afterUsage) {
          return 0; // Cannot measure GC effect
        }
        const afterGC = afterUsage.heapUsed;
        return Math.max(0, beforeGC - afterGC);
      }
    }
    return 0;
  };

  /**
   * Timer cleanup handler
   */
  static timerCleanup: CleanupHandler = async (level, metrics) => {
    if (level === 'critical') {
      // Clear old timers (this would need integration with timer tracking)
      // This is a placeholder - real implementation would track timers
      return 0;
    }
    return 0;
  };

  /**
   * Cache cleanup handler factory
   */
  static createCacheCleanup(caches: Array<{ clear: () => void; size?: () => number }>): CleanupHandler {
    return async (level, metrics) => {
      let cleaned = 0;
      
      if (level === 'high' || level === 'critical') {
        for (const cache of caches) {
          const sizeBefore = cache.size?.() || 0;
          cache.clear();
          const sizeAfter = cache.size?.() || 0;
          cleaned += sizeBefore - sizeAfter;
        }
      }
      
      return cleaned;
    };
  }
}

/**
 * Global memory pressure monitor
 */
let globalMonitor: MemoryPressureMonitor | undefined;

/**
 * Get or create global monitor
 */
export function getGlobalMemoryMonitor(): MemoryPressureMonitor {
  if (!globalMonitor) {
    globalMonitor = new MemoryPressureMonitor();
    globalMonitor.start();
  }
  return globalMonitor;
}

/**
 * Set custom global monitor
 */
export function setGlobalMemoryMonitor(monitor: MemoryPressureMonitor): void {
  if (globalMonitor) {
    globalMonitor[Symbol.dispose]();
  }
  globalMonitor = monitor;
}
