/**
 * @fileoverview Tests for RecipientValidator
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  WalletError, 
  WalletErrorCode,
  FFIBindings 
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../../models';
import { RecipientValidator } from '../recipient-validator';

// Mock FFI bindings
jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  FFIBindings: {
    emojiIdToPublicKey: jest.fn(),
  },
  withErrorContext: jest.fn((_, __) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
  validateTariAddress: jest.fn(),
  validateRequired: jest.fn()
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

describe('RecipientValidator', () => {
  let validator: RecipientValidator;
  let mockTariAddress: jest.Mocked<TariAddress>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTariAddress = {
      handle: 'mock-address-handle',
      toDisplayString: jest.fn().mockReturnValue('mock-address-display'),
    } as any;

    (TariAddress.fromString as jest.Mock).mockResolvedValue(mockTariAddress);
    (TariAddress.fromPublicKey as jest.Mock).mockResolvedValue(mockTariAddress);
    (TariAddress.fromBase58 as jest.Mock).mockResolvedValue(mockTariAddress);
    (TariAddress.fromHex as jest.Mock).mockResolvedValue(mockTariAddress);
    (TariAddress.empty as jest.Mock).mockReturnValue(mockTariAddress);

    validator = new RecipientValidator();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateAndResolve', () => {
    it('should validate and resolve a valid string address', async () => {
      const address = 'valid-address-string';
      
      const result = await validator.validateAndResolve(address);
      
      expect(result).toBe(mockTariAddress);
      expect(TariAddress.fromString).toHaveBeenCalledWith(address);
    });

    it('should return TariAddress object directly when provided', async () => {
      const result = await validator.validateAndResolve(mockTariAddress);
      
      expect(result).toBe(mockTariAddress);
      expect(TariAddress.fromString).not.toHaveBeenCalled();
    });

    it('should cache resolved addresses', async () => {
      const address = 'valid-address-string';
      
      // First call
      await validator.validateAndResolve(address);
      // Second call
      await validator.validateAndResolve(address);
      
      // Should only call fromString once due to caching
      expect(TariAddress.fromString).toHaveBeenCalledTimes(1);
    });

    it('should handle emoji ID resolution', async () => {
      const emojiId = '🚀🌙⭐';
      const mockPublicKey = 'mock-public-key';
      
      // Mock emoji ID resolution
      (TariAddress.fromString as jest.Mock).mockRejectedValueOnce(new Error('Not direct format'));
      (FFIBindings.emojiIdToPublicKey as jest.Mock).mockResolvedValue(mockPublicKey);
      
      const result = await validator.validateAndResolve(emojiId);
      
      expect(result).toBe(mockTariAddress);
      expect(FFIBindings.emojiIdToPublicKey).toHaveBeenCalledWith(emojiId);
      expect(TariAddress.fromPublicKey).toHaveBeenCalledWith(mockPublicKey);
    });

    it('should handle base58 address resolution', async () => {
      const base58Address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      
      // Mock direct resolution failure
      (TariAddress.fromString as jest.Mock).mockRejectedValueOnce(new Error('Not direct format'));
      
      const result = await validator.validateAndResolve(base58Address);
      
      expect(result).toBe(mockTariAddress);
      expect(TariAddress.fromBase58).toHaveBeenCalledWith(base58Address);
    });

    it('should handle hex address resolution', async () => {
      const hexAddress = '0x1234567890abcdef';
      
      // Mock direct resolution failure and other formats
      (TariAddress.fromString as jest.Mock).mockRejectedValueOnce(new Error('Not direct format'));
      (TariAddress.fromBase58 as jest.Mock).mockRejectedValueOnce(new Error('Not base58'));
      
      const result = await validator.validateAndResolve(hexAddress);
      
      expect(result).toBe(mockTariAddress);
      expect(TariAddress.fromHex).toHaveBeenCalledWith(hexAddress);
    });

    it('should throw error for unresolvable address', async () => {
      const invalidAddress = 'completely-invalid-address';
      
      // Mock all resolution methods to fail
      (TariAddress.fromString as jest.Mock).mockRejectedValue(new Error('Not direct format'));
      (TariAddress.fromBase58 as jest.Mock).mockRejectedValue(new Error('Not base58'));
      (TariAddress.fromHex as jest.Mock).mockRejectedValue(new Error('Not hex'));
      
      await expect(
        validator.validateAndResolve(invalidAddress)
      ).rejects.toThrow(WalletError);
    });

    it('should prevent self-send by default', async () => {
      // Mock self-send detection to return true
      jest.spyOn(validator, 'isSelfSend').mockResolvedValue(true);
      
      await expect(
        validator.validateAndResolve('self-address')
      ).rejects.toThrow(WalletError);
    });

    it('should allow self-send when explicitly enabled', async () => {
      // Mock self-send detection to return true
      jest.spyOn(validator, 'isSelfSend').mockResolvedValue(true);
      
      const result = await validator.validateAndResolve('self-address', true);
      
      expect(result).toBe(mockTariAddress);
    });
  });

  describe('validateMultipleRecipients', () => {
    it('should validate multiple valid recipients', async () => {
      const recipients = ['address1', 'address2', 'address3'];
      
      const results = await validator.validateMultipleRecipients(recipients);
      
      expect(results).toHaveLength(3);
      expect(results.every(addr => addr === mockTariAddress)).toBe(true);
    });

    it('should throw error for empty recipients array', async () => {
      await expect(
        validator.validateMultipleRecipients([])
      ).rejects.toThrow(WalletError);
    });

    it('should detect duplicate addresses', async () => {
      const recipients = ['address1', 'address1']; // Duplicate
      
      await expect(
        validator.validateMultipleRecipients(recipients)
      ).rejects.toThrow(WalletError);
    });

    it('should handle validation error for specific recipient', async () => {
      const recipients = ['valid-address', 'invalid-address'];
      
      // Mock the second address to fail
      (TariAddress.fromString as jest.Mock)
        .mockResolvedValueOnce(mockTariAddress)
        .mockRejectedValueOnce(new Error('Invalid address'));
      
      await expect(
        validator.validateMultipleRecipients(recipients)
      ).rejects.toThrow(WalletError);
    });
  });

  describe('isValidAddressFormat', () => {
    it('should return true for valid address format', () => {
      const result = validator.isValidAddressFormat('valid-address');
      
      expect(result).toBe(true);
    });

    it('should return false for empty string', () => {
      const result = validator.isValidAddressFormat('');
      
      expect(result).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(validator.isValidAddressFormat(null as any)).toBe(false);
      expect(validator.isValidAddressFormat(undefined as any)).toBe(false);
    });

    it('should handle whitespace correctly', () => {
      const result = validator.isValidAddressFormat('   ');
      
      expect(result).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should clear cache correctly', async () => {
      const address = 'test-address';
      
      // First resolution
      await validator.validateAndResolve(address);
      expect(TariAddress.fromString).toHaveBeenCalledTimes(1);
      
      // Clear cache
      validator.clearCache();
      
      // Second resolution should call fromString again
      await validator.validateAndResolve(address);
      expect(TariAddress.fromString).toHaveBeenCalledTimes(2);
    });

    it('should provide cache statistics', () => {
      const stats = validator.getCacheStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitCount');
      expect(stats).toHaveProperty('missCount');
      expect(typeof stats.size).toBe('number');
    });
  });

  describe('address format detection', () => {
    it('should detect emoji addresses', () => {
      // Test private method through validation
      const emojiAddress = '🚀🌙⭐';
      expect(validator.isValidAddressFormat(emojiAddress)).toBe(true);
    });

    it('should detect base58 addresses', () => {
      const base58Address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(validator.isValidAddressFormat(base58Address)).toBe(true);
    });

    it('should detect hex addresses', () => {
      const hexAddress = '0x1234567890abcdef';
      expect(validator.isValidAddressFormat(hexAddress)).toBe(true);
      
      const hexWithoutPrefix = '1234567890abcdef';
      expect(validator.isValidAddressFormat(hexWithoutPrefix)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle FFI errors gracefully', async () => {
      const emojiId = '🚀🌙⭐';
      
      (TariAddress.fromString as jest.Mock).mockRejectedValue(new Error('Not direct format'));
      (FFIBindings.emojiIdToPublicKey as jest.Mock).mockRejectedValue(new Error('FFI error'));
      
      await expect(
        validator.validateAndResolve(emojiId)
      ).rejects.toThrow(WalletError);
    });

    it('should handle self-send detection failure gracefully', async () => {
      // Mock self-send check to fail
      jest.spyOn(validator, 'isSelfSend').mockRejectedValue(new Error('Detection failed'));
      
      // Should not throw but proceed with transaction
      const result = await validator.validateAndResolve('test-address');
      expect(result).toBe(mockTariAddress);
    });
  });
});
