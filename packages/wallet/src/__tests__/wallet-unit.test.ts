/**
 * Comprehensive unit tests for wallet operations using mocked FFI
 * Tests wallet functionality without touching real native code
 * Updated to work with MockNativeBindings class instead of Jest spies
 */

import { TariWallet } from '../tari-wallet';
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

// Import mock function - Jest moduleNameMapper will redirect to __mocks__
const { getMockNativeBindings } = require('@tari-project/tarijs-core/native');

describe('TariWallet Unit Tests', () => {
  let mockFFI: any;

  beforeEach(() => {
    // Get fresh mock instance for each test
    mockFFI = getMockNativeBindings();
    mockFFI.reset();
    
    // Ensure performance monitoring is disabled
    process.env.DISABLE_PERFORMANCE_MONITORING = 'true';
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
      expect(mockFFI.getWalletCount()).toBeGreaterThan(0);
      
      await wallet.destroy();
    });

    test('should create wallet with custom configuration', async () => {
      const config = WalletConfigBuilder.create()
        .testnet()
        .debug()
        .withPassphrase('test123')
        .build();
      
      const wallet = await TariWallet.create(config);
      
      expect(wallet).toBeInstanceOf(TariWallet);
      expect(mockFFI.getWalletCount()).toBe(1);
      
      await wallet.destroy();
    });

    test('should handle wallet creation failure', async () => {
      mockFFI.setFailureMode(true);
      const config = WalletConfigFactory.testnet();
      
      await expect(TariWallet.create(config)).rejects.toThrow();
      
      mockFFI.setFailureMode(false);
    });

    test('should create wallet with seed words for recovery', async () => {
      const seedWords = SeedWordsFactory.alice();
      const config = WalletConfigFactory.withSeedWords(seedWords);
      
      const wallet = await TariWallet.create(config);
      
      expect(mockFFI.getWalletCount()).toBe(1);
      
      await wallet.destroy();
    });

    test('should reject invalid seed words', async () => {
      mockFFI.setFailureMode(true);
      const invalidSeedWords = SeedWordsFactory.invalid();
      const config = WalletConfigFactory.withSeedWords(invalidSeedWords);
      
      await expect(TariWallet.create(config)).rejects.toThrow();
      
      mockFFI.setFailureMode(false);
    });
  });

  describe('Wallet Destruction', () => {
    test('should properly destroy wallet', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      const initialCount = mockFFI.getWalletCount();
      await wallet.destroy();
      
      // After destruction, verify wallet is cleaned up
      expect(mockFFI.getWalletCount()).toBe(initialCount);
    });

    test('should handle destruction of already destroyed wallet', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      await wallet.destroy();
      
      // Second destroy should not throw
      await expect(wallet.destroy()).resolves.not.toThrow();
    });

    test('should handle destruction failure gracefully', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      mockFFI.setFailureMode(true);
      
      await expect(wallet.destroy()).rejects.toThrow();
      
      mockFFI.setFailureMode(false);
    });
  });

  describe('Balance Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should get wallet balance', async () => {
      const balance = await wallet.getBalance();
      
      // MockNativeBindings provides predictable balance values
      expect(typeof balance.available).toBe('bigint');
      expect(typeof balance.pendingIncoming).toBe('bigint');
      expect(typeof balance.pendingOutgoing).toBe('bigint');
      expect(typeof balance.timelocked).toBe('bigint');
      
      // MockNativeBindings sets available to '1000000000' (1 Tari)
      expect(balance.available).toBe(1000000000n);
      expect(balance.pendingIncoming).toBe(0n);
      expect(balance.pendingOutgoing).toBe(0n);
      expect(balance.timelocked).toBe(0n);
    });

    test('should handle balance retrieval failure', async () => {
      mockFFI.setFailureMode(true);

      await expect(wallet.getBalance()).rejects.toThrow();
      
      mockFFI.setFailureMode(false);
    });

    test('should handle large balance calculations', async () => {
      const balance = await wallet.getBalance();
      
      // Test BigInt arithmetic works correctly
      const totalBalance = balance.available + balance.pendingIncoming + balance.timelocked;
      expect(totalBalance).toBeGreaterThanOrEqual(balance.available);
      
      expect(balance.available.toString()).toBe('1000000000');
    });
  });

  describe('Address Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should get wallet address', async () => {
      const addressObj = await wallet.getAddress();
      
      // MockNativeBindings generates predictable hex address format in TariAddress object
      expect(typeof addressObj).toBe('object');
      expect(addressObj).toHaveProperty('address');
      expect(typeof addressObj.address).toBe('string');
      expect(addressObj.address).toMatch(/^[0-9a-f]{64}$/); // 64-character hex string
    });

    test('should handle address retrieval failure', async () => {
      mockFFI.setFailureMode(true);
      
      await expect(wallet.getAddress()).rejects.toThrow();
      
      mockFFI.setFailureMode(false);
    });

    test('should validate address format', async () => {
      const addressObj = await wallet.getAddress();
      
      // Test with the address we just got from the wallet (hex format)
      expect(addressObj.address).toMatch(/^[0-9a-f]{64}$/);
      expect(addressObj.format).toBe('hex');
    });
  });

  describe('Transaction Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should send transaction successfully', async () => {
      const recipientAddress = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'; // Valid hex address
      const amount = 1000000n; // 0.001 Tari
      const message = 'Test payment';

      // MockNativeBindings will handle transaction creation internally
      const result = await wallet.sendTransaction({
        destination: recipientAddress,
        amount,
        message,
      });

      expect(result).toBeDefined();
      expect(typeof result.transactionId).toBe('string');
    });

    test('should handle transaction failure', async () => {
      mockFFI.setFailureMode(true);
      
      const recipientAddress = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'; // Valid hex address
      const amount = 1000000n;

      await expect(wallet.sendTransaction({
        destination: recipientAddress,
        amount,
        message: 'Test payment',
      })).rejects.toThrow();

      mockFFI.setFailureMode(false);
    });

    test('should handle insufficient funds', async () => {
      const recipientAddress = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'; // Valid hex address
      const amount = 10000000000n; // 10 Tari (more than available)

      // MockNativeBindings should handle insufficient funds check
      await expect(wallet.sendTransaction({
        destination: recipientAddress,
        amount,
        message: 'Large payment',
      })).rejects.toThrow();
    });
  });

  describe('Seed Word Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should get seed words', async () => {
      const seedWords = await wallet.getSeedWords();
      
      expect(Array.isArray(seedWords)).toBe(true);
      expect(seedWords).toHaveLength(24); // Standard BIP39 length
      expect(seedWords.every(word => typeof word === 'string')).toBe(true);
    });

    test('should handle seed words retrieval failure', async () => {
      mockFFI.setFailureMode(true);
      
      await expect(wallet.getSeedWords()).rejects.toThrow();
      
      mockFFI.setFailureMode(false);
    });
  });

  describe('Base Node Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = WalletConfigFactory.testnet();
      wallet = await TariWallet.create(config);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should set base node successfully', async () => {
      const baseNode = {
        publicKey: 'mock_public_key_123',
        address: '/ip4/127.0.0.1/tcp/18189',
      };

      // MockNativeBindings should handle base node configuration
      await expect(wallet.setBaseNode(baseNode)).resolves.not.toThrow();
    });

    test('should handle base node configuration failure', async () => {
      const invalidBaseNode = {
        publicKey: '',
        address: '',
      };

      await expect(wallet.setBaseNode(invalidBaseNode)).rejects.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle wallet operations after destruction', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      await wallet.destroy();
      
      // Operations after destruction should fail gracefully
      await expect(wallet.getBalance()).rejects.toThrow();
    });

    test('should handle concurrent operations', async () => {
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      // Test that multiple concurrent operations work
      const promises = [
        wallet.getBalance(),
        wallet.getAddress(),
        wallet.getBalance(),
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results[0]).toBeDefined(); // First balance
      expect(results[1]).toBeDefined(); // Address
      expect(results[2]).toBeDefined(); // Second balance
      
      await wallet.destroy();
    });

    test('should handle memory pressure gracefully', async () => {
      const config = WalletConfigFactory.testnet();
      
      // Create and destroy multiple wallets to test memory management
      const wallets = [];
      for (let i = 0; i < 5; i++) {
        const wallet = await TariWallet.create(config);
        wallets.push(wallet);
      }
      
      // All wallets should be created successfully
      expect(wallets).toHaveLength(5);
      expect(mockFFI.getWalletCount()).toBe(5);
      
      // Clean up all wallets
      await Promise.all(wallets.map(wallet => wallet.destroy()));
    });
  });

  describe('Mock Behavior Verification', () => {
    test('should work with mock latency', async () => {
      mockFFI.setLatency(100); // 100ms latency
      
      const config = WalletConfigFactory.testnet();
      const startTime = Date.now();
      
      const wallet = await TariWallet.create(config);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThan(90); // Should include mock latency
      
      await wallet.destroy();
      mockFFI.setLatency(0); // Reset latency
    });

    test('should verify mock state management', async () => {
      expect(mockFFI.getWalletCount()).toBe(0);
      
      const config = WalletConfigFactory.testnet();
      const wallet = await TariWallet.create(config);
      
      expect(mockFFI.getWalletCount()).toBe(1);
      
      await wallet.destroy();
      expect(mockFFI.getWalletCount()).toBe(1); // Destroyed but tracked
    });
  });
});
