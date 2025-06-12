/**
 * @fileoverview Event type definitions for the Tari Wallet SDK
 * 
 * This module defines all possible events that can be emitted by the wallet,
 * providing strong TypeScript typing for event names and payloads.
 */

import type { 
  TransactionInfo, 
  Balance, 
  TransactionStatus 
} from '../types/index.js';

// Connectivity status enum
export enum ConnectivityStatus {
  Offline = 'offline',
  Connecting = 'connecting', 
  Online = 'online',
  Syncing = 'syncing'
}

// Base transaction events
export interface PendingInboundTransaction extends TransactionInfo {
  status: TransactionStatus.Pending;
  isInbound: true;
  source: string; // Source address
}

export interface CompletedTransaction extends TransactionInfo {
  status: TransactionStatus.MinedConfirmed;
  blockHeight: number;
  blockHash: string;
}

export interface CancelledTransaction extends TransactionInfo {
  status: TransactionStatus.Cancelled;
  reason: string;
  cancelledAt: Date;
}

// Connectivity event payload
export interface ConnectivityEvent {
  status: ConnectivityStatus;
  baseNode?: string;
  latency?: number;
  peerCount: number;
  timestamp: Date;
}

// Sync progress event payload
export interface SyncProgressEvent {
  current: number;
  total: number;
  percent: number;
  estimatedTimeRemaining?: number;
  timestamp: Date;
}

// Error event payload
export interface WalletErrorEvent {
  error: Error;
  event?: string;
  data?: unknown;
  timestamp: Date;
  context: Record<string, unknown>;
}

// Transaction validation event payload
export interface TransactionValidationEvent {
  transactionId: bigint;
  isValid: boolean;
  validationErrors?: string[];
  timestamp: Date;
}

// Wallet backup/restore events
export interface BackupEvent {
  type: 'backup_created' | 'backup_restored';
  path?: string;
  timestamp: Date;
}

// Security events
export interface SecurityEvent {
  type: 'authentication_required' | 'key_rotation' | 'suspicious_activity';
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

/**
 * Complete wallet event map defining all possible events and their payloads.
 * This provides compile-time type safety for event emission and subscription.
 */
export interface WalletEventMap {
  // Transaction events
  'tx:received': PendingInboundTransaction;
  'tx:broadcast': CompletedTransaction;
  'tx:mined': CompletedTransaction;
  'tx:cancelled': CancelledTransaction;
  'tx:validation': TransactionValidationEvent;
  
  // Balance events
  'balance:updated': Balance;
  
  // Connectivity events
  'connectivity:changed': ConnectivityEvent;
  
  // Sync events
  'sync:started': { timestamp: Date };
  'sync:progress': SyncProgressEvent;
  'sync:completed': { timestamp: Date; duration: number };
  'sync:failed': { error: Error; timestamp: Date };
  
  // Wallet lifecycle events
  'wallet:started': { timestamp: Date };
  'wallet:stopped': { timestamp: Date };
  'wallet:locked': { timestamp: Date };
  'wallet:unlocked': { timestamp: Date };
  
  // Security events
  'security:event': SecurityEvent;
  
  // Backup/restore events
  'backup:event': BackupEvent;
  
  // Error events
  'error': WalletErrorEvent;
  
  // Base node events
  'basenode:connected': { address: string; timestamp: Date };
  'basenode:disconnected': { address: string; timestamp: Date };
  'basenode:changed': { oldAddress?: string; newAddress: string; timestamp: Date };
}

/**
 * Event listener function type for a specific event
 */
export type EventListener<T> = (data: T) => void | Promise<void>;

/**
 * Event subscription interface returned when subscribing to events
 */
export interface EventSubscription {
  /** Unsubscribe from the event */
  unsubscribe(): void;
  /** Check if subscription is still active */
  isActive(): boolean;
}

/**
 * Multiple event subscription for grouped event handling
 */
export interface MultiEventSubscription {
  /** Unsubscribe from all events in this subscription */
  unsubscribe(): void;
  /** Check if subscription is still active */
  isActive(): boolean;
  /** Get count of active subscriptions */
  getActiveCount(): number;
}

/**
 * Event handler map for bulk subscription
 */
export type EventHandlerMap = {
  [K in keyof WalletEventMap]?: EventListener<WalletEventMap[K]>;
};

/**
 * Event options for customizing event behavior
 */
export interface EventOptions {
  /** Only listen once, then auto-unsubscribe */
  once?: boolean;
  /** Add delay before handler execution (ms) */
  delay?: number;
  /** Debounce rapid events (ms) */
  debounce?: number;
}
