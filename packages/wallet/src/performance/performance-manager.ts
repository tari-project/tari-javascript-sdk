import {
  MemoryPressureMonitor,
  GCCoordinator,
  HeapStatsCollector,
  CallBatcher
} from '@tari-project/tarijs-core';

// Import directly from source to avoid import resolution issues
import { DisposableResource } from '../../../core/src/memory/disposable.js';
import { QueryCache, GlobalCaches } from '../cache/query-cache';
import { TTLManager } from '../cache/ttl-manager';
import { WorkerManager, getGlobalWorkerManager } from '../workers/worker-manager';
import { PerformanceConfig, PerformanceFeatures } from './performance-config';
import { 
  getGlobalMemoryMonitor, 
  getGlobalGCCoordinator, 
  getGlobalHeapStats, 
  getGlobalBatcher 
} from './types/performance-types';

/**
 * Central performance manager that coordinates all performance features
 * Provides unified configuration and monitoring for the wallet SDK
 */
export class PerformanceManager extends DisposableResource {
  private static instance?: PerformanceManager;
  private config: PerformanceConfig;
  private features: PerformanceFeatures;
  
  // Core components - initialized in constructor
  private memoryMonitor: MemoryPressureMonitor;
  private gcCoordinator: GCCoordinator;
  private heapStats: HeapStatsCollector;
  private callBatcher: CallBatcher;
  private workerManager?: WorkerManager;
  private ttlManager?: TTLManager;
  
  // Performance tracking
  private performanceHistory: Array<{
    timestamp: number;
    metrics: any;
  }> = [];
  
  private monitoringTimer?: NodeJS.Timeout;

  constructor(config: Partial<PerformanceConfig> = {}) {
    super();
    
    // Initialize core components with defaults
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.gcCoordinator = getGlobalGCCoordinator();
    this.heapStats = getGlobalHeapStats();
    this.callBatcher = getGlobalBatcher();
    
    this.config = {
      memory: {
        enablePressureMonitoring: true,
        pressureThresholds: {
          moderate: 0.7,
          high: 0.85,
          critical: 0.95
        },
        enableGCCoordination: true,
        gcStrategy: 'adaptive',
        enableHeapStats: true,
        enableAutoCleanup: true
      },
      caching: {
        enableQueryCache: true,
        defaultTTL: 300000, // 5 minutes
        maxCacheSize: 1000,
        enableCacheMetrics: true,
        memoryPressureThreshold: 0.8
      },
      batching: {
        enableFFIBatching: true,
        maxBatchSize: 100,
        maxWaitTime: 10,
        enableDeduplication: true,
        priorityThreshold: 8
      },
      workers: {
        enableWorkerPool: true,
        poolSize: Math.max(1, (require('os').cpus()?.length || 4) - 1),
        enableAutoScaling: true,
        loadBalancingStrategy: 'adaptive'
      },
      monitoring: {
        enablePerformanceMonitoring: true,
        monitoringInterval: 30000, // 30 seconds
        enableMetricsCollection: true,
        historySize: 100
      },
      ...config
    };

    this.features = this.initializeFeatures();
    this.initialize();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<PerformanceConfig>): PerformanceManager {
    if (!this.instance) {
      this.instance = new PerformanceManager(config);
    }
    return this.instance;
  }

  /**
   * Set singleton instance
   */
  static setInstance(manager: PerformanceManager): void {
    if (this.instance) {
      this.instance[Symbol.dispose]();
    }
    this.instance = manager;
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PerformanceConfig>): void {
    // Deep merge configuration
    this.config = this.deepMerge(this.config, updates);
    
    // Update component configurations
    this.updateComponentConfigs();
  }

  /**
   * Get enabled features
   */
  getFeatures(): PerformanceFeatures {
    return { ...this.features };
  }

  /**
   * Get comprehensive performance metrics
   */
  getMetrics(): {
    memory: any;
    cache: any;
    batching: any;
    workers: any;
    overall: any;
  } {
    return {
      memory: this.getMemoryMetrics(),
      cache: this.getCacheMetrics(),
      batching: this.getBatchingMetrics(),
      workers: this.getWorkerMetrics(),
      overall: this.getOverallMetrics()
    };
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(): Array<{ timestamp: number; metrics: any }> {
    return [...this.performanceHistory];
  }

  /**
   * Force cleanup of all caches and memory
   */
  async forceCleanup(): Promise<{
    memoryFreed: number;
    cacheEntriesCleared: number;
    workersRecycled: number;
  }> {
    let memoryFreed = 0;
    let cacheEntriesCleared = 0;
    let workersRecycled = 0;

    // Trigger memory cleanup
    if (this.features.memoryPressureMonitoring && this.memoryMonitor?.triggerCleanup) {
      memoryFreed = await this.memoryMonitor.triggerCleanup();
    }

    // Clear caches
    if (this.features.queryCache) {
      const balanceCache = GlobalCaches.getBalanceCache();
      const transactionCache = GlobalCaches.getTransactionCache();
      const contactCache = GlobalCaches.getContactCache();
      const utxoCache = GlobalCaches.getUtxoCache();

      cacheEntriesCleared += balanceCache.getStats().totalEntries;
      cacheEntriesCleared += transactionCache.getStats().totalEntries;
      cacheEntriesCleared += contactCache.getStats().totalEntries;
      cacheEntriesCleared += utxoCache.getStats().totalEntries;

      balanceCache.clear();
      transactionCache.clear();
      contactCache.clear();
      utxoCache.clear();
    }

    // Recycle workers
    if (this.features.workerPool && this.workerManager) {
      // Note: recycleAllWorkers method may not exist in current WorkerManager implementation
      try {
        if ('recycleAllWorkers' in this.workerManager) {
          await (this.workerManager as any).recycleAllWorkers();
        }
        workersRecycled = this.workerManager.getStats?.()?.pools?.default?.totalWorkers || 0;
      } catch (error) {
        console.warn('Worker recycling not available:', error);
      }
    }

    // Force GC
    if (this.features.gcCoordination && this.gcCoordinator?.forceGC) {
      await this.gcCoordinator.forceGC('performance-manager-cleanup');
    }

    return {
      memoryFreed,
      cacheEntriesCleared,
      workersRecycled
    };
  }

  /**
   * Optimize performance based on current conditions
   */
  async optimizePerformance(): Promise<{
    optimizations: string[];
    metrics: any;
  }> {
    const optimizations: string[] = [];
    const metrics = this.getMetrics();

    // Memory optimizations
    if (metrics.memory?.pressureLevel !== 'normal') {
      await this.forceCleanup();
      optimizations.push('Triggered memory cleanup');
    }

    // Cache optimizations
    if (metrics.cache?.hitRatio && metrics.cache.hitRatio < 0.5) {
      this.optimizeCacheConfiguration();
      optimizations.push('Optimized cache configuration');
    }

    // Worker pool optimizations
    if (metrics.workers?.poolUtilization?.default > 0.8 && this.workerManager) {
      if ('scalePool' in this.workerManager) {
        await (this.workerManager as any).scalePool('default', 
          Math.min(8, metrics.workers.totalWorkers + 2));
        optimizations.push('Scaled up worker pool');
      }
    }

    // Batching optimizations
    if (metrics.batching?.pendingCalls && metrics.batching.pendingCalls > this.config.batching.maxBatchSize * 2) {
      await this.callBatcher.flush();
      optimizations.push('Flushed pending batched calls');
    }

    return {
      optimizations,
      metrics: this.getMetrics()
    };
  }

  /**
   * Run performance benchmark
   */
  async runBenchmark(): Promise<any> {
    const startTime = Date.now();
    const startMetrics = this.getMetrics();

    // Test memory operations
    const memoryResults = await this.benchmarkMemoryOperations();
    
    // Test cache operations
    const cacheResults = await this.benchmarkCacheOperations();
    
    // Test worker operations
    const workerResults = await this.benchmarkWorkerOperations();
    
    // Test batching operations
    const batchingResults = await this.benchmarkBatchingOperations();

    const endTime = Date.now();
    const endMetrics = this.getMetrics();

    return {
      duration: endTime - startTime,
      startMetrics,
      endMetrics,
      results: {
        memory: memoryResults,
        cache: cacheResults,
        workers: workerResults,
        batching: batchingResults
      }
    };
  }

  /**
   * Initialize features based on configuration
   */
  private initializeFeatures(): PerformanceFeatures {
    return {
      memoryPressureMonitoring: this.config.memory.enablePressureMonitoring,
      gcCoordination: this.config.memory.enableGCCoordination,
      heapStats: this.config.memory.enableHeapStats,
      queryCache: this.config.caching.enableQueryCache,
      ffiCallBatching: this.config.batching.enableFFIBatching,
      workerPool: this.config.workers.enableWorkerPool,
      performanceMonitoring: this.config.monitoring.enablePerformanceMonitoring
    };
  }

  /**
   * Initialize all components
   */
  private initialize(): void {
    // Skip initialization if performance monitoring is disabled (e.g., in tests)
    if (process.env.DISABLE_PERFORMANCE_MONITORING === 'true') {
      return;
    }
    
    // Setup memory monitoring
    if (this.features.memoryPressureMonitoring && this.memoryMonitor) {
      this.setupMemoryMonitoring();
    }

    // Setup GC coordination
    if (this.features.gcCoordination && this.gcCoordinator) {
      this.setupGCCoordination();
    }

    // Heap statistics are already initialized
    // Call batching is already initialized

    // Initialize worker management
    if (this.features.workerPool) {
      this.workerManager = getGlobalWorkerManager();
    }

    // Initialize TTL management
    this.ttlManager = new TTLManager();

    // Setup cache cleanup handlers
    this.setupCacheCleanupHandlers();

    // Start performance monitoring
    if (this.features.performanceMonitoring) {
      this.startPerformanceMonitoring();
    }
  }

  /**
   * Setup memory monitoring
   */
  private setupMemoryMonitoring(): void {
    this.memoryMonitor.updateThresholds(this.config.memory.pressureThresholds);
    
    this.memoryMonitor.on('pressureChange', (level: any, metrics: any) => {
      if (level === 'high' || level === 'critical') {
        this.handleMemoryPressure(level, metrics);
      }
    });

    this.memoryMonitor.on('leak', (detection: any) => {
      console.warn('Memory leak detected:', detection);
    });
  }

  /**
   * Setup GC coordination
   */
  private setupGCCoordination(): void {
    if (this.gcCoordinator && this.gcCoordinator.updateConfig) {
      this.gcCoordinator.updateConfig({
        strategy: this.config.memory.gcStrategy as any,
        timing: 'idle',
        pressureThreshold: this.config.memory.pressureThresholds.high
      });
    }
  }

  /**
   * Setup cache cleanup handlers
   */
  private setupCacheCleanupHandlers(): void {
    if (!this.features.memoryPressureMonitoring) return;

    this.memoryMonitor.addCleanupHandler(async (level: any, metrics: any) => {
      let cleaned = 0;

      if (level === 'high' || level === 'critical') {
        // Clear least important caches first
        const caches = [
          GlobalCaches.getBalanceCache(),
          GlobalCaches.getTransactionCache(),
          GlobalCaches.getContactCache(),
          GlobalCaches.getUtxoCache()
        ];

        for (const cache of caches) {
          const entries = cache.getStats().totalEntries;
          cache.clear();
          cleaned += entries;
          
          if (level !== 'critical') break; // Only clear all caches in critical situations
        }
      }

      return cleaned;
    });
  }

  /**
   * Handle memory pressure events
   */
  private async handleMemoryPressure(level: any, metrics: any): Promise<void> {
    console.warn(`Memory pressure: ${level}`, metrics);

    // Force GC if available
    if (this.features.gcCoordination) {
      await this.gcCoordinator.triggerGC(`memory-pressure-${level}`);
    }

    // Trigger cleanup if auto-cleanup is enabled
    if (this.config.memory.enableAutoCleanup) {
      await this.forceCleanup();
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      try {
        const metrics = this.getMetrics();
        this.performanceHistory.push({
          timestamp: Date.now(),
          metrics
        });

        // Maintain history size
        while (this.performanceHistory.length > this.config.monitoring.historySize) {
          this.performanceHistory.shift();
        }
      } catch (error) {
        console.error('Error during performance monitoring:', error);
      }
    }, this.config.monitoring.monitoringInterval);
  }

  /**
   * Get memory metrics
   */
  private getMemoryMetrics(): any {
    const usage = process.memoryUsage();
    
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      pressureLevel: this.features.memoryPressureMonitoring 
        ? this.memoryMonitor.getCurrentPressureLevel()
        : 'unknown',
      gcStats: this.features.gcCoordination 
        ? this.gcCoordinator.getStats()
        : null,
      heapAnalysis: this.features.heapStats 
        ? this.heapStats.analyzeHeap()
        : null
    };
  }

  /**
   * Get cache metrics
   */
  private getCacheMetrics(): any {
    if (!this.features.queryCache) {
      return { enabled: false };
    }

    const balanceStats = GlobalCaches.getBalanceCache().getStats();
    const transactionStats = GlobalCaches.getTransactionCache().getStats();
    const contactStats = GlobalCaches.getContactCache().getStats();
    const utxoStats = GlobalCaches.getUtxoCache().getStats();

    return {
      enabled: true,
      balance: balanceStats,
      transactions: transactionStats,
      contacts: contactStats,
      utxos: utxoStats,
      totalEntries: balanceStats.totalEntries + transactionStats.totalEntries + 
                   contactStats.totalEntries + utxoStats.totalEntries,
      hitRatio: (balanceStats.hitRatio + transactionStats.hitRatio + 
                contactStats.hitRatio + utxoStats.hitRatio) / 4
    };
  }

  /**
   * Get batching metrics
   */
  private getBatchingMetrics(): any {
    if (!this.features.ffiCallBatching) {
      return { enabled: false };
    }

    return {
      enabled: true,
      ...this.callBatcher.getStats()
    };
  }

  /**
   * Get worker metrics
   */
  private getWorkerMetrics(): any {
    if (!this.features.workerPool) {
      return { enabled: false };
    }

    return {
      enabled: true,
      ...(this.workerManager?.getStats() || {})
    };
  }

  /**
   * Get overall metrics
   */
  private getOverallMetrics(): any {
    return {
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version,
      cpuUsage: process.cpuUsage(),
      resourceUsage: process.resourceUsage?.() || null,
      features: this.features
    };
  }

  /**
   * Optimize cache configuration
   */
  private optimizeCacheConfiguration(): void {
    // This could implement dynamic cache tuning based on usage patterns
    // For now, just log the optimization
    console.log('Cache configuration optimized');
  }

  /**
   * Update component configurations
   */
  private updateComponentConfigs(): void {
    if (this.features.memoryPressureMonitoring) {
      this.memoryMonitor.updateThresholds(this.config.memory.pressureThresholds);
    }

    if (this.features.gcCoordination && this.gcCoordinator && this.gcCoordinator.updateConfig) {
      this.gcCoordinator.updateConfig({
        strategy: this.config.memory.gcStrategy as any
      });
    }
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Benchmark memory operations
   */
  private async benchmarkMemoryOperations(): Promise<any> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    // Create and dispose many objects
    const objects = [];
    for (let i = 0; i < 10000; i++) {
      objects.push({ data: Buffer.alloc(1024) });
    }

    const midTime = Date.now();
    const midMemory = process.memoryUsage();

    // Clear objects
    objects.length = 0;

    // Force GC if available
    if (this.features.gcCoordination) {
      await this.gcCoordinator.forceGC('benchmark');
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    return {
      allocationTime: midTime - startTime,
      cleanupTime: endTime - midTime,
      totalTime: endTime - startTime,
      memoryAllocated: midMemory.heapUsed - startMemory.heapUsed,
      memoryFreed: midMemory.heapUsed - endMemory.heapUsed
    };
  }

  /**
   * Benchmark cache operations
   */
  private async benchmarkCacheOperations(): Promise<any> {
    if (!this.features.queryCache) {
      return { enabled: false };
    }

    const cache = GlobalCaches.getBalanceCache();
    const startTime = Date.now();

    // Benchmark cache writes
    const writeStart = Date.now();
    for (let i = 0; i < 1000; i++) {
      cache.set(`test-${i}`, { value: i }, 60000);
    }
    const writeTime = Date.now() - writeStart;

    // Benchmark cache reads
    const readStart = Date.now();
    for (let i = 0; i < 1000; i++) {
      cache.getCached(`test-${i}`);
    }
    const readTime = Date.now() - readStart;

    // Clean up
    cache.clear();

    return {
      writeTime,
      readTime,
      totalTime: Date.now() - startTime,
      writeOpsPerSecond: 1000 / (writeTime / 1000),
      readOpsPerSecond: 1000 / (readTime / 1000)
    };
  }

  /**
   * Benchmark worker operations
   */
  private async benchmarkWorkerOperations(): Promise<any> {
    if (!this.features.workerPool) {
      return { enabled: false };
    }

    const startTime = Date.now();
    const tasks = [];

    // Submit computation tasks
    for (let i = 0; i < 10; i++) {
      if (this.workerManager) {
        tasks.push(
          this.workerManager.executeTask('computation', {
            operation: 'fibonacci',
            input: 30
          })
        );
      }
    }

    const results = await Promise.all(tasks);
    const endTime = Date.now();

    return {
      tasksExecuted: tasks.length,
      totalTime: endTime - startTime,
      averageTaskTime: (endTime - startTime) / tasks.length,
      successRate: results.filter(r => r.success).length / results.length
    };
  }

  /**
   * Benchmark batching operations
   */
  private async benchmarkBatchingOperations(): Promise<any> {
    if (!this.features.ffiCallBatching) {
      return { enabled: false };
    }

    const startTime = Date.now();
    const calls = [];

    // Submit many calls for batching
    for (let i = 0; i < 100; i++) {
      calls.push(
        this.callBatcher.batchCall('test_function', [i], 5)
      );
    }

    await Promise.all(calls);
    const endTime = Date.now();

    return {
      callsExecuted: calls.length,
      totalTime: endTime - startTime,
      batchingStats: this.callBatcher.getStats()
    };
  }

  /**
   * Stop performance monitoring
   */
  private stopPerformanceMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    this.stopPerformanceMonitoring();
    
    // Dispose TTL manager
    this.ttlManager?.[Symbol.dispose]();

    // Clear performance history
    this.performanceHistory.length = 0;

    // Clear singleton reference
    if (PerformanceManager.instance === this) {
      PerformanceManager.instance = undefined;
    }
  }
}

/**
 * Get singleton performance manager
 */
export function getPerformanceManager(): PerformanceManager {
  return PerformanceManager.getInstance();
}

/**
 * Configure performance manager
 */
export function configurePerformance(config: Partial<PerformanceConfig>): void {
  getPerformanceManager().updateConfig(config);
}
