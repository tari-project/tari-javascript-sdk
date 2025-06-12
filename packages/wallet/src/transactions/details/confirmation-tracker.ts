/**
 * @fileoverview Transaction Confirmation Tracker
 * 
 * Tracks transaction confirmations in real-time as new blocks are added
 * to the blockchain, providing automatic updates and finalization detection.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  TypedEventEmitter,
  type TransactionId,
  type WalletHandle,
  type BlockHeight,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type { DetailServiceConfig } from './detail-service.js';

/**
 * Tracking information for a transaction
 */
interface TransactionTrackingInfo {
  /** Transaction ID being tracked */
  transactionId: TransactionId;
  /** Block height when transaction was confirmed */
  confirmedBlockHeight?: BlockHeight;
  /** Current confirmation count */
  confirmations: number;
  /** Required confirmations for finality */
  requiredConfirmations: number;
  /** When tracking started */
  trackingStarted: UnixTimestamp;
  /** Last update timestamp */
  lastUpdated: UnixTimestamp;
  /** Whether transaction is considered final */
  isFinal: boolean;
  /** Number of updates received */
  updateCount: number;
}

/**
 * Events emitted by the confirmation tracker
 */
export interface ConfirmationTrackerEvents {
  'confirmations:changed': (transactionId: TransactionId, newCount: number, oldCount: number) => void;
  'transaction:confirmed': (transactionId: TransactionId, blockHeight: BlockHeight) => void;
  'transaction:finalized': (transactionId: TransactionId, confirmations: number) => void;
  'tracking:started': (transactionId: TransactionId) => void;
  'tracking:stopped': (transactionId: TransactionId) => void;
}

/**
 * Statistics for confirmation tracking
 */
export interface ConfirmationStatistics {
  /** Number of transactions currently being tracked */
  trackedTransactions: number;
  /** Total number of confirmation updates processed */
  totalUpdates: number;
  /** Number of transactions that reached finality */
  finalizedTransactions: number;
  /** Average time to finalization (seconds) */
  averageFinalizationTime: number;
  /** Current blockchain height */
  currentBlockHeight: BlockHeight;
  /** Last blockchain update timestamp */
  lastBlockUpdate?: UnixTimestamp;
  /** Tracking efficiency (updates per second) */
  trackingEfficiency: number;
}

/**
 * Real-time transaction confirmation tracker
 * 
 * Features:
 * - Automatic confirmation counting as new blocks arrive
 * - Configurable finalization thresholds
 * - Event emission for confirmation changes
 * - Efficient polling with block height caching
 * - Automatic cleanup of finalized transactions
 * - Performance monitoring and statistics
 */
export class ConfirmationTracker extends TypedEventEmitter {
  private readonly walletHandle: WalletHandle;
  private readonly config: DetailServiceConfig;
  private readonly ffiBindings = getFFIBindings();
  
  private readonly trackedTransactions = new Map<TransactionId, TransactionTrackingInfo>();
  private currentBlockHeight: BlockHeight = BigInt(0) as BlockHeight;
  private refreshTimer?: NodeJS.Timeout;
  private isRunning = false;
  private isDisposed = false;
  
  private statistics: ConfirmationStatistics = {
    trackedTransactions: 0,
    totalUpdates: 0,
    finalizedTransactions: 0,
    averageFinalizationTime: 0,
    currentBlockHeight: BigInt(0) as BlockHeight,
    trackingEfficiency: 0
  };
  
  private readonly finalizationTimes: number[] = [];
  private lastUpdateTime = Date.now();

  constructor(walletHandle: WalletHandle, config: DetailServiceConfig) {
    super();
    this.walletHandle = walletHandle;
    this.config = config;
    
    // Start tracking if confirmation tracking is enabled
    if (this.config.enableConfirmationTracking) {
      this.start();
    }
  }

  /**
   * Start the confirmation tracker
   */
  @withErrorContext('start_confirmation_tracker', 'confirmation_tracker')
  async start(): Promise<void> {
    this.ensureNotDisposed();
    
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // Get initial blockchain height
    await this.updateBlockchainHeight();
    
    // Start periodic updates
    this.startPeriodicUpdates();
  }

  /**
   * Stop the confirmation tracker
   */
  @withErrorContext('stop_confirmation_tracker', 'confirmation_tracker')
  async stop(): Promise<void> {
    this.ensureNotDisposed();
    
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Start tracking confirmations for a transaction
   */
  @withErrorContext('start_tracking_transaction', 'confirmation_tracker')
  async startTracking(
    transactionId: TransactionId,
    requiredConfirmations: number = 3
  ): Promise<void> {
    this.ensureNotDisposed();
    
    if (this.trackedTransactions.has(transactionId)) {
      // Already tracking this transaction
      return;
    }
    
    try {
      // Get current confirmation count
      const confirmations = await this.getCurrentConfirmationCount(transactionId);
      const confirmedBlockHeight = await this.getTransactionBlockHeight(transactionId);
      
      const trackingInfo: TransactionTrackingInfo = {
        transactionId,
        confirmedBlockHeight,
        confirmations,
        requiredConfirmations,
        trackingStarted: Date.now() as UnixTimestamp,
        lastUpdated: Date.now() as UnixTimestamp,
        isFinal: confirmations >= requiredConfirmations,
        updateCount: 0
      };
      
      this.trackedTransactions.set(transactionId, trackingInfo);
      this.statistics.trackedTransactions = this.trackedTransactions.size;
      
      this.emit('tracking:started', transactionId);
      
      // If transaction is already confirmed but not final, emit confirmation event
      if (confirmedBlockHeight && confirmations < requiredConfirmations) {
        this.emit('transaction:confirmed', transactionId, confirmedBlockHeight);
      }
      
      // If transaction is already final, emit finalization event
      if (trackingInfo.isFinal) {
        this.emit('transaction:finalized', transactionId, confirmations);
        this.handleTransactionFinalized(transactionId, trackingInfo);
      }
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ConfirmationTrackingFailed,
        `Failed to start tracking transaction ${transactionId}: ${error}`,
        { 
          cause: error,
          context: { transactionId: transactionId.toString() }
        }
      );
    }
  }

  /**
   * Stop tracking confirmations for a transaction
   */
  @withErrorContext('stop_tracking_transaction', 'confirmation_tracker')
  stopTracking(transactionId: TransactionId): boolean {
    this.ensureNotDisposed();
    
    const wasTracked = this.trackedTransactions.delete(transactionId);
    
    if (wasTracked) {
      this.statistics.trackedTransactions = this.trackedTransactions.size;
      this.emit('tracking:stopped', transactionId);
    }
    
    return wasTracked;
  }

  /**
   * Get current confirmation count for a transaction
   */
  @withErrorContext('get_confirmation_count', 'confirmation_tracker')
  async getConfirmationCount(transactionId: TransactionId): Promise<number> {
    this.ensureNotDisposed();
    
    // Check if we're tracking this transaction
    const tracked = this.trackedTransactions.get(transactionId);
    if (tracked) {
      return tracked.confirmations;
    }
    
    // Get fresh count from blockchain
    return await this.getCurrentConfirmationCount(transactionId);
  }

  /**
   * Get tracking information for a transaction
   */
  @withErrorContext('get_tracking_info', 'confirmation_tracker')
  getTrackingInfo(transactionId: TransactionId): TransactionTrackingInfo | null {
    this.ensureNotDisposed();
    
    const info = this.trackedTransactions.get(transactionId);
    return info ? { ...info } : null;
  }

  /**
   * Get all tracked transactions
   */
  @withErrorContext('get_all_tracked', 'confirmation_tracker')
  getAllTracked(): Array<{
    transactionId: TransactionId;
    confirmations: number;
    requiredConfirmations: number;
    isFinal: boolean;
    trackingDuration: number;
  }> {
    this.ensureNotDisposed();
    
    const now = Date.now();
    return Array.from(this.trackedTransactions.values()).map(info => ({
      transactionId: info.transactionId,
      confirmations: info.confirmations,
      requiredConfirmations: info.requiredConfirmations,
      isFinal: info.isFinal,
      trackingDuration: (now - info.trackingStarted) / 1000
    }));
  }

  /**
   * Force update confirmations for all tracked transactions
   */
  @withErrorContext('update_confirmations', 'confirmation_tracker')
  async updateConfirmations(): Promise<void> {
    this.ensureNotDisposed();
    
    if (this.trackedTransactions.size === 0) {
      return;
    }
    
    // Update blockchain height first
    await this.updateBlockchainHeight();
    
    // Update all tracked transactions
    const updatePromises = Array.from(this.trackedTransactions.keys()).map(
      txId => this.updateTransactionConfirmations(txId)
    );
    
    await Promise.allSettled(updatePromises);
    
    // Update efficiency statistics
    this.updateTrackingEfficiency();
  }

  /**
   * Get confirmation tracking statistics
   */
  @withErrorContext('get_confirmation_statistics', 'confirmation_tracker')
  getStatistics(): ConfirmationStatistics {
    this.ensureNotDisposed();
    
    return {
      ...this.statistics,
      trackedTransactions: this.trackedTransactions.size,
      currentBlockHeight: this.currentBlockHeight
    };
  }

  /**
   * Clean up finalized transactions
   */
  @withErrorContext('cleanup_finalized', 'confirmation_tracker')
  cleanupFinalized(): number {
    this.ensureNotDisposed();
    
    const toRemove: TransactionId[] = [];
    
    for (const [txId, info] of this.trackedTransactions.entries()) {
      if (info.isFinal) {
        toRemove.push(txId);
      }
    }
    
    for (const txId of toRemove) {
      this.stopTracking(txId);
    }
    
    return toRemove.length;
  }

  /**
   * Get current confirmation count from blockchain
   */
  private async getCurrentConfirmationCount(transactionId: TransactionId): Promise<number> {
    try {
      const confirmationsJson = await this.ffiBindings.wallet_get_transaction_confirmations?.(
        this.walletHandle,
        transactionId
      );
      
      if (!confirmationsJson) {
        return 0;
      }
      
      const confirmationData = JSON.parse(confirmationsJson);
      return confirmationData.confirmations || 0;
    } catch (error) {
      // If transaction is not found or not confirmed, return 0
      return 0;
    }
  }

  /**
   * Get the block height where transaction was confirmed
   */
  private async getTransactionBlockHeight(transactionId: TransactionId): Promise<BlockHeight | undefined> {
    try {
      const transactionJson = await this.ffiBindings.wallet_get_transaction(
        this.walletHandle,
        transactionId
      );
      
      if (!transactionJson) {
        return undefined;
      }
      
      const transaction = JSON.parse(transactionJson);
      return transaction.blockHeight ? BigInt(transaction.blockHeight) as BlockHeight : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Update blockchain height from wallet
   */
  private async updateBlockchainHeight(): Promise<void> {
    try {
      const heightJson = await this.ffiBindings.wallet_get_blockchain_height?.(
        this.walletHandle
      );
      
      if (heightJson) {
        const heightData = JSON.parse(heightJson);
        const newHeight = BigInt(heightData.height) as BlockHeight;
        
        if (newHeight > this.currentBlockHeight) {
          this.currentBlockHeight = newHeight;
          this.statistics.currentBlockHeight = newHeight;
          this.statistics.lastBlockUpdate = Date.now() as UnixTimestamp;
        }
      }
    } catch (error) {
      // Blockchain height update failed, continue with existing height
    }
  }

  /**
   * Update confirmations for a specific transaction
   */
  private async updateTransactionConfirmations(transactionId: TransactionId): Promise<void> {
    const trackingInfo = this.trackedTransactions.get(transactionId);
    if (!trackingInfo) {
      return;
    }
    
    try {
      const newConfirmations = await this.getCurrentConfirmationCount(transactionId);
      const oldConfirmations = trackingInfo.confirmations;
      
      if (newConfirmations !== oldConfirmations) {
        trackingInfo.confirmations = newConfirmations;
        trackingInfo.lastUpdated = Date.now() as UnixTimestamp;
        trackingInfo.updateCount++;
        
        const wasNotFinal = !trackingInfo.isFinal;
        trackingInfo.isFinal = newConfirmations >= trackingInfo.requiredConfirmations;
        
        this.statistics.totalUpdates++;
        
        // Emit confirmation change event
        this.emit('confirmations:changed', transactionId, newConfirmations, oldConfirmations);
        
        // Check if transaction just got confirmed
        if (oldConfirmations === 0 && newConfirmations > 0) {
          const blockHeight = await this.getTransactionBlockHeight(transactionId);
          if (blockHeight) {
            trackingInfo.confirmedBlockHeight = blockHeight;
            this.emit('transaction:confirmed', transactionId, blockHeight);
          }
        }
        
        // Check if transaction just reached finality
        if (wasNotFinal && trackingInfo.isFinal) {
          this.emit('transaction:finalized', transactionId, newConfirmations);
          this.handleTransactionFinalized(transactionId, trackingInfo);
        }
      }
    } catch (error) {
      // Continue with other transactions if one fails
    }
  }

  /**
   * Handle transaction finalization
   */
  private handleTransactionFinalized(
    transactionId: TransactionId,
    trackingInfo: TransactionTrackingInfo
  ): void {
    // Update finalization statistics
    this.statistics.finalizedTransactions++;
    
    const finalizationTime = (trackingInfo.lastUpdated - trackingInfo.trackingStarted) / 1000;
    this.finalizationTimes.push(finalizationTime);
    
    // Keep only the last 100 finalization times for rolling average
    if (this.finalizationTimes.length > 100) {
      this.finalizationTimes.splice(0, this.finalizationTimes.length - 100);
    }
    
    // Update average finalization time
    if (this.finalizationTimes.length > 0) {
      this.statistics.averageFinalizationTime = 
        this.finalizationTimes.reduce((sum, time) => sum + time, 0) / this.finalizationTimes.length;
    }
  }

  /**
   * Start periodic confirmation updates
   */
  private startPeriodicUpdates(): void {
    const intervalMs = this.config.confirmationRefreshIntervalSeconds * 1000;
    
    this.refreshTimer = setInterval(async () => {
      if (this.isRunning && !this.isDisposed) {
        try {
          await this.updateConfirmations();
        } catch (error) {
          // Continue running even if update fails
        }
      }
    }, intervalMs);
  }

  /**
   * Update tracking efficiency statistics
   */
  private updateTrackingEfficiency(): void {
    const now = Date.now();
    const timeSinceLastUpdate = (now - this.lastUpdateTime) / 1000;
    
    if (timeSinceLastUpdate > 0) {
      this.statistics.trackingEfficiency = this.trackedTransactions.size / timeSinceLastUpdate;
    }
    
    this.lastUpdateTime = now;
  }

  /**
   * Ensure tracker is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Confirmation tracker has been disposed'
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
    
    // Stop tracking
    await this.stop();
    
    // Clear all tracked transactions
    this.trackedTransactions.clear();
    
    this.removeAllListeners();
  }
}
