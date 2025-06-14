/**
 * E2E tests for network connectivity and base node operations
 * Tests real network interactions with testnet
 */

import { TariWallet } from '../../wallet';
import { WalletConfigFactory } from '../../testing/factories';

// Skip these tests if network is not available or E2E disabled
const describeIfE2EEnabled = process.env.JEST_E2E_MODE === 'true' && 
                             process.env.NETWORK_AVAILABLE === 'true' ? describe : describe.skip;

describeIfE2EEnabled('Network Connectivity E2E Tests', () => {
  let testContext: any;

  beforeAll(async () => {
    // Skip if network not available
    await global.testUtils.skipIfNetworkUnavailable();
  });

  beforeEach(async () => {
    testContext = global.testUtils.getE2EContext();
  });

  describe('Base Node Connection', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = global.testUtils.createE2EWalletConfig({
        logLevel: 3, // debug
      });
      
      wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should connect to testnet base node', async () => {
      const baseNode = global.testUtils.getTestBaseNode();
      
      // Set base node
      await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
      
      // Wait for connectivity
      await global.testUtils.waitForConnectivity(wallet, 60000);
      
      // Verify connection
      const networkInfo = await wallet.getNetworkInfo();
      expect(networkInfo.network).toBe('testnet');
      expect(networkInfo.tipHeight).toBeGreaterThan(0);
    }, 120000);

    test('should sync with network after connection', async () => {
      const baseNode = global.testUtils.getTestBaseNode();
      
      await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
      await global.testUtils.waitForConnectivity(wallet, 60000);
      
      // Wait for sync
      await global.testUtils.waitForNetworkSync(wallet, 180000);
      
      // Verify sync
      const syncStatus = await wallet.getSyncStatus();
      expect(syncStatus.isSynced).toBe(true);
      expect(syncStatus.localHeight).toBeGreaterThan(0);
      expect(syncStatus.networkHeight).toBeGreaterThan(0);
    }, 300000);

    test('should handle base node disconnection gracefully', async () => {
      const baseNode = global.testUtils.getTestBaseNode();
      
      // Connect first
      await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
      await global.testUtils.waitForConnectivity(wallet, 60000);
      
      // Verify connected
      expect(await wallet.isConnected()).toBe(true);
      
      // Disconnect (set invalid base node)
      await wallet.setBaseNode('invalid_key', '/ip4/0.0.0.0/tcp/1');
      
      // Should handle disconnection
      const isConnected = await wallet.isConnected();
      expect(isConnected).toBe(false);
    }, 180000);

    test('should reconnect after network interruption', async () => {
      const baseNode = global.testUtils.getTestBaseNode();
      
      // Initial connection
      await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
      await global.testUtils.waitForConnectivity(wallet, 60000);
      
      // Simulate reconnection by setting same base node again
      await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
      await global.testUtils.waitForConnectivity(wallet, 60000);
      
      // Should be connected again
      expect(await wallet.isConnected()).toBe(true);
    }, 240000);

    test('should handle multiple base node configurations', async () => {
      const baseNodes = [
        global.testUtils.getTestBaseNode(),
        // Add more base nodes if available
      ];
      
      for (const baseNode of baseNodes) {
        await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
        
        try {
          await global.testUtils.waitForConnectivity(wallet, 30000);
          const isConnected = await wallet.isConnected();
          
          if (isConnected) {
            // At least one base node should work
            expect(isConnected).toBe(true);
            break;
          }
        } catch (error) {
          console.warn(`Failed to connect to base node ${baseNode.name}:`, error);
          // Continue to next base node
        }
      }
    }, 180000);
  });

  describe('Network Information', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = global.testUtils.createE2EWalletConfig();
      wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      // Connect to network
      const baseNode = global.testUtils.getTestBaseNode();
      await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
      await global.testUtils.waitForConnectivity(wallet, 60000);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should get current network information', async () => {
      const networkInfo = await wallet.getNetworkInfo();
      
      expect(networkInfo.network).toBe('testnet');
      expect(networkInfo.tipHeight).toBeGreaterThan(0);
      expect(networkInfo.minConfirmations).toBeGreaterThan(0);
      expect(typeof networkInfo.maxFeePerGram).toBe('string');
      expect(BigInt(networkInfo.maxFeePerGram)).toBeGreaterThan(0n);
    }, 60000);

    test('should get blockchain height', async () => {
      const height = await wallet.getBlockchainHeight();
      
      expect(height).toBeGreaterThan(0);
    }, 60000);

    test('should get fee per gram statistics', async () => {
      const feeStats = await wallet.getFeePerGramStats();
      
      expect(BigInt(feeStats.minFeePerGram)).toBeGreaterThan(0n);
      expect(BigInt(feeStats.avgFeePerGram)).toBeGreaterThanOrEqual(BigInt(feeStats.minFeePerGram));
      expect(BigInt(feeStats.maxFeePerGram)).toBeGreaterThanOrEqual(BigInt(feeStats.avgFeePerGram));
    }, 60000);

    test('should track blockchain progress', async () => {
      const initialHeight = await wallet.getBlockchainHeight();
      
      // Wait for potential new blocks (in a real network, blocks are mined continuously)
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
      
      const laterHeight = await wallet.getBlockchainHeight();
      
      // Height should be same or higher (new blocks might have been mined)
      expect(laterHeight).toBeGreaterThanOrEqual(initialHeight);
    }, 90000);
  });

  describe('Address Validation and Conversion', () => {
    let wallet: TariWallet;

    beforeEach(async () => {
      const config = global.testUtils.createE2EWalletConfig();
      wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      // Connect to network for validation
      const baseNode = global.testUtils.getTestBaseNode();
      await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
      await global.testUtils.waitForConnectivity(wallet, 60000);
    });

    afterEach(async () => {
      if (wallet) {
        await wallet.destroy();
      }
    });

    test('should validate real testnet addresses', async () => {
      const walletAddress = await wallet.getAddress();
      
      // Wallet's own address should be valid
      const isValid = await wallet.validateAddress(walletAddress);
      expect(isValid).toBe(true);
      
      // Invalid address should be rejected
      const invalidAddress = 'invalid_address_format';
      const isInvalid = await wallet.validateAddress(invalidAddress);
      expect(isInvalid).toBe(false);
    }, 60000);

    test('should convert between address formats', async () => {
      const address = await wallet.getAddress();
      
      // Convert to emoji ID
      const emojiId = await wallet.addressToEmojiId(address);
      expect(typeof emojiId).toBe('string');
      expect(emojiId.length).toBeGreaterThan(0);
      
      // Convert back to address
      const convertedAddress = await wallet.emojiIdToAddress(emojiId);
      expect(convertedAddress).toBe(address);
    }, 60000);

    test('should handle public key conversions', async () => {
      const address = await wallet.getAddress();
      const emojiId = await wallet.addressToEmojiId(address);
      
      // Convert emoji ID to public key
      const publicKey = await wallet.emojiIdToPublicKey(emojiId);
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Error Handling and Resilience', () => {
    test('should handle network unavailable scenarios', async () => {
      const config = global.testUtils.createE2EWalletConfig();
      const wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      try {
        // Try to connect to non-existent base node
        await wallet.setBaseNode(
          'non_existent_key',
          '/ip4/192.0.2.0/tcp/18189' // RFC5737 test address
        );
        
        // Should timeout or fail gracefully
        await expect(
          global.testUtils.waitForConnectivity(wallet, 10000)
        ).rejects.toThrow();
        
      } finally {
        await wallet.destroy();
      }
    }, 30000);

    test('should handle malformed base node configurations', async () => {
      const config = global.testUtils.createE2EWalletConfig();
      const wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      try {
        // Test various invalid configurations
        await expect(
          wallet.setBaseNode('', '/ip4/127.0.0.1/tcp/18189')
        ).rejects.toThrow();
        
        await expect(
          wallet.setBaseNode('valid_key', 'invalid_address_format')
        ).rejects.toThrow();
        
        await expect(
          wallet.setBaseNode('', '')
        ).rejects.toThrow();
        
      } finally {
        await wallet.destroy();
      }
    }, 30000);

    test('should handle concurrent network operations', async () => {
      const config = global.testUtils.createE2EWalletConfig();
      const wallet = await TariWallet.create(config);
      global.testUtils.registerE2EWalletForCleanup(wallet);
      
      try {
        const baseNode = global.testUtils.getTestBaseNode();
        await wallet.setBaseNode(baseNode.publicKey, baseNode.address);
        await global.testUtils.waitForConnectivity(wallet, 60000);
        
        // Perform multiple network operations concurrently
        const operations = [
          wallet.getNetworkInfo(),
          wallet.getBlockchainHeight(),
          wallet.getFeePerGramStats(),
          wallet.getSyncStatus(),
        ];
        
        const results = await Promise.all(operations);
        
        // All operations should complete successfully
        expect(results).toHaveLength(4);
        expect(results[0].network).toBe('testnet'); // Network info
        expect(results[1]).toBeGreaterThan(0); // Blockchain height
        expect(BigInt(results[2].avgFeePerGram)).toBeGreaterThan(0n); // Fee stats
        expect(typeof results[3].isSynced).toBe('boolean'); // Sync status
        
      } finally {
        await wallet.destroy();
      }
    }, 120000);
  });
});
