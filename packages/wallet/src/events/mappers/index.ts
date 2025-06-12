/**
 * @fileoverview Event mapper exports
 * 
 * This module provides all event mappers for converting FFI events
 * to TypeScript event types.
 */

// Base mapper utilities
export {
  BaseEventMapper,
  ValidationUtils,
  EventMapperRegistry,
  defaultMapperRegistry,
  createSimpleMapper,
  createTransformMapper,
  type EventMapper
} from './base-mapper.js';

// Transaction mappers
export {
  PendingInboundTransactionMapper,
  CompletedTransactionMapper,
  CancelledTransactionMapper,
  TransactionValidationMapper,
  createTransactionMappers,
  registerTransactionMappers
} from './transaction-mapper.js';

// Connectivity mappers
export {
  ConnectivityMapper,
  BaseNodeConnectedMapper,
  BaseNodeDisconnectedMapper,
  BaseNodeChangedMapper,
  createConnectivityMappers,
  registerConnectivityMappers,
  determineConnectivityStatus,
  normalizePeerCount,
  normalizeLatency
} from './connectivity-mapper.js';

// Sync mappers
export {
  SyncProgressMapper,
  SyncStartedMapper,
  SyncCompletedMapper,
  SyncFailedMapper,
  createSyncMappers,
  registerSyncMappers,
  calculateSyncProgress,
  estimateRemainingTime,
  validateSyncProgress
} from './sync-mapper.js';

// Balance mappers
export {
  BalanceMapper,
  ExtendedBalanceMapper,
  createBalanceMappers,
  registerBalanceMappers,
  validateBalanceConsistency,
  formatBalance,
  calculateBalanceChange
} from './balance-mapper.js';

// Import the register functions and registry for internal use
import { defaultMapperRegistry, EventMapperRegistry } from './base-mapper.js';
import { registerTransactionMappers } from './transaction-mapper.js';
import { registerConnectivityMappers } from './connectivity-mapper.js';
import { registerSyncMappers } from './sync-mapper.js';
import { registerBalanceMappers } from './balance-mapper.js';

/**
 * Register all mappers with the default registry
 */
export function registerAllMappers(): void {
  registerTransactionMappers(defaultMapperRegistry);
  registerConnectivityMappers(defaultMapperRegistry);
  registerSyncMappers(defaultMapperRegistry);
  registerBalanceMappers(defaultMapperRegistry);
}

/**
 * Create a new registry with all mappers registered
 */
export function createFullMapperRegistry(): EventMapperRegistry {
  const registry = new EventMapperRegistry();
  
  registerTransactionMappers(registry);
  registerConnectivityMappers(registry);
  registerSyncMappers(registry);
  registerBalanceMappers(registry);
  
  return registry;
}

/**
 * Get all registered event types
 */
export function getAllEventTypes(): string[] {
  return defaultMapperRegistry.getEventTypes();
}

/**
 * Check if event type has a registered mapper
 */
export function hasMapper(eventType: string): boolean {
  return defaultMapperRegistry.has(eventType);
}

/**
 * Map event data using the default registry
 */
export function mapEventData<T>(eventType: string, data: unknown): T {
  return defaultMapperRegistry.map<T>(eventType, data);
}

// Initialize default registry with all mappers
registerAllMappers();
