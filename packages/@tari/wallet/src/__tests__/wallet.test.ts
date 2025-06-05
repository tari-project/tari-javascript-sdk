/* eslint-disable @typescript-eslint/no-var-requires */
import { TariWallet } from '../wallet';
import { Network } from '@tari-project/core';
import { WalletEvent } from '../types';

// Mock @tari-project/core
jest.mock('@tari-project/core', () => ({
...jest.requireActual('@tari-project/core'),
  initialize: jest.fn(),
  ffi: {
    createWallet: jest.fn(() => 1),
    destroyWallet: jest.fn(),
    getAddress: jest.fn(() => ({
      handle: 2,
      emojiId: '🎉🎨🎭🎪🎯🎲🎸🎺',
    })),
    getBalance: jest.fn(() => ({
      available: 1000000n,
      pending: 0n,
      locked: 0n,
      total: 1000000n,
    })),
    getSeedWords: jest.fn(() => 'test seed words'),
    sendTransaction: jest.fn(() => Promise.resolve('tx_123')),
    destroyAddress: jest.fn(),
    getUtxos: jest.fn(() => []),
  },
}));

describe('TariWallet', () => {
  let wallet: TariWallet;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    if (wallet) {
      await wallet.close();
    }
    jest.useRealTimers();
  });

  describe('Builder', () => {
    it('should build wallet with all options', () => {
      const wallet = TariWallet.builder()
        .network(Network.Testnet)
        .seedWords('test seed words')
        .passphrase('secret')
        .dataDirectory('./test-data')
        .baseNode('tcp://localhost:18142', 'public_key')
        .build();

      expect(wallet).toBeInstanceOf(TariWallet);
    });

    it('should throw if network not specified', () => {
      expect(() => 
        TariWallet.builder().seedWords('test').build()
      ).toThrow('Network is required');
    });

    it('should generate seed words if not provided', () => {
      const wallet = TariWallet.builder()
        .network(Network.Testnet)
        .build();

      expect(wallet).toBeInstanceOf(TariWallet);
    });
  });

  describe('Connection', () => {
    beforeEach(() => {
      wallet = new TariWallet({
        network: Network.Testnet,
        seedWords: 'test seed words',
      });
    });

    it('should connect successfully', async () => {
      const connectPromise = wallet.connect();
      
      await expect(connectPromise).resolves.toBeUndefined();
      expect(wallet.getReceiveAddress()).toBe('🎉🎨🎭🎪🎯🎲🎸🎺');
    });

    it('should emit connected event', async () => {
      const connectedHandler = jest.fn();
      wallet.on(WalletEvent.Connected, connectedHandler);

      await wallet.connect();

      expect(connectedHandler).toHaveBeenCalledWith({
        connected: true,
        baseNode: undefined,
        lastSeen: expect.any(Date),
      });
    });

    it('should throw if already connected', async () => {
      await wallet.connect();

      await expect(wallet.connect()).rejects.toThrow('Wallet already connected');
    });

    it('should handle connection timeout', async () => {
      const { ffi } = require('@tari-project/core');
      ffi.createWallet.mockImplementationOnce(() => {
        return new Promise((resolve) => setTimeout(() => resolve(1), 10000));
      });

      const connectPromise = wallet.connect();
      
      jest.advanceTimersByTime(5000);
      
      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });
  });

  describe('Operations', () => {
    beforeEach(async () => {
      wallet = new TariWallet({
        network: Network.Testnet,
        seedWords: 'test seed words',
      });
      await wallet.connect();
    });

    it('should get balance', async () => {
      const balance = await wallet.getBalance();

      expect(balance).toEqual({
        available: 1000000n,
        pending: 0n,
        locked: 0n,
        total: 1000000n,
      });
    });

    it('should send transaction', async () => {
      const tx = await wallet.sendTransaction({
        destination: 'recipient_address',
        amount: 100000n,
        feePerGram: 5n,
        message: 'Test payment',
      });

      expect(tx).toMatchObject({
        id: 'tx_123',
        amount: 100000n,
        destination: 'recipient_address',
        status: expect.any(Number),
        message: 'Test payment',
        timestamp: expect.any(Date),
        isOutbound: true,
      });
    });

    it('should validate transaction amount', async () => {
      await expect(
        wallet.sendTransaction({
          destination: 'recipient',
          amount: 0n,
        })
      ).rejects.toThrow('Amount must be greater than 0');
    });

    it('should check sufficient balance', async () => {
      await expect(
        wallet.sendTransaction({
          destination: 'recipient',
          amount: 10000000000n, // More than available
        })
      ).rejects.toThrow('Insufficient balance');
    });

    it('should watch transaction', () => {
      let callCount = 0;
      
      const unwatch = wallet.watchTransaction('tx_123', (tx) => {
        callCount++;
        
        expect(tx.id).toBe('tx_123');
        
        if (callCount === 1) {
          unwatch();
        }
      });

      // Trigger the interval callbacks
      jest.advanceTimersByTime(60000);
      
      expect(callCount).toBe(1);
    });

    it('should handle transaction not found in watch', () => {
      const { ffi } = require('@tari-project/core');
      ffi.getTransaction = jest.fn(() => null);

      const callback = jest.fn();
      const unwatch = wallet.watchTransaction('nonexistent', callback);

      jest.advanceTimersByTime(60000);

      expect(callback).not.toHaveBeenCalled();
      unwatch();
    });
  });

  describe('Events', () => {
    beforeEach(async () => {
      wallet = new TariWallet({
        network: Network.Testnet,
        seedWords: 'test seed words',
      });
      await wallet.connect();
    });

    it('should emit balance updated event', async () => {
      const balanceHandler = jest.fn();
      wallet.on(WalletEvent.BalanceUpdated, balanceHandler);

      await wallet.getBalance();

      expect(balanceHandler).toHaveBeenCalledWith({
        available: 1000000n,
        pending: 0n,
        locked: 0n,
        total: 1000000n,
      });
    });

    it('should emit transaction sent event', async () => {
      const txHandler = jest.fn();
      wallet.on(WalletEvent.TransactionSent, txHandler);

      await wallet.sendTransaction({
        destination: 'recipient',
        amount: 100000n,
      });

      expect(txHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100000n,
          isOutbound: true,
        })
      );
    });

    it('should remove event listeners', () => {
      const handler = jest.fn();
      wallet.on(WalletEvent.Connected, handler);
      wallet.off(WalletEvent.Connected, handler);

      // Event should not be called after removal
      wallet.emit(WalletEvent.Connected, { connected: true });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      wallet = new TariWallet({
        network: Network.Testnet,
        seedWords: 'test seed words',
      });
    });

    it('should handle FFI errors gracefully', async () => {
      const { ffi } = require('@tari-project/core');
      ffi.createWallet.mockImplementationOnce(() => {
        throw new Error('FFI error');
      });

      await expect(wallet.connect()).rejects.toThrow('FFI error');
    });

    it('should handle operations before connection', async () => {
      await expect(wallet.getBalance()).rejects.toThrow('Wallet not connected');
      await expect(wallet.sendTransaction({
        destination: 'test',
        amount: 1000n,
      })).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on close', async () => {
      wallet = new TariWallet({
        network: Network.Testnet,
        seedWords: 'test seed words',
      });
      await wallet.connect();

      await wallet.close();

      const { ffi } = require('@tari-project/core');
      expect(ffi.destroyWallet).toHaveBeenCalled();
      expect(ffi.destroyAddress).toHaveBeenCalled();
    });

    it('should emit disconnected event', async () => {
      wallet = new TariWallet({
        network: Network.Testnet,
        seedWords: 'test seed words',
      });
      await wallet.connect();

      const disconnectHandler = jest.fn();
      wallet.on(WalletEvent.Disconnected, disconnectHandler);

      await wallet.close();

      expect(disconnectHandler).toHaveBeenCalledWith({
        reason: 'User requested',
      });
    });

    it('should handle multiple close calls', async () => {
      wallet = new TariWallet({
        network: Network.Testnet,
        seedWords: 'test seed words',
      });
      await wallet.connect();

      await wallet.close();
      await wallet.close(); // Should not throw

      const { ffi } = require('@tari-project/core');
      expect(ffi.destroyWallet).toHaveBeenCalledTimes(1);
    });
  });
});
