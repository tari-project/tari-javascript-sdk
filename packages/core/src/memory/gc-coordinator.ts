import { DisposableResource } from './disposable';
import { MemoryUtils } from './memory-utils';

/**
 * Garbage collection coordinator for optimized memory management
 * Provides intelligent GC triggering and coordination with application lifecycle
 */

/**
 * GC strategy types
 */
export type GCStrategy = 
  | 'aggressive'   // Trigger GC frequently
  | 'conservative' // Trigger GC only when necessary
  | 'adaptive'     // Adjust based on memory patterns
  | 'scheduled';   // Trigger GC at scheduled intervals

/**
 * GC timing preferences
 */
export type GCTiming = 
  | 'immediate'    // Trigger GC immediately
  | 'deferred'     // Defer to next tick
  | 'idle'         // Trigger during idle periods
  | 'scheduled';   // Trigger at specific times

/**
 * GC coordinator configuration
 */
export interface GCConfig {
  /** GC strategy */
  strategy: GCStrategy;
  /** GC timing preference */
  timing: GCTiming;
  /** Memory pressure threshold to trigger GC */
  pressureThreshold: number;
  /** Minimum interval between GC calls (ms) */
  minInterval: number;
  /** Maximum interval for scheduled GC (ms) */
  maxInterval: number;
  /** Enable heap growth monitoring */
  enableHeapMonitoring: boolean;
  /** Heap growth threshold to trigger GC */
  heapGrowthThreshold: number;
  /** Enable idle time detection */
  enableIdleDetection: boolean;
  /** Idle timeout before triggering GC (ms) */
  idleTimeout: number;
}

/**
 * GC statistics
 */
export interface GCStats {
  totalGCCalls: number;
  forcedGCCalls: number;
  gcSuccessRate: number;
  averageMemoryFreed: number;
  lastGCTime: number;
  gcFrequency: number; // calls per minute
  heapGrowthRate: number; // bytes per second
}

/**
 * GC event types
 */
export interface GCEvents {
  beforeGC: (reason: string, metrics: GCMetrics) => void;
  afterGC: (result: GCResult) => void;
  gcSkipped: (reason: string) => void;
  heapGrowth: (growth: number, rate: number) => void;
}

/**
 * GC metrics before execution
 */
export interface GCMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  pressureLevel: number;
  timeSinceLastGC: number;
}

/**
 * GC execution result
 */
export interface GCResult {
  triggered: boolean;
  forced: boolean;
  reason: string;
  beforeHeap: number;
  afterHeap: number;
  memoryFreed: number;
  executionTime: number;
  timestamp: number;
}

/**
 * Activity monitor for idle detection
 */
interface ActivityMonitor {
  lastActivity: number;
  activityCount: number;
  isIdle: boolean;
}

/**
 * Garbage collection coordinator implementation
 */
export class GCCoordinator extends DisposableResource {
  private readonly config: GCConfig;
  private readonly stats: GCStats;
  private readonly activity: ActivityMonitor;
  private readonly listeners = new Map<keyof GCEvents, Set<Function>>();
  private lastGCTime = 0;
  private heapHistory: number[] = [];
  private scheduledGCTimer?: NodeJS.Timeout;
  private idleTimer?: NodeJS.Timeout;
  private isGCInProgress = false;

  constructor(config: Partial<GCConfig> = {}) {
    super();
    
    this.config = {
      strategy: 'adaptive',
      timing: 'idle',
      pressureThreshold: 0.8,
      minInterval: 30000, // 30 seconds
      maxInterval: 300000, // 5 minutes
      enableHeapMonitoring: true,
      heapGrowthThreshold: 10 * 1024 * 1024, // 10MB
      enableIdleDetection: true,
      idleTimeout: 5000, // 5 seconds
      ...config
    };

    this.stats = {
      totalGCCalls: 0,
      forcedGCCalls: 0,
      gcSuccessRate: 1.0,
      averageMemoryFreed: 0,
      lastGCTime: 0,
      gcFrequency: 0,
      heapGrowthRate: 0
    };

    this.activity = {
      lastActivity: Date.now(),
      activityCount: 0,
      isIdle: false
    };

    this.initialize();
  }

  /**
   * Register event listener
   */
  on<K extends keyof GCEvents>(event: K, listener: GCEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Unregister event listener
   */
  off<K extends keyof GCEvents>(event: K, listener: GCEvents[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  /**
   * Manually trigger garbage collection
   */
  async triggerGC(reason: string = 'manual', force: boolean = false): Promise<GCResult> {
    this.checkDisposed();

    if (this.isGCInProgress && !force) {
      return {
        triggered: false,
        forced: false,
        reason: 'gc-in-progress',
        beforeHeap: 0,
        afterHeap: 0,
        memoryFreed: 0,
        executionTime: 0,
        timestamp: Date.now()
      };
    }

    return await this.executeGC(reason, force);
  }

  /**
   * Record activity to update idle detection
   */
  recordActivity(): void {
    this.activity.lastActivity = Date.now();
    this.activity.activityCount++;
    
    if (this.activity.isIdle) {
      this.activity.isIdle = false;
      this.resetIdleTimer();
    }
  }

  /**
   * Check if GC should be triggered based on current conditions
   */
  shouldTriggerGC(): { should: boolean; reason: string } {
    const now = Date.now();
    const timeSinceLastGC = now - this.lastGCTime;
    
    // Respect minimum interval
    if (timeSinceLastGC < this.config.minInterval) {
      return { should: false, reason: 'min-interval-not-met' };
    }

    // Check memory pressure
    const memoryPressure = MemoryUtils.getMemoryPressure();
    if (memoryPressure >= this.config.pressureThreshold) {
      return { should: true, reason: 'memory-pressure' };
    }

    // Check heap growth
    if (this.config.enableHeapMonitoring) {
      const currentHeap = process.memoryUsage().heapUsed;
      if (this.heapHistory.length > 0) {
        const growth = currentHeap - this.heapHistory[0];
        if (growth >= this.config.heapGrowthThreshold) {
          return { should: true, reason: 'heap-growth' };
        }
      }
    }

    // Strategy-specific checks
    switch (this.config.strategy) {
      case 'aggressive':
        return { should: true, reason: 'aggressive-strategy' };
      
      case 'conservative':
        if (memoryPressure >= 0.9) {
          return { should: true, reason: 'conservative-high-pressure' };
        }
        break;
      
      case 'adaptive':
        const adaptiveThreshold = this.calculateAdaptiveThreshold();
        if (memoryPressure >= adaptiveThreshold) {
          return { should: true, reason: 'adaptive-threshold' };
        }
        break;
      
      case 'scheduled':
        if (timeSinceLastGC >= this.config.maxInterval) {
          return { should: true, reason: 'scheduled-interval' };
        }
        break;
    }

    return { should: false, reason: 'no-trigger-condition' };
  }

  /**
   * Get current GC statistics
   */
  getStats(): GCStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get current configuration
   */
  getConfig(): GCConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<GCConfig>): void {
    Object.assign(this.config, updates);
    
    // Restart timers if timing-related config changed
    if ('maxInterval' in updates || 'timing' in updates) {
      this.setupTimers();
    }
  }

  /**
   * Get heap growth rate
   */
  getHeapGrowthRate(): number {
    if (this.heapHistory.length < 2) return 0;
    
    const now = Date.now();
    const duration = now - this.stats.lastGCTime;
    const currentHeap = process.memoryUsage().heapUsed;
    const initialHeap = this.heapHistory[0];
    
    return duration > 0 ? (currentHeap - initialHeap) / (duration / 1000) : 0;
  }

  /**
   * Force immediate GC regardless of conditions
   */
  async forceGC(reason: string = 'forced'): Promise<GCResult> {
    return await this.triggerGC(reason, true);
  }

  /**
   * Schedule GC for next idle period
   */
  scheduleIdleGC(reason: string = 'scheduled-idle'): void {
    if (this.config.timing === 'idle' && this.config.enableIdleDetection) {
      this.resetIdleTimer();
    } else {
      // Schedule for next tick if idle detection is disabled
      process.nextTick(() => {
        this.triggerGC(reason).catch(console.error);
      });
    }
  }

  /**
   * Initialize the coordinator
   */
  private initialize(): void {
    this.updateHeapHistory();
    this.setupTimers();
    this.setupProcessHandlers();
  }

  /**
   * Execute garbage collection
   */
  private async executeGC(reason: string, forced: boolean = false): Promise<GCResult> {
    this.isGCInProgress = true;
    const startTime = Date.now();
    
    try {
      // Get before metrics
      const beforeUsage = process.memoryUsage();
      const metrics: GCMetrics = {
        heapUsed: beforeUsage.heapUsed,
        heapTotal: beforeUsage.heapTotal,
        rss: beforeUsage.rss,
        external: beforeUsage.external,
        pressureLevel: MemoryUtils.getMemoryPressure(),
        timeSinceLastGC: startTime - this.lastGCTime
      };

      // Emit before event
      this.emit('beforeGC', reason, metrics);

      // Attempt garbage collection
      const gcTriggered = forced || global.gc ? true : false;
      let actuallyTriggered = false;

      if (gcTriggered) {
        if (global.gc) {
          global.gc();
          actuallyTriggered = true;
        } else if (forced) {
          // Try alternative GC trigger methods
          actuallyTriggered = MemoryUtils.forceGarbageCollection();
        }
      }

      // Wait a bit for GC to complete
      if (actuallyTriggered) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Get after metrics
      const afterUsage = process.memoryUsage();
      const executionTime = Date.now() - startTime;
      const memoryFreed = Math.max(0, beforeUsage.heapUsed - afterUsage.heapUsed);

      const result: GCResult = {
        triggered: actuallyTriggered,
        forced,
        reason,
        beforeHeap: beforeUsage.heapUsed,
        afterHeap: afterUsage.heapUsed,
        memoryFreed,
        executionTime,
        timestamp: startTime
      };

      // Update statistics
      this.updateStatsAfterGC(result);
      
      // Emit after event
      this.emit('afterGC', result);

      return result;
    } finally {
      this.isGCInProgress = false;
      this.lastGCTime = startTime;
      this.updateHeapHistory();
    }
  }

  /**
   * Calculate adaptive threshold based on current conditions
   */
  private calculateAdaptiveThreshold(): number {
    const baseThreshold = this.config.pressureThreshold;
    const heapGrowthRate = this.getHeapGrowthRate();
    const timeSinceLastGC = Date.now() - this.lastGCTime;
    
    // Adjust threshold based on heap growth rate
    let adjustment = 0;
    if (heapGrowthRate > 1024 * 1024) { // 1MB/s
      adjustment -= 0.1; // Lower threshold for fast growth
    } else if (heapGrowthRate < 100 * 1024) { // 100KB/s
      adjustment += 0.1; // Higher threshold for slow growth
    }
    
    // Adjust based on time since last GC
    if (timeSinceLastGC > this.config.maxInterval * 0.8) {
      adjustment -= 0.05; // Lower threshold as we approach max interval
    }
    
    return Math.max(0.5, Math.min(0.95, baseThreshold + adjustment));
  }

  /**
   * Update heap history for growth monitoring
   */
  private updateHeapHistory(): void {
    if (!this.config.enableHeapMonitoring) return;
    
    const currentHeap = process.memoryUsage().heapUsed;
    this.heapHistory.unshift(currentHeap);
    
    // Keep only last 10 measurements
    if (this.heapHistory.length > 10) {
      this.heapHistory = this.heapHistory.slice(0, 10);
    }
    
    // Emit heap growth event if significant
    if (this.heapHistory.length >= 2) {
      const growth = currentHeap - this.heapHistory[1];
      const rate = this.getHeapGrowthRate();
      
      if (growth > this.config.heapGrowthThreshold / 2) {
        this.emit('heapGrowth', growth, rate);
      }
    }
  }

  /**
   * Setup timers for scheduled operations
   */
  private setupTimers(): void {
    // Clear existing timers
    if (this.scheduledGCTimer) {
      clearInterval(this.scheduledGCTimer);
    }
    
    // Setup scheduled GC timer
    if (this.config.strategy === 'scheduled') {
      this.scheduledGCTimer = setInterval(() => {
        this.triggerGC('scheduled').catch(console.error);
      }, this.config.maxInterval);
    }
    
    // Setup idle detection
    if (this.config.enableIdleDetection) {
      this.resetIdleTimer();
    }
  }

  /**
   * Reset idle detection timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    
    if (this.config.enableIdleDetection) {
      this.idleTimer = setTimeout(() => {
        this.activity.isIdle = true;
        
        // Trigger GC if timing is set to idle
        if (this.config.timing === 'idle') {
          const { should, reason } = this.shouldTriggerGC();
          if (should) {
            this.triggerGC(`idle-${reason}`).catch(console.error);
          }
        }
      }, this.config.idleTimeout);
    }
  }

  /**
   * Setup process-level handlers
   */
  private setupProcessHandlers(): void {
    // Trigger GC before exit
    process.on('beforeExit', () => {
      if (global.gc) {
        global.gc();
      }
    });
    
    // Handle memory warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning' ||
          warning.message?.includes('memory')) {
        this.forceGC('process-warning').catch(console.error);
      }
    });
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    const now = Date.now();
    const timeSinceStart = now - this.stats.lastGCTime;
    
    if (timeSinceStart > 0) {
      this.stats.gcFrequency = (this.stats.totalGCCalls / (timeSinceStart / 60000)); // per minute
    }
    
    this.stats.heapGrowthRate = this.getHeapGrowthRate();
  }

  /**
   * Update statistics after GC execution
   */
  private updateStatsAfterGC(result: GCResult): void {
    this.stats.totalGCCalls++;
    
    if (result.forced || global.gc) {
      this.stats.forcedGCCalls++;
    }
    
    this.stats.gcSuccessRate = result.triggered ? 
      (this.stats.gcSuccessRate * (this.stats.totalGCCalls - 1) + 1) / this.stats.totalGCCalls :
      (this.stats.gcSuccessRate * (this.stats.totalGCCalls - 1)) / this.stats.totalGCCalls;
    
    this.stats.averageMemoryFreed = 
      (this.stats.averageMemoryFreed * (this.stats.totalGCCalls - 1) + result.memoryFreed) / 
      this.stats.totalGCCalls;
    
    this.stats.lastGCTime = result.timestamp;
  }

  /**
   * Emit event to listeners
   */
  private emit<K extends keyof GCEvents>(event: K, ...args: Parameters<GCEvents[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in GC event listener for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Stop all timers
   */
  private stopTimers(): void {
    if (this.scheduledGCTimer) {
      clearInterval(this.scheduledGCTimer);
      this.scheduledGCTimer = undefined;
    }
    
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    this.stopTimers();
    this.listeners.clear();
    this.heapHistory.length = 0;
  }
}

/**
 * Global GC coordinator
 */
let globalGCCoordinator: GCCoordinator | undefined;

/**
 * Get or create global GC coordinator
 */
export function getGlobalGCCoordinator(): GCCoordinator {
  if (!globalGCCoordinator) {
    globalGCCoordinator = new GCCoordinator();
  }
  return globalGCCoordinator;
}

/**
 * Set custom global GC coordinator
 */
export function setGlobalGCCoordinator(coordinator: GCCoordinator): void {
  if (globalGCCoordinator) {
    globalGCCoordinator[Symbol.dispose]();
  }
  globalGCCoordinator = coordinator;
}

/**
 * Convenience function to trigger GC
 */
export async function triggerGC(reason?: string): Promise<GCResult> {
  return getGlobalGCCoordinator().triggerGC(reason);
}

/**
 * Convenience function to record activity
 */
export function recordActivity(): void {
  getGlobalGCCoordinator().recordActivity();
}
