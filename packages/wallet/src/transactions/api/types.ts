/**
 * Transaction API type definitions
 * Common types used throughout the transaction API
 */

import { 
  MicroTari, 
  TransactionId, 
  TariAddressString,
  UnixTimestamp,
  BlockHeight 
} from '@tari-project/tarijs-core';

export interface TransactionDetails {
  readonly id: TransactionId;
  readonly amount: MicroTari;
  readonly fee: MicroTari;
  readonly recipient: TariAddressString;
  readonly sender?: TariAddressString;
  readonly message?: string;
  readonly timestamp: UnixTimestamp;
  readonly status: TransactionStatus;
  readonly confirmations?: number;
  readonly blockHeight?: BlockHeight;
}

export type TransactionStatus = 
  | 'pending'
  | 'broadcast'
  | 'confirmed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface TransactionMetrics {
  readonly totalSent: MicroTari;
  readonly totalReceived: MicroTari;
  readonly totalFees: MicroTari;
  readonly transactionCount: number;
  readonly averageFee: MicroTari;
  readonly successRate: number;
}

export interface TransactionFilter {
  readonly status?: TransactionStatus[];
  readonly minAmount?: MicroTari;
  readonly maxAmount?: MicroTari;
  readonly fromDate?: UnixTimestamp;
  readonly toDate?: UnixTimestamp;
  readonly address?: TariAddressString;
}

export interface TransactionSort {
  readonly field: 'timestamp' | 'amount' | 'fee' | 'status';
  readonly direction: 'asc' | 'desc';
}

export interface TransactionQuery {
  readonly filter?: TransactionFilter;
  readonly sort?: TransactionSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TransactionQueryResult {
  readonly transactions: TransactionDetails[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly metrics?: TransactionMetrics;
}

export interface TransactionCallback {
  readonly onStatusChange?: (id: TransactionId, status: TransactionStatus) => void;
  readonly onConfirmation?: (id: TransactionId, confirmations: number) => void;
  readonly onFailure?: (id: TransactionId, error: string) => void;
}

export interface BroadcastOptions {
  readonly timeout?: number;
  readonly retries?: number;
  readonly callback?: TransactionCallback;
}

export interface FeeEstimateOptions {
  readonly priority?: 'low' | 'medium' | 'high';
  readonly targetConfirmations?: number;
  readonly includeChange?: boolean;
}

export interface UtxoSelection {
  readonly strategy: 'largest-first' | 'smallest-first' | 'random' | 'optimal';
  readonly maxInputs?: number;
  readonly dustThreshold?: MicroTari;
}

export interface TransactionBuildOptions {
  readonly fee?: MicroTari;
  readonly utxoSelection?: UtxoSelection;
  readonly changeAddress?: TariAddressString;
  readonly lockTime?: number;
}

/**
 * Transaction API error types
 */
export interface TransactionApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: any;
  readonly transactionId?: TransactionId;
}

/**
 * Transaction validation result
 */
export interface TransactionValidationResult {
  readonly isValid: boolean;
  readonly errors: TransactionApiError[];
  readonly warnings: string[];
  readonly estimatedFee?: MicroTari;
}
