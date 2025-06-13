/**
 * @fileoverview Runtime environment utilities and context management
 * 
 * Provides utilities for runtime environment management, context switching,
 * and environment-specific optimizations.
 */

import { PlatformDetector, type RuntimeEnvironment, type PlatformInfo } from './detector.js';
import { getCapabilitiesManager, type CapabilityAssessment } from './capabilities.js';

/**
 * Runtime context information
 */
export interface RuntimeContext {
  /** Runtime environment type */
  environment: RuntimeEnvironment;
  /** Process/thread identifier */
  processId: string;
  /** Main thread indicator */
  isMainThread: boolean;
  /** Available memory (in bytes) */
  availableMemory: number;
  /** CPU usage (0-1) */
  cpuUsage: number;
  /** Runtime capabilities */
  capabilities: CapabilityAssessment;
}

/**
 * Performance monitoring data
 */
export interface PerformanceData {
  /** Memory usage in bytes */
  memoryUsage: {
    used: number;
    total: number;
    available: number;
  };
  /** CPU usage percentage */
  cpuUsage: number;
  /** Event loop delay in milliseconds */
  eventLoopDelay: number;
  /** Active handles count */
  activeHandles: number;
  /** GC statistics */
  gcStats?: {
    totalTime: number;
    count: number;
  };
}

/**
 * Runtime configuration
 */
export interface RuntimeConfig {
  /** Maximum memory usage (in bytes) */
  maxMemory: number;
  /** CPU usage threshold for scaling */
  cpuThreshold: number;
  /** Enable performance monitoring */
  enableMonitoring: boolean;
  /** Monitoring interval in milliseconds */
  monitoringInterval: number;
  /** Enable garbage collection optimization */
  enableGcOptimization: boolean;
}

/**
 * Runtime environment manager
 */
export class RuntimeManager {
  private readonly platform: PlatformInfo;
  private readonly config: RuntimeConfig;
  private monitoringTimer?: NodeJS.Timeout;
  private performanceHistory: PerformanceData[] = [];
  private readonly maxHistorySize = 100;

  constructor(config: Partial<RuntimeConfig> = {}) {
    this.platform = PlatformDetector.detect();
    this.config = {
      maxMemory: this.getDefaultMaxMemory(),
      cpuThreshold: 0.8,
      enableMonitoring: true,
      monitoringInterval: 5000, // 5 seconds
      enableGcOptimization: true,
      ...config,
    };

    if (this.config.enableMonitoring) {
      this.startMonitoring();
    }

    if (this.config.enableGcOptimization) {
      this.optimizeGarbageCollection();
    }
  }

  /**
   * Get current runtime context
   */
  getCurrentContext(): RuntimeContext {
    return {
      environment: this.platform.runtime,
      processId: this.getProcessId(),
      isMainThread: this.isMainThread(),
      availableMemory: this.getAvailableMemory(),
      cpuUsage: this.getCpuUsage(),
      capabilities: getCapabilitiesManager().getCapabilityAssessment(),
    };
  }

  /**
   * Get current performance data
   */
  getCurrentPerformance(): PerformanceData {
    const memoryUsage = this.getMemoryUsage();
    
    return {
      memoryUsage,
      cpuUsage: this.getCpuUsage(),
      eventLoopDelay: this.getEventLoopDelay(),
      activeHandles: this.getActiveHandles(),
      gcStats: this.getGcStats(),
    };
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(): PerformanceData[] {
    return [...this.performanceHistory];
  }

  /**
   * Check if runtime is under stress
   */
  isUnderStress(): boolean {
    const current = this.getCurrentPerformance();
    
    // Check CPU usage
    if (current.cpuUsage > this.config.cpuThreshold) {
      return true;
    }

    // Check memory usage
    const memoryUsageRatio = current.memoryUsage.used / current.memoryUsage.total;
    if (memoryUsageRatio > 0.9) {
      return true;
    }

    // Check event loop delay (Node.js specific)
    if (current.eventLoopDelay > 100) { // 100ms is concerning
      return true;
    }

    return false;
  }

  /**
   * Get recommended scaling action
   */
  getScalingRecommendation(): 'scale-up' | 'scale-down' | 'maintain' {
    if (this.isUnderStress()) {
      return 'scale-up';
    }

    const current = this.getCurrentPerformance();
    const cpuUsage = current.cpuUsage;
    const memoryRatio = current.memoryUsage.used / current.memoryUsage.total;

    // Scale down if consistently low usage
    if (cpuUsage < 0.2 && memoryRatio < 0.5) {
      return 'scale-down';
    }

    return 'maintain';
  }

  /**
   * Optimize for current environment
   */
  optimize(): void {
    const context = this.getCurrentContext();
    
    if (context.environment === 'node' || context.environment.startsWith('electron')) {
      this.optimizeNodeEnvironment();
    }

    if (context.environment === 'browser') {
      this.optimizeBrowserEnvironment();
    }

    if (this.config.enableGcOptimization) {
      this.optimizeGarbageCollection();
    }
  }

  /**
   * Force garbage collection (if available)
   */
  forceGarbageCollection(): boolean {
    if (this.platform.runtime === 'browser') {
      // Cannot force GC in browser
      return false;
    }

    try {
      if (global.gc) {
        global.gc();
        return true;
      }
    } catch {
      // GC not available
    }

    return false;
  }

  /**
   * Get memory pressure level
   */
  getMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const current = this.getCurrentPerformance();
    const ratio = current.memoryUsage.used / current.memoryUsage.total;

    if (ratio > 0.95) return 'critical';
    if (ratio > 0.85) return 'high';
    if (ratio > 0.70) return 'medium';
    return 'low';
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      try {
        const performance = this.getCurrentPerformance();
        this.performanceHistory.push(performance);
        
        // Keep history within limits
        while (this.performanceHistory.length > this.maxHistorySize) {
          this.performanceHistory.shift();
        }

        // Auto-optimize if under stress
        if (this.isUnderStress()) {
          this.optimize();
        }
      } catch (error) {
        console.warn('Error during runtime monitoring:', error);
      }
    }, this.config.monitoringInterval);
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
  }

  /**
   * Get process identifier
   */
  private getProcessId(): string {
    if (this.platform.capabilities.nativeModules) {
      try {
        return process.pid.toString();
      } catch {
        // Not in Node.js environment
      }
    }

    // Generate random ID for non-Node environments
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Check if running in main thread
   */
  private isMainThread(): boolean {
    if (this.platform.runtime === 'browser') {
      return typeof window !== 'undefined';
    }

    if (this.platform.capabilities.nativeModules) {
      try {
        const { isMainThread } = require('worker_threads');
        return isMainThread;
      } catch {
        // worker_threads not available, assume main thread
        return true;
      }
    }

    return true; // Default assumption
  }

  /**
   * Get available memory in bytes
   */
  private getAvailableMemory(): number {
    if (this.platform.capabilities.nativeModules) {
      try {
        const os = require('os');
        return os.freemem();
      } catch {
        // Fall through to estimation
      }
    }

    // Estimate based on runtime
    switch (this.platform.runtime) {
      case 'electron-renderer':
      case 'browser':
        return 100 * 1024 * 1024; // 100MB estimate
      default:
        return 1024 * 1024 * 1024; // 1GB estimate
    }
  }

  /**
   * Get current CPU usage
   */
  private getCpuUsage(): number {
    if (this.platform.capabilities.nativeModules) {
      try {
        const { cpuUsage } = process;
        if (cpuUsage) {
          const usage = cpuUsage();
          return (usage.user + usage.system) / 1000000; // Convert to percentage
        }
      } catch {
        // Not available
      }
    }

    return 0; // Cannot determine in this environment
  }

  /**
   * Get memory usage information
   */
  private getMemoryUsage(): PerformanceData['memoryUsage'] {
    if (this.platform.capabilities.nativeModules) {
      try {
        const memUsage = process.memoryUsage();
        const os = require('os');
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        
        return {
          used: memUsage.heapUsed,
          total: totalMem,
          available: freeMem,
        };
      } catch {
        // Fall through to estimation
      }
    }

    // Browser estimation
    const estimatedTotal = 2 * 1024 * 1024 * 1024; // 2GB
    const estimatedUsed = 100 * 1024 * 1024; // 100MB
    
    return {
      used: estimatedUsed,
      total: estimatedTotal,
      available: estimatedTotal - estimatedUsed,
    };
  }

  /**
   * Get event loop delay (Node.js specific)
   */
  private getEventLoopDelay(): number {
    if (this.platform.capabilities.nativeModules) {
      try {
        const { performance } = require('perf_hooks');
        if (performance.eventLoopUtilization) {
          const utilization = performance.eventLoopUtilization();
          return utilization.utilization * 100; // Convert to percentage
        }
      } catch {
        // Not available
      }
    }

    return 0; // Cannot measure in this environment
  }

  /**
   * Get active handles count (Node.js specific)
   */
  private getActiveHandles(): number {
    if (this.platform.capabilities.nativeModules) {
      try {
        return (process as any)._getActiveHandles?.()?.length || 0;
      } catch {
        // Not available
      }
    }

    return 0; // Cannot determine
  }

  /**
   * Get garbage collection statistics
   */
  private getGcStats(): PerformanceData['gcStats'] | undefined {
    // This would require additional monitoring setup
    // For now, return undefined
    return undefined;
  }

  /**
   * Get default maximum memory for the environment
   */
  private getDefaultMaxMemory(): number {
    switch (this.platform.runtime) {
      case 'electron-renderer':
      case 'browser':
        return 512 * 1024 * 1024; // 512MB
      case 'electron-main':
        return 1024 * 1024 * 1024; // 1GB
      case 'node':
        return 2 * 1024 * 1024 * 1024; // 2GB
      default:
        return 256 * 1024 * 1024; // 256MB
    }
  }

  /**
   * Optimize Node.js environment
   */
  private optimizeNodeEnvironment(): void {
    if (!this.platform.capabilities.nativeModules) {
      return;
    }

    try {
      // Set appropriate V8 flags for wallet operations
      if (process.env.NODE_OPTIONS === undefined) {
        // These would need to be set before Node.js starts
        // This is more for documentation of recommended settings
      }
    } catch (error) {
      console.warn('Failed to optimize Node.js environment:', error);
    }
  }

  /**
   * Optimize browser environment
   */
  private optimizeBrowserEnvironment(): void {
    // Request high-performance mode if available
    if (typeof navigator !== 'undefined' && 'scheduling' in navigator) {
      try {
        (navigator as any).scheduling.isInputPending({ includeContinuous: true });
      } catch {
        // Not supported
      }
    }
  }

  /**
   * Optimize garbage collection
   */
  private optimizeGarbageCollection(): void {
    if (this.platform.runtime === 'browser') {
      // Cannot control GC in browser
      return;
    }

    // Set up periodic GC hints for memory pressure
    const memoryPressure = this.getMemoryPressure();
    
    if (memoryPressure === 'high' || memoryPressure === 'critical') {
      // Force GC if available
      this.forceGarbageCollection();
    }
  }

  /**
   * Cleanup and dispose
   */
  dispose(): void {
    this.stopMonitoring();
    this.performanceHistory.length = 0;
  }
}

/**
 * Global runtime manager instance
 */
let globalRuntimeManager: RuntimeManager | undefined;

/**
 * Get global runtime manager
 */
export function getRuntimeManager(): RuntimeManager {
  if (!globalRuntimeManager) {
    globalRuntimeManager = new RuntimeManager();
  }
  return globalRuntimeManager;
}

/**
 * Get current runtime context
 */
export function getCurrentRuntimeContext(): RuntimeContext {
  return getRuntimeManager().getCurrentContext();
}

/**
 * Check if runtime is under stress
 */
export function isRuntimeUnderStress(): boolean {
  return getRuntimeManager().isUnderStress();
}

/**
 * Get memory pressure level
 */
export function getMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
  return getRuntimeManager().getMemoryPressure();
}
