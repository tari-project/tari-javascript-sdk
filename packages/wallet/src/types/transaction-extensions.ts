/**
 * @fileoverview Extended transaction types for the wallet module
 * 
 * These interfaces extend the core transaction types with wallet-specific
 * properties and convenience interfaces.
 */

import type {
  TransactionFilter as CoreTransactionFilter,
  TransactionQueryOptions as CoreTransactionQueryOptions,
  SendTransactionParams as CoreSendTransactionParams,
  MicroTari,
  UnixTimestamp,
  TariAddressString,
  TransactionSortBy,
  BlockHeight
} from '@tari-project/tarijs-core';

// Extended TransactionFilter with wallet-specific convenience properties
export interface TransactionFilter extends CoreTransactionFilter {
  // Convenience date filters (maps to dateRange)
  startDate?: UnixTimestamp | Date;
  endDate?: UnixTimestamp | Date;
  
  // Convenience amount filters (maps to amountRange)
  minAmount?: MicroTari;
  maxAmount?: MicroTari;
  
  // Extended search capabilities
  addressPattern?: string;
  messagePattern?: string;
  minFee?: MicroTari;
  isOneSided?: boolean;
  isCoinbase?: boolean;
}

// Extended TransactionQueryOptions with wallet-specific properties
export interface TransactionQueryOptions extends CoreTransactionQueryOptions {
  // Wallet-specific query options
  timeoutMs?: number;
  enableCaching?: boolean;
  usePaginationOptimization?: boolean;
  useCursorPagination?: boolean;
}

// Extended SendTransactionParams with wallet-specific properties
export interface SendTransactionParams extends CoreSendTransactionParams {
  // Wallet-specific send parameters
  lockHeight?: BlockHeight;
}

// Standard send options for API compatibility
export interface StandardSendOptions {
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
  /** Optional lock height */
  lockHeight?: BlockHeight;
}

// Transaction parameter interface for builder
export interface TransactionParams {
  /** Recipient address */
  recipient: TariAddressString;
  /** Amount to send */
  amount: MicroTari;
  /** Fee per gram */
  feePerGram: MicroTari;
  /** Optional message */
  message?: string;
  /** Whether this is one-sided */
  isOneSided?: boolean;
  /** Optional lock height */
  lockHeight?: BlockHeight;
}

// Helper function to convert extended filter to core filter
export function toCoreTransactionFilter(filter: TransactionFilter): CoreTransactionFilter {
  const coreFilter: CoreTransactionFilter = {
    ...filter,
  };

  // Convert convenience date properties to dateRange
  if (filter.startDate || filter.endDate) {
    coreFilter.dateRange = {
      start: filter.startDate ? (typeof filter.startDate === 'number' ? filter.startDate : filter.startDate.getTime()) as UnixTimestamp : undefined,
      end: filter.endDate ? (typeof filter.endDate === 'number' ? filter.endDate : filter.endDate.getTime()) as UnixTimestamp : undefined,
    };
  }

  // Convert convenience amount properties to amountRange
  if (filter.minAmount || filter.maxAmount) {
    coreFilter.amountRange = {
      min: filter.minAmount,
      max: filter.maxAmount,
    };
  }

  // Remove convenience properties to avoid conflicts
  delete (coreFilter as any).startDate;
  delete (coreFilter as any).endDate;
  delete (coreFilter as any).minAmount;
  delete (coreFilter as any).maxAmount;

  return coreFilter;
}

// Helper function to convert extended query options to core options
export function toCoreTransactionQueryOptions(options: TransactionQueryOptions): CoreTransactionQueryOptions {
  const coreOptions: CoreTransactionQueryOptions = {
    limit: options.limit,
    offset: options.offset,
    sortBy: options.sortBy,
    sortOrder: options.sortOrder,
    includeDetails: options.includeDetails,
  };

  return coreOptions;
}
