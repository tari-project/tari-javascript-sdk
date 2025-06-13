/**
 * @fileoverview UTXO Service for Tari Wallet
 * 
 * Provides comprehensive UTXO management with querying, filtering,
 * pagination, and status tracking capabilities.
 */

import {
  UtxoInfo,
  ExtendedUtxoInfo,
  UtxoFilter,
  UtxoQueryOptions,
  UtxoStatistics,
  UtxoSortBy,
  UtxoStatus,
  OutputFeatures,
  MicroTari,
  BlockHeight,
  WalletError,
  WalletErrorCode,
  type WalletHandle
} from '@tari-project/tarijs-core';

import { UtxoRepository } from './utxo-repository.js';
import { UtxoMapper } from './utxo-mapper.js';

/**
 * UTXO service configuration
 */
export interface UtxoServiceConfig {
  /** Enable UTXO caching */
  enableCaching?: boolean;
  
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  
  /** Maximum number of UTXOs to cache */
  maxCacheSize?: number;
  
  /** Default page size for queries */
  defaultPageSize?: number;
  
  /** Enable detailed UTXO metadata fetching */
  fetchMetadata?: boolean;
}

/**
 * UTXO query result with pagination
 */
export interface UtxoQueryResult {
  /** UTXOs matching the query */
  utxos: UtxoInfo[];
  
  /** Total number of UTXOs (without pagination) */
  totalCount: number;
  
  /** Current page number */
  page: number;
  
  /** Page size used */
  pageSize: number;
  
  /** Total number of pages */
  totalPages: number;
  
  /** Whether there are more results */
  hasMore: boolean;
  
  /** Query execution time in milliseconds */
  executionTime: number;
}

/**
 * UTXO balance summary
 */
export interface UtxoBalanceSummary {
  /** Total balance from all UTXOs */
  total: MicroTari;
  
  /** Available balance (spendable UTXOs) */
  available: MicroTari;
  
  /** Pending balance (unconfirmed UTXOs) */
  pending: MicroTari;
  
  /** Locked balance (time-locked UTXOs) */
  locked: MicroTari;
  
  /** Balance by status */
  byStatus: Record<UtxoStatus, MicroTari>;
  
  /** Balance by features */
  byFeatures: Record<OutputFeatures, MicroTari>;
}

/**
 * Comprehensive UTXO service
 */
export class UtxoService {
  private readonly walletHandle: WalletHandle;
  private readonly repository: UtxoRepository;
  private readonly mapper: UtxoMapper;
  private readonly config: Required<UtxoServiceConfig>;
  private lastSyncTime = 0;

  constructor(
    walletHandle: WalletHandle,
    config?: Partial<UtxoServiceConfig>
  ) {
    this.walletHandle = walletHandle;
    this.config = {
      enableCaching: true,
      cacheTtl: 60000, // 1 minute
      maxCacheSize: 10000,
      defaultPageSize: 50,
      fetchMetadata: false,
      ...config
    };
    
    this.repository = new UtxoRepository(walletHandle, {
      enableCaching: this.config.enableCaching,
      cacheTtl: this.config.cacheTtl,
      maxCacheSize: this.config.maxCacheSize
    });
    
    this.mapper = new UtxoMapper();
  }

  /**
   * Initialize the UTXO service
   */
  public async initialize(): Promise<void> {
    try {
      await this.repository.initialize();
    } catch (error) {
      throw new WalletError(
        'Failed to initialize UTXO service',
        WalletErrorCode.InitializationFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Destroy the UTXO service and cleanup resources
   */
  public async destroy(): Promise<void> {
    try {
      await this.repository.destroy();
    } catch (error) {
      throw new WalletError(
        'Failed to destroy UTXO service',
        WalletErrorCode.ResourceCleanupFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * List UTXOs with filtering and pagination
   */
  public async list(
    filter?: UtxoFilter,
    options?: UtxoQueryOptions
  ): Promise<UtxoQueryResult> {
    const startTime = Date.now();
    
    try {
      const queryOptions = {
        limit: this.config.defaultPageSize,
        offset: 0,
        includeMetadata: this.config.fetchMetadata,
        ...options
      };

      const result = await this.repository.query(filter, queryOptions);
      
      const page = Math.floor((queryOptions.offset || 0) / (queryOptions.limit || this.config.defaultPageSize)) + 1;
      const pageSize = queryOptions.limit || this.config.defaultPageSize;
      const totalPages = Math.ceil(result.totalCount / pageSize);
      
      return {
        utxos: result.utxos,
        totalCount: result.totalCount,
        page,
        pageSize,
        totalPages,
        hasMore: result.totalCount > (queryOptions.offset || 0) + result.utxos.length,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      throw new WalletError(
        'Failed to list UTXOs',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get a specific UTXO by ID
   */
  public async get(utxoId: string): Promise<UtxoInfo | null> {
    try {
      return await this.repository.getById(utxoId);
    } catch (error) {
      throw new WalletError(
        'Failed to get UTXO',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get extended UTXO information
   */
  public async getExtended(utxoId: string): Promise<ExtendedUtxoInfo | null> {
    try {
      return await this.repository.getExtendedById(utxoId);
    } catch (error) {
      throw new WalletError(
        'Failed to get extended UTXO information',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get UTXOs by commitment
   */
  public async getByCommitment(commitment: string): Promise<UtxoInfo[]> {
    try {
      return await this.repository.getByCommitment(commitment);
    } catch (error) {
      throw new WalletError(
        'Failed to get UTXOs by commitment',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get UTXOs by transaction hash
   */
  public async getByTransaction(transactionHash: string): Promise<UtxoInfo[]> {
    try {
      return await this.repository.getByTransactionHash(transactionHash);
    } catch (error) {
      throw new WalletError(
        'Failed to get UTXOs by transaction',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get spendable UTXOs (mature and unspent)
   */
  public async getSpendable(
    currentHeight?: BlockHeight,
    minAmount?: MicroTari,
    maxAmount?: MicroTari
  ): Promise<UtxoInfo[]> {
    try {
      const filter: UtxoFilter = {
        status: [UtxoStatus.Unspent],
        minAmount,
        maxAmount
      };

      if (currentHeight !== undefined) {
        filter.maxMaturityHeight = currentHeight;
      }

      const result = await this.repository.query(filter);
      return result.utxos;
    } catch (error) {
      throw new WalletError(
        'Failed to get spendable UTXOs',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get UTXOs by status
   */
  public async getByStatus(status: UtxoStatus | UtxoStatus[]): Promise<UtxoInfo[]> {
    try {
      const filter: UtxoFilter = {
        status: Array.isArray(status) ? status : [status]
      };

      const result = await this.repository.query(filter);
      return result.utxos;
    } catch (error) {
      throw new WalletError(
        'Failed to get UTXOs by status',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get UTXOs by output features
   */
  public async getByFeatures(features: OutputFeatures | OutputFeatures[]): Promise<UtxoInfo[]> {
    try {
      const filter: UtxoFilter = {
        features: Array.isArray(features) ? features : [features]
      };

      const result = await this.repository.query(filter);
      return result.utxos;
    } catch (error) {
      throw new WalletError(
        'Failed to get UTXOs by features',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get balance summary from UTXOs
   */
  public async getBalanceSummary(currentHeight?: BlockHeight): Promise<UtxoBalanceSummary> {
    try {
      const allUtxos = await this.repository.getAll();
      
      const summary: UtxoBalanceSummary = {
        total: 0n as MicroTari,
        available: 0n as MicroTari,
        pending: 0n as MicroTari,
        locked: 0n as MicroTari,
        byStatus: {
          [UtxoStatus.Unspent]: 0n as MicroTari,
          [UtxoStatus.Spent]: 0n as MicroTari,
          [UtxoStatus.Encumbered]: 0n as MicroTari,
          [UtxoStatus.Invalid]: 0n as MicroTari,
          [UtxoStatus.Unknown]: 0n as MicroTari
        },
        byFeatures: {
          [OutputFeatures.Default]: 0n as MicroTari,
          [OutputFeatures.Coinbase]: 0n as MicroTari,
          [OutputFeatures.Sidechain]: 0n as MicroTari,
          [OutputFeatures.BurnCommitment]: 0n as MicroTari
        }
      };

      for (const utxo of allUtxos) {
        summary.total = (BigInt(summary.total) + BigInt(utxo.amount)) as MicroTari;
        summary.byStatus[utxo.status] = (BigInt(summary.byStatus[utxo.status]) + BigInt(utxo.amount)) as MicroTari;
        summary.byFeatures[utxo.features] = (BigInt(summary.byFeatures[utxo.features]) + BigInt(utxo.amount)) as MicroTari;

        // Categorize by availability
        if (utxo.status === UtxoStatus.Unspent) {
          if (currentHeight === undefined || utxo.maturityHeight <= currentHeight) {
            summary.available = (BigInt(summary.available) + BigInt(utxo.amount)) as MicroTari;
          } else {
            summary.locked = (BigInt(summary.locked) + BigInt(utxo.amount)) as MicroTari;
          }
        } else if (utxo.status === UtxoStatus.Encumbered) {
          summary.pending = (BigInt(summary.pending) + BigInt(utxo.amount)) as MicroTari;
        }
      }

      return summary;
    } catch (error) {
      throw new WalletError(
        'Failed to get balance summary',
        WalletErrorCode.BalanceQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get UTXO statistics
   */
  public async getStatistics(): Promise<UtxoStatistics> {
    try {
      const allUtxos = await this.repository.getAll();
      return this.calculateStatistics(allUtxos);
    } catch (error) {
      throw new WalletError(
        'Failed to get UTXO statistics',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Refresh UTXO data from the blockchain
   */
  public async refresh(): Promise<void> {
    try {
      await this.repository.refresh();
      this.lastSyncTime = Date.now();
    } catch (error) {
      throw new WalletError(
        'Failed to refresh UTXO data',
        WalletErrorCode.SyncFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Count UTXOs matching filter
   */
  public async count(filter?: UtxoFilter): Promise<number> {
    try {
      return await this.repository.count(filter);
    } catch (error) {
      throw new WalletError(
        'Failed to count UTXOs',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Check if UTXOs are mature (spendable)
   */
  public async checkMaturity(utxoIds: string[], currentHeight: BlockHeight): Promise<Record<string, boolean>> {
    try {
      const result: Record<string, boolean> = {};
      
      for (const utxoId of utxoIds) {
        const utxo = await this.repository.getById(utxoId);
        if (utxo) {
          result[utxoId] = utxo.maturityHeight <= currentHeight && utxo.status === UtxoStatus.Unspent;
        } else {
          result[utxoId] = false;
        }
      }
      
      return result;
    } catch (error) {
      throw new WalletError(
        'Failed to check UTXO maturity',
        WalletErrorCode.UtxoValidationFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get the largest UTXOs
   */
  public async getLargest(limit = 10): Promise<UtxoInfo[]> {
    try {
      const result = await this.repository.query(undefined, {
        sortBy: UtxoSortBy.Amount,
        sortOrder: 'desc',
        limit
      });
      
      return result.utxos;
    } catch (error) {
      throw new WalletError(
        'Failed to get largest UTXOs',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get the oldest UTXOs
   */
  public async getOldest(limit = 10): Promise<UtxoInfo[]> {
    try {
      const result = await this.repository.query(undefined, {
        sortBy: UtxoSortBy.BlockHeight,
        sortOrder: 'asc',
        limit
      });
      
      return result.utxos;
    } catch (error) {
      throw new WalletError(
        'Failed to get oldest UTXOs',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get recently created UTXOs
   */
  public async getRecent(limit = 10): Promise<UtxoInfo[]> {
    try {
      const result = await this.repository.query(undefined, {
        sortBy: UtxoSortBy.DetectedAt,
        sortOrder: 'desc',
        limit
      });
      
      return result.utxos;
    } catch (error) {
      throw new WalletError(
        'Failed to get recent UTXOs',
        WalletErrorCode.UtxoQueryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get service configuration
   */
  public getConfig(): Readonly<Required<UtxoServiceConfig>> {
    return { ...this.config };
  }

  /**
   * Get last sync time
   */
  public getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  /**
   * Clear UTXO cache
   */
  public clearCache(): void {
    this.repository.clearCache();
  }

  // Private helper methods

  private calculateStatistics(utxos: UtxoInfo[]): UtxoStatistics {
    const stats: UtxoStatistics = {
      total: utxos.length,
      byStatus: {
        [UtxoStatus.Unspent]: 0,
        [UtxoStatus.Spent]: 0,
        [UtxoStatus.Encumbered]: 0,
        [UtxoStatus.Invalid]: 0,
        [UtxoStatus.Unknown]: 0
      },
      byFeatures: {
        [OutputFeatures.Default]: 0,
        [OutputFeatures.Coinbase]: 0,
        [OutputFeatures.Sidechain]: 0,
        [OutputFeatures.BurnCommitment]: 0
      },
      totalValue: 0n as MicroTari,
      averageValue: 0n as MicroTari,
      largestUtxo: null,
      smallestUtxo: null,
      ageDistribution: {
        recent: 0, // < 24 hours
        daily: 0,  // 1-7 days
        weekly: 0, // 1-4 weeks
        monthly: 0, // 1-12 months
        old: 0     // > 1 year
      }
    };

    if (utxos.length === 0) {
      return stats;
    }

    let totalValue = 0n;
    let largest = utxos[0];
    let smallest = utxos[0];
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    for (const utxo of utxos) {
      // Status and features counts
      stats.byStatus[utxo.status]++;
      stats.byFeatures[utxo.features]++;

      // Value calculations
      const amount = BigInt(utxo.amount);
      totalValue += amount;

      if (amount > BigInt(largest.amount)) {
        largest = utxo;
      }
      if (amount < BigInt(smallest.amount)) {
        smallest = utxo;
      }

      // Age distribution
      const age = now - Number(utxo.detectedAt);
      if (age < oneDayAgo) {
        stats.ageDistribution.recent++;
      } else if (age < oneWeekAgo) {
        stats.ageDistribution.daily++;
      } else if (age < oneMonthAgo) {
        stats.ageDistribution.weekly++;
      } else if (age < oneYearAgo) {
        stats.ageDistribution.monthly++;
      } else {
        stats.ageDistribution.old++;
      }
    }

    stats.totalValue = totalValue as MicroTari;
    stats.averageValue = (totalValue / BigInt(utxos.length)) as MicroTari;
    stats.largestUtxo = largest;
    stats.smallestUtxo = smallest;

    return stats;
  }
}
