/**
 * @fileoverview UTXO Mapper for Tari Wallet
 * 
 * Provides mapping between FFI UTXO structures and TypeScript interfaces
 * with proper type conversion and validation.
 */

import {
  UtxoInfo,
  ExtendedUtxoInfo,
  UtxoMetadata,
  UtxoStatus,
  OutputFeatures,
  MicroTari,
  BlockHeight,
  UnixTimestamp,
  Hash,
  Commitment,
  WalletError,
  WalletErrorCode,
  type FFIUtxoInfo
} from '@tari-project/tarijs-core';

/**
 * FFI to TypeScript UTXO mapper
 */
export class UtxoMapper {

  /**
   * Map FFI UTXO to TypeScript UtxoInfo
   */
  public mapFromFFI(ffiUtxo: FFIUtxoInfo): UtxoInfo {
    try {
      return {
        id: this.generateUtxoId(ffiUtxo),
        amount: this.parseAmount(ffiUtxo.amount),
        commitment: ffiUtxo.commitment as Commitment,
        features: this.mapOutputFeatures(ffiUtxo.features),
        status: this.mapUtxoStatus(ffiUtxo.status),
        blockHeight: this.parseBlockHeight(ffiUtxo.block_height),
        maturityHeight: this.parseBlockHeight(ffiUtxo.maturity_height),
        transactionHash: this.generateTransactionHash(ffiUtxo),
        outputIndex: 0, // FFI doesn't provide this yet
        detectedAt: Date.now() as UnixTimestamp,
        updatedAt: Date.now() as UnixTimestamp
      };
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TypeConversionFailed,
        'Failed to map FFI UTXO to TypeScript interface',
        { 
          cause: error instanceof Error ? error : undefined,
          context: { ffiUtxo }
        }
      );
    }
  }

  /**
   * Map TypeScript UtxoInfo to FFI structure
   */
  public mapToFFI(utxo: UtxoInfo): FFIUtxoInfo {
    try {
      return {
        id: utxo.id,
        amount: utxo.amount.toString(),
        commitment: utxo.commitment,
        features: utxo.features as unknown as number,
        status: utxo.status as unknown as number,
        block_height: utxo.blockHeight.toString(),
        maturity_height: utxo.maturityHeight.toString(),
        transaction_hash: utxo.transactionHash,
        output_index: utxo.outputIndex,
        detected_at: Number(utxo.detectedAt),
        updated_at: Number(utxo.updatedAt)
      };
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.TypeConversionFailed,
        'Failed to map UtxoInfo to FFI structure',
        { 
          cause: error instanceof Error ? error : undefined,
          context: { utxo }
        }
      );
    }
  }

  /**
   * Map array of FFI UTXOs to TypeScript array
   */
  public mapArrayFromFFI(ffiUtxos: FFIUtxoInfo[]): UtxoInfo[] {
    return ffiUtxos.map(ffiUtxo => this.mapFromFFI(ffiUtxo));
  }

  /**
   * Map array of TypeScript UTXOs to FFI array
   */
  public mapArrayToFFI(utxos: UtxoInfo[]): FFIUtxoInfo[] {
    return utxos.map(utxo => this.mapToFFI(utxo));
  }

  /**
   * Create extended UTXO info from basic info and metadata
   */
  public createExtended(
    utxo: UtxoInfo, 
    metadata?: Partial<UtxoMetadata>
  ): ExtendedUtxoInfo {
    return {
      ...utxo,
      metadata: {
        sourceTransactionId: undefined,
        isCoinbase: utxo.features === OutputFeatures.Coinbase,
        tags: [],
        customData: {},
        ...metadata
      }
    };
  }

  /**
   * Validate UTXO data integrity
   */
  public validateUtxo(utxo: UtxoInfo): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate ID
    if (!utxo.id || utxo.id.trim().length === 0) {
      errors.push('UTXO ID cannot be empty');
    }

    // Validate amount
    if (BigInt(utxo.amount) < 0n) {
      errors.push('UTXO amount cannot be negative');
    }

    // Validate commitment
    if (!utxo.commitment || utxo.commitment.length === 0) {
      errors.push('UTXO commitment cannot be empty');
    }

    // Validate block heights
    if (utxo.blockHeight < 0n) {
      errors.push('Block height cannot be negative');
    }

    if (utxo.maturityHeight < 0n) {
      errors.push('Maturity height cannot be negative');
    }

    if (utxo.maturityHeight < utxo.blockHeight) {
      errors.push('Maturity height cannot be less than block height');
    }

    // Validate output index
    if (utxo.outputIndex < 0) {
      errors.push('Output index cannot be negative');
    }

    // Validate timestamps
    if (utxo.detectedAt < 0) {
      errors.push('Detected timestamp cannot be negative');
    }

    if (utxo.updatedAt < 0) {
      errors.push('Updated timestamp cannot be negative');
    }

    if (utxo.updatedAt < utxo.detectedAt) {
      errors.push('Updated timestamp cannot be before detected timestamp');
    }

    // Validate status consistency
    if (utxo.status === UtxoStatus.Spent && utxo.features === OutputFeatures.Coinbase) {
      // Coinbase outputs have special maturity rules
      const minimumMaturity = 1000n; // Example minimum maturity for coinbase
      if (utxo.maturityHeight - utxo.blockHeight < minimumMaturity) {
        errors.push('Coinbase UTXO maturity period is too short');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate UTXO value statistics
   */
  public calculateValueStats(utxos: UtxoInfo[]): {
    totalValue: MicroTari;
    averageValue: MicroTari;
    minValue: MicroTari;
    maxValue: MicroTari;
    medianValue: MicroTari;
  } {
    if (utxos.length === 0) {
      const zero = 0n as MicroTari;
      return {
        totalValue: zero,
        averageValue: zero,
        minValue: zero,
        maxValue: zero,
        medianValue: zero
      };
    }

    const amounts = utxos.map(utxo => BigInt(utxo.amount)).sort((a, b) => 
      a < b ? -1 : a > b ? 1 : 0
    );

    const totalValue = amounts.reduce((sum, amount) => sum + amount, 0n) as MicroTari;
    const averageValue = (totalValue / BigInt(amounts.length)) as MicroTari;
    const minValue = amounts[0] as MicroTari;
    const maxValue = amounts[amounts.length - 1] as MicroTari;
    
    // Calculate median
    const mid = Math.floor(amounts.length / 2);
    const medianValue = (amounts.length % 2 === 0
      ? (amounts[mid - 1] + amounts[mid]) / 2n
      : amounts[mid]) as MicroTari;

    return {
      totalValue,
      averageValue,
      minValue,
      maxValue,
      medianValue
    };
  }

  /**
   * Group UTXOs by a specific field
   */
  public groupBy<K extends keyof UtxoInfo>(
    utxos: UtxoInfo[], 
    field: K
  ): Map<UtxoInfo[K], UtxoInfo[]> {
    const groups = new Map<UtxoInfo[K], UtxoInfo[]>();
    
    for (const utxo of utxos) {
      const key = utxo[field];
      const group = groups.get(key) || [];
      group.push(utxo);
      groups.set(key, group);
    }
    
    return groups;
  }

  /**
   * Create UTXO summary information
   */
  public createSummary(utxos: UtxoInfo[]): {
    totalCount: number;
    spendableCount: number;
    lockedCount: number;
    totalValue: MicroTari;
    spendableValue: MicroTari;
    largestUtxo: UtxoInfo | null;
    oldestUtxo: UtxoInfo | null;
  } {
    let spendableCount = 0;
    let lockedCount = 0;
    let totalValue = 0n;
    let spendableValue = 0n;
    let largestUtxo: UtxoInfo | null = null;
    let oldestUtxo: UtxoInfo | null = null;

    for (const utxo of utxos) {
      const amount = BigInt(utxo.amount);
      totalValue += amount;

      // Count by spendability
      if (utxo.status === UtxoStatus.Unspent) {
        spendableCount++;
        spendableValue += amount;
      } else {
        lockedCount++;
      }

      // Track largest UTXO
      if (!largestUtxo || amount > BigInt(largestUtxo.amount)) {
        largestUtxo = utxo;
      }

      // Track oldest UTXO
      if (!oldestUtxo || utxo.blockHeight < oldestUtxo.blockHeight) {
        oldestUtxo = utxo;
      }
    }

    return {
      totalCount: utxos.length,
      spendableCount,
      lockedCount,
      totalValue: totalValue as MicroTari,
      spendableValue: spendableValue as MicroTari,
      largestUtxo,
      oldestUtxo
    };
  }

  // Private helper methods

  private generateUtxoId(ffiUtxo: FFIUtxoInfo): string {
    // Generate a deterministic ID from commitment and other data
    return `utxo_${ffiUtxo.commitment}_${ffiUtxo.maturity_height}`;
  }

  private parseAmount(amountStr: string): MicroTari {
    try {
      const amount = BigInt(amountStr);
      if (amount < 0n) {
        throw new Error('Amount cannot be negative');
      }
      return amount as MicroTari;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        `Invalid amount format: ${amountStr}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private parseBlockHeight(heightStr: string): BlockHeight {
    try {
      const height = BigInt(heightStr);
      if (height < 0n) {
        throw new Error('Block height cannot be negative');
      }
      return height as BlockHeight;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        `Invalid block height format: ${heightStr}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private mapOutputFeatures(features: number): OutputFeatures {
    // Map numeric values to enum values based on FFI contract
    switch (features) {
      case 0: return OutputFeatures.Default;
      case 1: return OutputFeatures.Coinbase;
      case 2: return OutputFeatures.Sidechain;
      case 3: return OutputFeatures.BurnCommitment;
      default:
        throw new WalletError(
          WalletErrorCode.InvalidFormat,
          `Invalid output features: ${features}`
        );
    }
  }

  private mapUtxoStatus(status: number): UtxoStatus {
    // Map numeric values to enum values based on FFI contract
    switch (status) {
      case 0: return UtxoStatus.Unspent;
      case 1: return UtxoStatus.Spent;
      case 2: return UtxoStatus.EncumberedToBeReceived;
      case 3: return UtxoStatus.EncumberedToBeSpent;
      case 4: return UtxoStatus.Invalid;
      case 5: return UtxoStatus.Abandoned;
      case 6: return UtxoStatus.Unknown;
      default:
        throw new WalletError(
          WalletErrorCode.InvalidFormat,
          `Invalid UTXO status: ${status}`
        );
    }
  }

  private generateTransactionHash(ffiUtxo: FFIUtxoInfo): Hash {
    // Generate a hash from commitment for now
    // In real implementation, this would come from FFI
    return `tx_${ffiUtxo.commitment.slice(0, 16)}` as Hash;
  }
}
