/**
 * @fileoverview Balance operations module exports
 * 
 * This module provides comprehensive balance querying, caching, and monitoring
 * capabilities for wallet operations.
 */

// Core balance service
export {
  BalanceService,
  type BalanceServiceConfig,
  type BalanceChangeListener
} from './balance-service.js';

// Balance mapping utilities
export {
  BalanceMapper,
  type FFIBalance
} from './balance-mapper.js';

// Balance caching system
export {
  BalanceCache,
  type CacheStats,
  type CacheConfig
} from './balance-cache.js';

// Re-export balance types for convenience
export type {
  Balance,
  BalanceInfo,
  BalanceChangeEvent
} from '../types/index.js';
