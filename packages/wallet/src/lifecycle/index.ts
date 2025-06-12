/**
 * @fileoverview Lifecycle management module exports
 * 
 * Comprehensive resource management and cleanup system for Tari wallets
 * including FinalizationRegistry-based automatic cleanup, manual resource
 * tracking, and sophisticated cleanup strategies.
 */

// Core lifecycle management
export {
  WalletLifecycleManager,
  LifecycleEvent,
  type LifecycleEventHandler,
  type LifecycleEventData,
  type CleanupFunction,
  type LifecycleHooks,
  type LifecycleStats,
  DisposableWalletResource,
  AsyncDisposableWalletResource,
  createDisposableResource,
  createAsyncDisposableResource,
  withResource
} from './lifecycle.js';

// Advanced resource management
export {
  ResourceManager,
  ResourceType,
  globalResourceManager,
  type ResourceMetadata,
  type ResourceCleanupFunction,
  type ResourceManagerStats,
  type ResourceManagerConfig
} from './resource-manager.js';

// Cleanup strategies and execution
export {
  globalCleanupExecutor,
  cleanupWithRetry,
  CleanupExecutor,
  WalletHandleCleanupStrategy,
  CacheCleanupStrategy,
  SubscriptionCleanupStrategy,
  NetworkConnectionCleanupStrategy,
  GenericCleanupStrategy,
  type CleanupStrategy,
  type CleanupResult,
  type CleanupBatchResult,
  type CleanupVerificationOptions
} from './cleanup.js';

// FinalizationRegistry-based automatic cleanup
export {
  AdvancedFinalizer,
  WalletFinalizer,
  globalWalletFinalizer,
  withFinalization,
  type FinalizerConfig,
  type FinalizerStats
} from './finalizer.js';
