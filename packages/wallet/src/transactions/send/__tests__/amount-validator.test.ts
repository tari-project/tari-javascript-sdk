/**
 * @fileoverview Tests for AmountValidator
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  WalletHandle,
  MicroTari, 
  WalletError, 
  WalletErrorCode,
  FFIBindings,
  getFFIBindings,
  microTariToFFI,
  microTariFromFFI
} from '@tari-project/tarijs-core';
import { Balance } from '../../../models';
import { 
  AmountValidator, 
  type AmountValidationConfig,
  DEFAULT_AMOUNT_CONFIG 
} from '../amount-validator';

// Mock FFI bindings
jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  getFFIBindings: jest.fn(),
  FFIBindings: {
    walletGetBalance: jest.fn(),
  },
  withErrorContext: jest.fn((_, __) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
  validateMicroTari: jest.fn(),
  validateRequired: jest.fn(),
  microTariToFFI: jest.fn((value) => value as bigint),
  microTariFromFFI: jest.fn((value) => value)
}));

// Mock Balance
jest.mock('../../../models', () => ({
  BalanceModel: jest.fn().mockImplementation((data) => ({
    available: data.available,
    pending: data.pendingIncoming + data.pendingOutgoing,
    total: data.available + data.pendingIncoming,
    ...data
  }))
}));

describe('AmountValidator', () => {
  let validator: AmountValidator;
  let mockWalletHandle: WalletHandle;
  let mockBalance: jest.Mocked<Balance>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWalletHandle = 'mock-wallet-handle' as WalletHandle;
    mockBalance = {
      available: 1000000n,
      pending: 0n,
      total: 1000000n,
    } as any;

    const mockFFIBindings = {
      walletGetBalance: jest.fn().mockResolvedValue({
        available: 1000000n,
        pendingIncoming: 0n,
        pendingOutgoing: 0n,
        timelocked: 0n
      })
    };

    (getFFIBindings as jest.Mock).mockReturnValue(mockFFIBindings);

    validator = new AmountValidator(mockWalletHandle);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateSufficientBalance', () => {
    it('should pass validation for sufficient balance', async () => {
      const amount = 5000000000n as MicroTari; // 5 Tari
      const fee = 100000n as MicroTari; // 0.1 Tari

      await expect(
        validator.validateSufficientBalance(amount, fee)
      ).resolves.toBeUndefined();
    });

    it('should throw error for insufficient balance', async () => {
      const amount = 2000000n as MicroTari; // More than available
      const fee = 1000n as MicroTari;

      await expect(
        validator.validateSufficientBalance(amount, fee)
      ).rejects.toThrow(WalletError);
    });

    it('should handle zero amount', async () => {
      const amount = 0n as MicroTari;

      await expect(
        validator.validateSufficientBalance(amount)
      ).rejects.toThrow(WalletError);
    });

    it('should handle negative amount', async () => {
      const amount = -1000n as MicroTari;

      await expect(
        validator.validateSufficientBalance(amount)
      ).rejects.toThrow(WalletError);
    });

    it('should account for safety margin', async () => {
      const config: Partial<AmountValidationConfig> = {
        safetyMarginPercent: 0.1 // 10% safety margin
      };
      
      validator = new AmountValidator(mockWalletHandle, config);
      
      const amount = 950000n as MicroTari; // 95% of balance
      const fee = 1000n as MicroTari;

      await expect(
        validator.validateSufficientBalance(amount, fee)
      ).rejects.toThrow(WalletError);
    });

    it('should handle dust limit validation', async () => {
      const config: Partial<AmountValidationConfig> = {
        minimumAmount: 1000n as MicroTari
      };
      
      validator = new AmountValidator(mockWalletHandle, config);
      
      const amount = 500n as MicroTari; // Below dust limit

      await expect(
        validator.validateSufficientBalance(amount)
      ).rejects.toThrow(WalletError);
    });

    it('should handle maximum amount validation', async () => {
      const config: Partial<AmountValidationConfig> = {
        maximumAmount: 100000n as MicroTari
      };
      
      validator = new AmountValidator(mockWalletHandle, config);
      
      const amount = 200000n as MicroTari; // Above maximum

      await expect(
        validator.validateSufficientBalance(amount)
      ).rejects.toThrow(WalletError);
    });

    it('should cache balance to reduce FFI calls', async () => {
      const amount = 50000n as MicroTari;

      // Multiple calls
      await validator.validateSufficientBalance(amount);
      await validator.validateSufficientBalance(amount);

      // Should only call FFI once due to caching
      expect(FFIBindings.walletGetBalance).toHaveBeenCalledTimes(1);
    });

    it('should refresh balance when forced', async () => {
      const amount = 50000n as MicroTari;

      await validator.getCurrentBalance(); // First call
      await validator.getCurrentBalance(true); // Force refresh

      expect(FFIBindings.walletGetBalance).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateMultipleAmounts', () => {
    it('should validate multiple valid amounts', async () => {
      const amounts = [1000000000n, 2000000000n, 3000000000n] as MicroTari[]; // 1, 2, 3 Tari

      await expect(
        validator.validateMultipleAmounts(amounts)
      ).resolves.toBeUndefined();
    });

    it('should throw error for empty amounts array', async () => {
      await expect(
        validator.validateMultipleAmounts([])
      ).rejects.toThrow(WalletError);
    });

    it('should handle insufficient balance for total', async () => {
      const amounts = [300000n, 400000n, 500000n] as MicroTari[]; // Total exceeds balance

      await expect(
        validator.validateMultipleAmounts(amounts)
      ).rejects.toThrow(WalletError);
    });

    it('should validate individual amounts', async () => {
      const amounts = [10000n, -5000n, 30000n] as MicroTari[]; // One negative

      await expect(
        validator.validateMultipleAmounts(amounts)
      ).rejects.toThrow(WalletError);
    });

    it('should handle fees for multiple amounts', async () => {
      const amounts = [10000n, 20000n, 30000n] as MicroTari[];
      const fees = [1000n, 1500n, 2000n] as MicroTari[];

      await expect(
        validator.validateMultipleAmounts(amounts, fees)
      ).resolves.toBeUndefined();
    });
  });

  describe('calculateRecommendedFee', () => {
    it('should calculate fee based on network stats', async () => {
      // Mock fee stats
      (FFIBindings.walletGetFeePerGramStats as jest.Mock) = jest.fn().mockResolvedValue({
        median: 1000,
        min: 500,
        max: 2000
      });

      const amount = 50000n as MicroTari;
      const fee = await validator.calculateRecommendedFee(amount);

      expect(fee).toBeGreaterThan(0n);
    });

    it('should fallback to minimum fee when stats unavailable', async () => {
      // Mock fee stats to fail
      (FFIBindings.walletGetFeePerGramStats as jest.Mock) = jest.fn().mockRejectedValue(
        new Error('Network unavailable')
      );

      const amount = 50000n as MicroTari;
      const fee = await validator.calculateRecommendedFee(amount);

      expect(fee).toBe(1000n); // Fallback minimum
    });

    it('should handle multiple outputs', async () => {
      (FFIBindings.walletGetFeePerGramStats as jest.Mock) = jest.fn().mockResolvedValue({
        median: 1000,
        min: 500,
        max: 2000
      });

      const amount = 50000n as MicroTari;
      const singleOutputFee = await validator.calculateRecommendedFee(amount, 1);
      const multiOutputFee = await validator.calculateRecommendedFee(amount, 3);

      expect(multiOutputFee).toBeGreaterThan(singleOutputFee);
    });
  });

  describe('getCurrentBalance', () => {
    it('should return current balance', async () => {
      const balance = await validator.getCurrentBalance();

      expect(balance).toBe(mockBalance);
      expect(FFIBindings.walletGetBalance).toHaveBeenCalledWith(mockWalletHandle);
    });

    it('should handle balance query failure', async () => {
      (FFIBindings.walletGetBalance as jest.Mock).mockRejectedValue(
        new Error('FFI error')
      );

      await expect(
        validator.getCurrentBalance()
      ).rejects.toThrow(WalletError);
    });

    it('should use cached balance within TTL', async () => {
      // First call
      await validator.getCurrentBalance();
      
      // Second call within cache TTL
      await validator.getCurrentBalance();

      expect(FFIBindings.walletGetBalance).toHaveBeenCalledTimes(1);
    });
  });

  describe('utility methods', () => {
    it('should check dust limit correctly', () => {
      const aboveDust = 1000n as MicroTari;
      const belowDust = 0n as MicroTari;

      expect(validator.isAboveDustLimit(aboveDust)).toBe(true);
      expect(validator.isAboveDustLimit(belowDust)).toBe(false);
    });

    it('should check maximum limit correctly', () => {
      const config: Partial<AmountValidationConfig> = {
        maximumAmount: 100000n as MicroTari
      };
      
      validator = new AmountValidator(mockWalletHandle, config);

      const belowMax = 50000n as MicroTari;
      const aboveMax = 200000n as MicroTari;

      expect(validator.isBelowMaximumLimit(belowMax)).toBe(true);
      expect(validator.isBelowMaximumLimit(aboveMax)).toBe(false);
    });

    it('should allow unlimited maximum when not configured', () => {
      const largeAmount = 999999999n as MicroTari;

      expect(validator.isBelowMaximumLimit(largeAmount)).toBe(true);
    });
  });

  describe('configuration management', () => {
    it('should use default configuration', () => {
      const validator = new AmountValidator(mockWalletHandle);
      
      expect(validator.isAboveDustLimit(DEFAULT_AMOUNT_CONFIG.minimumAmount)).toBe(true);
    });

    it('should allow configuration updates', () => {
      validator.updateConfig({
        minimumAmount: 5000n as MicroTari
      });

      expect(validator.isAboveDustLimit(1000n as MicroTari)).toBe(false);
      expect(validator.isAboveDustLimit(5000n as MicroTari)).toBe(true);
    });

    it('should clear cache when requested', () => {
      validator.clearBalanceCache();
      
      // Cache should be cleared, next call should hit FFI
      expect(() => validator.clearBalanceCache()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle zero fee', async () => {
      const amount = 50000n as MicroTari;
      const fee = 0n as MicroTari;

      await expect(
        validator.validateSufficientBalance(amount, fee)
      ).resolves.toBeUndefined();
    });

    it('should handle very large amounts', async () => {
      // Mock large balance
      mockBalance.available = BigInt(Number.MAX_SAFE_INTEGER);
      
      const largeAmount = BigInt(Number.MAX_SAFE_INTEGER - 1000) as MicroTari;

      await expect(
        validator.validateSufficientBalance(largeAmount)
      ).resolves.toBeUndefined();
    });

    it('should handle UTXO validation when enabled', async () => {
      const config: Partial<AmountValidationConfig> = {
        strictUtxoValidation: true
      };
      
      validator = new AmountValidator(mockWalletHandle, config);
      
      const amount = 50000n as MicroTari;

      await expect(
        validator.validateSufficientBalance(amount)
      ).resolves.toBeUndefined();
    });

    it('should handle UTXO validation failure', async () => {
      const config: Partial<AmountValidationConfig> = {
        strictUtxoValidation: true
      };
      
      validator = new AmountValidator(mockWalletHandle, config);
      
      // Mock insufficient UTXOs
      mockBalance.available = 10000n; // Less than amount
      
      const amount = 50000n as MicroTari;

      await expect(
        validator.validateSufficientBalance(amount)
      ).rejects.toThrow(WalletError);
    });
  });
});
