/**
 * @fileoverview Event types and interfaces for the Tari JavaScript SDK
 * 
 * Defines comprehensive event system for wallet notifications, status updates,
 * and real-time communication with wallet operations.
 */

import type {
  TransactionId,
  MicroTari,
  TariAddressString,
  BlockHeight,
  UnixTimestamp,
  Hash,
  WalletHandle
} from './branded.js';
import type {
  TransactionStatus,
  ConnectivityStatus,
  SyncStatus
} from './enums.js';
import type {
  Transaction,
  TransactionStatusUpdate
} from './transaction.js';
import type {
  Balance,
  BalanceChange
} from './balance.js';
import type { Contact } from './contact.js';

// Base event interface
export interface BaseEvent {
  /** Event type identifier */
  readonly type: string;
  /** Event timestamp */
  readonly timestamp: UnixTimestamp;
  /** Wallet handle that generated the event */
  readonly walletHandle?: WalletHandle;
  /** Event source identifier */
  readonly source: EventSource;
  /** Event sequence number */
  readonly sequence: number;
  /** Event correlation ID for tracking */
  readonly correlationId?: string;
}

// Event source types
export const EventSource = {
  Wallet: 'wallet',
  BaseNode: 'base_node',
  P2P: 'p2p',
  Mempool: 'mempool',
  Blockchain: 'blockchain',
  User: 'user',
  System: 'system',
  External: 'external'
} as const;

export type EventSource = typeof EventSource[keyof typeof EventSource];

// Transaction events
export interface TransactionReceivedEvent extends BaseEvent {
  readonly type: 'transaction_received';
  readonly transaction: Transaction;
  readonly amount: MicroTari;
  readonly sourceAddress: TariAddressString;
  readonly message: string;
}

export interface TransactionSentEvent extends BaseEvent {
  readonly type: 'transaction_sent';
  readonly transaction: Transaction;
  readonly amount: MicroTari;
  readonly destinationAddress: TariAddressString;
  readonly fee: MicroTari;
  readonly message: string;
}

export interface TransactionBroadcastEvent extends BaseEvent {
  readonly type: 'transaction_broadcast';
  readonly transactionId: TransactionId;
  readonly amount: MicroTari;
  readonly fee: MicroTari;
  readonly status: TransactionStatus;
}

export interface TransactionMinedEvent extends BaseEvent {
  readonly type: 'transaction_mined';
  readonly transactionId: TransactionId;
  readonly blockHeight: BlockHeight;
  readonly blockHash: Hash;
  readonly confirmations: number;
}

export interface TransactionConfirmedEvent extends BaseEvent {
  readonly type: 'transaction_confirmed';
  readonly transactionId: TransactionId;
  readonly blockHeight: BlockHeight;
  readonly confirmations: number;
  readonly finalizedAmount: MicroTari;
}

export interface TransactionCancelledEvent extends BaseEvent {
  readonly type: 'transaction_cancelled';
  readonly transactionId: TransactionId;
  readonly reason: string;
  readonly cancellationType: 'user' | 'timeout' | 'error';
}

export interface TransactionFailedEvent extends BaseEvent {
  readonly type: 'transaction_failed';
  readonly transactionId: TransactionId;
  readonly error: string;
  readonly errorCode: string;
  readonly retryable: boolean;
}

export interface TransactionStatusChangedEvent extends BaseEvent {
  readonly type: 'transaction_status_changed';
  readonly update: TransactionStatusUpdate;
}

// Balance events
export interface BalanceUpdatedEvent extends BaseEvent {
  readonly type: 'balance_updated';
  readonly newBalance: Balance;
  readonly previousBalance?: Balance;
  readonly change: BalanceChange;
}

export interface BalanceRefreshedEvent extends BaseEvent {
  readonly type: 'balance_refreshed';
  readonly balance: Balance;
  readonly refreshDuration: number;
}

// Connectivity events
export interface ConnectivityChangedEvent extends BaseEvent {
  readonly type: 'connectivity_changed';
  readonly status: ConnectivityStatus;
  readonly previousStatus: ConnectivityStatus;
  readonly peer?: PeerInfo;
}

export interface PeerConnectedEvent extends BaseEvent {
  readonly type: 'peer_connected';
  readonly peer: PeerInfo;
  readonly connectionType: 'inbound' | 'outbound';
}

export interface PeerDisconnectedEvent extends BaseEvent {
  readonly type: 'peer_disconnected';
  readonly peer: PeerInfo;
  readonly reason: string;
  readonly reconnectAttempt: number;
}

export interface BaseNodeChangedEvent extends BaseEvent {
  readonly type: 'base_node_changed';
  readonly previousNode?: PeerInfo;
  readonly newNode: PeerInfo;
  readonly reason: 'manual' | 'automatic' | 'failover';
}

// Peer information
export interface PeerInfo {
  /** Peer public key */
  readonly publicKey: string;
  /** Peer address */
  readonly address: string;
  /** Connection status */
  readonly status: PeerStatus;
  /** Last seen timestamp */
  readonly lastSeen: UnixTimestamp;
  /** Number of failed connections */
  readonly failureCount: number;
  /** Latency in milliseconds */
  readonly latency?: number;
  /** User agent string */
  readonly userAgent?: string;
  /** Supported protocols */
  readonly protocols: string[];
}

export const PeerStatus = {
  Connected: 'connected',
  Connecting: 'connecting',
  Disconnected: 'disconnected',
  Failed: 'failed',
  Banned: 'banned'
} as const;

export type PeerStatus = typeof PeerStatus[keyof typeof PeerStatus];

// Sync events
export interface SyncStartedEvent extends BaseEvent {
  readonly type: 'sync_started';
  readonly syncType: SyncType;
  readonly estimatedDuration?: number;
}

export interface SyncProgressEvent extends BaseEvent {
  readonly type: 'sync_progress';
  readonly current: number;
  readonly total: number;
  readonly percentage: number;
  readonly estimatedTimeRemaining?: number;
  readonly syncStage: SyncStage;
}

export interface SyncCompletedEvent extends BaseEvent {
  readonly type: 'sync_completed';
  readonly syncType: SyncType;
  readonly duration: number;
  readonly blocksProcessed: number;
  readonly newTip: BlockHeight;
}

export interface SyncFailedEvent extends BaseEvent {
  readonly type: 'sync_failed';
  readonly syncType: SyncType;
  readonly error: string;
  readonly retryAttempt: number;
  readonly nextRetryIn?: number;
}

export const SyncType = {
  Full: 'full',
  Headers: 'headers',
  Blocks: 'blocks',
  Transactions: 'transactions',
  Utxos: 'utxos'
} as const;

export type SyncType = typeof SyncType[keyof typeof SyncType];

export const SyncStage = {
  Connecting: 'connecting',
  Downloading: 'downloading',
  Validating: 'validating',
  Applying: 'applying',
  Finalizing: 'finalizing'
} as const;

export type SyncStage = typeof SyncStage[keyof typeof SyncStage];

// Validation events
export interface ValidationStartedEvent extends BaseEvent {
  readonly type: 'validation_started';
  readonly validationType: ValidationType;
  readonly itemCount: number;
}

export interface ValidationProgressEvent extends BaseEvent {
  readonly type: 'validation_progress';
  readonly validationType: ValidationType;
  readonly processed: number;
  readonly total: number;
  readonly errors: number;
}

export interface ValidationCompletedEvent extends BaseEvent {
  readonly type: 'validation_completed';
  readonly validationType: ValidationType;
  readonly duration: number;
  readonly itemsValidated: number;
  readonly errorsFound: number;
}

export const ValidationType = {
  Transactions: 'transactions',
  Utxos: 'utxos',
  Blocks: 'blocks',
  Mempool: 'mempool'
} as const;

export type ValidationType = typeof ValidationType[keyof typeof ValidationType];

// Wallet lifecycle events
export interface WalletStartedEvent extends BaseEvent {
  readonly type: 'wallet_started';
  readonly walletId: string;
  readonly network: string;
  readonly startupDuration: number;
}

export interface WalletStoppedEvent extends BaseEvent {
  readonly type: 'wallet_stopped';
  readonly walletId: string;
  readonly shutdownDuration: number;
  readonly reason: 'user' | 'error' | 'system';
}

export interface WalletLockedEvent extends BaseEvent {
  readonly type: 'wallet_locked';
  readonly walletId: string;
  readonly lockType: 'manual' | 'timeout' | 'error';
}

export interface WalletUnlockedEvent extends BaseEvent {
  readonly type: 'wallet_unlocked';
  readonly walletId: string;
  readonly unlockMethod: 'passphrase' | 'biometric' | 'hardware';
}

// Contact events
export interface ContactAddedEvent extends BaseEvent {
  readonly type: 'contact_added';
  readonly contact: Contact;
  readonly addedBy: 'user' | 'transaction' | 'import';
}

export interface ContactUpdatedEvent extends BaseEvent {
  readonly type: 'contact_updated';
  readonly contact: Contact;
  readonly previousContact: Contact;
  readonly updatedFields: string[];
}

export interface ContactRemovedEvent extends BaseEvent {
  readonly type: 'contact_removed';
  readonly contactId: string;
  readonly removedBy: 'user' | 'cleanup';
}

// Security events
export interface SecurityAlertEvent extends BaseEvent {
  readonly type: 'security_alert';
  readonly alertType: SecurityAlertType;
  readonly severity: SecuritySeverity;
  readonly description: string;
  readonly actionRequired: boolean;
  readonly details?: Record<string, any>;
}

export const SecurityAlertType = {
  UnauthorizedAccess: 'unauthorized_access',
  SuspiciousTransaction: 'suspicious_transaction',
  UnknownDevice: 'unknown_device',
  DataBreach: 'data_breach',
  MalwareDetected: 'malware_detected',
  NetworkAnomaly: 'network_anomaly'
} as const;

export type SecurityAlertType = typeof SecurityAlertType[keyof typeof SecurityAlertType];

export const SecuritySeverity = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical'
} as const;

export type SecuritySeverity = typeof SecuritySeverity[keyof typeof SecuritySeverity];

// Error events
export interface ErrorEvent extends BaseEvent {
  readonly type: 'error';
  readonly error: ErrorInfo;
}

export interface ErrorInfo {
  /** Error code */
  readonly code: string;
  /** Error message */
  readonly message: string;
  /** Error category */
  readonly category: ErrorCategory;
  /** Error severity */
  readonly severity: ErrorSeverity;
  /** Whether error is recoverable */
  readonly recoverable: boolean;
  /** Stack trace if available */
  readonly stackTrace?: string;
  /** Additional error details */
  readonly details?: Record<string, any>;
  /** Suggested recovery actions */
  readonly recoveryActions?: string[];
}

export const ErrorCategory = {
  Network: 'network',
  Database: 'database',
  Cryptography: 'cryptography',
  Validation: 'validation',
  Configuration: 'configuration',
  System: 'system',
  User: 'user',
  Unknown: 'unknown'
} as const;

export type ErrorCategory = typeof ErrorCategory[keyof typeof ErrorCategory];

export const ErrorSeverity = {
  Info: 'info',
  Warning: 'warning',
  Error: 'error',
  Fatal: 'fatal'
} as const;

export type ErrorSeverity = typeof ErrorSeverity[keyof typeof ErrorSeverity];

// Log events
export interface LogEvent extends BaseEvent {
  readonly type: 'log';
  readonly level: LogLevel;
  readonly module: string;
  readonly message: string;
  readonly metadata?: Record<string, any>;
}

export const LogLevel = {
  Trace: 'trace',
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error'
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

// Union type for all events
export type WalletEvent = 
  // Transaction events
  | TransactionReceivedEvent
  | TransactionSentEvent
  | TransactionBroadcastEvent
  | TransactionMinedEvent
  | TransactionConfirmedEvent
  | TransactionCancelledEvent
  | TransactionFailedEvent
  | TransactionStatusChangedEvent
  // Balance events
  | BalanceUpdatedEvent
  | BalanceRefreshedEvent
  // Connectivity events
  | ConnectivityChangedEvent
  | PeerConnectedEvent
  | PeerDisconnectedEvent
  | BaseNodeChangedEvent
  // Sync events
  | SyncStartedEvent
  | SyncProgressEvent
  | SyncCompletedEvent
  | SyncFailedEvent
  // Validation events
  | ValidationStartedEvent
  | ValidationProgressEvent
  | ValidationCompletedEvent
  // Wallet lifecycle events
  | WalletStartedEvent
  | WalletStoppedEvent
  | WalletLockedEvent
  | WalletUnlockedEvent
  // Contact events
  | ContactAddedEvent
  | ContactUpdatedEvent
  | ContactRemovedEvent
  // Security events
  | SecurityAlertEvent
  // Error and log events
  | ErrorEvent
  | LogEvent;

// Event filter for selective listening
export interface EventFilter {
  /** Event types to include */
  types?: string[];
  /** Event sources to include */
  sources?: EventSource[];
  /** Minimum severity for error events */
  minSeverity?: ErrorSeverity;
  /** Maximum age of events in milliseconds */
  maxAge?: number;
  /** Wallet handles to filter by */
  walletHandles?: WalletHandle[];
  /** Custom filter function */
  custom?: (event: WalletEvent) => boolean;
}

// Event subscription options
export interface EventSubscriptionOptions {
  /** Event filter */
  filter?: EventFilter;
  /** Buffer size for missed events */
  bufferSize?: number;
  /** Whether to receive historical events */
  includeHistorical?: boolean;
  /** Maximum historical events to include */
  maxHistorical?: number;
  /** Replay events from specific timestamp */
  replayFrom?: UnixTimestamp;
}

// Event handler types
export type EventHandler<T extends WalletEvent = WalletEvent> = (event: T) => void | Promise<void>;

// Event subscription result
export interface EventSubscription {
  /** Subscription ID */
  readonly id: string;
  /** Event types being listened to */
  readonly eventTypes: string[];
  /** Subscription options */
  readonly options: EventSubscriptionOptions;
  /** Unsubscribe function */
  readonly unsubscribe: () => void;
  /** Whether subscription is active */
  readonly active: boolean;
}

// Event bus interface
export interface EventBus {
  /** Subscribe to events */
  subscribe<T extends WalletEvent>(
    eventType: string | string[],
    handler: EventHandler<T>,
    options?: EventSubscriptionOptions
  ): EventSubscription;

  /** Subscribe to all events */
  subscribeAll(
    handler: EventHandler,
    options?: EventSubscriptionOptions
  ): EventSubscription;

  /** Unsubscribe from events */
  unsubscribe(subscriptionId: string): boolean;

  /** Emit an event */
  emit(event: WalletEvent): void;

  /** Get event history */
  getHistory(filter?: EventFilter, limit?: number): WalletEvent[];

  /** Clear event history */
  clearHistory(): void;

  /** Get active subscriptions */
  getSubscriptions(): EventSubscription[];

  /** Get event statistics */
  getStatistics(): EventStatistics;
}

// Event statistics
export interface EventStatistics {
  /** Total events emitted */
  readonly totalEvents: number;
  /** Events by type */
  readonly eventsByType: Record<string, number>;
  /** Events by source */
  readonly eventsBySource: Record<EventSource, number>;
  /** Active subscriptions */
  readonly activeSubscriptions: number;
  /** Error events count */
  readonly errorEvents: number;
  /** Events in last hour */
  readonly recentEvents: number;
  /** Average events per minute */
  readonly averageEventsPerMinute: number;
}

// Event utilities
export class EventUtils {
  /**
   * Create event with common fields
   */
  static createEvent<T extends WalletEvent>(
    type: string,
    data: Omit<T, keyof BaseEvent>,
    source: EventSource = EventSource.Wallet,
    walletHandle?: WalletHandle
  ): T {
    return {
      type,
      timestamp: Date.now() as UnixTimestamp,
      source,
      sequence: this.getNextSequenceNumber(),
      walletHandle,
      ...data
    } as T;
  }

  /**
   * Check if event matches filter
   */
  static matchesFilter(event: WalletEvent, filter: EventFilter): boolean {
    // Type filter
    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }

    // Source filter
    if (filter.sources && !filter.sources.includes(event.source)) {
      return false;
    }

    // Age filter
    if (filter.maxAge) {
      const age = Date.now() - event.timestamp;
      if (age > filter.maxAge) {
        return false;
      }
    }

    // Wallet handle filter
    if (filter.walletHandles && event.walletHandle) {
      if (!filter.walletHandles.includes(event.walletHandle)) {
        return false;
      }
    }

    // Severity filter for error events
    if (filter.minSeverity && event.type === 'error') {
      const errorEvent = event as ErrorEvent;
      if (this.compareSeverity(errorEvent.error.severity, filter.minSeverity) < 0) {
        return false;
      }
    }

    // Custom filter
    if (filter.custom && !filter.custom(event)) {
      return false;
    }

    return true;
  }

  /**
   * Get event type from event object
   */
  static getEventType(event: WalletEvent): string {
    return event.type;
  }

  /**
   * Check if event is transaction-related
   */
  static isTransactionEvent(event: WalletEvent): boolean {
    return event.type.startsWith('transaction_');
  }

  /**
   * Check if event is balance-related
   */
  static isBalanceEvent(event: WalletEvent): boolean {
    return event.type.startsWith('balance_');
  }

  /**
   * Check if event is connectivity-related
   */
  static isConnectivityEvent(event: WalletEvent): boolean {
    return event.type.includes('peer_') || 
           event.type.includes('connectivity_') || 
           event.type.includes('base_node_');
  }

  /**
   * Check if event is sync-related
   */
  static isSyncEvent(event: WalletEvent): boolean {
    return event.type.startsWith('sync_');
  }

  /**
   * Check if event is error-related
   */
  static isErrorEvent(event: WalletEvent): boolean {
    return event.type === 'error' || 
           event.type.endsWith('_failed') || 
           event.type === 'security_alert';
  }

  /**
   * Get event priority for ordering
   */
  static getEventPriority(event: WalletEvent): number {
    switch (event.type) {
      case 'error':
      case 'security_alert':
        return 1; // Highest priority
      case 'transaction_received':
      case 'transaction_confirmed':
        return 2;
      case 'balance_updated':
      case 'connectivity_changed':
        return 3;
      case 'sync_progress':
      case 'validation_progress':
        return 4;
      case 'log':
        return 5; // Lowest priority
      default:
        return 3; // Medium priority
    }
  }

  /**
   * Compare error severities
   */
  private static compareSeverity(a: ErrorSeverity, b: ErrorSeverity): number {
    const severityOrder = [
      ErrorSeverity.Info,
      ErrorSeverity.Warning,
      ErrorSeverity.Error,
      ErrorSeverity.Fatal
    ];

    return severityOrder.indexOf(a) - severityOrder.indexOf(b);
  }

  private static sequenceCounter = 0;

  /**
   * Get next sequence number
   */
  private static getNextSequenceNumber(): number {
    return ++this.sequenceCounter;
  }

  /**
   * Format event for display
   */
  static formatForDisplay(event: WalletEvent): string {
    const timestamp = new Date(event.timestamp).toISOString();
    const type = event.type.replace(/_/g, ' ').toUpperCase();
    
    switch (event.type) {
      case 'transaction_received':
        const received = event as TransactionReceivedEvent;
        return `${timestamp} - ${type}: ${received.amount} from ${received.sourceAddress}`;
      
      case 'transaction_sent':
        const sent = event as TransactionSentEvent;
        return `${timestamp} - ${type}: ${sent.amount} to ${sent.destinationAddress}`;
      
      case 'balance_updated':
        const balance = event as BalanceUpdatedEvent;
        return `${timestamp} - ${type}: ${balance.newBalance.available} available`;
      
      case 'connectivity_changed':
        const connectivity = event as ConnectivityChangedEvent;
        return `${timestamp} - ${type}: ${connectivity.status}`;
      
      case 'error':
        const error = event as ErrorEvent;
        return `${timestamp} - ${type}: ${error.error.message}`;
      
      default:
        return `${timestamp} - ${type}`;
    }
  }

  /**
   * Extract relevant data from event
   */
  static extractData(event: WalletEvent): Record<string, any> {
    const base = {
      type: event.type,
      timestamp: event.timestamp,
      source: event.source,
      sequence: event.sequence
    };

    switch (event.type) {
      case 'transaction_received':
        const received = event as TransactionReceivedEvent;
        return {
          ...base,
          transactionId: received.transaction.id,
          amount: received.amount.toString(),
          sourceAddress: received.sourceAddress
        };

      case 'balance_updated':
        const balance = event as BalanceUpdatedEvent;
        return {
          ...base,
          available: balance.newBalance.available.toString(),
          pendingIncoming: balance.newBalance.pendingIncoming.toString(),
          pendingOutgoing: balance.newBalance.pendingOutgoing.toString()
        };

      default:
        return base;
    }
  }
}

// Export utilities
export { EventUtils as Utils };

// Re-export enums used in events for convenience
export { ConnectivityStatus } from './enums.js';
