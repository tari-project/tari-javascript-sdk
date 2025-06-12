/**
 * @fileoverview UTXO types and interfaces for the Tari JavaScript SDK
 * 
 * Defines UTXO (Unspent Transaction Output) structures with comprehensive
 * status tracking, maturity calculations, and output feature support.
 */

import type {
  MicroTari,
  TransactionId,
  Hash,
  Commitment,
  PublicKey,
  Signature,
  BlockHeight,
  UnixTimestamp
} from './branded.js';
import {
  UtxoStatus,
  OutputFeatures
} from './enums.js';

// Core UTXO information
export interface UtxoInfo {
  /** Unique UTXO identifier */
  readonly id: string;
  /** UTXO amount in MicroTari */
  readonly amount: MicroTari;
  /** Commitment for this UTXO */
  readonly commitment: Commitment;
  /** Output features and flags */
  readonly features: OutputFeatures;
  /** Current UTXO status */
  readonly status: UtxoStatus;
  /** Block height when UTXO was created */
  readonly blockHeight: BlockHeight;
  /** Maturity height (when UTXO becomes spendable) */
  readonly maturityHeight: BlockHeight;
  /** Hash of the transaction that created this UTXO */
  readonly transactionHash: Hash;
  /** Output index in the creating transaction */
  readonly outputIndex: number;
  /** When UTXO was first detected */
  readonly detectedAt: UnixTimestamp;
  /** When UTXO status was last updated */
  readonly updatedAt: UnixTimestamp;
}

// Extended UTXO information with additional details
export interface ExtendedUtxoInfo extends UtxoInfo {
  /** Range proof for the UTXO amount */
  readonly rangeProof?: Hash;
  /** Script hash if UTXO has a script */
  readonly scriptHash?: Hash;
  /** Sender offset public key */
  readonly senderOffsetPublicKey?: PublicKey;
  /** Metadata signature */
  readonly metadataSignature?: Signature;
  /** Covenant hash if applicable */
  readonly covenantHash?: Hash;
  /** Additional metadata */
  readonly metadata?: UtxoMetadata;
}

// UTXO metadata for additional information
export interface UtxoMetadata {
  /** Source transaction ID */
  sourceTransactionId?: TransactionId;
  /** Whether this is a coinbase UTXO */
  isCoinbase?: boolean;
  /** Mining reward information (for coinbase UTXOs) */
  coinbaseInfo?: CoinbaseInfo;
  /** Script information if applicable */
  scriptInfo?: ScriptInfo;
  /** Lock information for time-locked UTXOs */
  lockInfo?: LockInfo;
  /** Spending information if UTXO is spent */
  spentInfo?: SpentInfo;
  /** Custom tags or labels */
  tags?: string[];
  /** Additional custom data */
  customData?: Record<string, any>;
}

// Coinbase-specific information
export interface CoinbaseInfo {
  /** Block reward amount */
  blockReward: MicroTari;
  /** Transaction fees included */
  fees: MicroTari;
  /** Mining pool information */
  poolInfo?: {
    name: string;
    address: string;
    share: number;
  };
  /** Kernel signature */
  kernelSignature: Signature;
}

// Script information for UTXOs with scripts
export interface ScriptInfo {
  /** Script type */
  type: ScriptType;
  /** Script bytecode */
  script: Uint8Array;
  /** Input data for script execution */
  inputData?: Uint8Array;
  /** Script execution result */
  executionResult?: ScriptExecutionResult;
}

export const ScriptType = {
  NoOp: 'noop',
  Hash: 'hash',
  MultiSig: 'multisig',
  TimeLock: 'timelock',
  Custom: 'custom'
} as const;

export type ScriptType = typeof ScriptType[keyof typeof ScriptType];

export interface ScriptExecutionResult {
  /** Whether script executed successfully */
  success: boolean;
  /** Error message if execution failed */
  error?: string;
  /** Gas used for execution */
  gasUsed?: number;
  /** Execution output */
  output?: Uint8Array;
}

// Lock information for time-locked UTXOs
export interface LockInfo {
  /** Lock type */
  type: LockType;
  /** Lock height (for height-based locks) */
  lockHeight?: BlockHeight;
  /** Lock time (for time-based locks) */
  lockTime?: UnixTimestamp;
  /** Whether lock is currently active */
  isLocked: boolean;
  /** When lock expires */
  expiresAt?: UnixTimestamp;
}

export const LockType = {
  None: 'none',
  Height: 'height',
  Time: 'time',
  Relative: 'relative'
} as const;

export type LockType = typeof LockType[keyof typeof LockType];

// Spending information for spent UTXOs
export interface SpentInfo {
  /** Transaction that spent this UTXO */
  spentInTransaction: TransactionId;
  /** Block height where spending occurred */
  spentAtHeight: BlockHeight;
  /** When spending was confirmed */
  spentAt: UnixTimestamp;
  /** Input index in spending transaction */
  inputIndex: number;
}

// UTXO query and filter options
export interface UtxoFilter {
  /** Filter by status */
  status?: UtxoStatus[];
  /** Filter by output features */
  features?: OutputFeatures[];
  /** Filter by amount range */
  amountRange?: {
    min?: MicroTari;
    max?: MicroTari;
  };
  /** Filter by maturity status */
  maturityFilter?: 'mature' | 'immature' | 'all';
  /** Filter by block height range */
  blockHeightRange?: {
    start?: BlockHeight;
    end?: BlockHeight;
  };
  /** Filter by coinbase status */
  isCoinbase?: boolean;
  /** Filter by lock status */
  isLocked?: boolean;
  /** Filter by tags */
  tags?: string[];
  /** Include spent UTXOs */
  includeSpent?: boolean;
}

// UTXO sorting options
export const UtxoSortBy = {
  Amount: 'amount',
  BlockHeight: 'block_height',
  MaturityHeight: 'maturity_height',
  Status: 'status',
  DetectedAt: 'detected_at',
  UpdatedAt: 'updated_at'
} as const;

export type UtxoSortBy = typeof UtxoSortBy[keyof typeof UtxoSortBy];

// UTXO query options
export interface UtxoQueryOptions {
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
  /** Sort by field */
  sortBy?: UtxoSortBy;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Include extended information */
  includeExtended?: boolean;
  /** Include metadata */
  includeMetadata?: boolean;
}

// UTXO selection criteria for transaction building
export interface UtxoSelectionCriteria {
  /** Target amount to select */
  targetAmount: MicroTari;
  /** Selection strategy */
  strategy: UtxoSelectionStrategy;
  /** Maximum number of UTXOs to select */
  maxUtxos?: number;
  /** Minimum UTXO amount to consider */
  minAmount?: MicroTari;
  /** Preferred UTXOs to use first */
  preferred?: string[];
  /** UTXOs to exclude from selection */
  excluded?: string[];
  /** Whether to include immature UTXOs */
  includeImmature?: boolean;
  /** Dust threshold for change output */
  dustThreshold?: MicroTari;
}

export const UtxoSelectionStrategy = {
  /** Select smallest UTXOs first */
  Smallest: 'smallest',
  /** Select largest UTXOs first */
  Largest: 'largest',
  /** Select oldest UTXOs first */
  Oldest: 'oldest',
  /** Select newest UTXOs first */
  Newest: 'newest',
  /** Try to minimize number of UTXOs */
  Consolidate: 'consolidate',
  /** Try to minimize change output */
  MinimizeChange: 'minimize_change',
  /** Random selection */
  Random: 'random'
} as const;

export type UtxoSelectionStrategy = typeof UtxoSelectionStrategy[keyof typeof UtxoSelectionStrategy];

// UTXO selection result
export interface UtxoSelectionResult {
  /** Selected UTXOs */
  readonly selected: UtxoInfo[];
  /** Total amount of selected UTXOs */
  readonly totalAmount: MicroTari;
  /** Change amount */
  readonly changeAmount: MicroTari;
  /** Whether selection was successful */
  readonly success: boolean;
  /** Selection error if any */
  readonly error?: string;
  /** Selection statistics */
  readonly stats: UtxoSelectionStats;
}

export interface UtxoSelectionStats {
  /** Number of UTXOs considered */
  readonly considered: number;
  /** Number of UTXOs selected */
  readonly selected: number;
  /** Selection efficiency (0-1) */
  readonly efficiency: number;
  /** Fragmentation score (0-1, lower is better) */
  readonly fragmentation: number;
}

// UTXO consolidation information
export interface UtxoConsolidationInfo {
  /** UTXOs that can be consolidated */
  readonly candidates: UtxoInfo[];
  /** Estimated savings from consolidation */
  readonly estimatedSavings: MicroTari;
  /** Number of UTXOs after consolidation */
  readonly outputCount: number;
  /** Consolidation urgency (0-1) */
  readonly urgency: number;
  /** Recommended consolidation batches */
  readonly batches: UtxoConsolidationBatch[];
}

export interface UtxoConsolidationBatch {
  /** UTXOs in this batch */
  readonly utxos: UtxoInfo[];
  /** Batch total amount */
  readonly totalAmount: MicroTari;
  /** Estimated fee for consolidation */
  readonly estimatedFee: MicroTari;
  /** Batch priority */
  readonly priority: number;
}

// UTXO statistics
export interface UtxoStatistics {
  /** Total number of UTXOs */
  readonly total: number;
  /** Number by status */
  readonly byStatus: Record<UtxoStatus, number>;
  /** Number by features */
  readonly byFeatures: Record<OutputFeatures, number>;
  /** Total value of all UTXOs */
  readonly totalValue: MicroTari;
  /** Average UTXO amount */
  readonly averageAmount: MicroTari;
  /** Median UTXO amount */
  readonly medianAmount: MicroTari;
  /** Largest UTXO amount */
  readonly maxAmount: MicroTari;
  /** Smallest UTXO amount */
  readonly minAmount: MicroTari;
  /** UTXOs below dust threshold */
  readonly dustUtxos: number;
  /** Mature vs immature UTXOs */
  readonly maturityStats: {
    mature: number;
    immature: number;
    locked: number;
  };
  /** Age distribution */
  readonly ageDistribution: {
    newUtxos: number; // < 1 day
    recentUtxos: number; // 1-7 days
    oldUtxos: number; // > 7 days
  };
}

// UTXO utilities
export class UtxoUtils {
  /**
   * Check if UTXO is mature (spendable)
   */
  static isMature(utxo: UtxoInfo, currentHeight: BlockHeight): boolean {
    return currentHeight >= utxo.maturityHeight;
  }

  /**
   * Check if UTXO is spendable
   */
  static isSpendable(utxo: UtxoInfo, currentHeight: BlockHeight): boolean {
    return utxo.status === UtxoStatus.Unspent && this.isMature(utxo, currentHeight);
  }

  /**
   * Check if UTXO is locked
   */
  static isLocked(utxo: ExtendedUtxoInfo, currentHeight: BlockHeight, currentTime: UnixTimestamp): boolean {
    if (!utxo.metadata?.lockInfo || utxo.metadata.lockInfo.type === LockType.None) {
      return false;
    }

    const lock = utxo.metadata.lockInfo;
    
    switch (lock.type) {
      case LockType.Height:
        return lock.lockHeight ? currentHeight < lock.lockHeight : false;
      case LockType.Time:
        return lock.lockTime ? currentTime < lock.lockTime : false;
      default:
        return lock.isLocked;
    }
  }

  /**
   * Calculate blocks until maturity
   */
  static blocksUntilMaturity(utxo: UtxoInfo, currentHeight: BlockHeight): number {
    return Math.max(0, Number(utxo.maturityHeight - currentHeight));
  }

  /**
   * Calculate estimated time until maturity
   */
  static timeUntilMaturity(utxo: UtxoInfo, currentHeight: BlockHeight, blockTime = 120): number {
    const blocks = this.blocksUntilMaturity(utxo, currentHeight);
    return blocks * blockTime; // seconds
  }

  /**
   * Get UTXO age in blocks
   */
  static getAgeInBlocks(utxo: UtxoInfo, currentHeight: BlockHeight): number {
    return Math.max(0, Number(currentHeight - utxo.blockHeight));
  }

  /**
   * Check if UTXO is dust
   */
  static isDust(utxo: UtxoInfo, dustThreshold: MicroTari = 100n as MicroTari): boolean {
    return utxo.amount < dustThreshold;
  }

  /**
   * Sort UTXOs by criteria
   */
  static sort(
    utxos: UtxoInfo[],
    sortBy: UtxoSortBy = UtxoSortBy.Amount,
    order: 'asc' | 'desc' = 'desc'
  ): UtxoInfo[] {
    return utxos.slice().sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case UtxoSortBy.Amount:
          comparison = Number(a.amount - b.amount);
          break;
        case UtxoSortBy.BlockHeight:
          comparison = Number(a.blockHeight - b.blockHeight);
          break;
        case UtxoSortBy.MaturityHeight:
          comparison = Number(a.maturityHeight - b.maturityHeight);
          break;
        case UtxoSortBy.Status:
          comparison = a.status.localeCompare(b.status);
          break;
        case UtxoSortBy.DetectedAt:
          comparison = a.detectedAt - b.detectedAt;
          break;
        case UtxoSortBy.UpdatedAt:
          comparison = a.updatedAt - b.updatedAt;
          break;
        default:
          comparison = 0;
      }

      return order === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Filter UTXOs by criteria
   */
  static filter(utxos: UtxoInfo[], filter: UtxoFilter, currentHeight?: BlockHeight): UtxoInfo[] {
    return utxos.filter(utxo => {
      // Status filter
      if (filter.status && !filter.status.includes(utxo.status)) {
        return false;
      }

      // Features filter
      if (filter.features && !filter.features.includes(utxo.features)) {
        return false;
      }

      // Amount range filter
      if (filter.amountRange) {
        if (filter.amountRange.min && utxo.amount < filter.amountRange.min) {
          return false;
        }
        if (filter.amountRange.max && utxo.amount > filter.amountRange.max) {
          return false;
        }
      }

      // Maturity filter
      if (filter.maturityFilter && currentHeight !== undefined) {
        const isMature = this.isMature(utxo, currentHeight);
        if (filter.maturityFilter === 'mature' && !isMature) {
          return false;
        }
        if (filter.maturityFilter === 'immature' && isMature) {
          return false;
        }
      }

      // Block height range filter
      if (filter.blockHeightRange) {
        if (filter.blockHeightRange.start && utxo.blockHeight < filter.blockHeightRange.start) {
          return false;
        }
        if (filter.blockHeightRange.end && utxo.blockHeight > filter.blockHeightRange.end) {
          return false;
        }
      }

      // Spent filter
      if (filter.includeSpent === false && utxo.status === UtxoStatus.Spent) {
        return false;
      }

      return true;
    });
  }

  /**
   * Select UTXOs for spending
   */
  static selectUtxos(
    utxos: UtxoInfo[],
    criteria: UtxoSelectionCriteria,
    currentHeight: BlockHeight
  ): UtxoSelectionResult {
    // Filter spendable UTXOs
    let candidates = utxos.filter(utxo => {
      if (criteria.excluded?.includes(utxo.id)) return false;
      if (criteria.minAmount && utxo.amount < criteria.minAmount) return false;
      if (!criteria.includeImmature && !this.isMature(utxo, currentHeight)) return false;
      return this.isSpendable(utxo, currentHeight);
    });

    // Sort candidates based on strategy
    candidates = this.sortByStrategy(candidates, criteria.strategy);

    // Select UTXOs
    const selected: UtxoInfo[] = [];
    let totalAmount = 0n as MicroTari;
    const targetAmount = criteria.targetAmount;

    // Prioritize preferred UTXOs
    if (criteria.preferred) {
      const preferred = candidates.filter(utxo => criteria.preferred!.includes(utxo.id));
      for (const utxo of preferred) {
        if (totalAmount >= targetAmount) break;
        if (criteria.maxUtxos && selected.length >= criteria.maxUtxos) break;
        
        selected.push(utxo);
        totalAmount = (totalAmount + utxo.amount) as MicroTari;
      }
      
      // Remove selected UTXOs from candidates
      candidates = candidates.filter(utxo => !selected.includes(utxo));
    }

    // Select remaining UTXOs
    for (const utxo of candidates) {
      if (totalAmount >= targetAmount) break;
      if (criteria.maxUtxos && selected.length >= criteria.maxUtxos) break;

      selected.push(utxo);
      totalAmount = (totalAmount + utxo.amount) as MicroTari;
    }

    const success = totalAmount >= targetAmount;
    const changeAmount = success ? (totalAmount - targetAmount) as MicroTari : 0n as MicroTari;

    const stats: UtxoSelectionStats = {
      considered: candidates.length + (criteria.preferred?.length || 0),
      selected: selected.length,
      efficiency: success ? Number(targetAmount) / Number(totalAmount) : 0,
      fragmentation: selected.length / Math.max(1, candidates.length)
    };

    return {
      selected,
      totalAmount,
      changeAmount,
      success,
      error: success ? undefined : 'Insufficient funds',
      stats
    };
  }

  /**
   * Sort UTXOs by selection strategy
   */
  private static sortByStrategy(utxos: UtxoInfo[], strategy: UtxoSelectionStrategy): UtxoInfo[] {
    switch (strategy) {
      case UtxoSelectionStrategy.Smallest:
        return this.sort(utxos, UtxoSortBy.Amount, 'asc');
      case UtxoSelectionStrategy.Largest:
        return this.sort(utxos, UtxoSortBy.Amount, 'desc');
      case UtxoSelectionStrategy.Oldest:
        return this.sort(utxos, UtxoSortBy.BlockHeight, 'asc');
      case UtxoSelectionStrategy.Newest:
        return this.sort(utxos, UtxoSortBy.BlockHeight, 'desc');
      case UtxoSelectionStrategy.Random:
        return utxos.slice().sort(() => Math.random() - 0.5);
      default:
        return utxos;
    }
  }

  /**
   * Calculate UTXO statistics
   */
  static calculateStatistics(utxos: UtxoInfo[], currentHeight: BlockHeight): UtxoStatistics {
    const stats = {
      total: utxos.length,
      byStatus: {} as Record<UtxoStatus, number>,
      byFeatures: {} as Record<OutputFeatures, number>,
      totalValue: 0n as MicroTari,
      averageAmount: 0n as MicroTari,
      medianAmount: 0n as MicroTari,
      maxAmount: 0n as MicroTari,
      minAmount: BigInt(Number.MAX_SAFE_INTEGER) as MicroTari,
      dustUtxos: 0,
      maturityStats: {
        mature: 0,
        immature: 0,
        locked: 0
      },
      ageDistribution: {
        newUtxos: 0,
        recentUtxos: 0,
        oldUtxos: 0
      }
    };

    if (utxos.length === 0) {
      return stats;
    }

    // Initialize counters
    Object.values(UtxoStatus).forEach(status => {
      stats.byStatus[status] = 0;
    });
    Object.values(OutputFeatures).forEach(features => {
      stats.byFeatures[features] = 0;
    });

    const amounts = utxos.map(u => u.amount).sort((a, b) => Number(a - b));
    const oneDayAgo = currentHeight - 720n; // ~1 day in blocks
    const oneWeekAgo = currentHeight - 5040n; // ~1 week in blocks

    for (const utxo of utxos) {
      // Status and features counts
      stats.byStatus[utxo.status]++;
      stats.byFeatures[utxo.features]++;

      // Amount statistics
      stats.totalValue = (stats.totalValue + utxo.amount) as MicroTari;
      if (utxo.amount > stats.maxAmount) stats.maxAmount = utxo.amount;
      if (utxo.amount < stats.minAmount) stats.minAmount = utxo.amount;

      // Dust detection
      if (this.isDust(utxo)) stats.dustUtxos++;

      // Maturity statistics
      if (this.isMature(utxo, currentHeight)) {
        stats.maturityStats.mature++;
      } else {
        stats.maturityStats.immature++;
      }

      // Age distribution
      if (utxo.blockHeight > oneDayAgo) {
        stats.ageDistribution.newUtxos++;
      } else if (utxo.blockHeight > oneWeekAgo) {
        stats.ageDistribution.recentUtxos++;
      } else {
        stats.ageDistribution.oldUtxos++;
      }
    }

    // Calculate averages
    stats.averageAmount = (stats.totalValue / BigInt(utxos.length)) as MicroTari;
    stats.medianAmount = amounts[Math.floor(amounts.length / 2)];

    return stats;
  }

  /**
   * Find consolidation opportunities
   */
  static findConsolidationOpportunities(
    utxos: UtxoInfo[],
    currentHeight: BlockHeight,
    feePerGram: MicroTari = 25n as MicroTari
  ): UtxoConsolidationInfo {
    // Find small UTXOs that can be consolidated
    const candidates = utxos.filter(utxo => 
      this.isSpendable(utxo, currentHeight) && 
      utxo.amount < 1000000n // Less than 1 Tari
    );

    if (candidates.length < 2) {
      return {
        candidates: [],
        estimatedSavings: 0n as MicroTari,
        outputCount: 0,
        urgency: 0,
        batches: []
      };
    }

    // Sort by amount (smallest first for better consolidation)
    const sorted = this.sort(candidates, UtxoSortBy.Amount, 'asc');
    
    // Create consolidation batches (max 500 UTXOs per batch)
    const batches: UtxoConsolidationBatch[] = [];
    const batchSize = 500;
    
    for (let i = 0; i < sorted.length; i += batchSize) {
      const batchUtxos = sorted.slice(i, i + batchSize);
      const totalAmount = batchUtxos.reduce((sum, u) => (sum + u.amount) as MicroTari, 0n as MicroTari);
      const estimatedFee = (feePerGram * BigInt(batchUtxos.length * 100)) as MicroTari; // Rough estimate
      
      batches.push({
        utxos: batchUtxos,
        totalAmount,
        estimatedFee,
        priority: batchUtxos.length // Higher priority for more UTXOs
      });
    }

    const totalInputs = candidates.length;
    const totalOutputs = batches.length;
    const inputSavings = (totalInputs - totalOutputs) * Number(feePerGram) * 100;
    
    return {
      candidates,
      estimatedSavings: BigInt(inputSavings) as MicroTari,
      outputCount: totalOutputs,
      urgency: Math.min(1, candidates.length / 1000), // 0-1 scale
      batches: batches.sort((a, b) => b.priority - a.priority)
    };
  }
}

// Export utilities
// UtxoUtils is already exported with its class declaration
