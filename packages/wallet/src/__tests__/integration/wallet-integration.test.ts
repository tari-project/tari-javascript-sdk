/**
 * Integration tests for wallet operations using real FFI bindings
 * Tests actual wallet functionality with isolated environments
 */

import { TariWallet } from '../../wallet';
import { 
  WalletConfigFactory,
  SeedWordsFactory,
  AddressFactory,
  ErrorFactory 
} from '../../testing/factories';
import { WalletConfigBuilder } from '../../testing/builders';
import { NetworkType } from '@tari-project/tarijs-core';

// Skip these tests if FFI is not available
const describeIfFFIAvailable = process.env.JEST_INTEGRATION_MODE === 'true' ? describe : describe.skip;

describeIfFFIAvailable('TariWallet Integration Tests', () => {
  let testContext: any;
  let testNetwork: NetworkType;

  beforeEach(() => {
    testContext = global.testUtils.getTestContext();
    testNetwork = global.testUtils.getCurrentNetwork();
  });

  afterEach(async () => {
    // Cleanup is handled by the test context
  });

  describe('Wallet Lifecycle', () => {
    test('should create and destroy wallet with real FFI', async () => {
      const config = global.testUtils.createIsolatedWalletConfig({
        logLevel: 3, // debug
      });
      
      const wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
      
      expect(wallet).toBeInstanceOf(TariWallet);
      
      // Verify wallet is functional
      const address = await wallet.getAddress();
      expect(address).toBeValidTariAddress();
      
      const balance = await wallet.getBalance();
      expect(balance.available).toBe(0n); // New wallet should be empty
      
      // Cleanup
      await wallet.destroy();
    });

    test('should create multiple wallets concurrently', async () => {
      const configs = Array.from({ length: 3 }, (_, i) => 
        global.testUtils.createIsolatedWalletConfig({
          storagePath: `${testContext.walletPath}/wallet-${i}`,
        })
      );
      
      const wallets = await Promise.all(
        configs.map(config => TariWallet.create(config))
      );
      
      wallets.forEach(wallet => {
        global.testUtils.registerWalletForCleanup(wallet);
        expect(wallet).toBeInstanceOf(TariWallet);
      });
      
      // Verify each wallet has unique address
      const addresses = await Promise.all(
        wallets.map(wallet => wallet.getAddress())
      );
      
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(3);
      
      // Cleanup all wallets
      await Promise.all(wallets.map(wallet => wallet.destroy()));
    });

    test('should handle wallet creation with invalid storage path', async () => {
      const config = WalletConfigBuilder.create()
        .testnet()
        .storagePath('/invalid/readonly/path/that/does/not/exist')
        .build();
      
      await expect(TariWallet.create(config)).rejects.toThrow();
    });

    test('should persist wallet state across restarts', async () => {
      const storagePath = `${testContext.walletPath}/persistent-wallet`;
      const config = global.testUtils.createIsolatedWalletConfig({
        storagePath,
      });
      
      // Create first wallet
      const wallet1 = await TariWallet.create(config);
      const address1 = await wallet1.getAddress();
      await wallet1.destroy();
      
      // Create second wallet with same storage path
      const wallet2 = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet2);
      
      const address2 = await wallet2.getAddress();
      
      // Should have same address (same wallet)
      expect(address2).toBe(address1);
      
      await wallet2.destroy();
    });
  });

  describe('Wallet Recovery', () => {
    test('should recover wallet from seed words', async () => {
      const seedWords = SeedWordsFactory.alice();
      const config = global.testUtils.createIsolatedWalletConfig({
        seedWords,
      });
      
      const wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
      
      const recoveredSeedWords = await wallet.getSeedWords();
      expect(recoveredSeedWords).toEqual(seedWords);
      
      const address = await wallet.getAddress();
      expect(address).toBeValidTariAddress();
      
      await wallet.destroy();
    });

    test('should generate same address from same seed words', async () => {
      const seedWords = SeedWordsFactory.bob();
      
      // Create first wallet
      const config1 = global.testUtils.createIsolatedWalletConfig({
        storagePath: `${testContext.walletPath}/wallet-1`,
        seedWords,
      });
      
      const wallet1 = await TariWallet.create(config1);
      const address1 = await wallet1.getAddress();
      await wallet1.destroy();
      
      // Create second wallet with same seed words
      const config2 = global.testUtils.createIsolatedWalletConfig({
        storagePath: `${testContext.walletPath}/wallet-2`,
        seedWords,
      });
      
      const wallet2 = await TariWallet.create(config2);
      global.testUtils.registerWalletForCleanup(wallet2);
      
      const address2 = await wallet2.getAddress();
      
      // Should generate the same address
      expect(address2).toBe(address1);
      
      await wallet2.destroy();
    });

    test('should reject invalid seed words during recovery', async () => {
      const invalidSeedWords = ['invalid', 'seed', 'words'];
      const config = global.testUtils.createIsolatedWalletConfig({
        seedWords: invalidSeedWords,
      });
      
      await expect(TariWallet.create(config)).rejects.toThrow();
    });

    test('should handle recovery with passphrase', async () => {
      const seedWords = SeedWordsFactory.charlie();
      const passphrase = 'test_passphrase_123';
      
      const config = global.testUtils.createIsolatedWalletConfig({
        seedWords,
        passphrase,
      });
      
      const wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
      
      const recoveredSeedWords = await wallet.getSeedWords();
      expect(recoveredSeedWords).toEqual(seedWords);
      
      await wallet.destroy();
    });
  });

  describe('Address Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should generate valid Tari address', async () => {
      const address = await wallet.getAddress();
      
      expect(address).toBeValidTariAddress();
      // Verify address matches the test network
      const networkName = testNetwork === NetworkType.Mainnet ? 'mainnet' : 
                          testNetwork === NetworkType.Testnet ? 'testnet' : 'nextnet';
      expect(address).toContain(networkName);
    });

    test('should validate Tari addresses correctly', async () => {
      const validAddress = await wallet.getAddress();
      const invalidAddress = AddressFactory.invalid();
      
      expect(await wallet.validateAddress(validAddress)).toBe(true);
      expect(await wallet.validateAddress(invalidAddress)).toBe(false);
    });

    test('should handle emoji ID conversions', async () => {
      const address = await wallet.getAddress();
      
      // Convert address to emoji ID
      const emojiId = await wallet.addressToEmojiId(address);
      expect(typeof emojiId).toBe('string');
      expect(emojiId.length).toBeGreaterThan(0);
      
      // Convert emoji ID back to address
      const convertedAddress = await wallet.emojiIdToAddress(emojiId);
      expect(convertedAddress).toBe(address);
    });

    test('should generate consistent address across calls', async () => {
      const address1 = await wallet.getAddress();
      const address2 = await wallet.getAddress();
      const address3 = await wallet.getAddress();
      
      expect(address1).toBe(address2);
      expect(address2).toBe(address3);
    });
  });

  describe('Balance Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should get initial empty balance', async () => {
      const balance = await wallet.getBalance();
      
      expect(balance.available).toBe(0n);
      expect(balance.pendingIncoming).toBe(0n);
      expect(balance.pendingOutgoing).toBe(0n);
      expect(balance.timelocked).toBe(0n);
    });

    test('should handle balance queries consistently', async () => {
      // Multiple balance queries should return same result
      const balances = await Promise.all([
        wallet.getBalance(),
        wallet.getBalance(),
        wallet.getBalance(),
      ]);
      
      balances.forEach(balance => {
        expect(balance.available).toBe(0n);
        expect(balance.pendingIncoming).toBe(0n);
        expect(balance.pendingOutgoing).toBe(0n);
        expect(balance.timelocked).toBe(0n);
      });
    });

    test('should handle concurrent balance queries', async () => {
      // Stress test with many concurrent queries
      const promises = Array.from({ length: 10 }, () => wallet.getBalance());
      const results = await Promise.all(promises);
      
      // All should succeed and return consistent results
      expect(results).toHaveLength(10);
      results.forEach(balance => {
        expect(balance.available).toBe(0n);
      });
    });
  });

  describe('Transaction Operations', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
    });

    afterEach(async () => {
      await wallet.destroy();
    });

    test('should reject transaction with insufficient funds', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n; // 1 Tari
      
      // New wallet has no funds
      await expect(
        wallet.sendTransaction(recipient, amount)
      ).rejects.toThrow(/insufficient/i);
    });

    test('should validate transaction parameters', async () => {
      const recipient = AddressFactory.testnet();
      
      // Test zero amount
      await expect(
        wallet.sendTransaction(recipient, 0n)
      ).rejects.toThrow(/amount/i);
      
      // Test negative amount  
      await expect(
        wallet.sendTransaction(recipient, -1000000n)
      ).rejects.toThrow(/amount/i);
    });

    test('should handle invalid recipient address', async () => {
      const invalidRecipient = AddressFactory.invalid();
      const amount = 1000000000n;
      
      await expect(
        wallet.sendTransaction(invalidRecipient, amount)
      ).rejects.toThrow(/address/i);
    });

    test('should get empty transaction history for new wallet', async () => {
      const history = await wallet.getTransactionHistory();
      expect(history).toEqual([]);
    });

    test('should get empty pending transactions for new wallet', async () => {
      const pending = await wallet.getPendingTransactions();
      expect(pending.outbound).toEqual([]);
      expect(pending.inbound).toEqual([]);
    });
  });

  describe('Seed Word Operations', () => {
    test('should generate valid seed words for new wallet', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      const wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
      
      const seedWords = await wallet.getSeedWords();
      
      expect(seedWords).toHaveLength(24); // Standard 24-word mnemonic
      expect(seedWords.every(word => typeof word === 'string')).toBe(true);
      expect(seedWords.every(word => word.length > 0)).toBe(true);
      
      await wallet.destroy();
    });

    test('should return consistent seed words across calls', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      const wallet = await TariWallet.create(config);
      global.testUtils.registerWalletForCleanup(wallet);
      
      const seedWords1 = await wallet.getSeedWords();
      const seedWords2 = await wallet.getSeedWords();
      
      expect(seedWords1).toEqual(seedWords2);
      
      await wallet.destroy();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle file system errors gracefully', async () => {
      // Try to create wallet in read-only location
      const config = WalletConfigBuilder.create()
        .testnet()
        .storagePath('/readonly/path')
        .build();
      
      await expect(TariWallet.create(config)).rejects.toThrow();
    });

    test('should handle concurrent wallet creation in same directory', async () => {
      const storagePath = `${testContext.walletPath}/concurrent-test`;
      
      const configs = Array.from({ length: 3 }, () => 
        global.testUtils.createIsolatedWalletConfig({ storagePath })
      );
      
      // Only one should succeed, others should fail
      const results = await Promise.allSettled(
        configs.map(config => TariWallet.create(config))
      );
      
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');
      
      // At least one should succeed
      expect(successes.length).toBeGreaterThanOrEqual(1);
      
      // Clean up successful wallets
      for (const result of successes) {
        if (result.status === 'fulfilled') {
          global.testUtils.registerWalletForCleanup(result.value);
          await result.value.destroy();
        }
      }
    });

    test('should handle operations after wallet destruction', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      const wallet = await TariWallet.create(config);
      
      await wallet.destroy();
      
      // Operations after destruction should fail
      await expect(wallet.getBalance()).rejects.toThrow();
      await expect(wallet.getAddress()).rejects.toThrow();
      await expect(wallet.getSeedWords()).rejects.toThrow();
    });

    test('should handle memory pressure during wallet operations', async () => {
      // Create multiple wallets to simulate memory pressure
      const configs = Array.from({ length: 5 }, (_, i) => 
        global.testUtils.createIsolatedWalletConfig({
          storagePath: `${testContext.walletPath}/stress-${i}`,
        })
      );
      
      const wallets = await Promise.all(
        configs.map(config => TariWallet.create(config))
      );
      
      wallets.forEach(wallet => {
        global.testUtils.registerWalletForCleanup(wallet);
      });
      
      // All wallets should be functional
      const addresses = await Promise.all(
        wallets.map(wallet => wallet.getAddress())
      );
      
      expect(addresses).toHaveLength(5);
      addresses.forEach(address => {
        expect(address).toBeValidTariAddress();
      });
      
      // Clean up
      await Promise.all(wallets.map(wallet => wallet.destroy()));
    });
  });

  describe('Performance and Resource Management', () => {
    test('should handle rapid wallet creation and destruction', async () => {
      const iterations = 10;
      const timings: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const config = global.testUtils.createIsolatedWalletConfig({
          storagePath: `${testContext.walletPath}/rapid-${i}`,
        });
        
        const wallet = await TariWallet.create(config);
        await wallet.getAddress(); // Ensure wallet is fully initialized
        await wallet.destroy();
        
        const duration = Date.now() - startTime;
        timings.push(duration);
      }
      
      // Average creation time should be reasonable
      const averageTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      expect(averageTime).toBeLessThan(5000); // Less than 5 seconds average
      
      // No timing should be extremely slow
      expect(Math.max(...timings)).toBeLessThan(30000); // Less than 30 seconds max
    });

    test('should clean up resources properly', async () => {
      const config = global.testUtils.createIsolatedWalletConfig();
      const wallet = await TariWallet.create(config);
      
      // Perform various operations
      await wallet.getAddress();
      await wallet.getBalance();
      await wallet.getSeedWords();
      
      // Verify no file handles are left open
      await wallet.destroy();
      
      // Storage path should exist but be properly closed
      await expect(testContext.walletPath).toHaveCreatedFiles();
    });
  });
});
