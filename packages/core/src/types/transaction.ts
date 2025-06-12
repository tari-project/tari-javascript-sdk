/**
 * @fileoverview Transaction types and interfaces for the Tari JavaScript SDK
 * 
 * Defines comprehensive transaction structures matching mobile wallet implementations
 * with support for all transaction states and operations.
 */

import type {
  TransactionId,
  PendingTransactionId,
  MicroTari,
  TariAddressString,
  UnixTimestamp,
  BlockHeight,
  Hash,
  PublicKey,
  Signature
} from './branded.js';
import {
  TransactionStatus,
  TransactionDirection
} from './enums.js';

// Core transaction information
export interface BaseTransactionInfo {
  /** Unique transaction identifier */
  readonly id: TransactionId;
  /** Transaction amount in MicroTari */
  readonly amount: MicroTari;
  /** Transaction fee in MicroTari */
  readonly fee: MicroTari;
  /** Current transaction status */
  readonly status: TransactionStatus;
  /** Transaction direction (inbound/outbound) */
  readonly direction: TransactionDirection;
  /** Associated message or memo */
  readonly message: string;
  /** Transaction timestamp */
  readonly timestamp: UnixTimestamp;
  /** Source/destination address */
  readonly address: TariAddressString;
  /** Whether this is a one-sided transaction */
  readonly isOneSided: boolean;
  /** Whether this is a coinbase transaction */
  readonly isCoinbase: boolean;
}

// Enhanced transaction information
export interface TransactionInfo extends BaseTransactionInfo {
  /** Number of confirmations (for mined transactions) */
  readonly confirmations?: number;
  /** Block height where transaction was mined */
  readonly blockHeight?: BlockHeight;
  /** Transaction hash (for completed transactions) */
  readonly hash?: Hash;
  /** Kernel signature (for completed transactions) */
  readonly kernelSignature?: Signature;
  /** Excess public key */
  readonly excessPublicKey?: PublicKey;
  /** Range proof hash */
  readonly rangeProofHash?: Hash;
  /** Transaction size in bytes */
  readonly sizeBytes?: number;
}

// Pending inbound transaction
export interface PendingInboundTransaction extends TransactionInfo {
  readonly status: typeof TransactionStatus.Pending;
  readonly direction: typeof TransactionDirection.Inbound;
  /** Sender's public key */
  readonly senderPublicKey: PublicKey;
  /** Expected amount (may differ from final amount) */
  readonly expectedAmount?: MicroTari;
}

// Pending outbound transaction
export interface PendingOutboundTransaction extends TransactionInfo {
  readonly status: typeof TransactionStatus.Pending;
  readonly direction: typeof TransactionDirection.Outbound;
  /** Pending transaction ID (different from final transaction ID) */
  readonly pendingId: PendingTransactionId;
  /** Recipient's public key */
  readonly recipientPublicKey?: PublicKey;
  /** Can this transaction be cancelled */
  readonly cancellable: boolean;
}

// Completed transaction (mined and confirmed)
export interface CompletedTransaction extends TransactionInfo {
  readonly status: typeof TransactionStatus.MinedConfirmed | typeof TransactionStatus.MinedUnconfirmed | typeof TransactionStatus.Broadcast | typeof TransactionStatus.Imported;
  readonly confirmations: number;
  readonly blockHeight: BlockHeight;
  readonly hash: Hash;
  readonly kernelSignature: Signature;
  readonly excessPublicKey: PublicKey;
  readonly sizeBytes: number;
}

// Cancelled transaction
export interface CancelledTransaction extends TransactionInfo {
  readonly status: typeof TransactionStatus.Cancelled;
  /** Reason for cancellation */
  readonly cancellationReason: TransactionCancellationReason;
  /** When the transaction was cancelled */
  readonly cancelledAt: UnixTimestamp;
}

// Coinbase transaction
export interface CoinbaseTransaction extends TransactionInfo {
  readonly status: typeof TransactionStatus.Coinbase;
  readonly direction: typeof TransactionDirection.Inbound;
  readonly isCoinbase: true;
  readonly blockHeight: BlockHeight;
  /** Coinbase maturity height */
  readonly maturityHeight: BlockHeight;
  /** Whether coinbase is mature and spendable */
  readonly isMature: boolean;
}

// Transaction cancellation reasons
export const TransactionCancellationReason = {
  UserCancelled: 'user_cancelled',
  Timeout: 'timeout',
  InsufficientFunds: 'insufficient_funds',
  InvalidTransaction: 'invalid_transaction',
  NetworkError: 'network_error',
  Unknown: 'unknown'
} as const;

export type TransactionCancellationReason = typeof TransactionCancellationReason[keyof typeof TransactionCancellationReason];

// Union type for all transaction types
export type Transaction = 
  | PendingInboundTransaction
  | PendingOutboundTransaction
  | CompletedTransaction
  | CancelledTransaction
  | CoinbaseTransaction;

// Transaction creation parameters
export interface SendTransactionParams {
  /** Recipient address */
  recipient: TariAddressString;
  /** Amount to send in MicroTari */
  amount: MicroTari;
  /** Fee per gram in MicroTari */
  feePerGram: MicroTari;
  /** Optional message */
  message?: string;
  /** Whether to create a one-sided transaction */
  isOneSided?: boolean;
}

// One-sided transaction parameters
export interface SendOneSidedParams {
  /** Recipient address */
  recipient: TariAddressString;
  /** Amount to send in MicroTari */
  amount: MicroTari;
  /** Fee per gram in MicroTari */
  feePerGram: MicroTari;
  /** Optional message */
  message?: string;
  /** Commitment for one-sided transaction */
  commitment?: string;
}

// Transaction query filters
export interface TransactionFilter {
  /** Filter by status */
  status?: TransactionStatus[];
  /** Filter by direction */
  direction?: TransactionDirection[];
  /** Filter by address */
  address?: TariAddressString;
  /** Filter by amount range */
  amountRange?: {
    min?: MicroTari;
    max?: MicroTari;
  };
  /** Filter by date range */
  dateRange?: {
    start?: UnixTimestamp;
    end?: UnixTimestamp;
  };
  /** Filter by block height range */
  blockHeightRange?: {
    start?: BlockHeight;
    end?: BlockHeight;
  };
  /** Include coinbase transactions */
  includeCoinbase?: boolean;
  /** Include cancelled transactions */
  includeCancelled?: boolean;
  /** Search in messages */
  messageSearch?: string;
}

// Transaction query options
export interface TransactionQueryOptions {
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
  /** Sort order */
  sortBy?: TransactionSortBy;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Include detailed information */
  includeDetails?: boolean;
}

// Transaction sorting options
export const TransactionSortBy = {
  Timestamp: 'timestamp',
  Amount: 'amount',
  Fee: 'fee',
  Status: 'status',
  BlockHeight: 'block_height',
  Confirmations: 'confirmations'
} as const;

export type TransactionSortBy = typeof TransactionSortBy[keyof typeof TransactionSortBy];

// Transaction validation result
export interface TransactionValidationResult {
  /** Whether the transaction is valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: TransactionValidationError[];
  /** Validation warnings */
  readonly warnings: TransactionValidationWarning[];
}

export interface TransactionValidationError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export interface TransactionValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly recommendation: string;
}

// Transaction fee estimation
export interface FeeEstimate {
  /** Estimated fee in MicroTari */
  readonly fee: MicroTari;
  /** Fee per gram used */
  readonly feePerGram: MicroTari;
  /** Estimated transaction size in bytes */
  readonly sizeBytes: number;
  /** Number of inputs */
  readonly inputs: number;
  /** Number of outputs */
  readonly outputs: number;
  /** Confidence level of estimate */
  readonly confidence: 'low' | 'medium' | 'high';
}

// Transaction building result
export interface TransactionBuildResult {
  /** Whether build was successful */
  readonly success: boolean;
  /** Built transaction info if successful */
  readonly transaction?: PendingOutboundTransaction;
  /** Fee estimate */
  readonly feeEstimate?: FeeEstimate;
  /** Build error if any */
  readonly error?: string;
  /** Selected UTXOs */
  readonly selectedUtxos?: string[];
}

// Transaction status update
export interface TransactionStatusUpdate {
  /** Transaction ID */
  readonly id: TransactionId;
  /** Previous status */
  readonly previousStatus: TransactionStatus;
  /** New status */
  readonly newStatus: TransactionStatus;
  /** Update timestamp */
  readonly timestamp: UnixTimestamp;
  /** Additional information */
  readonly details?: {
    blockHeight?: BlockHeight;
    confirmations?: number;
    hash?: Hash;
    cancellationReason?: TransactionCancellationReason;
  };
}

// Transaction history entry
export interface TransactionHistoryEntry {
  /** Transaction information */
  readonly transaction: Transaction;
  /** Balance before this transaction */
  readonly balanceBefore?: MicroTari;
  /** Balance after this transaction */
  readonly balanceAfter?: MicroTari;
  /** Running balance change */
  readonly balanceChange: MicroTari;
  /** Notes or tags */
  readonly notes?: string[];
}

// Transaction statistics
export interface TransactionStatistics {
  /** Total number of transactions */
  readonly total: number;
  /** Number by status */
  readonly byStatus: Record<TransactionStatus, number>;
  /** Number by direction */
  readonly byDirection: Record<TransactionDirection, number>;
  /** Total amount sent */
  readonly totalSent: MicroTari;
  /** Total amount received */
  readonly totalReceived: MicroTari;
  /** Total fees paid */
  readonly totalFees: MicroTari;
  /** Average transaction amount */
  readonly averageAmount: MicroTari;
  /** Average fee */
  readonly averageFee: MicroTari;
  /** Date range */
  readonly dateRange: {
    earliest: UnixTimestamp;
    latest: UnixTimestamp;
  };
}

// Transaction utilities
export class TransactionUtils {
  /**
   * Check if transaction is pending
   */
  static isPending(transaction: Transaction): transaction is PendingInboundTransaction | PendingOutboundTransaction {
    return transaction.status === TransactionStatus.Pending;
  }

  /**
   * Check if transaction is completed
   */
  static isCompleted(transaction: Transaction): transaction is CompletedTransaction {
    return transaction.status === TransactionStatus.MinedConfirmed ||
           transaction.status === TransactionStatus.MinedUnconfirmed ||
           transaction.status === TransactionStatus.Broadcast ||
           transaction.status === TransactionStatus.Imported;
  }

  /**
   * Check if transaction is cancelled
   */
  static isCancelled(transaction: Transaction): transaction is CancelledTransaction {
    return transaction.status === TransactionStatus.Cancelled;
  }

  /**
   * Check if transaction is coinbase
   */
  static isCoinbase(transaction: Transaction): transaction is CoinbaseTransaction {
    return transaction.isCoinbase;
  }

  /**
   * Check if transaction is inbound
   */
  static isInbound(transaction: Transaction): boolean {
    return transaction.direction === TransactionDirection.Inbound;
  }

  /**
   * Check if transaction is outbound
   */
  static isOutbound(transaction: Transaction): boolean {
    return transaction.direction === TransactionDirection.Outbound;
  }

  /**
   * Check if transaction is one-sided
   */
  static isOneSided(transaction: Transaction): boolean {
    return transaction.isOneSided;
  }

  /**
   * Get transaction total cost (amount + fee for outbound)
   */
  static getTotalCost(transaction: Transaction): MicroTari {
    if (this.isOutbound(transaction)) {
      return (transaction.amount + transaction.fee) as MicroTari;
    }
    return transaction.amount;
  }

  /**
   * Get transaction net amount (amount - fee)
   */
  static getNetAmount(transaction: Transaction): MicroTari {
    if (this.isOutbound(transaction)) {
      return (transaction.amount - transaction.fee) as MicroTari;
    }
    return transaction.amount;
  }

  /**
   * Calculate transaction age in seconds
   */
  static getAge(transaction: Transaction): number {
    return Math.floor((Date.now() - transaction.timestamp) / 1000);
  }

  /**
   * Check if transaction is confirmed
   */
  static isConfirmed(transaction: Transaction): boolean {
    return this.isCompleted(transaction) && 
           (transaction as CompletedTransaction).confirmations > 0;
  }

  /**
   * Check if transaction is mature (for coinbase)
   */
  static isMature(transaction: Transaction): boolean {
    if (!this.isCoinbase(transaction)) {
      return true;
    }
    return (transaction as CoinbaseTransaction).isMature;
  }

  /**
   * Get transaction status display name
   */
  static getStatusDisplayName(status: TransactionStatus): string {
    switch (status) {
      case TransactionStatus.Pending:
        return 'Pending';
      case TransactionStatus.Broadcast:
        return 'Broadcast';
      case TransactionStatus.MinedUnconfirmed:
        return 'Mined (Unconfirmed)';
      case TransactionStatus.MinedConfirmed:
        return 'Confirmed';
      case TransactionStatus.Imported:
        return 'Imported';
      case TransactionStatus.Coinbase:
        return 'Coinbase';
      case TransactionStatus.Cancelled:
        return 'Cancelled';
      case TransactionStatus.Unknown:
        return 'Unknown';
      default:
        return 'Unknown';
    }
  }

  /**
   * Sort transactions by multiple criteria
   */
  static sort(
    transactions: Transaction[],
    sortBy: TransactionSortBy = TransactionSortBy.Timestamp,
    order: 'asc' | 'desc' = 'desc'
  ): Transaction[] {
    return transactions.slice().sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case TransactionSortBy.Timestamp:
          comparison = a.timestamp - b.timestamp;
          break;
        case TransactionSortBy.Amount:
          comparison = Number(a.amount - b.amount);
          break;
        case TransactionSortBy.Fee:
          comparison = Number(a.fee - b.fee);
          break;
        case TransactionSortBy.Status:
          comparison = a.status.localeCompare(b.status);
          break;
        case TransactionSortBy.BlockHeight:
          const aHeight = (a as CompletedTransaction).blockHeight || 0n;
          const bHeight = (b as CompletedTransaction).blockHeight || 0n;
          comparison = Number(aHeight - bHeight);
          break;
        case TransactionSortBy.Confirmations:
          const aConf = (a as CompletedTransaction).confirmations || 0;
          const bConf = (b as CompletedTransaction).confirmations || 0;
          comparison = aConf - bConf;
          break;
        default:
          comparison = 0;
      }

      return order === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Filter transactions by criteria
   */
  static filter(transactions: Transaction[], filter: TransactionFilter): Transaction[] {
    return transactions.filter(tx => {
      // Status filter
      if (filter.status && !filter.status.includes(tx.status)) {
        return false;
      }

      // Direction filter
      if (filter.direction && !filter.direction.includes(tx.direction)) {
        return false;
      }

      // Address filter
      if (filter.address && tx.address !== filter.address) {
        return false;
      }

      // Amount range filter
      if (filter.amountRange) {
        if (filter.amountRange.min && tx.amount < filter.amountRange.min) {
          return false;
        }
        if (filter.amountRange.max && tx.amount > filter.amountRange.max) {
          return false;
        }
      }

      // Date range filter
      if (filter.dateRange) {
        if (filter.dateRange.start && tx.timestamp < filter.dateRange.start) {
          return false;
        }
        if (filter.dateRange.end && tx.timestamp > filter.dateRange.end) {
          return false;
        }
      }

      // Block height range filter
      if (filter.blockHeightRange && this.isCompleted(tx)) {
        const blockHeight = (tx as CompletedTransaction).blockHeight;
        if (filter.blockHeightRange.start && blockHeight < filter.blockHeightRange.start) {
          return false;
        }
        if (filter.blockHeightRange.end && blockHeight > filter.blockHeightRange.end) {
          return false;
        }
      }

      // Coinbase filter
      if (filter.includeCoinbase === false && this.isCoinbase(tx)) {
        return false;
      }

      // Cancelled filter
      if (filter.includeCancelled === false && this.isCancelled(tx)) {
        return false;
      }

      // Message search
      if (filter.messageSearch) {
        const searchTerm = filter.messageSearch.toLowerCase();
        if (!tx.message.toLowerCase().includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Calculate transaction statistics
   */
  static calculateStatistics(transactions: Transaction[]): TransactionStatistics {
    const stats = {
      total: transactions.length,
      byStatus: {} as Record<TransactionStatus, number>,
      byDirection: {} as Record<TransactionDirection, number>,
      totalSent: 0n as MicroTari,
      totalReceived: 0n as MicroTari,
      totalFees: 0n as MicroTari,
      averageAmount: 0n as MicroTari,
      averageFee: 0n as MicroTari,
      dateRange: {
        earliest: Date.now() as UnixTimestamp,
        latest: 0 as UnixTimestamp
      }
    };

    if (transactions.length === 0) {
      return stats;
    }

    // Initialize counters
    Object.values(TransactionStatus).forEach(status => {
      stats.byStatus[status] = 0;
    });
    Object.values(TransactionDirection).forEach(direction => {
      stats.byDirection[direction] = 0;
    });

    let totalAmount = 0n;
    let totalFees = 0n;

    for (const tx of transactions) {
      // Count by status and direction
      stats.byStatus[tx.status]++;
      stats.byDirection[tx.direction]++;

      // Sum amounts and fees
      totalAmount += tx.amount;
      totalFees += tx.fee;

      if (this.isOutbound(tx)) {
        stats.totalSent = (stats.totalSent + tx.amount) as MicroTari;
      } else {
        stats.totalReceived = (stats.totalReceived + tx.amount) as MicroTari;
      }

      stats.totalFees = (stats.totalFees + tx.fee) as MicroTari;

      // Update date range
      if (tx.timestamp < stats.dateRange.earliest) {
        stats.dateRange.earliest = tx.timestamp;
      }
      if (tx.timestamp > stats.dateRange.latest) {
        stats.dateRange.latest = tx.timestamp;
      }
    }

    // Calculate averages
    stats.averageAmount = (totalAmount / BigInt(transactions.length)) as MicroTari;
    stats.averageFee = (totalFees / BigInt(transactions.length)) as MicroTari;

    return stats;
  }

  /**
   * Validate transaction parameters
   */
  static validateSendParams(params: SendTransactionParams): TransactionValidationResult {
    const errors: TransactionValidationError[] = [];
    const warnings: TransactionValidationWarning[] = [];

    // Validate amount
    if (params.amount <= 0n) {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: 'Transaction amount must be positive',
        field: 'amount'
      });
    }

    // Validate fee
    if (params.feePerGram <= 0n) {
      errors.push({
        code: 'INVALID_FEE',
        message: 'Fee per gram must be positive',
        field: 'feePerGram'
      });
    }

    // Check for dust amount
    if (params.amount > 0n && params.amount < 100n) {
      warnings.push({
        code: 'DUST_AMOUNT',
        message: 'Transaction amount is below dust threshold',
        field: 'amount',
        recommendation: 'Consider using at least 100 MicroTari'
      });
    }

    // Validate message length
    if (params.message && params.message.length > 512) {
      errors.push({
        code: 'MESSAGE_TOO_LONG',
        message: 'Transaction message exceeds maximum length of 512 characters',
        field: 'message'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export utilities
// TransactionUtils is already exported with its class declaration
