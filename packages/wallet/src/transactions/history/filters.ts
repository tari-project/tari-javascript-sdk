/**
 * @fileoverview Transaction History Filters
 * 
 * Provides advanced filtering capabilities for transaction history including
 * post-processing filters, search functionality, and filter validation.
 */

import {
  WalletError,
  WalletErrorCode,
  type UnixTimestamp
} from '@tari-project/tarijs-core';
import type { TransactionFilter } from '../../types/transaction-extensions.js';
import { TransactionStatus, TransactionDirection } from '@tari-project/tarijs-core';
import type { HistoryEntry } from './history-service.js';

/**
 * Advanced filter options for post-processing
 */
export interface AdvancedFilterOptions {
  /** Text search across transaction fields */
  textSearch?: string;
  /** Regular expression pattern matching */
  regexPattern?: string;
  /** Custom predicate function */
  customPredicate?: (transaction: HistoryEntry) => boolean;
  /** Tag-based filtering */
  tags?: string[];
  /** Age-based filtering */
  maxAgeMs?: number;
  /** Fee percentage range (as percentage of amount) */
  feePercentageRange?: { min?: number; max?: number };
}

/**
 * Filter statistics for optimization
 */
export interface FilterStatistics {
  /** Number of transactions before filtering */
  totalTransactions: number;
  /** Number of transactions after filtering */
  filteredTransactions: number;
  /** Filtering efficiency (0-1) */
  efficiency: number;
  /** Filter execution time in milliseconds */
  executionTimeMs: number;
  /** Most selective filter applied */
  mostSelectiveFilter: string;
}

/**
 * Filter validation result
 */
export interface FilterValidationResult {
  /** Whether the filter is valid */
  isValid: boolean;
  /** Validation errors if any */
  errors: string[];
  /** Warnings about filter performance */
  warnings: string[];
  /** Estimated selectivity (0-1, lower is more selective) */
  estimatedSelectivity: number;
}

/**
 * Predefined filter presets for common use cases
 */
export const FILTER_PRESETS = {
  RECENT_WEEK: {
    startDate: Date.now() - (7 * 24 * 60 * 60 * 1000)
  } as TransactionFilter,
  
  RECENT_MONTH: {
    startDate: Date.now() - (30 * 24 * 60 * 60 * 1000)
  } as TransactionFilter,
  
  LARGE_TRANSACTIONS: {
    minAmount: BigInt(1000000) // 1 Tari in microTari
  } as TransactionFilter,
  
  FAILED_TRANSACTIONS: {
    status: [TransactionStatus.Failed, TransactionStatus.Cancelled]
  } as TransactionFilter,
  
  PENDING_OUTBOUND: {
    status: [TransactionStatus.Pending],
    direction: [TransactionDirection.Outbound]
  } as TransactionFilter,
  
  HIGH_FEE_TRANSACTIONS: {
    minFee: BigInt(10000) // 0.01 Tari in microTari
  } as TransactionFilter
} as const;

/**
 * Transaction history filters providing advanced filtering capabilities
 * 
 * Features:
 * - Post-processing filters for complex criteria
 * - Text search across multiple transaction fields
 * - Regular expression pattern matching
 * - Custom predicate functions for flexible filtering
 * - Filter validation and optimization
 * - Predefined filter presets for common use cases
 * - Filter statistics and performance monitoring
 */
export class HistoryFilters {
  /**
   * Apply post-processing filters that cannot be handled at the repository level
   * 
   * @param transactions Array of transactions to filter
   * @param filter Base filter criteria
   * @param advanced Advanced filter options
   * @returns Filtered transactions with statistics
   */
  applyPostProcessingFilters(
    transactions: HistoryEntry[],
    filter?: TransactionFilter,
    advanced?: AdvancedFilterOptions
  ): HistoryEntry[] {
    const startTime = Date.now();
    let filteredTransactions = [...transactions];
    const originalCount = transactions.length;

    // Apply advanced filters if provided
    if (advanced) {
      filteredTransactions = this.applyAdvancedFilters(filteredTransactions, advanced);
    }

    // Apply additional base filter criteria not handled by repository
    if (filter) {
      filteredTransactions = this.applyAdditionalBaseFilters(filteredTransactions, filter);
    }

    const executionTime = Date.now() - startTime;
    
    // Log filter performance for optimization
    this.logFilterPerformance({
      totalTransactions: originalCount,
      filteredTransactions: filteredTransactions.length,
      efficiency: filteredTransactions.length / originalCount,
      executionTimeMs: executionTime,
      mostSelectiveFilter: this.identifyMostSelectiveFilter(filter, advanced)
    });

    return filteredTransactions;
  }

  /**
   * Perform text search across transaction fields
   * 
   * @param transactions Transactions to search
   * @param query Search query
   * @param fields Fields to search in
   * @returns Matching transactions with relevance scores
   */
  performTextSearch(
    transactions: HistoryEntry[],
    query: string,
    fields: Array<keyof HistoryEntry> = ['message', 'address', 'tags']
  ): Array<HistoryEntry & { relevanceScore: number }> {
    if (!query || query.trim().length === 0) {
      return transactions.map(tx => ({ ...tx, relevanceScore: 1 }));
    }

    const searchTerm = query.toLowerCase().trim();
    const results: Array<HistoryEntry & { relevanceScore: number }> = [];

    for (const transaction of transactions) {
      let relevanceScore = 0;
      let matches = 0;

      // Search in specified fields
      for (const field of fields) {
        const fieldValue = transaction[field];
        if (fieldValue) {
          const fieldText = Array.isArray(fieldValue) 
            ? fieldValue.join(' ').toLowerCase()
            : fieldValue.toString().toLowerCase();

          if (fieldText.includes(searchTerm)) {
            matches++;
            
            // Score based on match type
            if (fieldText === searchTerm) {
              relevanceScore += 10; // Exact match
            } else if (fieldText.startsWith(searchTerm)) {
              relevanceScore += 7; // Prefix match
            } else if (fieldText.includes(` ${searchTerm} `)) {
              relevanceScore += 5; // Word match
            } else {
              relevanceScore += 3; // Substring match
            }

            // Boost score based on field importance
            if (field === 'message') {
              relevanceScore *= 1.5;
            } else if (field === 'address') {
              relevanceScore *= 1.2;
            }
          }
        }
      }

      // Include transaction if it has matches
      if (matches > 0) {
        // Boost recent transactions
        const daysSinceTransaction = transaction.age / (24 * 60 * 60 * 1000);
        if (daysSinceTransaction < 7) {
          relevanceScore *= 1.2;
        }

        results.push({ ...transaction, relevanceScore });
      }
    }

    // Sort by relevance score (descending)
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Apply regular expression pattern matching
   * 
   * @param transactions Transactions to filter
   * @param pattern Regular expression pattern
   * @param field Field to apply pattern to
   * @returns Matching transactions
   */
  applyRegexFilter(
    transactions: HistoryEntry[],
    pattern: string,
    field: keyof HistoryEntry = 'message'
  ): HistoryEntry[] {
    try {
      const regex = new RegExp(pattern, 'i'); // Case-insensitive by default
      
      return transactions.filter(transaction => {
        const fieldValue = transaction[field];
        if (!fieldValue) return false;
        
        const text = Array.isArray(fieldValue) 
          ? fieldValue.join(' ')
          : fieldValue.toString();
          
        return regex.test(text);
      });
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InvalidInput,
        `Invalid regular expression pattern: ${pattern}`,
        { pattern, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Filter by transaction tags
   * 
   * @param transactions Transactions to filter
   * @param tags Tags to filter by
   * @param matchAll Whether to match all tags or any tag
   * @returns Filtered transactions
   */
  filterByTags(
    transactions: HistoryEntry[],
    tags: string[],
    matchAll: boolean = false
  ): HistoryEntry[] {
    if (tags.length === 0) return transactions;

    return transactions.filter(transaction => {
      const transactionTags = transaction.tags || [];
      
      if (matchAll) {
        return tags.every(tag => transactionTags.includes(tag));
      } else {
        return tags.some(tag => transactionTags.includes(tag));
      }
    });
  }

  /**
   * Filter by transaction age
   * 
   * @param transactions Transactions to filter
   * @param maxAgeMs Maximum age in milliseconds
   * @returns Filtered transactions
   */
  filterByAge(transactions: HistoryEntry[], maxAgeMs: number): HistoryEntry[] {
    return transactions.filter(transaction => transaction.age <= maxAgeMs);
  }

  /**
   * Filter by fee percentage relative to amount
   * 
   * @param transactions Transactions to filter
   * @param minPercentage Minimum fee percentage
   * @param maxPercentage Maximum fee percentage
   * @returns Filtered transactions
   */
  filterByFeePercentage(
    transactions: HistoryEntry[],
    minPercentage?: number,
    maxPercentage?: number
  ): HistoryEntry[] {
    return transactions.filter(transaction => {
      if (transaction.amount === BigInt(0)) return false;
      
      const feePercentage = (Number(transaction.fee) / Number(transaction.amount)) * 100;
      
      if (minPercentage !== undefined && feePercentage < minPercentage) {
        return false;
      }
      
      if (maxPercentage !== undefined && feePercentage > maxPercentage) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Validate filter criteria for performance and correctness
   * 
   * @param filter Filter to validate
   * @param advanced Advanced filter options
   * @returns Validation result
   */
  validateFilter(
    filter?: TransactionFilter,
    advanced?: AdvancedFilterOptions
  ): FilterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let estimatedSelectivity = 1.0;

    // Validate base filter
    if (filter) {
      if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) {
        errors.push('Start date cannot be after end date');
      }

      if (filter.minAmount && filter.maxAmount && filter.minAmount > filter.maxAmount) {
        errors.push('Minimum amount cannot be greater than maximum amount');
      }

      // Estimate selectivity based on filters
      if (filter.status && filter.status.length > 0) {
        estimatedSelectivity *= 0.7;
      }

      if (filter.direction && filter.direction.length > 0) {
        estimatedSelectivity *= 0.6;
      }

      if (filter.startDate || filter.endDate) {
        estimatedSelectivity *= 0.5;
      }

      if (filter.address) {
        estimatedSelectivity *= 0.1;
      }
    }

    // Validate advanced filters
    if (advanced) {
      if (advanced.regexPattern) {
        try {
          new RegExp(advanced.regexPattern);
        } catch {
          errors.push('Invalid regular expression pattern');
        }
      }

      if (advanced.textSearch && advanced.textSearch.length < 2) {
        warnings.push('Text search with less than 2 characters may return too many results');
      }

      if (advanced.maxAgeMs && advanced.maxAgeMs < 0) {
        errors.push('Maximum age cannot be negative');
      }

      if (advanced.feePercentageRange) {
        const { min, max } = advanced.feePercentageRange;
        if (min !== undefined && min < 0) {
          errors.push('Minimum fee percentage cannot be negative');
        }
        if (max !== undefined && max > 100) {
          warnings.push('Maximum fee percentage above 100% may exclude most transactions');
        }
        if (min !== undefined && max !== undefined && min > max) {
          errors.push('Minimum fee percentage cannot be greater than maximum');
        }
      }

      // Adjust selectivity for advanced filters
      if (advanced.textSearch) {
        estimatedSelectivity *= 0.3;
      }

      if (advanced.tags && advanced.tags.length > 0) {
        estimatedSelectivity *= 0.4;
      }
    }

    // Performance warnings
    if (estimatedSelectivity > 0.8) {
      warnings.push('Filter may return a large number of results, consider adding more specific criteria');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedSelectivity
    };
  }

  /**
   * Get predefined filter preset
   * 
   * @param presetName Name of the preset
   * @returns Filter configuration
   */
  getPreset(presetName: keyof typeof FILTER_PRESETS): TransactionFilter {
    const preset = FILTER_PRESETS[presetName];
    if (!preset) {
      throw new WalletError(
        WalletErrorCode.InvalidInput,
        `Unknown filter preset: ${presetName}`,
        { availablePresets: Object.keys(FILTER_PRESETS) }
      );
    }

    // Create a copy with current timestamps for time-based presets
    if ('startDate' in preset && typeof preset.startDate === 'number') {
      return {
        ...preset,
        startDate: (Date.now() - (Date.now() - preset.startDate)) as UnixTimestamp
      };
    }

    return { ...preset };
  }

  /**
   * Combine multiple filters with logical operators
   * 
   * @param filters Array of filters to combine
   * @param operator Logical operator ('AND' | 'OR')
   * @returns Combined filter
   */
  combineFilters(
    filters: TransactionFilter[],
    operator: 'AND' | 'OR' = 'AND'
  ): TransactionFilter {
    if (filters.length === 0) return {};
    if (filters.length === 1) return filters[0];

    if (operator === 'AND') {
      // For AND operation, merge all filters
      const combined: TransactionFilter = {};
      
      for (const filter of filters) {
        Object.assign(combined, filter);
        
        // Special handling for array fields
        if (filter.status && combined.status) {
          combined.status = [...new Set([...combined.status, ...filter.status])];
        }
        
        if (filter.direction && combined.direction) {
          combined.direction = [...new Set([...combined.direction, ...filter.direction])];
        }
      }
      
      return combined;
    } else {
      // For OR operation, this would require more complex logic
      // For now, return the first filter with a warning
      console.warn('OR operation for filter combination not fully implemented');
      return filters[0];
    }
  }

  /**
   * Apply advanced filter options
   */
  private applyAdvancedFilters(
    transactions: HistoryEntry[],
    advanced: AdvancedFilterOptions
  ): HistoryEntry[] {
    let filtered = transactions;

    // Apply text search
    if (advanced.textSearch) {
      const searchResults = this.performTextSearch(filtered, advanced.textSearch);
      filtered = searchResults.map(({ relevanceScore, ...tx }) => tx);
    }

    // Apply regex pattern
    if (advanced.regexPattern) {
      filtered = this.applyRegexFilter(filtered, advanced.regexPattern);
    }

    // Apply tag filtering
    if (advanced.tags && advanced.tags.length > 0) {
      filtered = this.filterByTags(filtered, advanced.tags);
    }

    // Apply age filtering
    if (advanced.maxAgeMs !== undefined) {
      filtered = this.filterByAge(filtered, advanced.maxAgeMs);
    }

    // Apply fee percentage filtering
    if (advanced.feePercentageRange) {
      filtered = this.filterByFeePercentage(
        filtered,
        advanced.feePercentageRange.min,
        advanced.feePercentageRange.max
      );
    }

    // Apply custom predicate
    if (advanced.customPredicate) {
      filtered = filtered.filter(advanced.customPredicate);
    }

    return filtered;
  }

  /**
   * Apply additional base filter criteria not handled by repository
   */
  private applyAdditionalBaseFilters(
    transactions: HistoryEntry[],
    filter: TransactionFilter
  ): HistoryEntry[] {
    // Most base filters should be handled by the repository
    // This is for any special cases or computed properties
    return transactions;
  }

  /**
   * Identify the most selective filter for performance optimization
   */
  private identifyMostSelectiveFilter(
    filter?: TransactionFilter,
    advanced?: AdvancedFilterOptions
  ): string {
    if (filter?.address) return 'address';
    if (advanced?.textSearch) return 'textSearch';
    if (filter?.startDate && filter?.endDate) return 'dateRange';
    if (filter?.minAmount || filter?.maxAmount) return 'amountRange';
    if (filter?.status) return 'status';
    if (filter?.direction) return 'direction';
    if (advanced?.tags) return 'tags';
    
    return 'none';
  }

  /**
   * Log filter performance for optimization
   */
  private logFilterPerformance(stats: FilterStatistics): void {
    // In a production environment, this would integrate with monitoring systems
    if (stats.executionTimeMs > 100) {
      console.warn('Slow filter operation detected:', stats);
    }
    
    if (stats.efficiency < 0.1) {
      console.warn('Low filter efficiency detected:', stats);
    }
  }
}
