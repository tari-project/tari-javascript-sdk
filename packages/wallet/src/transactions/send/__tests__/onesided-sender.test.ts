/**
 * @fileoverview One-Sided Sender Tests
 * 
 * Comprehensive test suite for one-sided transaction sending functionality
 * including validation, fee estimation, stealth addressing, and error handling.
 */

import { 
  WalletHandle, 
  MicroTari, 
  TransactionId,
  WalletError,
  WalletErrorCode,
  FFIBindings
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../../models';
import { FeeEstimator } from '../../fees';
import { OneSidedSender, type OneSidedSendOptions } from '../onesided-sender';

// Mock dependencies
jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  FFIBindings: {
    walletSendTransaction: jest.fn(),
    walletGenerateStealthAddress: jest.fn(),
    walletPreviewUtxoSelection: jest.fn(),
    walletGetBalance: jest.fn(),
    walletValidateScript: jest.fn(),
    walletGetNetworkInfo: jest.fn()
  }
}));

jest.mock('../../../models');
jest.mock('../../fees');
jest.mock('../recipient-validator');
jest.mock('../onesided-validator');

describe('OneSidedSender', () => {
  let sender: OneSidedSender;
  let mockWalletHandle: WalletHandle;
  let mockFeeEstimator: jest.Mocked<FeeEstimator>;
  let mockRecipientAddress: jest.Mocked<TariAddress>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockWalletHandle = 'test-wallet-handle' as WalletHandle;
    mockFeeEstimator = {
      estimateFeePerGram: jest.fn()
    } as any;

    mockRecipientAddress = {
      handle: 'test-address-handle',
      toDisplayString: jest.fn().mockReturnValue('test-address'),
      toString: jest.fn().mockReturnValue('test-address')
    } as any;

    // Mock TariAddress static methods
    (TariAddress.fromHandle as jest.Mock) = jest.fn().mockReturnValue(mockRecipientAddress);
    (TariAddress.empty as jest.Mock) = jest.fn().mockReturnValue(mockRecipientAddress);

    // Create sender instance
    sender = new OneSidedSender(mockWalletHandle, mockFeeEstimator);

    // Setup default mock responses
    mockFeeEstimator.estimateFeePerGram.mockResolvedValue(BigInt(100) as MicroTari);
    
    (FFIBindings.walletSendTransaction as jest.Mock).mockResolvedValue('test-tx-id');
    (FFIBindings.walletGenerateStealthAddress as jest.Mock).mockResolvedValue('stealth-handle');
    (FFIBindings.walletPreviewUtxoSelection as jest.Mock).mockResolvedValue({
      success: true,
      inputCount: 1,
      outputCount: 1
    });
    (FFIBindings.walletGetBalance as jest.Mock).mockResolvedValue({
      available: BigInt(1000000),
      pending: BigInt(0)
    });
    (FFIBindings.walletValidateScript as jest.Mock).mockResolvedValue({
      valid: true,
      complexity: 2
    });
    (FFIBindings.walletGetNetworkInfo as jest.Mock).mockResolvedValue({
      network: 'testnet'
    });
  });

  describe('sendOneSidedTransaction', () => {
    const validRecipient = 'test-recipient';
    const validAmount = BigInt(1000) as MicroTari;

    it('should send one-sided transaction successfully', async () => {
      const result = await sender.sendOneSidedTransaction(validRecipient, validAmount);

      expect(result).toBeInstanceOf(TransactionId);
      expect(FFIBindings.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        mockRecipientAddress.handle,
        validAmount,
        BigInt(120), // Estimated fee with complexity multiplier
        '',
        true // isOneSided = true
      );
    });

    it('should send one-sided transaction with stealth addressing', async () => {
      const options: OneSidedSendOptions = {
        useStealth: true,
        message: 'Test message'
      };

      await sender.sendOneSidedTransaction(validRecipient, validAmount, options);

      expect(FFIBindings.walletGenerateStealthAddress).toHaveBeenCalledWith(
        mockWalletHandle,
        mockRecipientAddress.handle
      );
      expect(FFIBindings.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        mockRecipientAddress.handle, // Should use stealth address
        validAmount,
        BigInt(150), // Higher fee for stealth
        'Test message',
        true
      );
    });

    it('should send one-sided transaction with custom fee', async () => {
      const customFee = BigInt(200) as MicroTari;
      const options: OneSidedSendOptions = {
        feePerGram: customFee,
        message: 'Custom fee transaction'
      };

      await sender.sendOneSidedTransaction(validRecipient, validAmount, options);

      expect(FFIBindings.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        mockRecipientAddress.handle,
        validAmount,
        customFee,
        'Custom fee transaction',
        true
      );
    });

    it('should send one-sided transaction with recovery data', async () => {
      const options: OneSidedSendOptions = {
        recoveryData: 'recovery-info-123'
      };

      await sender.sendOneSidedTransaction(validRecipient, validAmount, options);

      expect(FFIBindings.walletSendTransaction).toHaveBeenCalled();
    });

    it('should throw error for invalid amount', async () => {
      const invalidAmount = BigInt(0) as MicroTari;

      await expect(
        sender.sendOneSidedTransaction(validRecipient, invalidAmount)
      ).rejects.toThrow(WalletError);
    });

    it('should throw error for negative amount', async () => {
      const negativeAmount = BigInt(-100) as MicroTari;

      await expect(
        sender.sendOneSidedTransaction(validRecipient, negativeAmount)
      ).rejects.toThrow(WalletError);
    });

    it('should handle FFI transaction failure', async () => {
      (FFIBindings.walletSendTransaction as jest.Mock).mockRejectedValue(
        new Error('FFI transaction failed')
      );

      await expect(
        sender.sendOneSidedTransaction(validRecipient, validAmount)
      ).rejects.toThrow(WalletError);
    });

    it('should handle fee estimation failure', async () => {
      mockFeeEstimator.estimateFeePerGram.mockRejectedValue(
        new Error('Fee estimation failed')
      );

      await expect(
        sender.sendOneSidedTransaction(validRecipient, validAmount)
      ).rejects.toThrow(WalletError);
    });

    it('should handle stealth address generation failure', async () => {
      (FFIBindings.walletGenerateStealthAddress as jest.Mock).mockRejectedValue(
        new Error('Stealth generation failed')
      );

      const options: OneSidedSendOptions = { useStealth: true };

      await expect(
        sender.sendOneSidedTransaction(validRecipient, validAmount, options)
      ).rejects.toThrow(WalletError);
    });
  });

  describe('validateOneSidedTransaction', () => {
    const validRecipient = 'test-recipient';
    const validAmount = BigInt(1000) as MicroTari;

    it('should validate successful one-sided transaction', async () => {
      const result = await sender.validateOneSidedTransaction(validRecipient, validAmount);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.estimatedFee).toBeGreaterThan(0n);
      expect(result.totalCost).toBe(validAmount + result.estimatedFee);
    });

    it('should include warnings for large amounts', async () => {
      const largeAmount = BigInt(2000000) as MicroTari;

      const result = await sender.validateOneSidedTransaction(validRecipient, largeAmount);

      expect(result.warnings).toContain(
        'Large one-sided transaction may take time for recipient to detect'
      );
    });

    it('should recommend stealth addressing', async () => {
      const result = await sender.validateOneSidedTransaction(validRecipient, validAmount);

      expect(result.warnings).toContain(
        'Consider using stealth addressing for enhanced privacy'
      );
    });

    it('should not recommend stealth when already enabled', async () => {
      const options: OneSidedSendOptions = { useStealth: true };

      const result = await sender.validateOneSidedTransaction(validRecipient, validAmount, options);

      expect(result.warnings).not.toContain(
        'Consider using stealth addressing for enhanced privacy'
      );
    });

    it('should return validation errors for invalid recipient', async () => {
      // Mock recipient validator to throw error
      const mockValidateAndResolve = jest.fn().mockRejectedValue(
        new WalletError(WalletErrorCode.INVALID_ADDRESS, 'Invalid address')
      );
      
      // Access the private validator and mock it
      (sender as any).recipientValidator = { validateAndResolve: mockValidateAndResolve };

      const result = await sender.validateOneSidedTransaction('invalid-recipient', validAmount);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid address');
    });

    it('should return validation errors for invalid amount', async () => {
      const invalidAmount = BigInt(0) as MicroTari;

      const result = await sender.validateOneSidedTransaction(validRecipient, invalidAmount);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount must be greater than zero');
    });

    it('should handle fee estimation failure in validation', async () => {
      mockFeeEstimator.estimateFeePerGram.mockRejectedValue(
        new Error('Fee estimation failed')
      );

      const result = await sender.validateOneSidedTransaction(validRecipient, validAmount);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Failed to estimate one-sided transaction fee');
    });

    it('should include UTXO consumption analysis', async () => {
      const result = await sender.validateOneSidedTransaction(validRecipient, validAmount);

      expect(result.utxoConsumption).toEqual({
        inputCount: 1,
        outputCount: 1,
        scriptComplexity: 1
      });
    });

    it('should adjust script complexity for stealth addressing', async () => {
      const options: OneSidedSendOptions = { useStealth: true };

      const result = await sender.validateOneSidedTransaction(validRecipient, validAmount, options);

      expect(result.utxoConsumption.scriptComplexity).toBe(2);
    });
  });

  describe('fee estimation', () => {
    it('should apply complexity multiplier for standard one-sided transaction', async () => {
      mockFeeEstimator.estimateFeePerGram.mockResolvedValue(BigInt(100) as MicroTari);

      const result = await (sender as any).estimateOneSidedFee(
        BigInt(1000) as MicroTari,
        false
      );

      expect(result).toBe(BigInt(120)); // 100 * 1.2 multiplier
    });

    it('should apply higher complexity multiplier for stealth transactions', async () => {
      mockFeeEstimator.estimateFeePerGram.mockResolvedValue(BigInt(100) as MicroTari);

      const result = await (sender as any).estimateOneSidedFee(
        BigInt(1000) as MicroTari,
        true
      );

      expect(result).toBe(BigInt(150)); // 100 * 1.5 multiplier
    });
  });

  describe('UTXO analysis', () => {
    it('should analyze UTXO consumption successfully', async () => {
      const result = await (sender as any).analyzeUtxoConsumption(
        BigInt(1000) as MicroTari,
        BigInt(100) as MicroTari
      );

      expect(result).toEqual({
        inputCount: 1,
        outputCount: 1,
        scriptComplexity: 2
      });
    });

    it('should fallback to estimation on FFI failure', async () => {
      (FFIBindings.walletPreviewUtxoSelection as jest.Mock).mockRejectedValue(
        new Error('FFI failed')
      );

      const result = await (sender as any).analyzeUtxoConsumption(
        BigInt(1000) as MicroTari,
        BigInt(100) as MicroTari
      );

      expect(result).toEqual({
        inputCount: 1,
        outputCount: 1,
        scriptComplexity: 2
      });
    });
  });

  describe('stealth address generation', () => {
    it('should generate stealth address successfully', async () => {
      const result = await (sender as any).generateStealthAddress(mockRecipientAddress);

      expect(result).toBe(mockRecipientAddress);
      expect(FFIBindings.walletGenerateStealthAddress).toHaveBeenCalledWith(
        mockWalletHandle,
        mockRecipientAddress.handle
      );
    });

    it('should handle stealth address generation failure', async () => {
      (FFIBindings.walletGenerateStealthAddress as jest.Mock).mockRejectedValue(
        new Error('Stealth generation failed')
      );

      await expect(
        (sender as any).generateStealthAddress(mockRecipientAddress)
      ).rejects.toThrow(WalletError);
    });
  });
});
