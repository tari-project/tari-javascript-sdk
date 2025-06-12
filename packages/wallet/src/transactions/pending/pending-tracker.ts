/**
 * @fileoverview Pending Transaction Tracker
 * 
 * Tracks individual pending transactions with metadata collection,
 * performance monitoring, and lifecycle management.
 */

import {
  WalletError,
  WalletErrorCode,
  withErrorContext,
  TypedEventEmitter,
  type TransactionId,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type {
  PendingInboundTransaction,
  PendingOutboundTransaction
} from '@tari-project/tarijs-core';
import type { PendingManagerConfig } from './pending-manager.js';

/**
 * Tracking metadata for a pending transaction
 */
export interface PendingTrackingInfo {
  /** Transaction being tracked */
  transaction: PendingInboundTransaction | PendingOutboundTransaction;
  /** When tracking started */
  trackingStartTime: UnixTimestamp;
  /** Number of status checks performed */
  checkCount: number;
  /** Last time the transaction was checked */
  lastCheckTime: UnixTimestamp;
  /** Number of failed status checks */
  failedChecks: number;
  /** Whether the transaction is approaching timeout */
  approachingTimeout: boolean;
  /** Custom metadata */
  metadata: Record<string, any>;
}

/**
 * Tracker events
 */
export interface PendingTrackerEvents {
  'transaction:tracked': (transaction: PendingInboundTransaction | PendingOutboundTransaction) => void;
  'transaction:untracked': (transactionId: TransactionId) => void;
  'transaction:checked': (transactionId: TransactionId, checkCount: number) => void;
  'transaction:approaching_timeout': (transactionId: TransactionId, timeRemaining: number) => void;
}

/**
 * Tracker statistics
 */
export interface TrackerStatistics {
  /** Total number of transactions being tracked */
  totalTracked: number;
  /** Number of inbound transactions */
  inboundCount: number;
  /** Number of outbound transactions */
  outboundCount: number;
  /** Average tracking duration in milliseconds */
  averageTrackingDuration: number;
  /** Total number of status checks performed */
  totalChecks: number;
  /** Number of transactions approaching timeout */
  approachingTimeoutCount: number;
  /** Oldest tracked transaction timestamp */
  oldestTrackedTransaction?: UnixTimestamp;
}

/**
 * Pending transaction tracker providing detailed monitoring and metadata collection
 * 
 * Features:
 * - Individual transaction lifecycle tracking
 * - Performance and timing metadata collection
 * - Timeout proximity detection
 * - Failed operation counting and circuit breaking
 * - Detailed statistics and reporting
 * - Custom metadata attachment
 */
export class PendingTracker extends TypedEventEmitter {
  private readonly config: PendingManagerConfig;
  private readonly trackedTransactions = new Map<TransactionId, PendingTrackingInfo>();
  private isDisposed = false;

  constructor(config: PendingManagerConfig) {
    super();
    this.config = config;
  }

  /**
   * Start tracking a pending transaction
   */
  @withErrorContext('track_transaction', 'pending_tracker')
  trackTransaction(transaction: PendingInboundTransaction | PendingOutboundTransaction): void {
    this.ensureNotDisposed();

    if (this.trackedTransactions.has(transaction.id)) {
      // Already tracking this transaction, update the reference
      const existing = this.trackedTransactions.get(transaction.id)!;
      existing.transaction = transaction;
      existing.lastCheckTime = Date.now() as UnixTimestamp;
      return;
    }

    const trackingInfo: PendingTrackingInfo = {
      transaction,
      trackingStartTime: Date.now() as UnixTimestamp,
      checkCount: 0,
      lastCheckTime: Date.now() as UnixTimestamp,
      failedChecks: 0,
      approachingTimeout: false,
      metadata: {}
    };

    this.trackedTransactions.set(transaction.id, trackingInfo);
    this.emit('transaction:tracked', transaction);
  }

  /**
   * Stop tracking a pending transaction
   */
  @withErrorContext('stop_tracking', 'pending_tracker')
  stopTracking(transactionId: TransactionId): boolean {
    this.ensureNotDisposed();

    const wasTracking = this.trackedTransactions.has(transactionId);
    this.trackedTransactions.delete(transactionId);
    
    if (wasTracking) {
      this.emit('transaction:untracked', transactionId);
    }
    
    return wasTracking;
  }

  /**
   * Record a status check for a tracked transaction
   */
  @withErrorContext('record_check', 'pending_tracker')
  recordStatusCheck(transactionId: TransactionId, successful: boolean = true): void {
    this.ensureNotDisposed();

    const trackingInfo = this.trackedTransactions.get(transactionId);
    if (!trackingInfo) {
      return; // Not tracking this transaction
    }

    trackingInfo.checkCount++;
    trackingInfo.lastCheckTime = Date.now() as UnixTimestamp;
    
    if (!successful) {
      trackingInfo.failedChecks++;
    }

    this.emit('transaction:checked', transactionId, trackingInfo.checkCount);

    // Check if approaching timeout
    this.checkTimeoutProximity(transactionId, trackingInfo);
  }

  /**
   * Add custom metadata to a tracked transaction
   */
  @withErrorContext('add_metadata', 'pending_tracker')
  addMetadata(transactionId: TransactionId, key: string, value: any): void {
    this.ensureNotDisposed();

    const trackingInfo = this.trackedTransactions.get(transactionId);
    if (trackingInfo) {
      trackingInfo.metadata[key] = value;
    }
  }

  /**
   * Get tracking information for a specific transaction
   */
  @withErrorContext('get_tracking_info', 'pending_tracker')
  getTrackingInfo(transactionId: TransactionId): PendingTrackingInfo | null {
    this.ensureNotDisposed();
    return this.trackedTransactions.get(transactionId) || null;
  }

  /**
   * Get all tracked transactions
   */
  @withErrorContext('get_all_tracked', 'pending_tracker')
  getAllTracked(): PendingTrackingInfo[] {
    this.ensureNotDisposed();
    return Array.from(this.trackedTransactions.values());
  }

  /**
   * Get tracked transactions by direction
   */
  @withErrorContext('get_tracked_by_direction', 'pending_tracker')
  getTrackedByDirection(): {
    inbound: PendingTrackingInfo[];
    outbound: PendingTrackingInfo[];
  } {
    this.ensureNotDisposed();

    const inbound: PendingTrackingInfo[] = [];
    const outbound: PendingTrackingInfo[] = [];

    for (const trackingInfo of this.trackedTransactions.values()) {
      if ('cancellable' in trackingInfo.transaction && trackingInfo.transaction.cancellable) {
        outbound.push(trackingInfo);
      } else {
        inbound.push(trackingInfo);
      }
    }

    return { inbound, outbound };
  }

  /**
   * Get transactions approaching timeout
   */
  @withErrorContext('get_approaching_timeout', 'pending_tracker')
  getApproachingTimeout(thresholdPercentage: number = 0.8): PendingTrackingInfo[] {
    this.ensureNotDisposed();

    const now = Date.now();
    const timeoutMs = this.config.transactionTimeoutSeconds * 1000;
    const thresholdMs = timeoutMs * thresholdPercentage;

    return Array.from(this.trackedTransactions.values()).filter(trackingInfo => {
      const age = now - Number(trackingInfo.transaction.timestamp);
      return age > thresholdMs;
    });
  }

  /**
   * Get transactions that have had too many failed checks
   */
  @withErrorContext('get_problematic_transactions', 'pending_tracker')
  getProblematicTransactions(maxFailedChecks: number = 5): PendingTrackingInfo[] {
    this.ensureNotDisposed();

    return Array.from(this.trackedTransactions.values()).filter(trackingInfo => 
      trackingInfo.failedChecks >= maxFailedChecks
    );
  }

  /**
   * Get comprehensive tracker statistics
   */
  @withErrorContext('get_statistics', 'pending_tracker')
  getStatistics(): TrackerStatistics {
    this.ensureNotDisposed();

    const tracked = Array.from(this.trackedTransactions.values());
    const now = Date.now();
    
    let inboundCount = 0;
    let outboundCount = 0;
    let totalTrackingDuration = 0;
    let totalChecks = 0;
    let approachingTimeoutCount = 0;
    let oldestTimestamp: UnixTimestamp | undefined;

    for (const trackingInfo of tracked) {
      // Count by direction
      if ('cancellable' in trackingInfo.transaction && trackingInfo.transaction.cancellable) {
        outboundCount++;
      } else {
        inboundCount++;
      }

      // Calculate tracking duration
      totalTrackingDuration += now - trackingInfo.trackingStartTime;
      
      // Sum checks
      totalChecks += trackingInfo.checkCount;
      
      // Count approaching timeout
      if (trackingInfo.approachingTimeout) {
        approachingTimeoutCount++;
      }

      // Find oldest
      const txTimestamp = trackingInfo.transaction.timestamp as UnixTimestamp;
      if (!oldestTimestamp || txTimestamp < oldestTimestamp) {
        oldestTimestamp = txTimestamp;
      }
    }

    const averageTrackingDuration = tracked.length > 0 ? 
      totalTrackingDuration / tracked.length : 0;

    return {
      totalTracked: tracked.length,
      inboundCount,
      outboundCount,
      averageTrackingDuration,
      totalChecks,
      approachingTimeoutCount,
      oldestTrackedTransaction: oldestTimestamp
    };
  }

  /**
   * Clean up old tracking entries for completed transactions
   */
  @withErrorContext('cleanup_completed', 'pending_tracker')
  cleanupCompleted(maxAge: number = 24 * 60 * 60 * 1000): number {
    this.ensureNotDisposed();

    const now = Date.now();
    const toRemove: TransactionId[] = [];

    for (const [transactionId, trackingInfo] of this.trackedTransactions.entries()) {
      const age = now - trackingInfo.trackingStartTime;
      if (age > maxAge) {
        toRemove.push(transactionId);
      }
    }

    for (const transactionId of toRemove) {
      this.stopTracking(transactionId);
    }

    return toRemove.length;
  }

  /**
   * Check if a transaction is approaching timeout
   */
  private checkTimeoutProximity(transactionId: TransactionId, trackingInfo: PendingTrackingInfo): void {
    const now = Date.now();
    const age = now - Number(trackingInfo.transaction.timestamp);
    const timeoutMs = this.config.transactionTimeoutSeconds * 1000;
    const timeRemaining = timeoutMs - age;
    
    // Consider transaction approaching timeout if within 20% of timeout period
    const thresholdMs = timeoutMs * 0.8;
    const isApproaching = age > thresholdMs;

    if (isApproaching && !trackingInfo.approachingTimeout) {
      trackingInfo.approachingTimeout = true;
      this.emit('transaction:approaching_timeout', transactionId, timeRemaining);
    } else if (!isApproaching && trackingInfo.approachingTimeout) {
      trackingInfo.approachingTimeout = false;
    }
  }

  /**
   * Ensure tracker is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Pending transaction tracker has been disposed'
      );
    }
  }

  /**
   * Dispose of the tracker and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.trackedTransactions.clear();
    this.removeAllListeners();
  }

  /**
   * Get the number of tracked transactions
   */
  get trackedCount(): number {
    return this.trackedTransactions.size;
  }

  /**
   * Check if a transaction is being tracked
   */
  isTracking(transactionId: TransactionId): boolean {
    return this.trackedTransactions.has(transactionId);
  }
}
