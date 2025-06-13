/**
 * Performance system integration for the Tari Wallet SDK
 * Coordinates all performance features: memory management, caching, batching, and worker pools
 */

// Core memory management
export type { 
  using, 
  usingAsync, 
  MemoryDisposableResource as CoreDisposableResource
} from '@tari-project/tarijs-core';

// Re-export available performance types from core
export type {
  TariFFIResource,
  ResourceMetrics,
  SecureView,
  CallBatchResult,
  BatchConfig,
  BatchQueue,
  QueueStats,
  BatchExecutor
} from '@tari-project/tarijs-core';

// Export only non-conflicting concrete exports
export { CallBatcher } from '@tari-project/tarijs-core';
export { SecureBuffer as CoreSecureBuffer } from '@tari-project/tarijs-core';

// Caching system  
export { QueryCache } from './cache/query-cache';
export type { CacheEntry, CacheOptions } from './cache/query-cache';
export type { CacheStats as PerformanceCacheStats } from './cache/query-cache';

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
