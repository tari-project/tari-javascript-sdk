/**
 * Performance system integration for the Tari Wallet SDK
 * Coordinates all performance features: memory management, caching, batching, and worker pools
 */

// Core memory management
export { 
  Disposable, 
  AsyncDisposable, 
  DisposableStack, 
  AsyncDisposableStack,
  isDisposable,
  isAsyncDisposable,
  safeDispose,
  safeAsyncDispose
} from '@tari/core/memory/using-polyfill';

export {
  DisposableResource,
  FFIResource,
  AutoDisposer,
  ResourceManager
} from '@tari/core/memory/disposable';

export {
  TariFFIResource,
  TariResourceFactory,
  ResourcePatterns
} from '@tari/core/memory/resource-base';

export {
  SecureBuffer,
  SecureMemoryUtils,
  EncryptionResult
} from '@tari/core/memory/secure-buffer';

export {
  CryptoHelpers,
  KDF
} from '@tari/core/memory/crypto-helpers';

export {
  MemoryUtils,
  MemorySnapshot,
  MemoryComparison,
  MemoryLeakDetector,
  MemoryTrend
} from '@tari/core/memory/memory-utils';

// Memory pressure monitoring
export {
  MemoryPressureMonitor,
  MemoryPressureLevel,
  MemoryMetrics,
  MemoryThresholds,
  MonitorConfig,
  MemoryLeakDetection,
  CleanupHandler,
  DefaultCleanupHandlers,
  getGlobalMemoryMonitor,
  setGlobalMemoryMonitor
} from '@tari/core/memory/pressure-monitor';

export {
  GCCoordinator,
  GCStrategy,
  GCTiming,
  GCConfig,
  GCStats,
  GCResult,
  getGlobalGCCoordinator,
  setGlobalGCCoordinator,
  triggerGC,
  recordActivity
} from '@tari/core/memory/gc-coordinator';

export {
  HeapStatsCollector,
  HeapSnapshot,
  HeapAnalysis,
  HeapTrends,
  HeapStatsUtils,
  getGlobalHeapStats,
  setGlobalHeapStats
} from '@tari/core/memory/heap-stats';

// FFI performance optimization
export {
  CallBatcher,
  BatchConfig,
  PendingCall,
  BatchResult,
  CallBatcherFactory,
  getGlobalBatcher,
  setGlobalBatcher,
  batchFFICall
} from '@tari/core/performance/call-batcher';

export {
  BatchQueue,
  QueueConfig,
  QueuedCall,
  EnqueueOptions,
  BatchQueueFactory
} from '@tari/core/performance/batch-queue';

export {
  BatchExecutor,
  ExecutorConfig,
  ExecutionStats,
  BatchExecutorFactory
} from '@tari/core/performance/batch-executor';

// Caching system
export {
  QueryCache,
  CacheConfig,
  CacheEntry,
  CacheStats,
  InvalidationPattern,
  QueryFetcher,
  QueryCacheFactory,
  GlobalCaches
} from './cache/query-cache';

export {
  CacheKeyBuilder,
  KeyOptions,
  KeyComponent,
  CacheKeys,
  KeyPatternMatcher,
  CacheKeyValidator
} from './cache/cache-key';

export {
  TTLManager,
  TTLStrategy,
  TTLConfig,
  TTLEntry,
  TTLStats,
  TTLConfigFactory
} from './cache/ttl-manager';

// Resource management
export {
  withResource,
  withResources,
  withAsyncResource,
  withAsyncResources,
  createResourceScope,
  ResourceScope,
  TemporaryResourceManager,
  globalTemporaryResources,
  autoDispose,
  makeDisposable,
  createDisposableTimeout,
  createDisposableInterval,
  createDisposableEventListener
} from './memory/using-helpers';

export {
  HierarchicalResourceScope,
  AutoCleanupResourceScope,
  TransactionalResourceScope,
  ResourceScopeFactory,
  ScopeConfig,
  ScopeStats,
  CleanupPolicy
} from './memory/resource-scope';

export {
  AutoDisposeWrapper,
  RefCountedResource,
  RefCountedHandle,
  LazyResource,
  ResourcePool,
  PooledResource,
  PoolStats,
  AutoDisposeFactory
} from './memory/auto-dispose';

// Worker thread system
export {
  WorkerPool,
  TaskType,
  TaskPriority,
  WorkerTask,
  TaskResult,
  WorkerPoolConfig,
  PoolStats as WorkerPoolStats,
  WorkerInfo,
  WorkerPoolFactory,
  GlobalWorkerPools
} from './workers/worker-pool';

export {
  WorkerManager,
  WorkerManagerConfig,
  LoadBalancingStrategy,
  ScalingThresholds,
  PoolTemplate,
  PerformanceMetrics,
  TaskRouting,
  getGlobalWorkerManager,
  setGlobalWorkerManager,
  executeWorkerTask
} from './workers/worker-manager';

// Performance integration and configuration
export { PerformanceManager } from './performance-manager';
export { PerformanceConfig, PerformanceFeatures, PerformanceMetrics as WalletPerformanceMetrics } from './performance-config';
export { BenchmarkSuite, BenchmarkResult, BenchmarkRunner } from './benchmark-suite';
