/**
 * @fileoverview Wallet event system exports
 * 
 * This module provides the public API for the wallet event system,
 * including all types, classes, and utilities for event handling.
 */

// Core event system
export { 
  WalletEventSystem, 
  createWalletEventSystem,
  type EventSystemConfig,
  type EventSystemStats
} from './event-system.js';

// Event emitter
export { 
  TypedWalletEventEmitter, 
  createWalletEventEmitter 
} from './event-emitter.js';

// Event types and interfaces
export type {
  WalletEventMap,
  EventListener,
  EventSubscription,
  MultiEventSubscription,
  EventHandlerMap,
  EventOptions,
  
  // Event payload types
  PendingInboundTransaction,
  CompletedTransaction,
  CancelledTransaction,
  ConnectivityEvent,
  SyncProgressEvent,
  WalletErrorEvent,
  TransactionValidationEvent,
  BackupEvent,
  SecurityEvent
} from './event-types.js';

// Connectivity status enum
export { ConnectivityStatus } from './event-types.js';

// Event registration and lifecycle
export { 
  EventRegistrationManager,
  createEventRegistrationManager,
  type RegistrationConfig
} from './registration.js';

export {
  CallbackManager,
  createCallbackManager,
  type CallbackManagerConfig,
  type CallbackManagerState
} from './callback-manager.js';

export {
  EventSystemLifecycleManager,
  createEventSystemLifecycleManager,
  getGlobalLifecycleManager,
  resetGlobalLifecycleManager,
  type LifecycleConfig,
  type LifecycleHook
} from './lifecycle.js';

// Event mappers
export {
  defaultMapperRegistry,
  registerAllMappers,
  createFullMapperRegistry,
  getAllEventTypes,
  hasMapper,
  mapEventData,
  type EventMapper
} from './mappers/index.js';
