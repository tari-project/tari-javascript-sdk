/**
 * @fileoverview Tests for RecipientValidator
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  WalletError, 
  WalletErrorCode,
  FFIBindings,
  TariAddress
} from '@tari-project/tarijs-core';

import { RecipientValidator } from '../recipient-validator';
import { AddressFactory } from '../../../testing/factories';

// Mock FFI bindings and TariAddress
jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  TariAddress: Object.assign(
    jest.fn().mockImplementation(() => ({
      handle: 'mock-address-handle',
      toDisplayString: jest.fn().mockReturnValue('mock-address-display'),
    })),
    {
      fromString: jest.fn(),
      fromPublicKey: jest.fn(),
      fromBase58: jest.fn(),
      fromHex: jest.fn(),
      empty: jest.fn(),
    }
  ),
  FFIBindings: {
    emojiIdToPublicKey: jest.fn(),
  },
  withErrorContext: jest.fn((_, __) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor),
  validateTariAddress: jest.fn(),
  validateRequired: jest.fn()
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

    // Make fromString return unique mock addresses to avoid duplicate detection
    let callCount = 0;
    (TariAddress.fromString as jest.Mock).mockImplementation(() => {
      callCount++;
      return {
        handle: `mock-address-handle-${callCount}`,
        toDisplayString: jest.fn().mockReturnValue(`mock-address-display-${callCount}`),
      };
    });
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
      const address = AddressFactory.base58();
      
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
      const address = AddressFactory.base58();
      
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
      const base58Address = AddressFactory.base58();
      
      // Mock direct resolution failure
      (TariAddress.fromString as jest.Mock).mockRejectedValueOnce(new Error('Not direct format'));
      
      const result = await validator.validateAndResolve(base58Address);
      
      expect(result).toBe(mockTariAddress);
      expect(TariAddress.fromBase58).toHaveBeenCalledWith(base58Address);
    });

    it('should handle hex address resolution', async () => {
      const hexAddress = AddressFactory.hex();
      
      // Mock direct resolution failure and other formats
      (TariAddress.fromString as jest.Mock).mockRejectedValueOnce(new Error('Not direct format'));
      (TariAddress.fromBase58 as jest.Mock).mockRejectedValueOnce(new Error('Not base58'));
      
      const result = await validator.validateAndResolve(hexAddress);
      
      expect(result).toBe(mockTariAddress);
      expect(TariAddress.fromHex).toHaveBeenCalledWith(hexAddress);
    });

    it('should throw error for unresolvable address', async () => {
      const invalidAddress = AddressFactory.invalid();
      
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
      const recipients = ['valid-addr1', 'valid-addr2', 'valid-addr3'];
      
      const results = await validator.validateMultipleRecipients(recipients);
      
      expect(results).toHaveLength(3);
      expect(results.every(addr => addr && typeof addr.handle === 'string')).toBe(true);
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
      const recipients = [AddressFactory.base58(), AddressFactory.invalid()];
      
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
      const address = AddressFactory.base58();
      
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
      const base58Address = AddressFactory.base58();
      expect(validator.isValidAddressFormat(base58Address)).toBe(true);
    });

    it('should detect hex addresses', () => {
      const hexAddress = AddressFactory.hex();
      expect(validator.isValidAddressFormat(hexAddress)).toBe(true);
      
      const hexWithoutPrefix = AddressFactory.hex();
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
      const result = await validator.validateAndResolve(AddressFactory.invalid());
      expect(result).toBe(mockTariAddress);
    });
  });
});
