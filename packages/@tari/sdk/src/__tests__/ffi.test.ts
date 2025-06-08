import { Network } from '../types';

// Mock the bindings module
jest.mock('../bindings', () => ({
  binding: require('../__mocks__/bindings').mockBinding,
}));

import { 
  createWallet, 
  destroyWallet, 
  getBalance, 
  getAddress, 
  sendTransaction,
  getSeedWords,
  getAllUtxos
} from '../ffi';
import { mockBinding } from '../__mocks__/bindings';

describe('FFI Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createWallet', () => {
    it('should create a wallet with valid config', () => {
      const config = {
        seedWords: 'test seed words',
        network: Network.Testnet,
        dbPath: './test-db',
      };

      const handle = createWallet(config);

      expect(handle).toBeDefined();
      expect(mockBinding.walletCreate).toHaveBeenCalledWith(config);
    });

    it('should throw if wallet creation fails', () => {
      mockBinding.walletCreate.mockReturnValueOnce(null);

      expect(() => 
        createWallet({ seedWords: 'test', network: Network.Testnet })
      ).toThrow('Failed to create wallet');
    });
  });

  describe('getBalance', () => {
    it('should return balance from FFI', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const balance = getBalance(handle);

      expect(balance).toEqual({
        available: 1000000000n,
        pending: 0n,
        locked: 0n,
        total: 1000000000n,
      });
      expect(mockBinding.walletGetBalance).toHaveBeenCalledWith(handle);
    });

    it('should throw for invalid handle', () => {
      // Mock walletGetBalance to return null for invalid handle
      mockBinding.walletGetBalance.mockReturnValueOnce(null);
      expect(() => getBalance(999 as any)).toThrow('Failed to get balance');
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction successfully', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const params = {
        destination: 'destination_emoji_id',
        amount: 1000000n,
        message: 'Test transaction'
      };

      const txId = sendTransaction(handle, params);

      // Should return a BigInt (converted from string transaction ID)
      expect(typeof txId).toBe('bigint');
      expect(mockBinding.walletSendTransaction).toHaveBeenCalledWith(handle, {
        destination: params.destination,
        amount: params.amount.toString(),
        feePerGram: '5',
        message: params.message,
        oneSided: true
      });
    });

    it('should throw for invalid destination', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      expect(() => 
        sendTransaction(handle, {
          destination: '',
          amount: 1000n
        })
      ).toThrow('Invalid destination address');
    });
  });

  describe('getAddress', () => {
    it('should return address info', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const address = getAddress(handle);

      expect(address).toEqual({
        handle: expect.any(Number),
        emojiId: '🎉🎨🎭🎪🎯🎲🎸🎺',
        bytes: new Uint8Array(0) // TODO: implement proper conversion
      });
    });

    it('should throw for invalid wallet handle', () => {
      // Mock walletGetAddress to return null for invalid handle
      mockBinding.walletGetAddress.mockReturnValueOnce(null);
      expect(() => getAddress(999 as any)).toThrow('Failed to get address');
    });
  });

  describe('getSeedWords', () => {
    it('should retrieve seed words', () => {
      const seedWords = 'test seed words for recovery';
      const handle = createWallet({
        seedWords,
        network: Network.Testnet,
      });

      const retrieved = getSeedWords(handle);
      expect(retrieved).toBe(seedWords);
    });

    it('should throw if seed words are null', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      mockBinding.walletGetSeedWords.mockReturnValueOnce(null);

      expect(() => getSeedWords(handle)).toThrow('Failed to get seed words');
    });
  });

  describe('getAllUtxos', () => {
    it('should get wallet utxos', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      const utxos = getAllUtxos(handle);
      
      expect(utxos).toHaveLength(1);
      expect(utxos[0]).toMatchObject({
        commitment: 'commitment_1',
        value: 1000000n,
        minedHeight: 100,
        status: 0,
      });
    });

    it('should return empty array if no UTXOs', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      mockBinding.walletGetUtxos.mockReturnValueOnce([]);

      const utxos = getAllUtxos(handle);
      expect(utxos).toEqual([]);
    });
  });

  describe('destroyWallet', () => {
    it('should properly destroy wallet handle', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      destroyWallet(handle);

      expect(mockBinding.walletDestroy).toHaveBeenCalledWith(handle);
    });

    it('should throw for invalid handle', () => {
      expect(() => destroyWallet(0 as any)).toThrow('Invalid wallet handle');
    });
  });
});
