/**
 * @fileoverview Tests for StandardSender
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  WalletHandle, 
  TransactionId, 
  MicroTari, 
  WalletError, 
  WalletErrorCode,
  FFIBindings 
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../../models';
import { FeeEstimator } from '../../fees';
import { StandardSender, type StandardSendOptions } from '../standard-sender';

// Mock FFI bindings
jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  FFIBindings: {
    walletSendTransaction: jest.fn(),
    walletGetBalance: jest.fn(),
    emojiIdToPublicKey: jest.fn(),
  },
  withErrorContext: jest.fn((_, __) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
  withRetry: jest.fn((_) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor)
}));

// Mock TariAddress
jest.mock('../../../models', () => ({
  TariAddress: {
    fromString: jest.fn(),
    fromPublicKey: jest.fn(),
    fromBase58: jest.fn(),
    fromHex: jest.fn(),
    empty: jest.fn(),
  }
}));

// Mock FeeEstimator
jest.mock('../../fees', () => ({
  FeeEstimator: jest.fn().mockImplementation(() => ({
    estimateFeePerGram: jest.fn(),
    estimateTransactionSize: jest.fn().mockReturnValue(250)
  }))
}));

describe('StandardSender', () => {
  let standardSender: StandardSender;
  let mockWalletHandle: WalletHandle;
  let mockFeeEstimator: jest.Mocked<FeeEstimator>;
  let mockTariAddress: jest.Mocked<TariAddress>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockWalletHandle = 'mock-wallet-handle' as WalletHandle;
    mockFeeEstimator = new FeeEstimator(mockWalletHandle, {}) as jest.Mocked<FeeEstimator>;
    mockTariAddress = {
      handle: 'mock-address-handle',
      toDisplayString: jest.fn().mockReturnValue('mock-address-display'),
    } as any;

    // Setup TariAddress mock
    (TariAddress.fromString as jest.Mock).mockResolvedValue(mockTariAddress);
    (TariAddress.empty as jest.Mock).mockReturnValue(mockTariAddress);

    // Setup fee estimator mock
    mockFeeEstimator.estimateFeePerGram.mockResolvedValue(1000n);
    mockFeeEstimator.estimateTransactionSize.mockReturnValue(250);

    // Setup FFI mocks
    (FFIBindings.walletSendTransaction as jest.Mock).mockResolvedValue('mock-transaction-id');
    (FFIBindings.walletGetBalance as jest.Mock).mockResolvedValue({
      available: 1000000n,
      pending_incoming: 0n,
      pending_outgoing: 0n
    });

    standardSender = new StandardSender(mockWalletHandle, mockFeeEstimator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendTransaction', () => {
    const validRecipient = 'valid-recipient-address';
    const validAmount = 50000n as MicroTari;
    const validOptions: StandardSendOptions = {
      message: 'Test transaction',
      feePerGram: 1000n as MicroTari
    };

    it('should successfully send a standard transaction', async () => {
      const result = await standardSender.sendTransaction(
        validRecipient,
        validAmount,
        validOptions
      );

      expect(result).toBeDefined();
      expect(FFIBindings.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        mockTariAddress.handle,
        validAmount,
        validOptions.feePerGram,
        validOptions.message,
        false // isOneSided = false for standard transactions
      );
    });

    it('should estimate fee when not provided', async () => {
      const optionsWithoutFee = {
        message: 'Test transaction'
      };

      await standardSender.sendTransaction(
        validRecipient,
        validAmount,
        optionsWithoutFee
      );

      expect(mockFeeEstimator.estimateFeePerGram).toHaveBeenCalledWith(validAmount, 1);
    });

    it('should validate recipient address', async () => {
      const invalidRecipient = '';

      await expect(
        standardSender.sendTransaction(invalidRecipient, validAmount, validOptions)
      ).rejects.toThrow(WalletError);
    });

    it('should validate amount is positive', async () => {
      const invalidAmount = 0n as MicroTari;

      await expect(
        standardSender.sendTransaction(validRecipient, invalidAmount, validOptions)
      ).rejects.toThrow(WalletError);
    });

    it('should handle insufficient balance', async () => {
      // Mock insufficient balance
      (FFIBindings.walletGetBalance as jest.Mock).mockResolvedValue({
        available: 1000n, // Less than amount + fee
        pending_incoming: 0n,
        pending_outgoing: 0n
      });

      await expect(
        standardSender.sendTransaction(validRecipient, validAmount, validOptions)
      ).rejects.toThrow(WalletError);
    });

    it('should handle fee estimation failure gracefully', async () => {
      mockFeeEstimator.estimateFeePerGram.mockRejectedValue(new Error('Fee estimation failed'));

      await expect(
        standardSender.sendTransaction(validRecipient, validAmount, {})
      ).rejects.toThrow(WalletError);
    });

    it('should handle FFI send transaction failure', async () => {
      (FFIBindings.walletSendTransaction as jest.Mock).mockRejectedValue(
        new Error('FFI send failed')
      );

      await expect(
        standardSender.sendTransaction(validRecipient, validAmount, validOptions)
      ).rejects.toThrow(WalletError);
    });

    it('should include lock height when provided', async () => {
      const optionsWithLockHeight = {
        ...validOptions,
        lockHeight: 1000
      };

      await standardSender.sendTransaction(
        validRecipient,
        validAmount,
        optionsWithLockHeight
      );

      // The lock height would be passed through the transaction builder
      // This test verifies the parameter is accepted
      expect(FFIBindings.walletSendTransaction).toHaveBeenCalled();
    });
  });

  describe('validateTransactionParams', () => {
    const validRecipient = 'valid-recipient-address';
    const validAmount = 50000n as MicroTari;

    it('should return valid result for valid parameters', async () => {
      const result = await standardSender.validateTransactionParams(
        validRecipient,
        validAmount
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.recipientAddress).toBeDefined();
      expect(result.estimatedFee).toBeGreaterThan(0n);
      expect(result.totalCost).toBeGreaterThan(validAmount);
    });

    it('should return invalid result for invalid recipient', async () => {
      (TariAddress.fromString as jest.Mock).mockRejectedValue(
        new WalletError(WalletErrorCode.InvalidAddress, 'Invalid address')
      );

      const result = await standardSender.validateTransactionParams(
        'invalid-address',
        validAmount
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return invalid result for invalid amount', async () => {
      const result = await standardSender.validateTransactionParams(
        validRecipient,
        0n as MicroTari
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return invalid result for insufficient balance', async () => {
      // Mock insufficient balance
      (FFIBindings.walletGetBalance as jest.Mock).mockResolvedValue({
        available: 1000n,
        pending_incoming: 0n,
        pending_outgoing: 0n
      });

      const result = await standardSender.validateTransactionParams(
        validRecipient,
        validAmount
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Insufficient'))).toBe(true);
    });
  });

  describe('getTransactionCost', () => {
    const validAmount = 50000n as MicroTari;

    it('should return cost breakdown', async () => {
      const result = await standardSender.getTransactionCost(validAmount);

      expect(result.amount).toBe(validAmount);
      expect(result.estimatedFee).toBeGreaterThan(0n);
      expect(result.totalCost).toBe(validAmount + result.estimatedFee);
      expect(result.feeBreakdown).toBeDefined();
      expect(result.feeBreakdown.feePerGram).toBeGreaterThan(0n);
      expect(result.feeBreakdown.estimatedSizeGrams).toBeGreaterThan(0);
    });

    it('should use custom fee per gram when provided', async () => {
      const customFeePerGram = 2000n as MicroTari;
      
      const result = await standardSender.getTransactionCost(
        validAmount,
        customFeePerGram
      );

      expect(result.feeBreakdown.feePerGram).toBe(customFeePerGram);
    });

    it('should handle invalid amount', async () => {
      await expect(
        standardSender.getTransactionCost(0n as MicroTari)
      ).rejects.toThrow(WalletError);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle TariAddress object as recipient', async () => {
      const addressObject = mockTariAddress;
      const validAmount = 50000n as MicroTari;

      await standardSender.sendTransaction(
        addressObject,
        validAmount,
        { feePerGram: 1000n as MicroTari }
      );

      expect(FFIBindings.walletSendTransaction).toHaveBeenCalled();
    });

    it('should handle empty options', async () => {
      const validRecipient = 'valid-recipient-address';
      const validAmount = 50000n as MicroTari;

      await standardSender.sendTransaction(
        validRecipient,
        validAmount
      );

      expect(mockFeeEstimator.estimateFeePerGram).toHaveBeenCalled();
      expect(FFIBindings.walletSendTransaction).toHaveBeenCalled();
    });

    it('should validate required parameters', async () => {
      await expect(
        standardSender.sendTransaction(
          null as any,
          50000n as MicroTari
        )
      ).rejects.toThrow(WalletError);

      await expect(
        standardSender.sendTransaction(
          'valid-address',
          null as any
        )
      ).rejects.toThrow(WalletError);
    });
  });
});
