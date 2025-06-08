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
      expect(mockBinding.wallet_create).toHaveBeenCalledWith(config);
    });

    it('should throw if wallet creation fails', () => {
      mockBinding.wallet_create.mockReturnValueOnce(null);

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
      expect(mockBinding.wallet_get_balance).toHaveBeenCalledWith(handle);
    });

    it('should throw for invalid handle', () => {
      expect(() => getBalance(999 as any)).toThrow('Invalid wallet handle');
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

      // Mock address conversion
      mockBinding.tari_address_from_emoji_id.mockReturnValueOnce(123);
      mockBinding.wallet_send_transaction.mockReturnValueOnce(456n);

      const txId = sendTransaction(handle, params);

      expect(txId).toBe(456n);
      expect(mockBinding.tari_address_from_emoji_id).toHaveBeenCalledWith(params.destination);
      expect(mockBinding.wallet_send_transaction).toHaveBeenCalledWith(
        handle,
        123, // destination handle
        params.amount,
        5n, // default fee
        params.message,
        true // oneSided default
      );
    });

    it('should throw for invalid destination', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      mockBinding.tari_address_from_emoji_id.mockReturnValueOnce(null);

      expect(() => 
        sendTransaction(handle, {
          destination: 'invalid_address',
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

      mockBinding.wallet_get_tari_address.mockReturnValueOnce(123);
      mockBinding.tari_address_to_emoji_id.mockReturnValueOnce('🎉🎨🎭🎪🎯🎲🎸🎺');
      mockBinding.tari_address_get_bytes.mockReturnValueOnce(456);

      const address = getAddress(handle);

      expect(address).toEqual({
        handle: 123,
        emojiId: '🎉🎨🎭🎪🎯🎲🎸🎺',
        bytes: new Uint8Array(0) // TODO: implement proper conversion
      });
    });

    it('should throw for invalid wallet handle', () => {
      expect(() => getAddress(999 as any)).toThrow('Invalid wallet handle');
    });
  });

  describe('getSeedWords', () => {
    it('should retrieve seed words', () => {
      const seedWords = 'test seed words for recovery';
      const handle = createWallet({
        seedWords,
        network: Network.Testnet,
      });

      mockBinding.wallet_get_seed_words.mockReturnValueOnce(seedWords);

      const retrieved = getSeedWords(handle);
      expect(retrieved).toBe(seedWords);
    });

    it('should throw if seed words are null', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      mockBinding.wallet_get_seed_words.mockReturnValueOnce(null);

      expect(() => getSeedWords(handle)).toThrow('Failed to get seed words');
    });
  });

  describe('getAllUtxos', () => {
    it('should get wallet utxos', () => {
      const handle = createWallet({
        seedWords: 'test',
        network: Network.Testnet,
      });

      // Mock UTXO operations
      mockBinding.wallet_get_utxos.mockReturnValueOnce(789);
      mockBinding.utxos_get_length.mockReturnValueOnce(1);
      mockBinding.utxos_get_at.mockReturnValueOnce(101);
      mockBinding.utxo_get_commitment.mockReturnValueOnce('commitment_1');
      mockBinding.utxo_get_value.mockReturnValueOnce(1000000n);
      mockBinding.utxo_get_mined_height.mockReturnValueOnce(100);
      mockBinding.utxo_get_mined_timestamp.mockReturnValueOnce(1234567890n);
      mockBinding.utxo_get_lock_height.mockReturnValueOnce(0);
      mockBinding.utxo_get_status.mockReturnValueOnce(0);

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

      mockBinding.wallet_get_utxos.mockReturnValueOnce(null);

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

      expect(mockBinding.wallet_destroy).toHaveBeenCalledWith(handle);
    });

    it('should throw for invalid handle', () => {
      expect(() => destroyWallet(999 as any)).toThrow('Invalid wallet handle');
    });
  });
});
