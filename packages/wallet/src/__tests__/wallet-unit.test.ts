/**
 * Comprehensive unit tests for wallet operations using mocked FFI
 * Tests wallet functionality without touching real native code
 */

import { TariWallet } from '../wallet';
import { 
  WalletConfigFactory, 
  BalanceFactory, 
  TransactionFactory,
  AddressFactory,
  SeedWordsFactory,
  ErrorFactory 
} from '../testing/factories';
import { 
  WalletConfigBuilder, 
  BalanceBuilder,
  TransactionBuilder 
} from '../testing/builders';
// Import mock function for unit tests
import { getMockNativeBindings } from '@tari-project/tarijs-core/ffi/__mocks__/native';

describe('TariWallet Unit Tests', () => {
  let mockFFI: any;

  beforeEach(() => {
    // Get fresh mock instance for each test
    mockFFI = getMockNativeBindings();
    mockFFI.reset();
    
    // Mock the wallet creation to return predictable handles
    mockFFI.walletCreate = jest.fn().mockResolvedValue(1);
    mockFFI.walletDestroy = jest.fn().mockResolvedValue(undefined);
    mockFFI.walletGetBalance = jest.fn().mockResolvedValue({
      available: '1000000000',
      pending_incoming: '0',
      pending_outgoing: '0',
      timelocked: '0',
    });
    mockFFI.walletGetAddress = jest.fn().mockResolvedValue('tari://testnet/mock_address');
  });

  afterEach(() => {
    mockFFI.reset();
    jest.clearAllMocks();
  });

  describe('Wallet Creation', () => {
    test('should create new wallet with valid configuration', async () => {
      const config = WalletConfigFactory.testnet();
      
      const wallet = await TariWallet.create(config);
      
      expect(wallet).toBeInstanceOf(TariWallet);
      expect(mockFFI.walletCreate).toHaveBeenCalledWith({
        network: 'testnet',
        storagePath: config.storagePath,
        logLevel: 'info',
      });
    });

    test('should create wallet with custom configuration', async () => {
      const config = WalletConfigBuilder.create()
        .testnet()
        .debug()
        .withPassphrase('test123')
        .build();
      
      const wallet = await TariWallet.create(config);
      
      expect(wallet).toBeInstanceOf(TariWallet);
      expect(mockFFI.walletCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          network: 'testnet',
          logLevel: 'debug',
          passphrase: 'test123',
        })
      );
    });

    test('should handle wallet creation failure', async () => {
      mockFFI.walletCreate.mockRejectedValue(new Error('Creation failed'));
      const config = WalletConfigFactory.testnet();
      
      await expect(TariWallet.create(config)).rejects.toThrow('Creation failed');
    });

    test('should create wallet with seed words for recovery', async () => {
      const seedWords = SeedWordsFactory.alice();
      const config = WalletConfigFactory.withSeedWords(seedWords);
      
      const wallet = await TariWallet.create(config);
      
      expect(mockFFI.walletCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          seedWords,
        })
      );
    });

    test('should reject invalid seed words', async () => {
      mockFFI.walletCreate.mockRejectedValue(new Error('Invalid seed words'));
      const invalidSeedWords = SeedWordsFactory.invalid();
      const config = WalletConfigFactory.withSeedWords(invalidSeedWords);
      
      await expect(TariWallet.create(config)).rejects.toThrow('Invalid seed words');
    });
  });

  describe('Wallet Destruction', () => {
    test('should properly destroy wallet', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      await wallet.destroy();
      
      expect(mockFFI.walletDestroy).toHaveBeenCalledWith(1);
    });

    test('should handle destruction of already destroyed wallet', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      await wallet.destroy();
      
      // Second destroy should not throw
      await expect(wallet.destroy()).resolves.not.toThrow();
    });

    test('should handle destruction failure gracefully', async () => {
      mockFFI.walletDestroy.mockRejectedValue(new Error('Destruction failed'));
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      await expect(wallet.destroy()).rejects.toThrow('Destruction failed');
    });
  });

  describe('Balance Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should get wallet balance', async () => {
      const mockBalance = BalanceFactory.create();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: mockBalance.available.toString(),
        pending_incoming: mockBalance.pendingIncoming.toString(),
        pending_outgoing: mockBalance.pendingOutgoing.toString(),
        timelocked: mockBalance.timelocked.toString(),
      });
      
      const balance = await wallet.getBalance();
      
      expect(balance.available).toBe(mockBalance.available);
      expect(balance.pendingIncoming).toBe(mockBalance.pendingIncoming);
      expect(balance.pendingOutgoing).toBe(mockBalance.pendingOutgoing);
      expect(balance.timelocked).toBe(mockBalance.timelocked);
      expect(mockFFI.walletGetBalance).toHaveBeenCalledWith(1);
    });

    test('should handle empty balance', async () => {
      const emptyBalance = BalanceFactory.empty();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: emptyBalance.available.toString(),
        pending_incoming: emptyBalance.pendingIncoming.toString(),
        pending_outgoing: emptyBalance.pendingOutgoing.toString(),
        timelocked: emptyBalance.timelocked.toString(),
      });
      
      const balance = await wallet.getBalance();
      
      expect(balance.available).toBe(0n);
      expect(balance.pendingIncoming).toBe(0n);
      expect(balance.pendingOutgoing).toBe(0n);
      expect(balance.timelocked).toBe(0n);
    });

    test('should handle balance retrieval failure', async () => {
      mockFFI.walletGetBalance.mockRejectedValue(new Error('Balance query failed'));
      
      await expect(wallet.getBalance()).rejects.toThrow('Balance query failed');
    });

    test('should handle large balance values', async () => {
      const largeBalance = BalanceFactory.rich();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: largeBalance.available.toString(),
        pending_incoming: largeBalance.pendingIncoming.toString(),
        pending_outgoing: largeBalance.pendingOutgoing.toString(),
        timelocked: largeBalance.timelocked.toString(),
      });
      
      const balance = await wallet.getBalance();
      
      expect(balance.available).toBe(100000000000n); // 100 Tari
      expect(balance.pendingIncoming).toBe(5000000000n); // 5 Tari
    });
  });

  describe('Address Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should get wallet address', async () => {
      const mockAddress = AddressFactory.testnet();
      mockFFI.walletGetAddress.mockResolvedValue(mockAddress);
      
      const address = await wallet.getAddress();
      
      expect(address).toBe(mockAddress);
      expect(address).toBeValidTariAddress();
      expect(mockFFI.walletGetAddress).toHaveBeenCalledWith(1);
    });

    test('should handle address retrieval failure', async () => {
      mockFFI.walletGetAddress.mockRejectedValue(new Error('Address query failed'));
      
      await expect(wallet.getAddress()).rejects.toThrow('Address query failed');
    });

    test('should validate address format', async () => {
      const validAddress = AddressFactory.testnet();
      mockFFI.validateAddress = jest.fn().mockResolvedValue(true);
      
      const isValid = await wallet.validateAddress(validAddress);
      
      expect(isValid).toBe(true);
      expect(mockFFI.validateAddress).toHaveBeenCalledWith(validAddress, 'testnet');
    });

    test('should reject invalid address format', async () => {
      const invalidAddress = AddressFactory.invalid();
      mockFFI.validateAddress = jest.fn().mockResolvedValue(false);
      
      const isValid = await wallet.validateAddress(invalidAddress);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Transaction Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
      
      // Mock sufficient balance
      mockFFI.walletGetBalance.mockResolvedValue({
        available: '10000000000', // 10 Tari
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should send transaction successfully', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n; // 1 Tari
      const mockTxId = 'mock_tx_123';
      
      mockFFI.walletSendTransaction = jest.fn().mockResolvedValue(mockTxId);
      
      const txId = await wallet.sendTransaction(recipient, amount);
      
      expect(txId).toBe(mockTxId);
      expect(mockFFI.walletSendTransaction).toHaveBeenCalledWith(
        1,
        recipient,
        amount.toString(),
        undefined
      );
    });

    test('should send transaction with options', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n;
      const options = {
        message: 'Test payment',
        feePerGram: 10000n,
      };
      const mockTxId = 'mock_tx_456';
      
      mockFFI.walletSendTransaction = jest.fn().mockResolvedValue(mockTxId);
      
      const txId = await wallet.sendTransaction(recipient, amount, options);
      
      expect(txId).toBe(mockTxId);
      expect(mockFFI.walletSendTransaction).toHaveBeenCalledWith(
        1,
        recipient,
        amount.toString(),
        expect.objectContaining({
          message: 'Test payment',
          feePerGram: '10000',
        })
      );
    });

    test('should handle insufficient funds error', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 20000000000n; // 20 Tari (more than available)
      
      mockFFI.walletSendTransaction = jest.fn().mockRejectedValue(
        ErrorFactory.insufficientFunds()
      );
      
      await expect(wallet.sendTransaction(recipient, amount))
        .rejects.toThrow('Insufficient funds');
    });

    test('should handle invalid recipient address', async () => {
      const invalidRecipient = AddressFactory.invalid();
      const amount = 1000000000n;
      
      mockFFI.walletSendTransaction = jest.fn().mockRejectedValue(
        ErrorFactory.invalidAddress()
      );
      
      await expect(wallet.sendTransaction(invalidRecipient, amount))
        .rejects.toThrow('Invalid recipient address');
    });

    test('should reject zero amount transaction', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 0n;
      
      await expect(wallet.sendTransaction(recipient, amount))
        .rejects.toThrow('Amount must be greater than zero');
    });

    test('should reject negative amount transaction', async () => {
      const recipient = AddressFactory.testnet();
      const amount = -1000000n;
      
      await expect(wallet.sendTransaction(recipient, amount))
        .rejects.toThrow('Amount must be greater than zero');
    });
  });

  describe('Seed Word Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should get seed words', async () => {
      const mockSeedWords = SeedWordsFactory.alice();
      mockFFI.walletGetSeedWords = jest.fn().mockResolvedValue(mockSeedWords);
      
      const seedWords = await wallet.getSeedWords();
      
      expect(seedWords).toEqual(mockSeedWords);
      expect(seedWords).toHaveLength(24);
      expect(mockFFI.walletGetSeedWords).toHaveBeenCalledWith(1);
    });

    test('should handle seed words retrieval failure', async () => {
      mockFFI.walletGetSeedWords = jest.fn().mockRejectedValue(
        new Error('Seed words access denied')
      );
      
      await expect(wallet.getSeedWords()).rejects.toThrow('Seed words access denied');
    });

    test('should validate seed words format', async () => {
      const validSeedWords = SeedWordsFactory.valid24Words();
      mockFFI.walletGetSeedWords = jest.fn().mockResolvedValue(validSeedWords);
      
      const seedWords = await wallet.getSeedWords();
      
      expect(seedWords).toHaveLength(24);
      expect(seedWords.every(word => typeof word === 'string')).toBe(true);
      expect(seedWords.every(word => word.length > 0)).toBe(true);
    });
  });

  describe('Base Node Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should set base node successfully', async () => {
      const publicKey = 'test_public_key_123';
      const address = '/ip4/127.0.0.1/tcp/18189';
      
      mockFFI.walletSetBaseNode = jest.fn().mockResolvedValue(undefined);
      
      await wallet.setBaseNode(publicKey, address);
      
      expect(mockFFI.walletSetBaseNode).toHaveBeenCalledWith(1, {
        publicKey,
        address,
      });
    });

    test('should handle base node configuration failure', async () => {
      const publicKey = 'invalid_key';
      const address = 'invalid_address';
      
      mockFFI.walletSetBaseNode = jest.fn().mockRejectedValue(
        new Error('Invalid base node configuration')
      );
      
      await expect(wallet.setBaseNode(publicKey, address))
        .rejects.toThrow('Invalid base node configuration');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle wallet operations after destruction', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      await wallet.destroy();
      
      // Operations after destruction should fail gracefully
      await expect(wallet.getBalance()).rejects.toThrow();
      await expect(wallet.getAddress()).rejects.toThrow();
    });

    test('should handle concurrent operations', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      try {
        // Simulate concurrent balance queries
        const promises = Array.from({ length: 5 }, () => wallet.getBalance());
        const results = await Promise.all(promises);
        
        // All should succeed and return the same balance
        expect(results).toHaveLength(5);
        results.forEach(balance => {
          expect(balance.available).toBe(1000000000n);
        });
      } finally {
        await wallet.destroy();
      }
    });

    test('should handle FFI timeout scenarios', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      // Mock latency to simulate timeout
      mockFFI.setLatency(6000); // 6 seconds
      mockFFI.walletGetBalance.mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), 5000)
        )
      );
      
      try {
        await expect(wallet.getBalance()).rejects.toThrow('Operation timeout');
      } finally {
        await wallet.destroy();
      }
    });

    test('should handle memory pressure gracefully', async () => {
      const config = WalletConfigFactory.testnet();
      
      // Create multiple wallets to simulate memory pressure
      const wallets = await Promise.all(
        Array.from({ length: 10 }, () => TariWallet.create(config))
      );
      
      try {
        // All wallets should be functional
        const balances = await Promise.all(
          wallets.map(wallet => wallet.getBalance())
        );
        
        expect(balances).toHaveLength(10);
      } finally {
        // Clean up all wallets
        await Promise.all(wallets.map(wallet => wallet.destroy()));
      }
    });
  });

  describe('Mock Behavior Verification', () => {
    test('should verify no real FFI calls are made', async () => {
      global.testUtils.verifyNoRealFFICalls();
    });

    test('should test with mock failure conditions', async () => {
      global.testUtils.setMockFailure(true);
      
      const config = WalletConfigFactory.testnet();
      
      await expect(TariWallet.create(config)).rejects.toThrow();
    });

    test('should test with mock latency', async () => {
      global.testUtils.setMockLatency(100);
      
      const config = WalletConfigFactory.testnet();
      const startTime = Date.now();
      
      const wallet = await TariWallet.create(config);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThan(90); // Should include mock latency
      
      await wallet.destroy();
    });
  });
});
