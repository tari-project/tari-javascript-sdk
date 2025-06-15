/**
 * @fileoverview Tests for TariWallet class
 */

import { TariWallet } from './index';
import { NetworkType } from '@tari-project/tarijs-core';

describe('TariWallet', () => {
  const validConfig = {
    network: NetworkType.Testnet,
    storagePath: '/tmp/test-wallet',
    logLevel: 2, // info
  };

  describe('Configuration Validation', () => {
    it('should create wallet with valid config', async () => {
      const wallet = await TariWallet.create(validConfig);
      expect(wallet).toBeInstanceOf(TariWallet);
      expect(wallet.isDestroyed).toBe(false);
      expect(wallet.id).toBeDefined();
      
      await wallet.destroy();
    });

    it('should throw error for missing network', async () => {
      const invalidConfig = { ...validConfig, network: undefined as any };
      await expect(TariWallet.create(invalidConfig)).rejects.toThrow('Network configuration is required');
    });

    it('should throw error for missing storage path', async () => {
      const invalidConfig = { ...validConfig, storagePath: '' };
      await expect(TariWallet.create(invalidConfig)).rejects.toThrow('Storage path is required');
    });

    it('should throw error for invalid log file count', async () => {
      const invalidConfig = { ...validConfig, numRollingLogFiles: 0 };
      await expect(TariWallet.create(invalidConfig)).rejects.toThrow('Number of rolling log files must be at least 1');
    });

    it('should throw error for invalid log file size', async () => {
      const invalidConfig = { ...validConfig, rollingLogFileSize: 0 };
      await expect(TariWallet.create(invalidConfig)).rejects.toThrow('Rolling log file size must be at least 1 byte');
    });
  });

  describe('Wallet Restoration', () => {
    const validSeedWords = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual'
    ];

    it('should create wallet from valid seed words', async () => {
      const wallet = await TariWallet.restore(validSeedWords, validConfig);
      expect(wallet).toBeInstanceOf(TariWallet);
      
      await wallet.destroy();
    });

    it('should throw error for invalid seed word count', async () => {
      const invalidSeeds = ['abandon', 'ability'];
      await expect(TariWallet.restore(invalidSeeds, validConfig)).rejects.toThrow('Invalid word count');
    });

    it('should throw error for empty seed words', async () => {
      await expect(TariWallet.restore([], validConfig)).rejects.toThrow('Seed phrase cannot be empty');
    });
  });

  describe('Wallet Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      wallet = await TariWallet.create(validConfig);
    });

    afterEach(async () => {
      if (!wallet.isDestroyed) {
        await wallet.destroy();
      }
    });

    it('should get wallet address successfully', async () => {
      const address = await wallet.getAddress();
      expect(address).toBeDefined();
      expect(typeof address.normalized).toBe('string');
    });

    it('should get wallet balance successfully', async () => {
      const balance = await wallet.getBalance();
      expect(balance).toBeDefined();
      expect(typeof balance.total).toBe('bigint');
    });

    it('should throw not implemented for sendTransaction', async () => {
      await expect(wallet.sendTransaction('test_address', 1000n)).rejects.toThrow('not yet implemented');
    });

    it('should throw error for zero amount transaction', async () => {
      await expect(wallet.sendTransaction('test_address', 0n)).rejects.toThrow('Transaction amount must be positive');
    });

    it('should throw error for negative amount transaction', async () => {
      await expect(wallet.sendTransaction('test_address', -100n)).rejects.toThrow('Transaction amount must be positive');
    });

    it('should throw not implemented for other operations', async () => {
      await expect(wallet.getTransactions()).rejects.toThrow('not yet implemented');
      await expect(wallet.getContacts()).rejects.toThrow('not yet implemented');
      await expect(wallet.sync()).rejects.toThrow('not yet implemented');
      await expect(wallet.getSeedWords()).rejects.toThrow('not yet implemented');
      await expect(wallet.signMessage('test')).rejects.toThrow('not yet implemented');
    });
  });

  describe('Wallet Lifecycle', () => {
    it('should provide safe config without sensitive data', async () => {
      const configWithSecrets = {
        ...validConfig,
        passphrase: 'secret123',
        seedWords: ['abandon', 'ability'],
      };

      const wallet = await TariWallet.create(configWithSecrets);
      const safeConfig = wallet.getConfig();

      expect(safeConfig.network).toBe(NetworkType.Testnet);
      expect(safeConfig.storagePath).toBe('/tmp/test-wallet');
      expect(safeConfig).not.toHaveProperty('passphrase');
      expect(safeConfig).not.toHaveProperty('seedWords');

      await wallet.destroy();
    });

    it('should prevent operations after destruction', async () => {
      const wallet = await TariWallet.create(validConfig);
      await wallet.destroy();

      expect(wallet.isDestroyed).toBe(true);
      await expect(wallet.getBalance()).rejects.toThrow('Cannot use wallet after it has been destroyed');
    });

    it('should allow multiple destroy calls', async () => {
      const wallet = await TariWallet.create(validConfig);
      await wallet.destroy();
      await wallet.destroy(); // Should not throw
      
      expect(wallet.isDestroyed).toBe(true);
    });
  });

  describe('Event Handling', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      wallet = await TariWallet.create(validConfig);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    it('should register and unregister event handlers', () => {
      const handler = jest.fn();
      
      wallet.on('onBalanceUpdated', handler);
      wallet.off('onBalanceUpdated', handler);
      
      // No errors should be thrown
      expect(true).toBe(true);
    });
  });
});
