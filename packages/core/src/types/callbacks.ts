/**
 * @fileoverview Callback types and interfaces for the Tari JavaScript SDK
 * 
 * Defines callback function types for wallet operations, events,
 * and asynchronous operations with proper error handling.
 */

import type {
  TransactionId,
  MicroTari,
  BlockHeight,
  UnixTimestamp,
  WalletHandle
} from './branded.js';
import type {
  Transaction,
  PendingInboundTransaction,
  PendingOutboundTransaction,
  CompletedTransaction,
  CancelledTransaction
} from './transaction.js';
import type { Balance } from './balance.js';
import type { Contact } from './contact.js';
import type { UtxoInfo } from './utxo.js';
import type {
  WalletEvent,
  ConnectivityStatus,
  PeerInfo,
  SyncType,
  SyncStage,
  ValidationType,
  SecurityAlertEvent,
  ErrorEvent
} from './events.js';

// Base callback types
export type NodeCallback<T = void> = (error?: Error | null, result?: T) => void;
export type AsyncCallback<T = void> = (result: T) => void | Promise<void>;
export type ErrorCallback = (error: Error) => void | Promise<void>;

// Transaction callback types
export type TransactionReceivedCallback = (transaction: PendingInboundTransaction) => void | Promise<void>;
export type TransactionSentCallback = (transaction: PendingOutboundTransaction) => void | Promise<void>;
export type TransactionBroadcastCallback = (transactionId: TransactionId) => void | Promise<void>;
export type TransactionMinedCallback = (transaction: CompletedTransaction) => void | Promise<void>;
export type TransactionConfirmedCallback = (transaction: CompletedTransaction) => void | Promise<void>;
export type TransactionCancelledCallback = (transaction: CancelledTransaction) => void | Promise<void>;
export type TransactionFailedCallback = (transactionId: TransactionId, error: string) => void | Promise<void>;

// Balance callback types
export type BalanceUpdatedCallback = (balance: Balance) => void | Promise<void>;
export type BalanceRefreshedCallback = (balance: Balance) => void | Promise<void>;

// Connectivity callback types
export type ConnectivityChangedCallback = (status: ConnectivityStatus) => void | Promise<void>;
export type PeerConnectedCallback = (peer: PeerInfo) => void | Promise<void>;
export type PeerDisconnectedCallback = (peer: PeerInfo, reason: string) => void | Promise<void>;
export type BaseNodeChangedCallback = (newNode: PeerInfo, previousNode?: PeerInfo) => void | Promise<void>;

// Sync callback types
export type SyncStartedCallback = (syncType: SyncType) => void | Promise<void>;
export type SyncProgressCallback = (current: number, total: number, stage: SyncStage) => void | Promise<void>;
export type SyncCompletedCallback = (syncType: SyncType, duration: number) => void | Promise<void>;
export type SyncFailedCallback = (syncType: SyncType, error: string) => void | Promise<void>;

// Validation callback types
export type ValidationStartedCallback = (validationType: ValidationType, itemCount: number) => void | Promise<void>;
export type ValidationProgressCallback = (validationType: ValidationType, processed: number, total: number) => void | Promise<void>;
export type ValidationCompletedCallback = (validationType: ValidationType, duration: number) => void | Promise<void>;

// Contact callback types
export type ContactAddedCallback = (contact: Contact) => void | Promise<void>;
export type ContactUpdatedCallback = (contact: Contact, previousContact: Contact) => void | Promise<void>;
export type ContactRemovedCallback = (contactId: string) => void | Promise<void>;

// Security callback types
export type SecurityAlertCallback = (alert: SecurityAlertEvent) => void | Promise<void>;

// Wallet lifecycle callback types
export type WalletStartedCallback = (walletId: string) => void | Promise<void>;
export type WalletStoppedCallback = (walletId: string, reason: string) => void | Promise<void>;
export type WalletLockedCallback = (walletId: string) => void | Promise<void>;
export type WalletUnlockedCallback = (walletId: string) => void | Promise<void>;

// Error callback types
export type ErrorOccurredCallback = (error: ErrorEvent) => void | Promise<void>;

// Progress callback types
export type ProgressCallback = (current: number, total: number, message?: string) => void | Promise<void>;

// Comprehensive wallet event handlers interface
export interface WalletEventHandlers {
  // Transaction events
  onTransactionReceived?: TransactionReceivedCallback;
  onTransactionSent?: TransactionSentCallback;
  onTransactionBroadcast?: TransactionBroadcastCallback;
  onTransactionMined?: TransactionMinedCallback;
  onTransactionConfirmed?: TransactionConfirmedCallback;
  onTransactionCancelled?: TransactionCancelledCallback;
  onTransactionFailed?: TransactionFailedCallback;

  // Balance events
  onBalanceUpdated?: BalanceUpdatedCallback;
  onBalanceRefreshed?: BalanceRefreshedCallback;

  // Connectivity events
  onConnectivityChanged?: ConnectivityChangedCallback;
  onPeerConnected?: PeerConnectedCallback;
  onPeerDisconnected?: PeerDisconnectedCallback;
  onBaseNodeChanged?: BaseNodeChangedCallback;

  // Sync events
  onSyncStarted?: SyncStartedCallback;
  onSyncProgress?: SyncProgressCallback;
  onSyncCompleted?: SyncCompletedCallback;
  onSyncFailed?: SyncFailedCallback;

  // Validation events
  onValidationStarted?: ValidationStartedCallback;
  onValidationProgress?: ValidationProgressCallback;
  onValidationCompleted?: ValidationCompletedCallback;

  // Contact events
  onContactAdded?: ContactAddedCallback;
  onContactUpdated?: ContactUpdatedCallback;
  onContactRemoved?: ContactRemovedCallback;

  // Security events
  onSecurityAlert?: SecurityAlertCallback;

  // Wallet lifecycle events
  onWalletStarted?: WalletStartedCallback;
  onWalletStopped?: WalletStoppedCallback;
  onWalletLocked?: WalletLockedCallback;
  onWalletUnlocked?: WalletUnlockedCallback;

  // Error events
  onError?: ErrorOccurredCallback;

  // Generic event handler for all events
  onEvent?: (event: WalletEvent) => void | Promise<void>;
}

// Operation callbacks for async operations
export interface OperationCallbacks<T> {
  /** Called when operation starts */
  onStart?: () => void | Promise<void>;
  /** Called with progress updates */
  onProgress?: ProgressCallback;
  /** Called when operation completes successfully */
  onSuccess?: (result: T) => void | Promise<void>;
  /** Called when operation fails */
  onError?: ErrorCallback;
  /** Called when operation is cancelled */
  onCancel?: () => void | Promise<void>;
  /** Called when operation completes (success or failure) */
  onComplete?: (result?: T, error?: Error) => void | Promise<void>;
}

// Transaction operation callbacks
export interface TransactionOperationCallbacks extends OperationCallbacks<TransactionId> {
  /** Called when transaction is built */
  onTransactionBuilt?: (transactionId: TransactionId) => void | Promise<void>;
  /** Called when transaction is broadcast */
  onTransactionBroadcast?: (transactionId: TransactionId) => void | Promise<void>;
  /** Called when transaction is mined */
  onTransactionMined?: (transactionId: TransactionId, blockHeight: BlockHeight) => void | Promise<void>;
}

// Wallet operation callbacks
export interface WalletOperationCallbacks extends OperationCallbacks<WalletHandle> {
  /** Called when wallet is created */
  onWalletCreated?: (walletHandle: WalletHandle) => void | Promise<void>;
  /** Called when wallet is restored */
  onWalletRestored?: (walletHandle: WalletHandle) => void | Promise<void>;
  /** Called during recovery progress */
  onRecoveryProgress?: ProgressCallback;
}

// Sync operation callbacks
export interface SyncOperationCallbacks extends OperationCallbacks<void> {
  /** Called when sync stage changes */
  onStageChanged?: (stage: SyncStage) => void | Promise<void>;
  /** Called when headers are synced */
  onHeadersSynced?: (headerCount: number) => void | Promise<void>;
  /** Called when blocks are synced */
  onBlocksSynced?: (blockCount: number) => void | Promise<void>;
}

// Import/Export operation callbacks
export interface ImportExportCallbacks<T> extends OperationCallbacks<T> {
  /** Called when file is being read */
  onFileRead?: (filename: string, size: number) => void | Promise<void>;
  /** Called when data is being processed */
  onDataProcessed?: (processed: number, total: number) => void | Promise<void>;
  /** Called when validation occurs */
  onValidation?: (item: any, isValid: boolean) => void | Promise<void>;
}

// Callback registration and management
export interface CallbackManager {
  /** Register event handler */
  on<K extends keyof WalletEventHandlers>(
    event: K,
    handler: NonNullable<WalletEventHandlers[K]>
  ): void;

  /** Unregister event handler */
  off<K extends keyof WalletEventHandlers>(
    event: K,
    handler: NonNullable<WalletEventHandlers[K]>
  ): void;

  /** Register one-time event handler */
  once<K extends keyof WalletEventHandlers>(
    event: K,
    handler: NonNullable<WalletEventHandlers[K]>
  ): void;

  /** Register multiple handlers at once */
  setHandlers(handlers: Partial<WalletEventHandlers>): void;

  /** Remove all handlers */
  removeAllHandlers(): void;

  /** Get registered handlers for event */
  getHandlers<K extends keyof WalletEventHandlers>(event: K): Array<NonNullable<WalletEventHandlers[K]>>;

  /** Check if event has handlers */
  hasHandlers<K extends keyof WalletEventHandlers>(event: K): boolean;

  /** Emit event to handlers */
  emit<K extends keyof WalletEventHandlers>(
    event: K,
    ...args: Parameters<NonNullable<WalletEventHandlers[K]>>
  ): Promise<void>;
}

// Callback result wrapper for error handling
export interface CallbackResult<T> {
  /** Whether callback executed successfully */
  readonly success: boolean;
  /** Callback result if successful */
  readonly result?: T;
  /** Error if callback failed */
  readonly error?: Error;
  /** Execution time in milliseconds */
  readonly duration: number;
}

// Callback execution options
export interface CallbackExecutionOptions {
  /** Timeout for callback execution */
  timeout?: number;
  /** Whether to catch and log errors */
  catchErrors?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Whether to execute in parallel */
  parallel?: boolean;
}

// Callback utilities
export class CallbackUtils {
  /**
   * Execute callback safely with error handling
   */
  static async executeCallback<T extends any[], R>(
    callback: (...args: T) => R | Promise<R>,
    args: T,
    options: CallbackExecutionOptions = {}
  ): Promise<CallbackResult<R>> {
    const startTime = Date.now();
    const {
      timeout = 5000,
      catchErrors = true,
      maxRetries = 0,
      retryDelay = 1000
    } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let result: R;

        if (timeout > 0) {
          result = await Promise.race([
            Promise.resolve(callback(...args)),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Callback timeout')), timeout)
            )
          ]);
        } else {
          result = await Promise.resolve(callback(...args));
        }

        return {
          success: true,
          result,
          duration: Date.now() - startTime
        };
      } catch (error) {
        if (attempt === maxRetries || !catchErrors) {
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            duration: Date.now() - startTime
          };
        }

        // Wait before retry
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    return {
      success: false,
      error: new Error('All retry attempts failed'),
      duration: Date.now() - startTime
    };
  }

  /**
   * Execute multiple callbacks in parallel
   */
  static async executeCallbacksParallel<T extends any[]>(
    callbacks: Array<(...args: T) => any>,
    args: T,
    options: CallbackExecutionOptions = {}
  ): Promise<CallbackResult<any>[]> {
    const promises = callbacks.map(callback =>
      this.executeCallback(callback, args, options)
    );
    return Promise.all(promises);
  }

  /**
   * Execute multiple callbacks in sequence
   */
  static async executeCallbacksSequential<T extends any[]>(
    callbacks: Array<(...args: T) => any>,
    args: T,
    options: CallbackExecutionOptions = {}
  ): Promise<CallbackResult<any>[]> {
    const results: CallbackResult<any>[] = [];
    
    for (const callback of callbacks) {
      const result = await this.executeCallback(callback, args, options);
      results.push(result);
      
      // Stop on first error if not catching errors
      if (!result.success && !options.catchErrors) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Create a callback wrapper with error handling
   */
  static wrapCallback<T extends any[], R>(
    callback: (...args: T) => R | Promise<R>,
    options: CallbackExecutionOptions = {}
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const result = await this.executeCallback(callback, args, options);
      
      if (result.success) {
        return result.result!;
      } else {
        throw result.error!;
      }
    };
  }

  /**
   * Create a debounced callback
   */
  static debounce<T extends any[]>(
    callback: (...args: T) => void | Promise<void>,
    delay: number
  ): (...args: T) => void {
    let timeoutId: NodeJS.Timeout | null = null;
    
    return (...args: T): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        callback(...args);
        timeoutId = null;
      }, delay);
    };
  }

  /**
   * Create a throttled callback
   */
  static throttle<T extends any[]>(
    callback: (...args: T) => void | Promise<void>,
    interval: number
  ): (...args: T) => void {
    let lastCall = 0;
    let timeoutId: NodeJS.Timeout | null = null;
    
    return (...args: T): void => {
      const now = Date.now();
      
      if (now - lastCall >= interval) {
        lastCall = now;
        callback(...args);
      } else if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          callback(...args);
          timeoutId = null;
        }, interval - (now - lastCall));
      }
    };
  }

  /**
   * Create a callback that only executes once
   */
  static once<T extends any[], R>(
    callback: (...args: T) => R | Promise<R>
  ): (...args: T) => R | Promise<R> {
    let called = false;
    let result: R | Promise<R>;
    
    return (...args: T): R | Promise<R> => {
      if (!called) {
        called = true;
        result = callback(...args);
      }
      return result;
    };
  }

  /**
   * Convert Node.js style callback to Promise
   */
  static promisify<T extends any[], R>(
    fn: (...args: [...T, NodeCallback<R>]) => void
  ): (...args: T) => Promise<R> {
    return (...args: T): Promise<R> => {
      return new Promise<R>((resolve, reject) => {
        fn(...args, (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result!);
          }
        });
      });
    };
  }

  /**
   * Convert Promise to Node.js style callback
   */
  static callbackify<T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ): (...args: [...T, NodeCallback<R>]) => void {
    return (...args: [...T, NodeCallback<R>]): void => {
      const callback = args.pop() as NodeCallback<R>;
      const fnArgs = args as unknown as T;
      
      fn(...fnArgs)
        .then(result => callback(null, result))
        .catch(error => callback(error));
    };
  }

  /**
   * Create callback chain for sequential execution
   */
  static chain<T>(
    ...callbacks: Array<(input: T) => T | Promise<T>>
  ): (input: T) => Promise<T> {
    return async (input: T): Promise<T> => {
      let result = input;
      
      for (const callback of callbacks) {
        result = await Promise.resolve(callback(result));
      }
      
      return result;
    };
  }

  /**
   * Create callback with retry logic
   */
  static withRetry<T extends any[], R>(
    callback: (...args: T) => R | Promise<R>,
    maxRetries = 3,
    retryDelay = 1000
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const result = await this.executeCallback(callback, args, {
        maxRetries,
        retryDelay,
        catchErrors: false
      });
      
      if (result.success) {
        return result.result!;
      } else {
        throw result.error!;
      }
    };
  }
}

// Export utilities
// CallbackUtils is already exported with its class declaration

// Type helpers for extracting callback types
export type ExtractCallbackArgs<T> = T extends (...args: infer A) => any ? A : never;
export type ExtractCallbackReturn<T> = T extends (...args: any[]) => infer R ? R : never;

// Conditional callback types
export type OptionalCallback<T> = T | undefined;
export type RequiredCallback<T> = T;

// Callback with metadata
export interface CallbackWithMetadata<T extends (...args: any[]) => any> {
  callback: T;
  metadata: {
    name?: string;
    description?: string;
    priority?: number;
    timeout?: number;
    retries?: number;
  };
}

// Event-driven callback system
export interface EventDrivenCallbacks {
  /** Map of event types to their callbacks */
  callbacks: Map<string, Set<(...args: any[]) => void | Promise<void>>>;
  
  /** Add callback for event type */
  addCallback(eventType: string, callback: (...args: any[]) => void | Promise<void>): void;
  
  /** Remove callback for event type */
  removeCallback(eventType: string, callback: (...args: any[]) => void | Promise<void>): void;
  
  /** Trigger all callbacks for event type */
  trigger(eventType: string, ...args: any[]): Promise<void>;
  
  /** Clear all callbacks */
  clear(): void;
}
