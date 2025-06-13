/**
 * Performance configuration types and interfaces
 */

import { GCStrategy } from '@tari/core/memory/gc-coordinator';
import { LoadBalancingStrategy } from '../workers/worker-manager';

/**
 * Memory management configuration
 */
export interface MemoryConfig {
  /** Enable memory pressure monitoring */
  enablePressureMonitoring: boolean;
  /** Memory pressure thresholds */
  pressureThresholds: {
    moderate: number;
    high: number;
    critical: number;
    rssLimit?: number;
    heapLimit?: number;
  };
  /** Enable GC coordination */
  enableGCCoordination: boolean;
  /** GC strategy */
  gcStrategy: GCStrategy;
  /** Enable heap statistics collection */
  enableHeapStats: boolean;
  /** Enable automatic cleanup on pressure */
  enableAutoCleanup: boolean;
}

/**
 * Caching system configuration
 */
export interface CachingConfig {
  /** Enable query caching */
  enableQueryCache: boolean;
  /** Default TTL for cache entries */
  defaultTTL: number;
  /** Maximum cache size */
  maxCacheSize: number;
  /** Enable cache metrics collection */
  enableCacheMetrics: boolean;
  /** Memory pressure threshold for cache eviction */
  memoryPressureThreshold: number;
}

/**
 * FFI call batching configuration
 */
export interface BatchingConfig {
  /** Enable FFI call batching */
  enableFFIBatching: boolean;
  /** Maximum batch size */
  maxBatchSize: number;
  /** Maximum wait time before flushing batch */
  maxWaitTime: number;
  /** Enable call deduplication */
  enableDeduplication: boolean;
  /** Priority threshold for immediate execution */
  priorityThreshold: number;
}

/**
 * Worker pool configuration
 */
export interface WorkerConfig {
  /** Enable worker thread pool */
  enableWorkerPool: boolean;
  /** Number of worker threads */
  poolSize: number;
  /** Enable automatic pool scaling */
  enableAutoScaling: boolean;
  /** Load balancing strategy */
  loadBalancingStrategy: LoadBalancingStrategy;
}

/**
 * Performance monitoring configuration
 */
export interface MonitoringConfig {
  /** Enable performance monitoring */
  enablePerformanceMonitoring: boolean;
  /** Monitoring interval in milliseconds */
  monitoringInterval: number;
  /** Enable metrics collection */
  enableMetricsCollection: boolean;
  /** Maximum history size */
  historySize: number;
}

/**
 * Complete performance configuration
 */
export interface PerformanceConfig {
  memory: MemoryConfig;
  caching: CachingConfig;
  batching: BatchingConfig;
  workers: WorkerConfig;
  monitoring: MonitoringConfig;
}

/**
 * Performance features enabled/disabled flags
 */
export interface PerformanceFeatures {
  memoryPressureMonitoring: boolean;
  gcCoordination: boolean;
  heapStats: boolean;
  queryCache: boolean;
  ffiCallBatching: boolean;
  workerPool: boolean;
  performanceMonitoring: boolean;
}

/**
 * Performance metrics aggregation
 */
export interface PerformanceMetrics {
  timestamp: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    pressureLevel: string;
    gcStats?: any;
    heapAnalysis?: any;
  };
  cache: {
    enabled: boolean;
    totalEntries?: number;
    hitRatio?: number;
    balance?: any;
    transactions?: any;
    contacts?: any;
    utxos?: any;
  };
  batching: {
    enabled: boolean;
    pendingCalls?: number;
    batchesProcessed?: number;
    avgBatchSize?: number;
  };
  workers: {
    enabled: boolean;
    totalWorkers?: number;
    busyWorkers?: number;
    queuedTasks?: number;
    poolUtilization?: Record<string, number>;
  };
  overall: {
    uptime: number;
    platform: string;
    nodeVersion: string;
    cpuUsage: NodeJS.CpuUsage;
    features: PerformanceFeatures;
  };
}

/**
 * Default performance configuration
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
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
    maxWaitTime: 10, // 10ms
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
  }
};

/**
 * High-performance configuration for demanding applications
 */
export const HIGH_PERFORMANCE_CONFIG: PerformanceConfig = {
  memory: {
    enablePressureMonitoring: true,
    pressureThresholds: {
      moderate: 0.6,
      high: 0.75,
      critical: 0.9
    },
    enableGCCoordination: true,
    gcStrategy: 'aggressive',
    enableHeapStats: true,
    enableAutoCleanup: true
  },
  caching: {
    enableQueryCache: true,
    defaultTTL: 180000, // 3 minutes
    maxCacheSize: 2000,
    enableCacheMetrics: true,
    memoryPressureThreshold: 0.7
  },
  batching: {
    enableFFIBatching: true,
    maxBatchSize: 200,
    maxWaitTime: 5, // 5ms
    enableDeduplication: true,
    priorityThreshold: 6
  },
  workers: {
    enableWorkerPool: true,
    poolSize: require('os').cpus()?.length || 4,
    enableAutoScaling: true,
    loadBalancingStrategy: 'least-busy'
  },
  monitoring: {
    enablePerformanceMonitoring: true,
    monitoringInterval: 15000, // 15 seconds
    enableMetricsCollection: true,
    historySize: 200
  }
};

/**
 * Memory-efficient configuration for resource-constrained environments
 */
export const MEMORY_EFFICIENT_CONFIG: PerformanceConfig = {
  memory: {
    enablePressureMonitoring: true,
    pressureThresholds: {
      moderate: 0.5,
      high: 0.65,
      critical: 0.8
    },
    enableGCCoordination: true,
    gcStrategy: 'conservative',
    enableHeapStats: false,
    enableAutoCleanup: true
  },
  caching: {
    enableQueryCache: true,
    defaultTTL: 600000, // 10 minutes
    maxCacheSize: 200,
    enableCacheMetrics: false,
    memoryPressureThreshold: 0.6
  },
  batching: {
    enableFFIBatching: true,
    maxBatchSize: 50,
    maxWaitTime: 20, // 20ms
    enableDeduplication: true,
    priorityThreshold: 9
  },
  workers: {
    enableWorkerPool: true,
    poolSize: 2,
    enableAutoScaling: false,
    loadBalancingStrategy: 'round-robin'
  },
  monitoring: {
    enablePerformanceMonitoring: false,
    monitoringInterval: 60000, // 1 minute
    enableMetricsCollection: false,
    historySize: 20
  }
};

/**
 * Development configuration with extensive monitoring
 */
export const DEVELOPMENT_CONFIG: PerformanceConfig = {
  memory: {
    enablePressureMonitoring: true,
    pressureThresholds: {
      moderate: 0.8,
      high: 0.9,
      critical: 0.95
    },
    enableGCCoordination: true,
    gcStrategy: 'adaptive',
    enableHeapStats: true,
    enableAutoCleanup: false // Disable for debugging
  },
  caching: {
    enableQueryCache: true,
    defaultTTL: 60000, // 1 minute for development
    maxCacheSize: 100,
    enableCacheMetrics: true,
    memoryPressureThreshold: 0.85
  },
  batching: {
    enableFFIBatching: false, // Disable for easier debugging
    maxBatchSize: 10,
    maxWaitTime: 100,
    enableDeduplication: false,
    priorityThreshold: 10
  },
  workers: {
    enableWorkerPool: false, // Disable for easier debugging
    poolSize: 1,
    enableAutoScaling: false,
    loadBalancingStrategy: 'round-robin'
  },
  monitoring: {
    enablePerformanceMonitoring: true,
    monitoringInterval: 5000, // 5 seconds
    enableMetricsCollection: true,
    historySize: 500
  }
};

/**
 * Configuration presets
 */
export const PERFORMANCE_PRESETS = {
  default: DEFAULT_PERFORMANCE_CONFIG,
  'high-performance': HIGH_PERFORMANCE_CONFIG,
  'memory-efficient': MEMORY_EFFICIENT_CONFIG,
  development: DEVELOPMENT_CONFIG
} as const;

/**
 * Type for preset names
 */
export type PerformancePreset = keyof typeof PERFORMANCE_PRESETS;

/**
 * Get configuration for a preset
 */
export function getPresetConfig(preset: PerformancePreset): PerformanceConfig {
  return { ...PERFORMANCE_PRESETS[preset] };
}

/**
 * Merge configuration with a preset
 */
export function mergeWithPreset(
  preset: PerformancePreset,
  overrides: Partial<PerformanceConfig>
): PerformanceConfig {
  const baseConfig = getPresetConfig(preset);
  return deepMergeConfig(baseConfig, overrides);
}

/**
 * Deep merge configuration objects
 */
function deepMergeConfig(
  target: PerformanceConfig,
  source: Partial<PerformanceConfig>
): PerformanceConfig {
  const result = { ...target };
  
  for (const key in source) {
    const sourceValue = source[key as keyof PerformanceConfig];
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      result[key as keyof PerformanceConfig] = {
        ...target[key as keyof PerformanceConfig],
        ...sourceValue
      } as any;
    } else if (sourceValue !== undefined) {
      (result as any)[key] = sourceValue;
    }
  }
  
  return result;
}

/**
 * Validate performance configuration
 */
export function validateConfig(config: Partial<PerformanceConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate memory thresholds
  if (config.memory?.pressureThresholds) {
    const thresholds = config.memory.pressureThresholds;
    if (thresholds.moderate >= thresholds.high) {
      errors.push('Memory moderate threshold must be less than high threshold');
    }
    if (thresholds.high >= thresholds.critical) {
      errors.push('Memory high threshold must be less than critical threshold');
    }
    if (thresholds.critical > 1.0) {
      errors.push('Memory critical threshold cannot exceed 1.0');
    }
  }

  // Validate cache configuration
  if (config.caching?.maxCacheSize && config.caching.maxCacheSize <= 0) {
    errors.push('Cache max size must be positive');
  }

  if (config.caching?.defaultTTL && config.caching.defaultTTL <= 0) {
    errors.push('Cache default TTL must be positive');
  }

  // Validate batching configuration
  if (config.batching?.maxBatchSize && config.batching.maxBatchSize <= 0) {
    errors.push('Batch max size must be positive');
  }

  if (config.batching?.maxWaitTime && config.batching.maxWaitTime < 0) {
    errors.push('Batch max wait time cannot be negative');
  }

  // Validate worker configuration
  if (config.workers?.poolSize && config.workers.poolSize <= 0) {
    errors.push('Worker pool size must be positive');
  }

  // Validate monitoring configuration
  if (config.monitoring?.monitoringInterval && config.monitoring.monitoringInterval <= 0) {
    errors.push('Monitoring interval must be positive');
  }

  if (config.monitoring?.historySize && config.monitoring.historySize <= 0) {
    errors.push('Monitoring history size must be positive');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create configuration for specific use case
 */
export function createConfigForUseCase(useCase: 'server' | 'desktop' | 'mobile' | 'embedded'): PerformanceConfig {
  switch (useCase) {
    case 'server':
      return getPresetConfig('high-performance');
    
    case 'desktop':
      return getPresetConfig('default');
    
    case 'mobile':
      return mergeWithPreset('memory-efficient', {
        workers: { poolSize: 2 },
        caching: { maxCacheSize: 100 }
      });
    
    case 'embedded':
      return mergeWithPreset('memory-efficient', {
        workers: { poolSize: 1, enableWorkerPool: false },
        caching: { maxCacheSize: 50 },
        memory: { enableHeapStats: false },
        monitoring: { enablePerformanceMonitoring: false }
      });
    
    default:
      return getPresetConfig('default');
  }
}
