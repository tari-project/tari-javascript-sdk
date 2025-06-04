import { Network } from '../ffi-types';

// Mock the bindings module
jest.mock('../bindings', () => ({
  binding: require('../__mocks__/bindings').mockBinding,
}));

import { FFIWrapper } from '../wrapper';
import { mockBinding } from '../__mocks__/bindings';

describe('FFIWrapper', () => {
  let wrapper: FFIWrapper;

  beforeEach(() => {
    wrapper = new FFIWrapper();
    jest.clearAllMocks();
  });

  describe('createWallet', () => {
    it('should create a wallet with valid config', () => {
      const config = {
        seedWords: 'test seed words',
        network: Network.Testnet,
        dbPath: './test-db',
      };

      const handle = wrapper.createWallet(config);

      expect(handle).toBeDefined();
      expect(mockBinding.walletCreate).toHaveBeenCalledWith(config);
    });

    it('should throw if wallet creation fails', () => {
      mockBinding.walletCreate.mockReturnValueOnce(null);

      expect(() => 
        wrapper.createWallet({ seedWords: 'test', network: Network.Testnet })
      ).toThrow('Failed to create wallet');
    });

    it('should handle empty seed words', () => {
      expect(() => 
        wrapper.createWallet({ seedWords: '', network: Network.Testnet })
      ).toThrow('Seed words are required');
    });
  });

  describe('getBalance', () => {
    it('should return parsed balance', () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const balance = wrapper.getBalance(handle);

      expect(balance).toEqual({
        available: 1000000000n,
        pending: 0n,
        locked: 0n,
        total: 1000000000n,
      });
    });

    it('should handle large balances', () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      mockBinding.walletGetBalance.mockReturnValueOnce({
        available: '999999999999999999',
        pending: '1000000000',
        locked: '0',
        total: '1000000000999999999',
      });

      const balance = wrapper.getBalance(handle);

      expect(balance.total).toBe(1000000000999999999n);
    });

    it('should throw for invalid handle', () => {
      expect(() => wrapper.getBalance(999 as any)).toThrow('Invalid wallet handle');
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction successfully', async () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const txId = await wrapper.sendTransaction(
        handle,
        'destination_address',
        1000000n,
        5n,
        'Test transaction'
      );

      expect(txId).toMatch(/^tx_\d+_[a-z0-9]+$/);
      expect(mockBinding.walletSendTransaction).toHaveBeenCalledWith(handle, {
        destination: 'destination_address',
        amount: '1000000',
        feePerGram: '5',
        message: 'Test transaction',
        oneSided: true,
      });
    });

    it('should validate amount', async () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      await expect(
        wrapper.sendTransaction(handle, 'dest', 0n)
      ).rejects.toThrow('Amount must be greater than 0');
    });

    it('should validate destination', async () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      await expect(
        wrapper.sendTransaction(handle, '', 1000n)
      ).rejects.toThrow('Destination address is required');
    });
  });

  describe('address management', () => {
    it('should create and destroy address', () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const address = wrapper.getAddress(handle);
      expect(address.emojiId).toMatch(/^🎉🎨🎭🎪🎯🎲🎸🎺_\d+$/);

      wrapper.destroyAddress(address.handle);
      expect(mockBinding.addressDestroy).toHaveBeenCalledWith(address.handle);
    });
  });

  describe('resource cleanup', () => {
    it('should properly destroy wallet handle', () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      wrapper.destroyWallet(handle);

      expect(mockBinding.walletDestroy).toHaveBeenCalledWith(handle);
    });

    it('should handle destroying invalid handle', () => {
      expect(() => wrapper.destroyWallet(999 as any)).not.toThrow();
    });
  });

  describe('seed words', () => {
    it('should retrieve seed words', () => {
      const seedWords = 'test seed words for recovery';
      const handle = wrapper.createWallet({
        seedWords,
        network: Network.Testnet,
      });

      const retrieved = wrapper.getSeedWords(handle);
      expect(retrieved).toBe(seedWords);
    });
  });

  describe('utxos', () => {
    it('should get wallet utxos', () => {
      const handle = wrapper.createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const utxos = wrapper.getUtxos(handle);
      expect(utxos).toHaveLength(1);
      expect(utxos[0]).toMatchObject({
        value: '1000000',
        commitment: 'commitment_1',
        minedHeight: 100,
        status: 0,
      });
    });
  });
});
