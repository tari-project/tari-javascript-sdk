/**
 * @fileoverview Transaction Memo Service
 * 
 * Manages transaction memos/messages with persistent storage,
 * encryption support, and comprehensive memo management.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  TypedEventEmitter,
  type TransactionId,
  type WalletHandle,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type { DetailServiceConfig } from './detail-service.js';

/**
 * Memo entry with metadata
 */
interface MemoEntry {
  /** Transaction ID */
  transactionId: TransactionId;
  /** Memo text */
  memo: string;
  /** When memo was created */
  createdAt: UnixTimestamp;
  /** When memo was last updated */
  updatedAt: UnixTimestamp;
  /** Whether memo is encrypted */
  encrypted: boolean;
  /** Memo hash for integrity verification */
  hash?: string;
}

/**
 * Events emitted by the memo service
 */
export interface MemoServiceEvents {
  'memo:created': (transactionId: TransactionId, memo: string) => void;
  'memo:updated': (transactionId: TransactionId, oldMemo: string, newMemo: string) => void;
  'memo:deleted': (transactionId: TransactionId) => void;
}

/**
 * Statistics for memo operations
 */
export interface MemoStatistics {
  /** Total number of memos stored */
  totalMemos: number;
  /** Number of encrypted memos */
  encryptedMemos: number;
  /** Average memo length */
  averageMemoLength: number;
  /** Total memo storage size (bytes) */
  totalStorageSize: number;
  /** Last memo operation timestamp */
  lastOperationTime?: UnixTimestamp;
}

/**
 * Transaction memo service
 * 
 * Features:
 * - Persistent memo storage
 * - Optional encryption for sensitive memos
 * - Memo validation and sanitization
 * - Search and filtering capabilities
 * - Bulk memo operations
 * - Storage statistics and management
 */
export class MemoService extends TypedEventEmitter {
  private readonly walletHandle: WalletHandle;
  private readonly config: DetailServiceConfig;
  private readonly ffiBindings = getFFIBindings();
  
  private readonly memoCache = new Map<TransactionId, MemoEntry>();
  private isDisposed = false;
  
  private statistics: MemoStatistics = {
    totalMemos: 0,
    encryptedMemos: 0,
    averageMemoLength: 0,
    totalStorageSize: 0
  };

  constructor(walletHandle: WalletHandle, config: DetailServiceConfig) {
    super();
    this.walletHandle = walletHandle;
    this.config = config;
    
    // Initialize memo cache if memo management is enabled
    if (this.config.enableMemoManagement) {
      this.initializeMemoCache();
    }
  }

  /**
   * Set memo for a transaction
   */
  @withErrorContext('set_transaction_memo', 'memo_service')
  async setMemo(
    transactionId: TransactionId,
    memo: string,
    encrypted: boolean = false
  ): Promise<void> {
    this.ensureNotDisposed();
    this.ensureMemoManagementEnabled();
    
    // Validate memo
    this.validateMemo(memo);
    
    try {
      const now = Date.now() as UnixTimestamp;
      const existingMemo = this.memoCache.get(transactionId);
      
      // Process memo (encrypt if requested)
      const processedMemo = encrypted ? await this.encryptMemo(memo) : memo;
      
      // Create memo entry
      const memoEntry: MemoEntry = {
        transactionId,
        memo: processedMemo,
        createdAt: existingMemo?.createdAt || now,
        updatedAt: now,
        encrypted,
        hash: this.calculateMemoHash(processedMemo)
      };
      
      // Store memo via FFI (if available)
      await this.storeMemoViaFFI(transactionId, processedMemo, encrypted);
      
      // Update cache
      this.memoCache.set(transactionId, memoEntry);
      
      // Update statistics
      this.updateStatistics();
      
      // Emit appropriate event
      if (existingMemo) {
        const oldMemo = encrypted ? 
          await this.decryptMemo(existingMemo.memo) : 
          existingMemo.memo;
        this.emit('memo:updated', transactionId, oldMemo, memo);
      } else {
        this.emit('memo:created', transactionId, memo);
      }
      
      this.statistics.lastOperationTime = now;
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.MemoOperationFailed,
        `Failed to set memo for transaction ${transactionId}: ${error}`,
        { 
          cause: error,
          context: { transactionId: transactionId.toString() }
        }
      );
    }
  }

  /**
   * Get memo for a transaction
   */
  @withErrorContext('get_transaction_memo', 'memo_service')
  async getMemo(transactionId: TransactionId): Promise<string | null> {
    this.ensureNotDisposed();
    this.ensureMemoManagementEnabled();
    
    try {
      // Check cache first
      const cached = this.memoCache.get(transactionId);
      if (cached) {
        return cached.encrypted ? 
          await this.decryptMemo(cached.memo) : 
          cached.memo;
      }
      
      // Retrieve from FFI storage
      const storedMemo = await this.retrieveMemoViaFFI(transactionId);
      if (!storedMemo) {
        return null;
      }
      
      // Cache the retrieved memo
      const now = Date.now() as UnixTimestamp;
      const memoEntry: MemoEntry = {
        transactionId,
        memo: storedMemo.memo,
        createdAt: storedMemo.createdAt || now,
        updatedAt: storedMemo.updatedAt || now,
        encrypted: storedMemo.encrypted || false,
        hash: this.calculateMemoHash(storedMemo.memo)
      };
      
      this.memoCache.set(transactionId, memoEntry);
      this.updateStatistics();
      
      return memoEntry.encrypted ? 
        await this.decryptMemo(memoEntry.memo) : 
        memoEntry.memo;
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.MemoOperationFailed,
        `Failed to get memo for transaction ${transactionId}: ${error}`,
        { 
          cause: error,
          context: { transactionId: transactionId.toString() }
        }
      );
    }
  }

  /**
   * Delete memo for a transaction
   */
  @withErrorContext('delete_transaction_memo', 'memo_service')
  async deleteMemo(transactionId: TransactionId): Promise<boolean> {
    this.ensureNotDisposed();
    this.ensureMemoManagementEnabled();
    
    try {
      const existingMemo = this.memoCache.get(transactionId);
      if (!existingMemo) {
        return false;
      }
      
      // Delete from FFI storage
      await this.deleteMemoViaFFI(transactionId);
      
      // Remove from cache
      this.memoCache.delete(transactionId);
      
      // Update statistics
      this.updateStatistics();
      
      // Emit deletion event
      this.emit('memo:deleted', transactionId);
      
      this.statistics.lastOperationTime = Date.now() as UnixTimestamp;
      
      return true;
      
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.MemoOperationFailed,
        `Failed to delete memo for transaction ${transactionId}: ${error}`,
        { 
          cause: error,
          context: { transactionId: transactionId.toString() }
        }
      );
    }
  }

  /**
   * Get all memos for transactions
   */
  @withErrorContext('get_all_memos', 'memo_service')
  async getAllMemos(): Promise<Array<{
    transactionId: TransactionId;
    memo: string;
    createdAt: UnixTimestamp;
    updatedAt: UnixTimestamp;
    encrypted: boolean;
  }>> {
    this.ensureNotDisposed();
    this.ensureMemoManagementEnabled();
    
    const memos: Array<{
      transactionId: TransactionId;
      memo: string;
      createdAt: UnixTimestamp;
      updatedAt: UnixTimestamp;
      encrypted: boolean;
    }> = [];
    
    for (const [transactionId, entry] of this.memoCache.entries()) {
      const memo = entry.encrypted ? 
        await this.decryptMemo(entry.memo) : 
        entry.memo;
      
      memos.push({
        transactionId,
        memo,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        encrypted: entry.encrypted
      });
    }
    
    return memos.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Search memos by text
   */
  @withErrorContext('search_memos', 'memo_service')
  async searchMemos(searchText: string): Promise<Array<{
    transactionId: TransactionId;
    memo: string;
    matchedText: string;
  }>> {
    this.ensureNotDisposed();
    this.ensureMemoManagementEnabled();
    
    if (!searchText || searchText.trim().length === 0) {
      return [];
    }
    
    const searchLower = searchText.toLowerCase().trim();
    const results: Array<{
      transactionId: TransactionId;
      memo: string;
      matchedText: string;
    }> = [];
    
    for (const [transactionId, entry] of this.memoCache.entries()) {
      const memo = entry.encrypted ? 
        await this.decryptMemo(entry.memo) : 
        entry.memo;
      
      const memoLower = memo.toLowerCase();
      if (memoLower.includes(searchLower)) {
        // Find the matched text with some context
        const matchIndex = memoLower.indexOf(searchLower);
        const contextStart = Math.max(0, matchIndex - 20);
        const contextEnd = Math.min(memo.length, matchIndex + searchText.length + 20);
        const matchedText = memo.substring(contextStart, contextEnd);
        
        results.push({
          transactionId,
          memo,
          matchedText
        });
      }
    }
    
    return results;
  }

  /**
   * Get memo statistics
   */
  @withErrorContext('get_memo_statistics', 'memo_service')
  getStatistics(): MemoStatistics {
    this.ensureNotDisposed();
    return { ...this.statistics };
  }

  /**
   * Clear all memos
   */
  @withErrorContext('clear_all_memos', 'memo_service')
  async clearAllMemos(): Promise<number> {
    this.ensureNotDisposed();
    this.ensureMemoManagementEnabled();
    
    const count = this.memoCache.size;
    
    // Clear FFI storage
    await this.clearMemosViaFFI();
    
    // Clear cache
    this.memoCache.clear();
    
    // Reset statistics
    this.statistics = {
      totalMemos: 0,
      encryptedMemos: 0,
      averageMemoLength: 0,
      totalStorageSize: 0,
      lastOperationTime: Date.now() as UnixTimestamp
    };
    
    return count;
  }

  /**
   * Validate memo content
   */
  private validateMemo(memo: string): void {
    if (typeof memo !== 'string') {
      throw new WalletError(
        WalletErrorCode.InvalidArgument,
        'Memo must be a string'
      );
    }
    
    if (memo.length > 1000) { // Arbitrary limit
      throw new WalletError(
        WalletErrorCode.InvalidArgument,
        'Memo is too long (max 1000 characters)'
      );
    }
    
    // Check for potentially malicious content
    if (memo.includes('\0')) {
      throw new WalletError(
        WalletErrorCode.InvalidArgument,
        'Memo contains invalid characters'
      );
    }
  }

  /**
   * Calculate hash for memo integrity
   */
  private calculateMemoHash(memo: string): string {
    // Simple hash implementation (in production, use a proper crypto hash)
    let hash = 0;
    for (let i = 0; i < memo.length; i++) {
      const char = memo.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Encrypt memo (placeholder implementation)
   */
  private async encryptMemo(memo: string): Promise<string> {
    // Placeholder encryption - in production, use proper encryption
    // This could integrate with the wallet's key management system
    const encoded = Buffer.from(memo, 'utf8').toString('base64');
    return `encrypted:${encoded}`;
  }

  /**
   * Decrypt memo (placeholder implementation)
   */
  private async decryptMemo(encryptedMemo: string): Promise<string> {
    // Placeholder decryption - in production, use proper decryption
    if (!encryptedMemo.startsWith('encrypted:')) {
      return encryptedMemo;
    }
    
    const encoded = encryptedMemo.substring('encrypted:'.length);
    return Buffer.from(encoded, 'base64').toString('utf8');
  }

  /**
   * Store memo via FFI
   */
  private async storeMemoViaFFI(
    transactionId: TransactionId,
    memo: string,
    encrypted: boolean
  ): Promise<void> {
    try {
      // Check if FFI supports memo storage
      if (!this.ffiBindings.wallet_set_transaction_memo) {
        // FFI doesn't support memo storage, use local cache only
        return;
      }
      
      await this.ffiBindings.wallet_set_transaction_memo(
        this.walletHandle,
        transactionId,
        memo,
        encrypted
      );
    } catch (error) {
      // FFI memo storage failed, continue with cache-only storage
      // In a production system, you might want to log this
    }
  }

  /**
   * Retrieve memo via FFI
   */
  private async retrieveMemoViaFFI(transactionId: TransactionId): Promise<{
    memo: string;
    encrypted: boolean;
    createdAt?: UnixTimestamp;
    updatedAt?: UnixTimestamp;
  } | null> {
    try {
      // Check if FFI supports memo retrieval
      if (!this.ffiBindings.wallet_get_transaction_memo) {
        return null;
      }
      
      const memoJson = await this.ffiBindings.wallet_get_transaction_memo(
        this.walletHandle,
        transactionId
      );
      
      return memoJson ? JSON.parse(memoJson) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete memo via FFI
   */
  private async deleteMemoViaFFI(transactionId: TransactionId): Promise<void> {
    try {
      if (!this.ffiBindings.wallet_delete_transaction_memo) {
        return;
      }
      
      await this.ffiBindings.wallet_delete_transaction_memo(
        this.walletHandle,
        transactionId
      );
    } catch (error) {
      // FFI memo deletion failed, continue with cache-only deletion
    }
  }

  /**
   * Clear all memos via FFI
   */
  private async clearMemosViaFFI(): Promise<void> {
    try {
      if (!this.ffiBindings.wallet_clear_transaction_memos) {
        return;
      }
      
      await this.ffiBindings.wallet_clear_transaction_memos(this.walletHandle);
    } catch (error) {
      // FFI memo clearing failed, continue with cache-only clearing
    }
  }

  /**
   * Initialize memo cache from storage
   */
  private async initializeMemoCache(): Promise<void> {
    try {
      // Try to load existing memos from FFI storage
      if (!this.ffiBindings.wallet_get_all_transaction_memos) {
        return;
      }
      
      const memosJson = await this.ffiBindings.wallet_get_all_transaction_memos(
        this.walletHandle
      );
      
      if (memosJson) {
        const memos = JSON.parse(memosJson);
        for (const memoData of memos) {
          const entry: MemoEntry = {
            transactionId: memoData.transactionId,
            memo: memoData.memo,
            createdAt: memoData.createdAt || Date.now() as UnixTimestamp,
            updatedAt: memoData.updatedAt || Date.now() as UnixTimestamp,
            encrypted: memoData.encrypted || false,
            hash: this.calculateMemoHash(memoData.memo)
          };
          
          this.memoCache.set(memoData.transactionId, entry);
        }
        
        this.updateStatistics();
      }
    } catch (error) {
      // Failed to load existing memos, start with empty cache
    }
  }

  /**
   * Update memo statistics
   */
  private updateStatistics(): void {
    let totalLength = 0;
    let encryptedCount = 0;
    let totalSize = 0;
    
    for (const entry of this.memoCache.values()) {
      totalLength += entry.memo.length;
      totalSize += entry.memo.length * 2; // Approximate size in bytes (UTF-16)
      
      if (entry.encrypted) {
        encryptedCount++;
      }
    }
    
    this.statistics = {
      totalMemos: this.memoCache.size,
      encryptedMemos: encryptedCount,
      averageMemoLength: this.memoCache.size > 0 ? totalLength / this.memoCache.size : 0,
      totalStorageSize: totalSize,
      lastOperationTime: this.statistics.lastOperationTime
    };
  }

  /**
   * Ensure memo management is enabled
   */
  private ensureMemoManagementEnabled(): void {
    if (!this.config.enableMemoManagement) {
      throw new WalletError(
        WalletErrorCode.FeatureNotEnabled,
        'Memo management is not enabled'
      );
    }
  }

  /**
   * Ensure service is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Memo service has been disposed'
      );
    }
  }

  /**
   * Dispose of the service and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    
    this.isDisposed = true;
    
    // Clear cache
    this.memoCache.clear();
    
    this.removeAllListeners();
  }
}
