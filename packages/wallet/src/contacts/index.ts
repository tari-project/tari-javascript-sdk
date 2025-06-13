/**
 * @fileoverview Contact Management Module for Tari Wallet
 * 
 * Exports all contact-related classes, interfaces, and utilities
 * for comprehensive contact management functionality.
 */

// Core contact manager
export { ContactManager } from './contact-manager.js';

// Storage layer
export { ContactStore } from './contact-store.js';
export type { ContactStoreConfig } from './contact-store.js';

// Validation service
export { ContactValidator } from './contact-validator.js';

// Event system
export { ContactEventEmitter } from './contact-events.js';
export type { ContactEvents, ContactEventData } from './contact-events.js';

// Synchronization service
export { ContactSyncService } from './contact-sync.js';
export type { 
  ContactSyncConfig,
  ContactSyncConflict,
  ContactSyncResult
} from './contact-sync.js';

// Cache service
export { ContactCache } from './contact-cache.js';
export type { 
  ContactCacheConfig,
  ContactCacheStats
} from './contact-cache.js';

// Re-export core contact types for convenience
export type {
  Contact,
  ContactMetadata,
  ContactType,
  ContactSource,
  CreateContactParams,
  UpdateContactParams,
  ContactFilter,
  ContactQueryOptions,
  ContactSortBy,
  ContactValidationResult,
  ContactExportData,
  ContactImportResult,
  ContactStatistics
} from '@tari-project/tarijs-core';

// Re-export contact utilities
export { ContactUtils } from '@tari-project/tarijs-core';
