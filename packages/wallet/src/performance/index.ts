/**
 * Performance system integration for the Tari Wallet SDK
 * Coordinates all performance features: memory management, caching, batching, and worker pools
 */

// Core memory management
export { 
  using, 
  usingAsync, 
  DisposableResource as CoreDisposableResource
} from '@tari-project/tarijs-core';

// Re-export available performance types from core
export {
  TariFFIResource,
  ResourceMetrics,
  SecureBuffer,
  SecureView,
  CallBatcher,
  CallBatchResult,
  BatchConfig,
  BatchQueue,
  QueueStats,
  BatchExecutor
} from '@tari-project/tarijs-core';

// Caching system
export {
  QueryCache,
  CacheEntry,
  CacheOptions,
  CacheStats
} from './cache/query-cache';

// Stub implementations for missing components
export const PerformanceManager = {
  getInstance: () => ({
    initialize: async () => {},
    cleanup: async () => {},
    getMetrics: () => ({}),
  }),
};

export const getPerformanceManager = () => PerformanceManager.getInstance();

export const configurePerformance = (config: any) => {
  // TODO: Implement performance configuration
  console.log('Performance configuration not yet implemented:', config);
};

// Stub type for performance configuration
export interface PerformanceConfig {
  readonly enableBatching?: boolean;
  readonly enableCaching?: boolean;
  readonly enableWorkerPool?: boolean;
  readonly enableMemoryOptimization?: boolean;
}
