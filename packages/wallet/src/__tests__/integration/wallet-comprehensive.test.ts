/**
 * @fileoverview Comprehensive integration tests for Tari Wallet SDK
 * 
 * Tests the complete wallet functionality including creation, restoration,
 * balance operations, address management, signing, and resource cleanup.
 */

import {
  WalletFactory,
  TariWallet,
  WalletConfig,
  NetworkType,
  WalletError,
  WalletErrorCode,
  MessageSigner,
  SignatureVerifier,
  WalletRestorationService,
  ResourceManager,
  globalWalletFinalizer
} from '../../index';

// Mock FFI bindings for testing
jest.mock('@tari-project/tarijs-core', () => ({
  NetworkType: {
    Mainnet: 'mainnet',
    Testnet: 'testnet',
    Nextnet: 'nextnet'
  },
  getFFIBindings: jest.fn(() => ({
    createWallet: jest.fn().mockResolvedValue(12345),
    destroyWallet: jest.fn().mockResolvedValue(undefined),
    getBalance: jest.fn().mockResolvedValue({
      available: '1000000000',
      pendingIncoming: '0',
      pendingOutgoing: '0',
      timelocked: '0'
    }),
    getAddress: jest.fn().mockResolvedValue('test_address_123'),
    getSeedWords: jest.fn().mockResolvedValue(['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12']),
    signMessage: jest.fn().mockImplementation(() => {
      throw new Error('Message signing not yet implemented in FFI');
    }),
    getPublicKey: jest.fn().mockImplementation(() => {
      throw new Error('Public key retrieval not yet implemented in FFI');
    }),
    verifyMessageSignature: jest.fn().mockImplementation(() => {
      throw new Error('Message signature verification not yet implemented in FFI');
    }),
    publicKeyToAddress: jest.fn().mockImplementation(() => {
      throw new Error('Public key to address conversion not yet implemented in FFI');
    }),
    sendTransaction: jest.fn().mockResolvedValue('tx_12345'),
    setBaseNode: jest.fn().mockResolvedValue(undefined)
  })),
  WalletError: class WalletError extends Error {
    constructor(public code: number, message: string, public context?: any) {
      super(message);
      this.name = 'WalletError';
    }
  },
  WalletErrorCode: {
    InvalidConfig: 1000,
    WalletExists: 1001,
    InitializationFailed: 1003,
    InvalidFormat: 4001,
    SigningFailed: 7001,
    NotImplemented: 9001,
    UseAfterFree: 5001
  },
  ErrorSeverity: {
    Error: 'error',
    Warning: 'warning',
    Info: 'info'
  },
  TariAddress: class TariAddress {
    constructor(public address: string) {}
    toString() { return this.address; }
  }
}));

describe('Tari Wallet SDK - Comprehensive Integration Tests', () => {
  let testConfig: WalletConfig;
  let wallet: TariWallet;

  beforeEach(async () => {
    // Reset singletons for each test
    ResourceManager.resetInstance();
    
    testConfig = {
      network: NetworkType.Testnet as any,
      storagePath: './test-wallet-storage',
      logPath: './test-wallet.log'
    };

    // Initialize WalletFactory
    await WalletFactory.initialize();
  });

  afterEach(async () => {
    if (wallet && !wallet.isDestroyed) {
      await wallet.destroy();
    }
  });

  describe('Wallet Factory', () => {
    test('should create a new wallet successfully', async () => {
      wallet = await WalletFactory.create(testConfig);
      
      expect(wallet).toBeInstanceOf(TariWallet);
      expect(wallet.isDestroyed).toBe(false);
      expect(wallet.isUsable).toBe(true);
      expect(wallet.id).toBeDefined();
    });

    test('should generate seed phrase', async () => {
      const seedPhrase = await WalletFactory.generateSeedPhrase(12);
      
      expect(seedPhrase).toHaveLength(12);
      expect(seedPhrase.every(word => typeof word === 'string')).toBe(true);
    });

    test('should validate seed phrase', async () => {
      const seedPhrase = await WalletFactory.generateSeedPhrase(24);
      const validation = await WalletFactory.validateSeedWords(seedPhrase);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.normalizedWords).toHaveLength(24);
    });

    test('should restore wallet from seed phrase', async () => {
      const seedPhrase = await WalletFactory.generateSeedPhrase(12);
      
      wallet = await WalletFactory.restore(seedPhrase, testConfig);
      
      expect(wallet).toBeInstanceOf(TariWallet);
      expect(wallet.isUsable).toBe(true);
    });

    test('should handle invalid configuration gracefully', async () => {
      const invalidConfig = {
        network: 'invalid_network' as any,
        storagePath: ''
      };

      await expect(WalletFactory.create(invalidConfig)).rejects.toThrow(WalletError);
    });
  });

  describe('Wallet Core Operations', () => {
    beforeEach(async () => {
      wallet = await WalletFactory.create(testConfig);
    });

    test('should get wallet address', async () => {
      const address = await wallet.getAddress();
      
      expect(address).toBeDefined();
      expect(typeof address.toString()).toBe('string');
    });

    test('should get wallet balance', async () => {
      const balance = await wallet.getBalance();
      
      expect(balance).toBeDefined();
      expect(typeof balance.available).toBe('bigint');
      expect(typeof balance.total).toBe('bigint');
      expect(balance.available).toBeGreaterThanOrEqual(0n);
    });

    test('should get detailed balance information', async () => {
      const balanceInfo = await wallet.getDetailedBalance();
      
      expect(balanceInfo).toBeDefined();
      expect(typeof balanceInfo.confirmed).toBe('bigint');
      expect(typeof balanceInfo.timeLocked).toBe('bigint');
      expect(typeof balanceInfo.height).toBe('number');
    });

    test('should format address for display', async () => {
      const address = await wallet.getAddress();
      const formatted = wallet.formatAddress(address, {
        format: 'base58',
        truncate: { maxLength: 20, startChars: 8, endChars: 8, separator: '...' }
      });
      
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });

    test('should get wallet information', async () => {
      const walletInfo = await wallet.getWalletInfo();
      
      expect(walletInfo).toBeDefined();
      expect(walletInfo.network).toBe(testConfig.network);
    });

    test('should get network information', async () => {
      const networkInfo = await wallet.getNetworkInfo();
      
      expect(networkInfo).toBeDefined();
      expect(networkInfo.networkType).toBe(testConfig.network);
    });

    test('should get version information', async () => {
      const versionInfo = await wallet.getVersionInfo();
      
      expect(versionInfo).toBeDefined();
      expect(versionInfo.sdkVersion).toBeDefined();
    });
  });

  describe('Seed Phrase Management', () => {
    beforeEach(async () => {
      wallet = await WalletFactory.create(testConfig);
    });

    test('should retrieve seed words', async () => {
      const seedWords = await wallet.getSeedWords();
      
      expect(seedWords).toHaveLength(12);
      expect(seedWords.every(word => typeof word === 'string')).toBe(true);
    });

    test('should validate seed phrase format', async () => {
      const testWords = ['abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'about'];
      const validation = await TariWallet.validateSeedWords(testWords);
      
      expect(validation.isValid).toBe(true);
    });

    test('should generate different seed phrases', async () => {
      const phrase1 = await TariWallet.generateSeedPhrase(12);
      const phrase2 = await TariWallet.generateSeedPhrase(12);
      
      expect(phrase1).not.toEqual(phrase2);
    });
  });

  describe('Message Signing (FFI Pending)', () => {
    beforeEach(async () => {
      wallet = await WalletFactory.create(testConfig);
    });

    test('should handle signing not implemented gracefully', async () => {
      const message = 'Hello, Tari!';
      
      // Should throw NotImplemented error until FFI is available
      await expect(wallet.signMessage(message)).rejects.toThrow();
    });

    test('should validate message format before signing', async () => {
      await expect(wallet.signMessage('')).rejects.toThrow(WalletError);
    });

    test('should create message signer instance', () => {
      const signer = new MessageSigner(12345 as any, 'test-wallet');
      
      expect(signer).toBeInstanceOf(MessageSigner);
    });

    test('should create signature verifier instance', () => {
      const verifier = new SignatureVerifier();
      
      expect(verifier).toBeInstanceOf(SignatureVerifier);
    });
  });

  describe('Address Management', () => {
    beforeEach(async () => {
      wallet = await WalletFactory.create(testConfig);
    });

    test('should format wallet address for UI', async () => {
      const formattedAddress = await wallet.formatWalletAddressForUI(20);
      
      expect(formattedAddress).toBeDefined();
      expect(typeof formattedAddress).toBe('string');
      expect(formattedAddress.length).toBeLessThanOrEqual(20);
    });

    test('should get address as emoji', async () => {
      // This will test the emoji conversion system
      const emojiAddress = await wallet.getAddressAsEmoji();
      
      expect(emojiAddress).toBeDefined();
      expect(typeof emojiAddress).toBe('string');
    });

    test('should validate addresses', async () => {
      const isValid = await wallet.validateAddress('test_address_123');
      
      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('Resource Management', () => {
    test('should track wallet resources', async () => {
      const resourceManager = ResourceManager.getInstance();
      const initialStats = resourceManager.getStats();
      
      wallet = await WalletFactory.create(testConfig);
      
      const statsAfterCreation = resourceManager.getStats();
      expect(statsAfterCreation.totalResources).toBeGreaterThan(initialStats.totalResources);
      
      await wallet.destroy();
      
      // Resources should be cleaned up
      expect(wallet.isDestroyed).toBe(true);
    });

    test('should handle finalizer cleanup', () => {
      const finalizer = globalWalletFinalizer;
      const stats = finalizer.getStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.registeredObjects).toBe('number');
    });

    test('should prevent use after destroy', async () => {
      wallet = await WalletFactory.create(testConfig);
      await wallet.destroy();
      
      await expect(wallet.getBalance()).rejects.toThrow(WalletError);
      await expect(wallet.getAddress()).rejects.toThrow(WalletError);
    });
  });

  describe('Wallet Restoration', () => {
    test('should create restoration service', () => {
      const service = new WalletRestorationService();
      
      expect(service).toBeInstanceOf(WalletRestorationService);
      expect(service.isRestoring).toBe(false);
    });

    test('should track restoration state', () => {
      const service = new WalletRestorationService();
      const state = service.state;
      
      expect(state.isRestoring).toBe(false);
      expect(state.progress.stage).toBeDefined();
      expect(state.progress.percentage).toBe(0);
    });

    test('should validate seed phrase for restoration', async () => {
      const service = new WalletRestorationService();
      const testWords = ['word1', 'word2', 'word3'];
      
      // Should fail validation
      await expect(service.validateSeedPhraseOnly(testWords)).rejects.toThrow();
    });
  });

  describe('Configuration Management', () => {
    test('should create default configuration', () => {
      const config = {
        network: NetworkType.Testnet as any,
        storagePath: './test'
      };
      
      expect(config.network).toBe('testnet');
      expect(config.storagePath).toBe('./test');
    });

    test('should get wallet configuration safely', async () => {
      wallet = await WalletFactory.create(testConfig);
      const config = wallet.getConfig();
      
      expect(config.network).toBeDefined();
      expect(config.storagePath).toBeDefined();
      expect('passphrase' in config).toBe(false); // Should not expose sensitive data
      expect('seedWords' in config).toBe(false); // Should not expose sensitive data
    });
  });

  describe('Error Handling', () => {
    test('should handle wallet creation errors', async () => {
      const invalidConfig = {
        network: '' as any,
        storagePath: '/invalid/path/that/does/not/exist'
      };

      await expect(WalletFactory.create(invalidConfig)).rejects.toThrow();
    });

    test('should provide detailed error information', async () => {
      try {
        await WalletFactory.create({ network: 'invalid' as any, storagePath: '' });
      } catch (error) {
        expect(error).toBeInstanceOf(WalletError);
        if (error instanceof WalletError) {
          expect(error.code).toBeDefined();
          expect(error.message).toBeDefined();
        }
      }
    });

    test('should handle async disposal', async () => {
      wallet = await WalletFactory.create(testConfig);
      
      // Test Symbol.asyncDispose
      await wallet[Symbol.asyncDispose]();
      
      expect(wallet.isDestroyed).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      wallet = await WalletFactory.create(testConfig);
    });

    test('should provide wallet statistics', () => {
      const stats = wallet.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.lifecycle).toBeDefined();
      expect(stats.resources).toBeDefined();
      expect(stats.finalizer).toBeDefined();
    });

    test('should track balance cache statistics', () => {
      const cacheStats = wallet.getBalanceCacheStats();
      
      expect(cacheStats).toBeDefined();
    });

    test('should provide resource manager health check', () => {
      const resourceManager = ResourceManager.getInstance();
      const isHealthy = resourceManager.isHealthy();
      
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Integration Scenarios', () => {
    test('complete wallet lifecycle', async () => {
      // Create wallet
      wallet = await WalletFactory.create(testConfig);
      expect(wallet.isUsable).toBe(true);
      
      // Get basic information
      const address = await wallet.getAddress();
      const balance = await wallet.getBalance();
      const walletInfo = await wallet.getWalletInfo();
      
      expect(address).toBeDefined();
      expect(balance).toBeDefined();
      expect(walletInfo).toBeDefined();
      
      // Test operations
      const formattedAddress = await wallet.formatWalletAddressForUI();
      expect(formattedAddress).toBeDefined();
      
      // Cleanup
      await wallet.destroy();
      expect(wallet.isDestroyed).toBe(true);
    });

    test('seed phrase generation and restoration', async () => {
      // Generate seed phrase
      const seedPhrase = await WalletFactory.generateSeedPhrase(12);
      expect(seedPhrase).toHaveLength(12);
      
      // Validate seed phrase
      const validation = await WalletFactory.validateSeedWords(seedPhrase);
      expect(validation.isValid).toBe(true);
      
      // Restore wallet from seed
      wallet = await WalletFactory.restore(seedPhrase, testConfig);
      expect(wallet.isUsable).toBe(true);
      
      // Get restored seed words
      const restoredSeeds = await wallet.getSeedWords();
      expect(restoredSeeds).toEqual(seedPhrase);
    });

    test('multiple wallets independence', async () => {
      const wallet1 = await WalletFactory.create({
        ...testConfig,
        storagePath: './wallet1'
      });
      
      const wallet2 = await WalletFactory.create({
        ...testConfig,
        storagePath: './wallet2'
      });
      
      expect(wallet1.id).not.toBe(wallet2.id);
      
      const address1 = await wallet1.getAddress();
      const address2 = await wallet2.getAddress();
      
      // Addresses should be the same in mock but IDs different
      expect(wallet1.id).not.toBe(wallet2.id);
      
      await wallet1.destroy();
      await wallet2.destroy();
      
      wallet = null as any; // Don't cleanup in afterEach
    });
  });
});
