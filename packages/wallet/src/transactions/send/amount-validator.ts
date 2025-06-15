import { getFFIBindings } from '@tari-project/tarijs-core';
import {
    WalletHandle,
    MicroTari,
    WalletError,
    WalletErrorCode,
    withErrorContext,
    validateMicroTari,
    validateRequired,
    microTariFromFFI,
    microTariToFFI,
} from '@tari-project/tarijs-core';
import { BalanceModel as Balance } from '../../models';

/**
 * Configuration for amount validation
 */
export interface AmountValidationConfig {
    /** Minimum transaction amount (dust limit) */
    minimumAmount: MicroTari;
    /** Maximum transaction amount for safety */
    maximumAmount?: MicroTari;
    /** Safety margin percentage (e.g., 0.01 for 1%) */
    safetyMarginPercent: number;
    /** Enable strict UTXO validation */
    strictUtxoValidation: boolean;
}

/**
 * Default amount validation configuration
 */
export const DEFAULT_AMOUNT_CONFIG: AmountValidationConfig = {
    minimumAmount: (1n as MicroTari), // 1 MicroTari dust limit
    maximumAmount: undefined, // No maximum by default
    safetyMarginPercent: 0.05, // 5% safety margin
    strictUtxoValidation: true
};

/**
 * Amount and balance validation service for transactions
 * 
 * Provides comprehensive validation for transaction amounts including:
 * - Dust limit enforcement
 * - Balance sufficiency checks
 * - UTXO availability verification
 * - Safety margin calculations
 * - Multi-output transaction validation
 */
export class AmountValidator {
    private config: AmountValidationConfig;
    private cachedBalance?: {
        balance: InstanceType<typeof Balance>;
        timestamp: number;
        ttl: number;
    };

    constructor(
        private readonly walletHandle: WalletHandle,
        config: Partial<AmountValidationConfig> = {}
    ) {
        this.config = { ...DEFAULT_AMOUNT_CONFIG, ...config };
    }

    /**
     * Validate transaction amount and ensure sufficient balance
     * 
     * Performs comprehensive validation including:
     * - Basic amount validation (positive, above dust limit)
     * - Balance sufficiency check including fees
     * - UTXO availability verification
     * - Safety margin enforcement
     * 
     * @param amount Transaction amount to validate
     * @param estimatedFee Estimated transaction fee
     * @returns Promise resolving when validation passes
     * 
     * @throws {WalletError} WalletErrorCode.InvalidAmount - Invalid amount
     * @throws {WalletError} WalletErrorCode.AmountBelowDustLimit - Amount too small
     * @throws {WalletError} WalletErrorCode.AmountExceedsMaximum - Amount too large
     * @throws {WalletError} WalletErrorCode.InsufficientFunds - Not enough balance
     * @throws {WalletError} WalletErrorCode.InsufficientUtxos - UTXOs not available
     */
    @withErrorContext('validate_sufficient_balance', 'transaction')
    async validateSufficientBalance(
        amount: MicroTari,
        estimatedFee?: MicroTari
    ): Promise<void> {
        // Basic amount validation
        this.validateBasicAmount(amount);

        // Get current balance
        const balance = await this.getCurrentBalance();
        const availableBalance = microTariFromFFI(balance.available);

        // Calculate total required amount
        const fee = estimatedFee || microTariFromFFI(0n);
        const totalRequired = microTariFromFFI(microTariToFFI(amount) + microTariToFFI(fee));
        const safetyMargin = this.calculateSafetyMargin(availableBalance);
        const totalWithMargin = microTariFromFFI(microTariToFFI(totalRequired) + microTariToFFI(safetyMargin));

        // Check available balance
        if (microTariToFFI(availableBalance) < microTariToFFI(totalRequired)) {
            throw new WalletError(
                WalletErrorCode.InsufficientFunds,
                `Insufficient funds: need ${totalRequired} MicroTari, have ${balance.available} MicroTari`,
                {
                    context: {
                        required: totalRequired.toString(),
                        available: balance.available.toString(),
                        amount: amount.toString(),
                        fee: fee.toString()
                    }
                }
            );
        }

        // Check safety margin if enabled
        if (this.config.safetyMarginPercent > 0 && microTariToFFI(availableBalance) < microTariToFFI(totalWithMargin)) {
            throw new WalletError(
                WalletErrorCode.InsufficientFundsWithMargin,
                `Insufficient funds including safety margin: need ${totalWithMargin} MicroTari, have ${balance.available} MicroTari`,
                {
                    context: {
                        required: totalRequired.toString(),
                        requiredWithMargin: totalWithMargin.toString(),
                        available: balance.available.toString(),
                        safetyMargin: safetyMargin.toString(),
                        safetyMarginPercent: this.config.safetyMarginPercent.toString()
                    }
                }
            );
        }

        // Verify UTXO availability if strict validation is enabled
        if (this.config.strictUtxoValidation) {
            await this.validateUtxoAvailability(totalRequired);
        }
    }

    /**
     * Validate multiple transaction amounts (for batch transactions)
     * 
     * @param amounts Array of transaction amounts
     * @param estimatedFees Array of corresponding fees (optional)
     * @returns Promise resolving when all validations pass
     */
    @withErrorContext('validate_multiple_amounts', 'transaction')
    async validateMultipleAmounts(
        amounts: MicroTari[],
        estimatedFees?: MicroTari[]
    ): Promise<void> {
        validateRequired(amounts, 'amounts');

        if (amounts.length === 0) {
            throw new WalletError(
                WalletErrorCode.InvalidParameters,
                'At least one amount is required'
            );
        }

        // Validate each amount individually
        amounts.forEach((amount, index) => {
            try {
                this.validateBasicAmount(amount);
            } catch (error: unknown) {
                throw new WalletError(
                    (error as any)?.code || WalletErrorCode.InvalidAmount,
                    `Invalid amount at index ${index}: ${(error as any)?.message || String(error)}`,
                    {
                        context: {
                            amountIndex: index,
                            amount: amount.toString()
                        },
                        cause: error instanceof Error ? error : undefined
                    }
                );
            }
        });

        // Calculate total required amount
        const totalAmount = amounts.reduce((sum, amount) => microTariFromFFI(microTariToFFI(sum) + microTariToFFI(amount)), microTariFromFFI(0n));
        const totalFees = estimatedFees?.reduce((sum, fee) => microTariFromFFI(microTariToFFI(sum) + microTariToFFI(fee)), microTariFromFFI(0n)) || microTariFromFFI(0n);
        const grandTotal = microTariFromFFI(microTariToFFI(totalAmount) + microTariToFFI(totalFees));

        // Validate total against balance
        const balance = await this.getCurrentBalance();
        const availableBalance = microTariFromFFI(balance.available);
        const safetyMargin = this.calculateSafetyMargin(availableBalance);

        const grandTotalWithMargin = microTariFromFFI(microTariToFFI(grandTotal) + microTariToFFI(safetyMargin));
        if (microTariToFFI(availableBalance) < microTariToFFI(grandTotalWithMargin)) {
            throw new WalletError(
                WalletErrorCode.InsufficientFunds,
                `Insufficient funds for batch transaction: need ${grandTotalWithMargin} MicroTari, have ${balance.available} MicroTari`,
                {
                    context: {
                        totalAmount: totalAmount.toString(),
                        totalFees: totalFees.toString(),
                        grandTotal: grandTotal.toString(),
                        safetyMargin: safetyMargin.toString(),
                        available: balance.available.toString(),
                        transactionCount: amounts.length.toString()
                    }
                }
            );
        }

        // Verify UTXO availability for the total amount
        if (this.config.strictUtxoValidation) {
            await this.validateUtxoAvailability(grandTotal);
        }
    }

    /**
     * Calculate the recommended fee for a given amount
     * 
     * @param amount Transaction amount
     * @param outputCount Number of outputs (default: 1)
     * @returns Promise resolving to recommended fee
     */
    @withErrorContext('calculate_recommended_fee', 'transaction')
    async calculateRecommendedFee(
        amount: MicroTari,
        outputCount = 1
    ): Promise<MicroTari> {
        this.validateBasicAmount(amount);

        try {
            // Get current network fee statistics
            const ffiBindings = getFFIBindings();
            const feeStats = await ffiBindings.walletGetFeePerGramStats(this.walletHandle);

            // Estimate transaction size based on outputs
            const estimatedSizeGrams = this.estimateTransactionSize(outputCount);

            // Use average fee rate for standard priority
            const recommendedFee = BigInt(feeStats.avg) * BigInt(estimatedSizeGrams);

            return microTariFromFFI(recommendedFee);
        } catch (error: unknown) {
            // Fallback to minimum network fee if stats unavailable
            const minimumFee = microTariFromFFI(1000n); // 1000 MicroTari minimum
            return minimumFee;
        }
    }

    /**
     * Get current balance with caching
     * 
     * @param forceRefresh Force refresh of cached balance
     * @returns Promise resolving to current wallet balance
     */
    @withErrorContext('get_current_balance', 'transaction')
    async getCurrentBalance(forceRefresh = false): Promise<InstanceType<typeof Balance>> {
        const now = Date.now();
        const cacheExpired = !this.cachedBalance ||
            now > this.cachedBalance.timestamp + this.cachedBalance.ttl;

        if (forceRefresh || cacheExpired) {
            try {
                const ffiBindings = getFFIBindings();
                const balanceData = await ffiBindings.walletGetBalance(this.walletHandle);

                this.cachedBalance = {
                    balance: new Balance({
                        available: BigInt(balanceData.available),
                        pendingIncoming: BigInt(balanceData.pendingIncoming),
                        pendingOutgoing: BigInt(balanceData.pendingOutgoing),
                        timelocked: BigInt(balanceData.timelocked || 0),
                        total: BigInt(balanceData.available) + BigInt(balanceData.pendingIncoming),
                        lastUpdated: new Date()
                    }),
                    timestamp: now,
                    ttl: 30000 // 30 seconds cache
                };
            } catch (error: unknown) {
                throw new WalletError(
                    WalletErrorCode.BalanceQueryFailed,
                    'Failed to retrieve wallet balance',
                    {
                        cause: error instanceof Error ? error : undefined
                    }
                );
            }
        }

        return this.cachedBalance!.balance;
    }

    /**
     * Check if an amount is above the dust limit
     * 
     * @param amount Amount to check
     * @returns True if amount is above dust limit
     */
    isAboveDustLimit(amount: MicroTari): boolean {
        return microTariToFFI(amount) >= microTariToFFI(this.config.minimumAmount);
    }

    /**
     * Check if an amount is below the maximum limit (if configured)
     * 
     * @param amount Amount to check
     * @returns True if amount is below maximum limit
     */
    isBelowMaximumLimit(amount: MicroTari): boolean {
        return this.config.maximumAmount === undefined ||
            microTariToFFI(amount) <= microTariToFFI(this.config.maximumAmount);
    }

    /**
     * Update validation configuration
     * 
     * @param newConfig Partial configuration to update
     */
    updateConfig(newConfig: Partial<AmountValidationConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Clear cached balance data
     */
    clearBalanceCache(): void {
        this.cachedBalance = undefined;
    }

    private validateBasicAmount(amount: MicroTari): void {
        validateMicroTari(microTariToFFI(amount));

        if (microTariToFFI(amount) <= 0n) {
            throw new WalletError(
                WalletErrorCode.InvalidAmount,
                'Transaction amount must be greater than zero',
                {
                    context: {
                        amount: amount.toString()
                    }
                }
            );
        }

        if (!this.isAboveDustLimit(amount)) {
            throw new WalletError(
                WalletErrorCode.AmountBelowDustLimit,
                `Transaction amount ${amount} is below dust limit of ${this.config.minimumAmount}`,
                {
                    context: {
                        amount: amount.toString(),
                        dustLimit: this.config.minimumAmount.toString()
                    }
                }
            );
        }

        if (!this.isBelowMaximumLimit(amount)) {
            throw new WalletError(
                WalletErrorCode.AmountExceedsMaximum,
                `Transaction amount ${amount} exceeds maximum limit of ${this.config.maximumAmount}`,
                {
                    context: {
                        amount: amount.toString(),
                        maximumLimit: this.config.maximumAmount!.toString()
                    }
                }
            );
        }
    }

    private calculateSafetyMargin(availableBalance: MicroTari): MicroTari {
        if (this.config.safetyMarginPercent <= 0) {
            return microTariFromFFI(0n);
        }

        const balanceFFI = microTariToFFI(availableBalance);
        const marginPercent = BigInt(Math.floor(this.config.safetyMarginPercent * 10000));
        const margin = (balanceFFI * marginPercent) / 10000n;
        return microTariFromFFI(margin);
    }

    private async validateUtxoAvailability(requiredAmount: MicroTari): Promise<void> {
        try {
            // Check if we have sufficient UTXOs to cover the required amount
            // This would typically involve querying available UTXOs and ensuring
            // they can be combined to meet the requirement

            // For now, we'll implement a simple check
            // In a full implementation, this would query actual UTXO availability
            const balance = await this.getCurrentBalance();
            const availableBalance = microTariFromFFI(balance.available);

            if (microTariToFFI(availableBalance) < microTariToFFI(requiredAmount)) {
                throw new WalletError(
                    WalletErrorCode.InsufficientUtxos,
                    `Insufficient UTXOs available: need ${requiredAmount}, have ${balance.available}`,
                    {
                        context: {
                            required: requiredAmount.toString(),
                            available: balance.available.toString()
                        }
                    }
                );
            }
        } catch (error: unknown) {
            if (error instanceof WalletError) {
                throw error;
            }

            throw new WalletError(
                WalletErrorCode.UtxoValidationFailed,
                'Failed to validate UTXO availability',
                {
                    context: {
                        required: requiredAmount.toString()
                    },
                    cause: error instanceof Error ? error : undefined
                }
            );
        }
    }

    private estimateTransactionSize(outputCount: number): number {
        // Simplified transaction size estimation
        // In practice, this would be more sophisticated based on:
        // - Number of inputs and outputs
        // - Script complexity
        // - Signature requirements
        // - Metadata size

        const baseSize = 100; // Base transaction overhead
        const inputSize = 32; // Typical input size
        const outputSize = 32; // Typical output size

        // Assume 1 input per output for simplicity
        const estimatedSize = baseSize + (outputCount * (inputSize + outputSize));

        return estimatedSize;
    }
}
