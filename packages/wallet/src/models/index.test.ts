/**
 * @fileoverview Tests for wallet models
 */

import { TariAddress, Balance, TransactionId } from './index';
import { NetworkType } from '@tari-project/tarijs-core';

describe('Wallet Models', () => {
  describe('TariAddress', () => {
    const mockComponents = {
      publicKey: 'test_public_key',
      network: NetworkType.Testnet,
      checksum: 123,
    };

    it('should create address with valid components', () => {
      const address = new TariAddress(mockComponents);
      expect(address.publicKey).toBe('test_public_key');
      expect(address.network).toBe(NetworkType.Testnet);
    });

    it('should throw error for missing public key', () => {
      const invalidComponents = { ...mockComponents, publicKey: '' };
      expect(() => new TariAddress(invalidComponents)).toThrow('Address public key is required');
    });

    it('should throw error for missing network', () => {
      const invalidComponents = { ...mockComponents, network: undefined as any };
      expect(() => new TariAddress(invalidComponents)).toThrow('Address network is required');
    });

    it('should check equality correctly', () => {
      const address1 = new TariAddress(mockComponents);
      const address2 = new TariAddress(mockComponents);
      const address3 = new TariAddress({ ...mockComponents, publicKey: 'different_key' });

      expect(address1.equals(address2)).toBe(true);
      expect(address1.equals(address3)).toBe(false);
    });

    it('should throw not implemented for conversion methods', () => {
      const address = new TariAddress(mockComponents);
      
      expect(() => address.toBase58()).toThrow('not yet implemented');
      expect(() => address.toEmojiId()).toThrow('not yet implemented');
      expect(() => address.toString()).toThrow('not yet implemented');
    });
  });

  describe('Balance', () => {
    const mockBalance = {
      available: 1000n,
      pendingIncoming: 200n,
      pendingOutgoing: 100n,
      timelocked: 50n,
    };

    it('should provide correct balance properties', () => {
      const balance = new Balance(mockBalance);
      
      expect(balance.available).toBe(1000n);
      expect(balance.pendingIncoming).toBe(200n);
      expect(balance.pendingOutgoing).toBe(100n);
      expect(balance.timelocked).toBe(50n);
    });

    it('should calculate total balance correctly', () => {
      const balance = new Balance(mockBalance);
      expect(balance.total).toBe(1200n); // available + pendingIncoming
    });

    it('should calculate spendable balance correctly', () => {
      const balance = new Balance(mockBalance);
      expect(balance.spendable).toBe(900n); // available - pendingOutgoing
    });

    it('should check sufficient balance correctly', () => {
      const balance = new Balance(mockBalance);
      
      expect(balance.hasEnoughFor(500n)).toBe(true);
      expect(balance.hasEnoughFor(1000n)).toBe(false);
      expect(balance.hasEnoughFor(900n)).toBe(true);
    });

    it('should convert to JSON correctly', () => {
      const balance = new Balance(mockBalance);
      const json = balance.toJSON();
      
      expect(json).toEqual(mockBalance);
      expect(json).not.toBe(mockBalance); // Should be a copy
    });
  });

  describe('TransactionId', () => {
    it('should create from bigint', () => {
      const txId = new TransactionId(123n);
      expect(txId.toBigInt()).toBe(123n);
      expect(txId.toString()).toBe('123');
    });

    it('should create from string', () => {
      const txId = new TransactionId('456');
      expect(txId.toBigInt()).toBe(456n);
      expect(txId.toString()).toBe('456');
    });

    it('should create from number', () => {
      const txId = new TransactionId(789);
      expect(txId.toBigInt()).toBe(789n);
      expect(txId.toString()).toBe('789');
    });

    it('should throw error for negative values', () => {
      expect(() => new TransactionId(-1)).toThrow('must be non-negative');
      expect(() => new TransactionId(-1n)).toThrow('must be non-negative');
    });

    it('should check equality correctly', () => {
      const txId1 = new TransactionId(123n);
      const txId2 = new TransactionId('123');
      const txId3 = new TransactionId(456n);

      expect(txId1.equals(txId2)).toBe(true);
      expect(txId1.equals(txId3)).toBe(false);
    });
  });
});
