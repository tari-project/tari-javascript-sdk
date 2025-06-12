/**
 * @fileoverview Output features types for the Tari JavaScript SDK
 * 
 * Defines output feature structures and flags for different types
 * of transaction outputs in the Tari protocol.
 */

import type {
  MicroTari,
  BlockHeight,
  UnixTimestamp,
  Hash,
  PublicKey
} from './branded.js';
import { OutputFeatures } from './enums.js';

// Base output features interface
export interface BaseOutputFeatures {
  /** Output feature type */
  readonly type: OutputFeatures;
  /** Output flags */
  readonly flags: OutputFlags;
  /** Maturity period in blocks */
  readonly maturity: number;
  /** Recovery byte for coinbase outputs */
  readonly recoveryByte?: number;
  /** Metadata for the output */
  readonly metadata?: OutputMetadata;
}

// Output flags bitfield
export interface OutputFlags {
  /** Whether output is a coinbase output */
  readonly coinbase: boolean;
  /** Whether output has a script */
  readonly hasScript: boolean;
  /** Whether output has metadata */
  readonly hasMetadata: boolean;
  /** Whether output is time-locked */
  readonly timeLocked: boolean;
  /** Whether output has a covenant */
  readonly hasCovenant: boolean;
  /** Raw flags value */
  readonly raw: number;
}

// Output metadata for additional information
export interface OutputMetadata {
  /** Metadata length */
  readonly length: number;
  /** Metadata content */
  readonly data: Uint8Array;
  /** Metadata hash */
  readonly hash: Hash;
  /** Metadata version */
  readonly version: number;
}

// Coinbase-specific output features
export interface CoinbaseOutputFeatures extends BaseOutputFeatures {
  readonly type: typeof OutputFeatures.Coinbase;
  /** Block reward amount */
  readonly blockReward: MicroTari;
  /** Total fees in block */
  readonly totalFees: MicroTari;
  /** Block height */
  readonly blockHeight: BlockHeight;
  /** Kernel excess for coinbase */
  readonly kernelExcess: PublicKey;
}

// Standard output features
export interface StandardOutputFeatures extends BaseOutputFeatures {
  readonly type: typeof OutputFeatures.Default;
  /** Optional lock height */
  readonly lockHeight?: BlockHeight;
  /** Optional lock time */
  readonly lockTime?: UnixTimestamp;
}

// Sidechain output features
export interface SidechainOutputFeatures extends BaseOutputFeatures {
  readonly type: typeof OutputFeatures.Sidechain;
  /** Sidechain identifier */
  readonly sidechainId: Hash;
  /** Sidechain block height */
  readonly sidechainBlockHeight: BlockHeight;
  /** Merkle root of sidechain state */
  readonly merkleRoot: Hash;
  /** Sidechain committee size */
  readonly committeeSize: number;
}

// Burn commitment output features
export interface BurnCommitmentOutputFeatures extends BaseOutputFeatures {
  readonly type: typeof OutputFeatures.BurnCommitment;
  /** Amount being burned */
  readonly burnAmount: MicroTari;
  /** Burn reason code */
  readonly reasonCode: BurnReasonCode;
  /** Burn payload */
  readonly payload?: Uint8Array;
  /** Claim public key for burns that can be claimed */
  readonly claimPublicKey?: PublicKey;
}

// Burn reason codes
export const BurnReasonCode = {
  /** Intentional burn with no recovery */
  Permanent: 0,
  /** Burn for sidechain operation */
  Sidechain: 1,
  /** Burn for atomic swap */
  AtomicSwap: 2,
  /** Burn for validator staking */
  ValidatorStaking: 3,
  /** Burn for fee payment */
  FeeBurn: 4,
  /** Custom burn reason */
  Custom: 255
} as const;

export type BurnReasonCode = typeof BurnReasonCode[keyof typeof BurnReasonCode];

// Union type for all output features
export type OutputFeaturesUnion = 
  | StandardOutputFeatures
  | CoinbaseOutputFeatures
  | SidechainOutputFeatures
  | BurnCommitmentOutputFeatures;

// Output feature validation result
export interface OutputFeaturesValidationResult {
  /** Whether features are valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: OutputFeaturesValidationError[];
  /** Validation warnings */
  readonly warnings: OutputFeaturesValidationWarning[];
}

export interface OutputFeaturesValidationError {
  readonly code: string;
  readonly message: string;
  readonly field: string;
}

export interface OutputFeaturesValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly field: string;
  readonly recommendation: string;
}

// Output feature builder for creating different types
export interface OutputFeaturesBuilder {
  /** Set output type */
  setType(type: OutputFeatures): this;
  /** Set maturity period */
  setMaturity(blocks: number): this;
  /** Set coinbase flag */
  setCoinbase(isCoinbase: boolean): this;
  /** Set script flag */
  setHasScript(hasScript: boolean): this;
  /** Set metadata */
  setMetadata(metadata: OutputMetadata): this;
  /** Set time lock */
  setTimeLock(lockHeight?: BlockHeight, lockTime?: UnixTimestamp): this;
  /** Set covenant flag */
  setHasCovenant(hasCovenant: boolean): this;
  /** Build the output features */
  build(): BaseOutputFeatures;
}

// Output feature utilities
export class OutputFeaturesUtils {
  /**
   * Create standard output features
   */
  static createStandard(maturity = 0, lockHeight?: BlockHeight, lockTime?: UnixTimestamp): StandardOutputFeatures {
    return {
      type: OutputFeatures.Default,
      flags: {
        coinbase: false,
        hasScript: false,
        hasMetadata: false,
        timeLocked: !!(lockHeight || lockTime),
        hasCovenant: false,
        raw: this.calculateFlags({
          coinbase: false,
          hasScript: false,
          hasMetadata: false,
          timeLocked: !!(lockHeight || lockTime),
          hasCovenant: false
        })
      },
      maturity,
      lockHeight,
      lockTime
    };
  }

  /**
   * Create coinbase output features
   */
  static createCoinbase(
    blockReward: MicroTari,
    totalFees: MicroTari,
    blockHeight: BlockHeight,
    kernelExcess: PublicKey,
    maturity = 1000 // Standard coinbase maturity
  ): CoinbaseOutputFeatures {
    return {
      type: OutputFeatures.Coinbase,
      flags: {
        coinbase: true,
        hasScript: false,
        hasMetadata: false,
        timeLocked: false,
        hasCovenant: false,
        raw: this.calculateFlags({
          coinbase: true,
          hasScript: false,
          hasMetadata: false,
          timeLocked: false,
          hasCovenant: false
        })
      },
      maturity,
      blockReward,
      totalFees,
      blockHeight,
      kernelExcess
    };
  }

  /**
   * Create sidechain output features
   */
  static createSidechain(
    sidechainId: Hash,
    sidechainBlockHeight: BlockHeight,
    merkleRoot: Hash,
    committeeSize: number,
    maturity = 0
  ): SidechainOutputFeatures {
    return {
      type: OutputFeatures.Sidechain,
      flags: {
        coinbase: false,
        hasScript: false,
        hasMetadata: true,
        timeLocked: false,
        hasCovenant: true,
        raw: this.calculateFlags({
          coinbase: false,
          hasScript: false,
          hasMetadata: true,
          timeLocked: false,
          hasCovenant: true
        })
      },
      maturity,
      sidechainId,
      sidechainBlockHeight,
      merkleRoot,
      committeeSize
    };
  }

  /**
   * Create burn commitment output features
   */
  static createBurnCommitment(
    burnAmount: MicroTari,
    reasonCode: BurnReasonCode,
    payload?: Uint8Array,
    claimPublicKey?: PublicKey,
    maturity = 0
  ): BurnCommitmentOutputFeatures {
    return {
      type: OutputFeatures.BurnCommitment,
      flags: {
        coinbase: false,
        hasScript: false,
        hasMetadata: !!(payload || claimPublicKey),
        timeLocked: false,
        hasCovenant: false,
        raw: this.calculateFlags({
          coinbase: false,
          hasScript: false,
          hasMetadata: !!(payload || claimPublicKey),
          timeLocked: false,
          hasCovenant: false
        })
      },
      maturity,
      burnAmount,
      reasonCode,
      payload,
      claimPublicKey
    };
  }

  /**
   * Calculate raw flags value from individual flags
   */
  static calculateFlags(flags: Omit<OutputFlags, 'raw'>): number {
    let raw = 0;
    
    if (flags.coinbase) raw |= 0x01;
    if (flags.hasScript) raw |= 0x02;
    if (flags.hasMetadata) raw |= 0x04;
    if (flags.timeLocked) raw |= 0x08;
    if (flags.hasCovenant) raw |= 0x10;
    
    return raw;
  }

  /**
   * Parse flags from raw value
   */
  static parseFlags(raw: number): OutputFlags {
    return {
      coinbase: (raw & 0x01) !== 0,
      hasScript: (raw & 0x02) !== 0,
      hasMetadata: (raw & 0x04) !== 0,
      timeLocked: (raw & 0x08) !== 0,
      hasCovenant: (raw & 0x10) !== 0,
      raw
    };
  }

  /**
   * Check if output features represent a coinbase output
   */
  static isCoinbase(features: BaseOutputFeatures): features is CoinbaseOutputFeatures {
    return features.type === OutputFeatures.Coinbase || features.flags.coinbase;
  }

  /**
   * Check if output features represent a sidechain output
   */
  static isSidechain(features: BaseOutputFeatures): features is SidechainOutputFeatures {
    return features.type === OutputFeatures.Sidechain;
  }

  /**
   * Check if output features represent a burn commitment
   */
  static isBurnCommitment(features: BaseOutputFeatures): features is BurnCommitmentOutputFeatures {
    return features.type === OutputFeatures.BurnCommitment;
  }

  /**
   * Check if output is time-locked
   */
  static isTimeLocked(features: BaseOutputFeatures): boolean {
    return features.flags.timeLocked;
  }

  /**
   * Check if output has a script
   */
  static hasScript(features: BaseOutputFeatures): boolean {
    return features.flags.hasScript;
  }

  /**
   * Check if output has metadata
   */
  static hasMetadata(features: BaseOutputFeatures): boolean {
    return features.flags.hasMetadata;
  }

  /**
   * Check if output has a covenant
   */
  static hasCovenant(features: BaseOutputFeatures): boolean {
    return features.flags.hasCovenant;
  }

  /**
   * Get maturity requirement for output
   */
  static getMaturityRequirement(features: BaseOutputFeatures): number {
    if (this.isCoinbase(features)) {
      return features.maturity || 1000; // Standard coinbase maturity
    }
    return features.maturity || 0;
  }

  /**
   * Calculate when output becomes spendable
   */
  static getSpendableHeight(
    features: BaseOutputFeatures,
    creationHeight: BlockHeight
  ): BlockHeight {
    const maturity = this.getMaturityRequirement(features);
    return (creationHeight + BigInt(maturity)) as BlockHeight;
  }

  /**
   * Check if output is spendable at given height
   */
  static isSpendableAtHeight(
    features: BaseOutputFeatures,
    creationHeight: BlockHeight,
    currentHeight: BlockHeight
  ): boolean {
    const spendableHeight = this.getSpendableHeight(features, creationHeight);
    return currentHeight >= spendableHeight;
  }

  /**
   * Get time lock expiration
   */
  static getTimeLockExpiration(features: StandardOutputFeatures): {
    heightLock?: BlockHeight;
    timeLock?: UnixTimestamp;
  } {
    return {
      heightLock: features.lockHeight,
      timeLock: features.lockTime
    };
  }

  /**
   * Check if time lock has expired
   */
  static isTimeLockExpired(
    features: StandardOutputFeatures,
    currentHeight: BlockHeight,
    currentTime: UnixTimestamp
  ): boolean {
    if (features.lockHeight && currentHeight < features.lockHeight) {
      return false;
    }
    
    if (features.lockTime && currentTime < features.lockTime) {
      return false;
    }
    
    return true;
  }

  /**
   * Validate output features
   */
  static validate(features: BaseOutputFeatures): OutputFeaturesValidationResult {
    const errors: OutputFeaturesValidationError[] = [];
    const warnings: OutputFeaturesValidationWarning[] = [];

    // Validate maturity
    if (features.maturity < 0) {
      errors.push({
        code: 'INVALID_MATURITY',
        message: 'Maturity cannot be negative',
        field: 'maturity'
      });
    }

    // Validate coinbase features
    if (this.isCoinbase(features)) {
      const coinbase = features as CoinbaseOutputFeatures;
      
      if (coinbase.blockReward <= 0n) {
        errors.push({
          code: 'INVALID_BLOCK_REWARD',
          message: 'Block reward must be positive',
          field: 'blockReward'
        });
      }

      if (coinbase.totalFees < 0n) {
        errors.push({
          code: 'INVALID_TOTAL_FEES',
          message: 'Total fees cannot be negative',
          field: 'totalFees'
        });
      }

      if (coinbase.maturity < 1000) {
        warnings.push({
          code: 'LOW_COINBASE_MATURITY',
          message: 'Coinbase maturity is less than standard 1000 blocks',
          field: 'maturity',
          recommendation: 'Consider using standard coinbase maturity of 1000 blocks'
        });
      }
    }

    // Validate burn commitment features
    if (this.isBurnCommitment(features)) {
      const burn = features as BurnCommitmentOutputFeatures;
      
      if (burn.burnAmount <= 0n) {
        errors.push({
          code: 'INVALID_BURN_AMOUNT',
          message: 'Burn amount must be positive',
          field: 'burnAmount'
        });
      }

      if (!Object.values(BurnReasonCode).includes(burn.reasonCode)) {
        errors.push({
          code: 'INVALID_BURN_REASON',
          message: 'Invalid burn reason code',
          field: 'reasonCode'
        });
      }
    }

    // Validate flags consistency
    if (features.flags.coinbase && features.type !== OutputFeatures.Coinbase) {
      warnings.push({
        code: 'INCONSISTENT_COINBASE_FLAG',
        message: 'Coinbase flag is set but type is not coinbase',
        field: 'flags',
        recommendation: 'Ensure flags and type are consistent'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get feature type display name
   */
  static getTypeDisplayName(type: OutputFeatures): string {
    switch (type) {
      case OutputFeatures.Default:
        return 'Standard';
      case OutputFeatures.Coinbase:
        return 'Coinbase';
      case OutputFeatures.Sidechain:
        return 'Sidechain';
      case OutputFeatures.BurnCommitment:
        return 'Burn Commitment';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get burn reason display name
   */
  static getBurnReasonDisplayName(reasonCode: BurnReasonCode): string {
    switch (reasonCode) {
      case BurnReasonCode.Permanent:
        return 'Permanent Burn';
      case BurnReasonCode.Sidechain:
        return 'Sidechain Operation';
      case BurnReasonCode.AtomicSwap:
        return 'Atomic Swap';
      case BurnReasonCode.ValidatorStaking:
        return 'Validator Staking';
      case BurnReasonCode.FeeBurn:
        return 'Fee Burn';
      case BurnReasonCode.Custom:
        return 'Custom';
      default:
        return 'Unknown';
    }
  }

  /**
   * Serialize output features to JSON
   */
  static toJSON(features: BaseOutputFeatures): object {
    const base = {
      type: features.type,
      flags: features.flags,
      maturity: features.maturity,
      recoveryByte: features.recoveryByte,
      metadata: features.metadata ? {
        length: features.metadata.length,
        data: Array.from(features.metadata.data),
        hash: features.metadata.hash,
        version: features.metadata.version
      } : undefined
    };

    switch (features.type) {
      case OutputFeatures.Coinbase:
        const coinbase = features as CoinbaseOutputFeatures;
        return {
          ...base,
          blockReward: coinbase.blockReward.toString(),
          totalFees: coinbase.totalFees.toString(),
          blockHeight: coinbase.blockHeight.toString(),
          kernelExcess: coinbase.kernelExcess
        };

      case OutputFeatures.Sidechain:
        const sidechain = features as SidechainOutputFeatures;
        return {
          ...base,
          sidechainId: sidechain.sidechainId,
          sidechainBlockHeight: sidechain.sidechainBlockHeight.toString(),
          merkleRoot: sidechain.merkleRoot,
          committeeSize: sidechain.committeeSize
        };

      case OutputFeatures.BurnCommitment:
        const burn = features as BurnCommitmentOutputFeatures;
        return {
          ...base,
          burnAmount: burn.burnAmount.toString(),
          reasonCode: burn.reasonCode,
          payload: burn.payload ? Array.from(burn.payload) : undefined,
          claimPublicKey: burn.claimPublicKey
        };

      default:
        const standard = features as StandardOutputFeatures;
        return {
          ...base,
          lockHeight: standard.lockHeight?.toString(),
          lockTime: standard.lockTime
        };
    }
  }
}

// Builder implementation
export class OutputFeaturesBuilderImpl implements OutputFeaturesBuilder {
  private type: OutputFeatures = OutputFeatures.Default;
  private maturity = 0;
  private flags: {
    coinbase?: boolean;
    hasScript?: boolean;
    hasMetadata?: boolean;
    timeLocked?: boolean;
    hasCovenant?: boolean;
  } = {};
  private metadata?: OutputMetadata;
  private lockHeight?: BlockHeight;
  private lockTime?: UnixTimestamp;

  setType(type: OutputFeatures): this {
    this.type = type;
    return this;
  }

  setMaturity(blocks: number): this {
    this.maturity = blocks;
    return this;
  }

  setCoinbase(isCoinbase: boolean): this {
    this.flags.coinbase = isCoinbase;
    return this;
  }

  setHasScript(hasScript: boolean): this {
    this.flags.hasScript = hasScript;
    return this;
  }

  setMetadata(metadata: OutputMetadata): this {
    this.metadata = metadata;
    this.flags.hasMetadata = true;
    return this;
  }

  setTimeLock(lockHeight?: BlockHeight, lockTime?: UnixTimestamp): this {
    this.lockHeight = lockHeight;
    this.lockTime = lockTime;
    this.flags.timeLocked = !!(lockHeight || lockTime);
    return this;
  }

  setHasCovenant(hasCovenant: boolean): this {
    this.flags.hasCovenant = hasCovenant;
    return this;
  }

  build(): BaseOutputFeatures {
    const flagsForCalculation = {
      coinbase: this.flags.coinbase || false,
      hasScript: this.flags.hasScript || false,
      hasMetadata: this.flags.hasMetadata || false,
      timeLocked: this.flags.timeLocked || false,
      hasCovenant: this.flags.hasCovenant || false
    };
    
    const finalFlags: OutputFlags = {
      ...flagsForCalculation,
      raw: OutputFeaturesUtils.calculateFlags(flagsForCalculation)
    };

    return {
      type: this.type,
      flags: finalFlags,
      maturity: this.maturity,
      metadata: this.metadata
    };
  }
}

// Factory function
export function createOutputFeaturesBuilder(): OutputFeaturesBuilder {
  return new OutputFeaturesBuilderImpl();
}

// Export utilities
// OutputFeaturesUtils is already exported with its class declaration
