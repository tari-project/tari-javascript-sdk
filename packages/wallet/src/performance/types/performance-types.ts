/**
 * @fileoverview Performance management type definitions
 * 
 * Provides type-safe performance management interfaces separated from
 * implementation to prevent circular dependencies and ensure clean architecture.
 */

/**
 * Performance monitoring levels
 */
export type PerformanceLevel = 'minimal' | 'standard' | 'comprehensive';

/**
 * GC strategy configuration
 */
export type GCStrategy = 'aggressive' | 'balanced' | 'conservative' | 'adaptive';

/**
 * Performance metrics data structure
 */
export interface PerformanceMetrics {
  memory: {
    used: number;
    total: number;
    pressure: number;
  };
  gc: {
    collections: number;
    totalTime: number;
    averageTime: number;
  };
  workers: {
    active: number;
    idle: number;
    tasks: number;
  };
  cache: {
    hits: number;
    misses: number;
    size: number;
  };
}

/**
 * Worker configuration interface
 */
export interface WorkerConfig {
  /** Enable worker pool functionality */
  enableWorkerPool: boolean;
  /** Pool size for worker threads */
  poolSize: number;
  /** Enable automatic scaling */
  enableAutoScaling: boolean;
  /** Load balancing strategy */
  loadBalancingStrategy: 'round-robin' | 'least-busy' | 'random';
}

/**
 * Caching configuration interface
 */
export interface CachingConfig {
  /** Enable query cache */
  enableQueryCache: boolean;
  /** Maximum cache size in MB */
  maxCacheSize: number;
  /** Default TTL in milliseconds */
  defaultTTL: number;
  /** Enable cache metrics collection */
  enableCacheMetrics: boolean;
  /** Memory pressure threshold for cache eviction */
  memoryPressureThreshold: number;
}

/**
 * Memory management configuration
 */
export interface MemoryConfig {
  /** Enable heap statistics collection */
  enableHeapStats: boolean;
  /** Enable memory pressure monitoring */
  enablePressureMonitoring: boolean;
  /** Memory pressure thresholds */
  pressureThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  /** Enable GC coordination */
  enableGCCoordination: boolean;
  /** GC strategy */
  gcStrategy: GCStrategy;
  /** Enable automatic cleanup */
  enableAutoCleanup: boolean;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  /** Enable performance monitoring */
  enablePerformanceMonitoring: boolean;
  /** Monitoring interval in milliseconds */
  monitoringInterval: number;
  /** Enable metrics collection */
  enableMetricsCollection: boolean;
  /** History size for metrics */
  historySize: number;
}

/**
 * Mock global function implementations for safe fallbacks
 */
export function getGlobalMemoryMonitor(): any {
  console.warn('getGlobalMemoryMonitor not available, using mock');
  return {
    start: () => {},
    stop: () => {},
    getMetrics: () => ({ used: 0, total: 0, pressure: 0 }),
  };
}

export function getGlobalGCCoordinator(): any {
  console.warn('getGlobalGCCoordinator not available, using mock');
  return {
    scheduleCollection: () => {},
    getMetrics: () => ({ collections: 0, totalTime: 0, averageTime: 0 }),
  };
}

export function getGlobalHeapStats(): any {
  console.warn('getGlobalHeapStats not available, using mock');
  return {
    collect: () => {},
    getStats: () => ({ used: 0, total: 0 }),
  };
}

export function getGlobalBatcher(): any {
  console.warn('getGlobalBatcher not available, using mock');
  return {
    batch: (fn: Function) => fn(),
    flush: () => {},
  };
}

/**
 * Performance configuration with complete interfaces
 */
export interface PerformanceConfiguration {
  level: PerformanceLevel;
  worker: WorkerConfig;
  caching: CachingConfig;
  memory: MemoryConfig;
  monitoring: MonitoringConfig;
}
