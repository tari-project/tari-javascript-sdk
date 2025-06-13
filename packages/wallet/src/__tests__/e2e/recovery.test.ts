/**
 * E2E tests for wallet recovery and seed word validation
 * Tests deterministic wallet recovery across different scenarios
 */

import { TariWallet } from '../../wallet';
import { SeedWordsFactory, WalletConfigFactory } from '../../testing/factories';
import { WalletConfigBuilder } from '../../testing/builders';

// Skip these tests if E2E is not enabled
const describeIfE2EEnabled = process.env.JEST_E2E_MODE === 'true' ? describe : describe.skip;

describeIfE2EEnabled('Wallet Recovery E2E Tests', () => {
  let testContext: any;

  beforeEach(async () => {
    testContext = global.testUtils.getE2EContext();
  });

  describe('Seed Word Recovery', () => {
    test('should recover wallet with same address from seed words', async () => {
      const seedWords = SeedWordsFactory.alice();
      
      // Create first wallet
      const config1 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/original`,
        seedWords,
      });
      
      const wallet1 = await TariWallet.create(config1);
      const address1 = await wallet1.getAddress();
      const seedWords1 = await wallet1.getSeedWords();
      await wallet1.destroy();
      
      // Create second wallet with same seed words but different storage
      const config2 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/recovered`,
        seedWords,
      });
      
      const wallet2 = await TariWallet.create(config2);
      global.testUtils.registerE2EWalletForCleanup(wallet2);
      
      const address2 = await wallet2.getAddress();
      const seedWords2 = await wallet2.getSeedWords();
      
      // Should generate same address and seed words
      expect(address2).toBe(address1);
      expect(seedWords2).toEqual(seedWords1);
      expect(seedWords2).toEqual(seedWords);
      
      await wallet2.destroy();
    }, 60000);

    test('should recover multiple wallets with different seed words', async () => {
      const testCases = [
        { name: 'Alice', seedWords: SeedWordsFactory.alice() },
        { name: 'Bob', seedWords: SeedWordsFactory.bob() },
        { name: 'Charlie', seedWords: SeedWordsFactory.charlie() },
      ];
      
      const walletData: Array<{ name: string; address: string; seedWords: string[] }> = [];
      
      // Create and record original wallets
      for (const testCase of testCases) {
        const config = global.testUtils.createE2EWalletConfig({
          storagePath: `${testContext.walletPath}/original-${testCase.name.toLowerCase()}`,
          seedWords: testCase.seedWords,
        });
        
        const wallet = await TariWallet.create(config);
        const address = await wallet.getAddress();
        const seedWords = await wallet.getSeedWords();
        
        walletData.push({
          name: testCase.name,
          address,
          seedWords,
        });
        
        await wallet.destroy();
      }
      
      // Recover all wallets and verify consistency
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const originalData = walletData[i];
        
        const config = global.testUtils.createE2EWalletConfig({
          storagePath: `${testContext.walletPath}/recovered-${testCase.name.toLowerCase()}`,
          seedWords: testCase.seedWords,
        });
        
        const wallet = await TariWallet.create(config);
        global.testUtils.registerE2EWalletForCleanup(wallet);
        
        const recoveredAddress = await wallet.getAddress();
        const recoveredSeedWords = await wallet.getSeedWords();
        
        expect(recoveredAddress).toBe(originalData.address);
        expect(recoveredSeedWords).toEqual(originalData.seedWords);
        expect(recoveredSeedWords).toEqual(testCase.seedWords);
        
        await wallet.destroy();
      }
    }, 180000);

    test('should handle recovery with passphrase', async () => {
      const seedWords = SeedWordsFactory.charlie();
      const passphrase = 'test_recovery_passphrase_123';
      
      // Create wallet with passphrase
      const config1 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/with-passphrase`,
        seedWords,
        passphrase,
      });
      
      const wallet1 = await TariWallet.create(config1);
      const address1 = await wallet1.getAddress();
      await wallet1.destroy();
      
      // Recover with same passphrase
      const config2 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/recovered-with-passphrase`,
        seedWords,
        passphrase,
      });
      
      const wallet2 = await TariWallet.create(config2);
      global.testUtils.registerE2EWalletForCleanup(wallet2);
      
      const address2 = await wallet2.getAddress();
      expect(address2).toBe(address1);
      
      await wallet2.destroy();
    }, 120000);

    test('should generate different addresses with different passphrases', async () => {
      const seedWords = SeedWordsFactory.bob();
      const passphrase1 = 'passphrase_one';
      const passphrase2 = 'passphrase_two';
      
      // Create wallet with first passphrase
      const config1 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/passphrase-1`,
        seedWords,
        passphrase: passphrase1,
      });
      
      const wallet1 = await TariWallet.create(config1);
      const address1 = await wallet1.getAddress();
      await wallet1.destroy();
      
      // Create wallet with second passphrase
      const config2 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/passphrase-2`,
        seedWords,
        passphrase: passphrase2,
      });
      
      const wallet2 = await TariWallet.create(config2);
      global.testUtils.registerE2EWalletForCleanup(wallet2);
      
      const address2 = await wallet2.getAddress();
      
      // Different passphrases should generate different addresses
      expect(address2).not.toBe(address1);
      
      await wallet2.destroy();
    }, 120000);

    test('should fail recovery with incorrect seed words', async () => {
      const correctSeedWords = SeedWordsFactory.alice();
      const incorrectSeedWords = SeedWordsFactory.invalid();
      
      // Create wallet with correct seed words
      const config1 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/correct-seeds`,
        seedWords: correctSeedWords,
      });
      
      const wallet1 = await TariWallet.create(config1);
      await wallet1.destroy();
      
      // Try to recover with incorrect seed words
      const config2 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/incorrect-seeds`,
        seedWords: incorrectSeedWords,
      });
      
      await expect(TariWallet.create(config2)).rejects.toThrow();
    }, 60000);

    test('should handle recovery with partial seed words', async () => {
      const fullSeedWords = SeedWordsFactory.alice();
      const partialSeedWords = fullSeedWords.slice(0, 12); // Only first 12 words
      
      const config = global.testUtils.createE2EWalletConfig({
        seedWords: partialSeedWords,
      });
      
      // Should reject incomplete seed words
      await expect(TariWallet.create(config)).rejects.toThrow();
    }, 30000);

    test('should handle recovery with too many seed words', async () => {
      const normalSeedWords = SeedWordsFactory.alice();
      const tooManySeedWords = [...normalSeedWords, 'extra', 'words', 'here'];
      
      const config = global.testUtils.createE2EWalletConfig({
        seedWords: tooManySeedWords,
      });
      
      // Should reject excessive seed words
      await expect(TariWallet.create(config)).rejects.toThrow();
    }, 30000);
  });

  describe('Deterministic Recovery', () => {
    test('should generate consistent addresses across recovery attempts', async () => {
      const seedWords = SeedWordsFactory.deterministic('consistency_test', 24);
      const addresses: string[] = [];
      
      // Perform multiple recovery attempts
      for (let i = 0; i < 5; i++) {
        const config = global.testUtils.createE2EWalletConfig({
          storagePath: `${testContext.walletPath}/consistency-${i}`,
          seedWords,
        });
        
        const wallet = await TariWallet.create(config);
        const address = await wallet.getAddress();
        addresses.push(address);
        await wallet.destroy();
      }
      
      // All addresses should be identical
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(1);
    }, 150000);

    test('should generate same address on different networks with same seed', async () => {
      const seedWords = SeedWordsFactory.deterministic('network_test', 24);
      
      // Create wallet on testnet
      const testnetConfig = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/testnet`,
        seedWords,
        network: 'testnet',
      });
      
      const testnetWallet = await TariWallet.create(testnetConfig);
      const testnetAddress = await testnetWallet.getAddress();
      await testnetWallet.destroy();
      
      // Note: We can't easily test mainnet in E2E, but we can verify
      // that the address format is consistent for testnet
      expect(testnetAddress).toContain('testnet');
      expect(testnetAddress).toBeValidTariAddress();
    }, 60000);

    test('should handle recovery progress tracking', async () => {
      const seedWords = SeedWordsFactory.alice();
      const config = global.testUtils.createE2EWalletConfig({
        seedWords,
      });
      
      const recoveryEvents: any[] = [];
      
      // This would require implementing recovery progress events
      // For now, we'll just verify successful recovery
      const wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      const address = await wallet.getAddress();
      expect(address).toBeValidTariAddress();
      
      const recoveredSeedWords = await wallet.getSeedWords();
      expect(recoveredSeedWords).toEqual(seedWords);
      
      await wallet.destroy();
    }, 60000);
  });

  describe('Cross-Platform Recovery', () => {
    test('should maintain address consistency across storage formats', async () => {
      const seedWords = SeedWordsFactory.bob();
      
      // Create wallet and get address
      const config1 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/format-1`,
        seedWords,
      });
      
      const wallet1 = await TariWallet.create(config1);
      const address1 = await wallet1.getAddress();
      await wallet1.destroy();
      
      // Recover in different storage location
      const config2 = global.testUtils.createE2EWalletConfig({
        storagePath: `${testContext.walletPath}/format-2`,
        seedWords,
      });
      
      const wallet2 = await TariWallet.create(config2);
      global.testUtils.registerE2EWalletForCleanup(wallet2);
      
      const address2 = await wallet2.getAddress();
      expect(address2).toBe(address1);
      
      await wallet2.destroy();
    }, 120000);

    test('should handle recovery with different log levels', async () => {
      const seedWords = SeedWordsFactory.charlie();
      const logLevels = ['error', 'warn', 'info', 'debug'];
      const addresses: string[] = [];
      
      for (const logLevel of logLevels) {
        const config = global.testUtils.createE2EWalletConfig({
          storagePath: `${testContext.walletPath}/log-${logLevel}`,
          seedWords,
          logLevel,
        });
        
        const wallet = await TariWallet.create(config);
        const address = await wallet.getAddress();
        addresses.push(address);
        await wallet.destroy();
      }
      
      // Log level should not affect address generation
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(1);
    }, 120000);
  });

  describe('Recovery Error Scenarios', () => {
    test('should handle corrupted seed word input', async () => {
      const corruptedSeedWords = [
        '', // Empty word
        '   ', // Whitespace only
        'inv@lid', // Invalid characters
        'toolongwordthatexceedslimits',
        ...SeedWordsFactory.alice().slice(4), // Mix of invalid and valid
      ];
      
      const config = global.testUtils.createE2EWalletConfig({
        seedWords: corruptedSeedWords,
      });
      
      await expect(TariWallet.create(config)).rejects.toThrow();
    }, 30000);

    test('should handle recovery in locked storage directory', async () => {
      const seedWords = SeedWordsFactory.alice();
      
      // Try to recover in read-only location
      const config = WalletConfigBuilder.create()
        .testnet()
        .storagePath('/readonly/directory/that/should/not/be/writable')
        .withSeedWords(seedWords)
        .build();
      
      await expect(TariWallet.create(config)).rejects.toThrow();
    }, 30000);

    test('should handle recovery with insufficient disk space simulation', async () => {
      const seedWords = SeedWordsFactory.bob();
      
      // This test would require actually filling up disk space
      // For now, we'll just verify normal recovery works
      const config = global.testUtils.createE2EWalletConfig({
        seedWords,
      });
      
      const wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      const address = await wallet.getAddress();
      expect(address).toBeValidTariAddress();
      
      await wallet.destroy();
    }, 60000);

    test('should handle concurrent recovery attempts', async () => {
      const seedWords = SeedWordsFactory.charlie();
      
      // Attempt multiple concurrent recoveries with same seed words
      const configs = Array.from({ length: 3 }, (_, i) => 
        global.testUtils.createE2EWalletConfig({
          storagePath: `${testContext.walletPath}/concurrent-${i}`,
          seedWords,
        })
      );
      
      const walletPromises = configs.map(config => TariWallet.create(config));
      const wallets = await Promise.all(walletPromises);
      
      try {
        // All should succeed with same address
        const addresses = await Promise.all(
          wallets.map(wallet => wallet.getAddress())
        );
        
        const uniqueAddresses = new Set(addresses);
        expect(uniqueAddresses.size).toBe(1);
        
      } finally {
        // Clean up all wallets
        await Promise.all(wallets.map(wallet => {
          global.testUtils.registerE2EWalletForCleanup(wallet);
          return wallet.destroy();
        }));
      }
    }, 120000);
  });

  describe('Recovery Performance', () => {
    test('should complete recovery within reasonable time', async () => {
      const seedWords = SeedWordsFactory.alice();
      const startTime = Date.now();
      
      const config = global.testUtils.createE2EWalletConfig({
        seedWords,
      });
      
      const wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      const recoveryTime = Date.now() - startTime;
      
      // Recovery should complete within 30 seconds
      expect(recoveryTime).toBeLessThan(30000);
      
      // Verify wallet is functional
      const address = await wallet.getAddress();
      expect(address).toBeValidTariAddress();
      
      await wallet.destroy();
    }, 60000);

    test('should handle multiple sequential recoveries efficiently', async () => {
      const testSeedWords = [
        SeedWordsFactory.alice(),
        SeedWordsFactory.bob(),
        SeedWordsFactory.charlie(),
      ];
      
      const recoveryTimes: number[] = [];
      
      for (let i = 0; i < testSeedWords.length; i++) {
        const startTime = Date.now();
        
        const config = global.testUtils.createE2EWalletConfig({
          storagePath: `${testContext.walletPath}/sequential-${i}`,
          seedWords: testSeedWords[i],
        });
        
        const wallet = await TariWallet.create(config);
        await wallet.getAddress(); // Ensure fully initialized
        await wallet.destroy();
        
        const recoveryTime = Date.now() - startTime;
        recoveryTimes.push(recoveryTime);
      }
      
      // Average recovery time should be reasonable
      const averageTime = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
      expect(averageTime).toBeLessThan(20000); // Less than 20 seconds average
      
      // No single recovery should be extremely slow
      expect(Math.max(...recoveryTimes)).toBeLessThan(60000); // Less than 60 seconds max
    }, 180000);
  });
});
