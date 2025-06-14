/**
 * Manual testing framework for funded wallets
 * Provides interactive test scenarios for real wallet operations
 */

import { TariWallet } from '@tari-project/tarijs-wallet';
import { WalletConfigBuilder, NetworkType } from '@tari-project/tarijs-wallet/testing';
import * as readline from 'readline';
import { tmpdir } from 'os';
import { join } from 'path';

// Manual test configuration
interface ManualTestConfig {
  senderSeedWords?: string[];
  receiverSeedWords?: string[];
  network: NetworkType;
  baseNodePublicKey?: string;
  baseNodeAddress?: string;
  testAmount: bigint;
  storagePath: string;
}

/**
 * Manual test suite for funded wallet operations
 */
export class ManualTestSuite {
  private sender?: TariWallet;
  private receiver?: TariWallet;
  private config: ManualTestConfig;
  private rl: readline.Interface;

  constructor(config: ManualTestConfig) {
    this.config = config;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Initialize the test suite
   */
  async setup(): Promise<void> {
    console.log('🚀 Setting up manual test wallets...');
    console.log(`Network: ${this.config.network}`);
    console.log(`Test amount: ${this.config.testAmount} µT`);
    console.log('');

    try {
      // Setup sender wallet
      await this.setupSenderWallet();
      
      // Setup receiver wallet  
      await this.setupReceiverWallet();
      
      // Connect to base node if specified
      if (this.config.baseNodePublicKey && this.config.baseNodeAddress) {
        await this.connectToBaseNode();
      }
      
      console.log('✅ Manual test setup complete!');
      console.log('');
    } catch (error) {
      console.error('❌ Setup failed:', error);
      throw error;
    }
  }

  /**
   * Run interactive test menu
   */
  async runInteractiveTests(): Promise<void> {
    let running = true;
    
    while (running) {
      console.log('\n📋 Manual Test Menu:');
      console.log('1. Check wallet balances');
      console.log('2. Send basic transaction');
      console.log('3. Send transaction with memo');
      console.log('4. Check transaction status');
      console.log('5. View transaction history');
      console.log('6. Test fee estimation');
      console.log('7. Test address validation');
      console.log('8. Test wallet sync');
      console.log('9. Stress test (multiple transactions)');
      console.log('10. Run all tests');
      console.log('0. Exit');
      console.log('');
      
      const choice = await this.prompt('Select test (0-10): ');
      
      try {
        switch (choice) {
          case '1':
            await this.testCheckBalances();
            break;
          case '2':
            await this.testBasicTransaction();
            break;
          case '3':
            await this.testTransactionWithMemo();
            break;
          case '4':
            await this.testTransactionStatus();
            break;
          case '5':
            await this.testTransactionHistory();
            break;
          case '6':
            await this.testFeeEstimation();
            break;
          case '7':
            await this.testAddressValidation();
            break;
          case '8':
            await this.testWalletSync();
            break;
          case '9':
            await this.testStressTest();
            break;
          case '10':
            await this.runAllTests();
            break;
          case '0':
            running = false;
            break;
          default:
            console.log('❌ Invalid choice. Please select 0-10.');
        }
      } catch (error) {
        console.error(`❌ Test failed: ${error}`);
        const continueChoice = await this.prompt('Continue with other tests? (y/n): ');
        if (continueChoice.toLowerCase() !== 'y') {
          running = false;
        }
      }
    }
  }

  /**
   * Test: Check wallet balances
   */
  async testCheckBalances(): Promise<void> {
    console.log('\n💰 Checking wallet balances...');
    
    if (!this.sender || !this.receiver) {
      throw new Error('Wallets not initialized');
    }
    
    const senderBalance = await this.sender.getBalance();
    const receiverBalance = await this.receiver.getBalance();
    
    console.log('Sender wallet:');
    console.log(`  Available: ${senderBalance.available} µT`);
    console.log(`  Pending In: ${senderBalance.pendingIncoming} µT`);
    console.log(`  Pending Out: ${senderBalance.pendingOutgoing} µT`);
    console.log(`  Timelocked: ${senderBalance.timelocked} µT`);
    
    console.log('Receiver wallet:');
    console.log(`  Available: ${receiverBalance.available} µT`);
    console.log(`  Pending In: ${receiverBalance.pendingIncoming} µT`);
    console.log(`  Pending Out: ${receiverBalance.pendingOutgoing} µT`);
    console.log(`  Timelocked: ${receiverBalance.timelocked} µT`);
    
    // Check if sender has sufficient funds
    const totalNeeded = this.config.testAmount + 5000n; // Amount + estimated fee
    if (senderBalance.available < totalNeeded) {
      console.log(`⚠️  Warning: Sender may not have sufficient funds for test transactions`);
      console.log(`   Required: ${totalNeeded} µT, Available: ${senderBalance.available} µT`);
    } else {
      console.log(`✅ Sender has sufficient funds for testing`);
    }
  }

  /**
   * Test: Send basic transaction
   */
  async testBasicTransaction(): Promise<void> {
    console.log('\n💸 Testing basic transaction...');
    
    if (!this.sender || !this.receiver) {
      throw new Error('Wallets not initialized');
    }
    
    const amount = this.config.testAmount;
    const receiverAddress = await this.receiver.getAddress();
    
    console.log(`Sending ${amount} µT to receiver...`);
    
    const balanceBefore = await this.sender.getBalance();
    console.log(`Sender balance before: ${balanceBefore.available} µT`);
    
    const txId = await this.sender.sendTransaction(receiverAddress, amount);
    console.log(`✅ Transaction sent: ${txId}`);
    
    // Wait a moment and check balance
    await this.wait(2000);
    const balanceAfter = await this.sender.getBalance();
    console.log(`Sender balance after: ${balanceAfter.available} µT`);
    console.log(`Pending outgoing: ${balanceAfter.pendingOutgoing} µT`);
    
    await this.waitForTransactionProgress(txId, this.sender);
  }

  /**
   * Test: Send transaction with memo
   */
  async testTransactionWithMemo(): Promise<void> {
    console.log('\n📝 Testing transaction with memo...');
    
    if (!this.sender || !this.receiver) {
      throw new Error('Wallets not initialized');
    }
    
    const amount = this.config.testAmount / 2n; // Use half the test amount
    const memo = `Manual test transaction at ${new Date().toISOString()}`;
    const receiverAddress = await this.receiver.getAddress();
    
    console.log(`Sending ${amount} µT with memo: "${memo}"`);
    
    const txId = await this.sender.sendTransaction(receiverAddress, amount, {
      message: memo,
    });
    
    console.log(`✅ Transaction with memo sent: ${txId}`);
    
    // Verify memo was stored
    try {
      const txMemo = await this.sender.getTransactionMemo(txId);
      if (txMemo === memo) {
        console.log(`✅ Memo correctly stored: "${txMemo}"`);
      } else {
        console.log(`⚠️  Memo mismatch. Expected: "${memo}", Got: "${txMemo}"`);
      }
    } catch (error) {
      console.log(`ℹ️  Could not retrieve memo: ${error}`);
    }
    
    await this.waitForTransactionProgress(txId, this.sender);
  }

  /**
   * Test: Check transaction status
   */
  async testTransactionStatus(): Promise<void> {
    console.log('\n🔍 Testing transaction status...');
    
    if (!this.sender) {
      throw new Error('Sender wallet not initialized');
    }
    
    const history = await this.sender.getTransactionHistory({ limit: 5 });
    
    if (history.length === 0) {
      console.log('ℹ️  No transactions found in history');
      return;
    }
    
    console.log(`Found ${history.length} recent transactions:`);
    
    for (const tx of history) {
      console.log(`\nTransaction ${tx.id}:`);
      console.log(`  Amount: ${tx.amount} µT`);
      console.log(`  Fee: ${tx.fee} µT`);
      console.log(`  Status: ${tx.status}`);
      console.log(`  Direction: ${tx.isInbound ? 'Inbound' : 'Outbound'}`);
      console.log(`  Confirmations: ${tx.confirmations}`);
      console.log(`  Timestamp: ${tx.timestamp.toISOString()}`);
      
      if (tx.message) {
        console.log(`  Message: "${tx.message}"`);
      }
    }
  }

  /**
   * Test: View transaction history
   */
  async testTransactionHistory(): Promise<void> {
    console.log('\n📜 Testing transaction history...');
    
    if (!this.sender || !this.receiver) {
      throw new Error('Wallets not initialized');
    }
    
    console.log('Sender transaction history:');
    const senderHistory = await this.sender.getTransactionHistory({ limit: 10 });
    this.displayTransactionHistory(senderHistory, 'sender');
    
    console.log('\nReceiver transaction history:');
    const receiverHistory = await this.receiver.getTransactionHistory({ limit: 10 });
    this.displayTransactionHistory(receiverHistory, 'receiver');
  }

  /**
   * Test: Fee estimation
   */
  async testFeeEstimation(): Promise<void> {
    console.log('\n💳 Testing fee estimation...');
    
    if (!this.sender) {
      throw new Error('Sender wallet not initialized');
    }
    
    const testAmounts = [
      this.config.testAmount / 4n,
      this.config.testAmount / 2n,
      this.config.testAmount,
      this.config.testAmount * 2n,
    ];
    
    console.log('Fee estimates for different amounts:');
    
    for (const amount of testAmounts) {
      try {
        const feeEstimate = await this.sender.estimateFee(amount);
        
        console.log(`\nAmount: ${amount} µT`);
        console.log(`  Estimated fee: ${feeEstimate.feeEstimate} µT`);
        console.log(`  Total value: ${feeEstimate.totalValue} µT`);
        console.log(`  Output count: ${feeEstimate.outputCount}`);
        
      } catch (error) {
        console.log(`\nAmount: ${amount} µT - Fee estimation failed: ${error}`);
      }
    }
    
    // Test fee statistics
    try {
      const feeStats = await this.sender.getFeePerGramStats();
      console.log('\nNetwork fee statistics:');
      console.log(`  Min fee per gram: ${feeStats.minFeePerGram} µT`);
      console.log(`  Avg fee per gram: ${feeStats.avgFeePerGram} µT`);
      console.log(`  Max fee per gram: ${feeStats.maxFeePerGram} µT`);
    } catch (error) {
      console.log(`\nFee statistics not available: ${error}`);
    }
  }

  /**
   * Test: Address validation
   */
  async testAddressValidation(): Promise<void> {
    console.log('\n🏠 Testing address validation...');
    
    if (!this.sender || !this.receiver) {
      throw new Error('Wallets not initialized');
    }
    
    const senderAddress = await this.sender.getAddress();
    const receiverAddress = await this.receiver.getAddress();
    
    // Test valid addresses
    console.log('Testing valid addresses:');
    console.log(`Sender address: ${senderAddress}`);
    console.log(`  Valid: ${await this.sender.validateAddress(senderAddress)}`);
    
    console.log(`Receiver address: ${receiverAddress}`);
    console.log(`  Valid: ${await this.sender.validateAddress(receiverAddress)}`);
    
    // Test invalid addresses
    console.log('\nTesting invalid addresses:');
    const invalidAddresses = [
      'invalid_address',
      '',
      'tari://mainnet/invalid',
      'not_a_tari_address',
    ];
    
    for (const invalidAddress of invalidAddresses) {
      try {
        const isValid = await this.sender.validateAddress(invalidAddress);
        console.log(`"${invalidAddress}": ${isValid}`);
      } catch (error) {
        console.log(`"${invalidAddress}": Validation failed - ${error}`);
      }
    }
    
    // Test emoji ID conversion
    console.log('\nTesting emoji ID conversion:');
    try {
      const emojiId = await this.sender.addressToEmojiId(senderAddress);
      console.log(`Sender emoji ID: ${emojiId}`);
      
      const convertedBack = await this.sender.emojiIdToAddress(emojiId);
      console.log(`Converted back: ${convertedBack}`);
      console.log(`Conversion correct: ${convertedBack === senderAddress}`);
    } catch (error) {
      console.log(`Emoji ID conversion failed: ${error}`);
    }
  }

  /**
   * Test: Wallet sync
   */
  async testWalletSync(): Promise<void> {
    console.log('\n🔄 Testing wallet sync...');
    
    if (!this.sender || !this.receiver) {
      throw new Error('Wallets not initialized');
    }
    
    console.log('Checking initial sync status:');
    const senderSync = await this.sender.getSyncStatus();
    const receiverSync = await this.receiver.getSyncStatus();
    
    console.log(`Sender sync status: ${senderSync.isSynced ? 'Synced' : 'Not synced'}`);
    console.log(`  Local height: ${senderSync.localHeight}`);
    console.log(`  Network height: ${senderSync.networkHeight}`);
    
    console.log(`Receiver sync status: ${receiverSync.isSynced ? 'Synced' : 'Not synced'}`);
    console.log(`  Local height: ${receiverSync.localHeight}`);
    console.log(`  Network height: ${receiverSync.networkHeight}`);
    
    if (!senderSync.isSynced || !receiverSync.isSynced) {
      console.log('\nStarting wallet sync...');
      
      const syncPromises = [];
      
      if (!senderSync.isSynced) {
        syncPromises.push(this.sender.startSync());
      }
      
      if (!receiverSync.isSynced) {
        syncPromises.push(this.receiver.startSync());
      }
      
      try {
        await Promise.all(syncPromises);
        console.log('✅ Sync completed successfully');
      } catch (error) {
        console.log(`⚠️  Sync encountered issues: ${error}`);
      }
    } else {
      console.log('✅ Both wallets are already synced');
    }
  }

  /**
   * Test: Stress test with multiple transactions
   */
  async testStressTest(): Promise<void> {
    console.log('\n🔥 Running stress test...');
    
    if (!this.sender || !this.receiver) {
      throw new Error('Wallets not initialized');
    }
    
    const txCountStr = await this.prompt('Enter number of transactions (1-10): ');
    const txCount = parseInt(txCountStr, 10);
    
    if (isNaN(txCount) || txCount < 1 || txCount > 10) {
      console.log('❌ Invalid transaction count. Must be 1-10.');
      return;
    }
    
    console.log(`Sending ${txCount} transactions...`);
    
    const receiverAddress = await this.receiver.getAddress();
    const amount = this.config.testAmount / BigInt(txCount * 2); // Split amount
    
    const txIds: string[] = [];
    const startTime = Date.now();
    
    try {
      for (let i = 0; i < txCount; i++) {
        console.log(`Sending transaction ${i + 1}/${txCount}...`);
        
        const txId = await this.sender.sendTransaction(receiverAddress, amount, {
          message: `Stress test transaction ${i + 1}/${txCount}`,
        });
        
        txIds.push(txId);
        console.log(`  Transaction ${i + 1} sent: ${txId}`);
        
        // Small delay between transactions
        await this.wait(1000);
      }
      
      const sendTime = Date.now() - startTime;
      console.log(`\n✅ All ${txCount} transactions sent in ${sendTime}ms`);
      console.log(`Average time per transaction: ${Math.round(sendTime / txCount)}ms`);
      
      // Monitor transaction progress
      console.log('\nMonitoring transaction progress...');
      for (const txId of txIds) {
        try {
          const status = await this.sender.getTransactionStatus(txId);
          console.log(`  ${txId}: ${status}`);
        } catch (error) {
          console.log(`  ${txId}: Status check failed - ${error}`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Stress test failed: ${error}`);
    }
  }

  /**
   * Run all tests in sequence
   */
  async runAllTests(): Promise<void> {
    console.log('\n🚀 Running all manual tests...');
    
    const tests = [
      { name: 'Check Balances', fn: () => this.testCheckBalances() },
      { name: 'Fee Estimation', fn: () => this.testFeeEstimation() },
      { name: 'Address Validation', fn: () => this.testAddressValidation() },
      { name: 'Wallet Sync', fn: () => this.testWalletSync() },
      { name: 'Basic Transaction', fn: () => this.testBasicTransaction() },
      { name: 'Transaction with Memo', fn: () => this.testTransactionWithMemo() },
      { name: 'Transaction Status', fn: () => this.testTransactionStatus() },
      { name: 'Transaction History', fn: () => this.testTransactionHistory() },
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      try {
        console.log(`\n🧪 Running: ${test.name}`);
        await test.fn();
        console.log(`✅ ${test.name} passed`);
        passed++;
      } catch (error) {
        console.log(`❌ ${test.name} failed: ${error}`);
        failed++;
        
        const continueChoice = await this.prompt('Continue with remaining tests? (y/n): ');
        if (continueChoice.toLowerCase() !== 'y') {
          break;
        }
      }
    }
    
    console.log(`\n📊 Test Summary:`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total: ${passed + failed}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    
    try {
      if (this.sender) {
        await this.sender.destroy();
        console.log('✅ Sender wallet cleaned up');
      }
      
      if (this.receiver) {
        await this.receiver.destroy();
        console.log('✅ Receiver wallet cleaned up');
      }
      
      this.rl.close();
      console.log('✅ Manual test cleanup complete');
      
    } catch (error) {
      console.error('⚠️  Cleanup encountered issues:', error);
    }
  }

  // Private helper methods
  
  private async setupSenderWallet(): Promise<void> {
    console.log('Setting up sender wallet...');
    
    if (!this.config.senderSeedWords) {
      throw new Error('Sender seed words required for manual testing');
    }
    
    const config = WalletConfigBuilder.create()
      .network(this.config.network)
      .storagePath(join(this.config.storagePath, 'sender'))
      .withSeedWords(this.config.senderSeedWords)
      .debug()
      .build();
    
    this.sender = await TariWallet.create(config);
    const address = await this.sender.getAddress();
    console.log(`Sender wallet address: ${address}`);
  }

  private async setupReceiverWallet(): Promise<void> {
    console.log('Setting up receiver wallet...');
    
    if (!this.config.receiverSeedWords) {
      throw new Error('Receiver seed words required for manual testing');
    }
    
    const config = WalletConfigBuilder.create()
      .network(this.config.network)
      .storagePath(join(this.config.storagePath, 'receiver'))
      .withSeedWords(this.config.receiverSeedWords)
      .debug()
      .build();
    
    this.receiver = await TariWallet.create(config);
    const address = await this.receiver.getAddress();
    console.log(`Receiver wallet address: ${address}`);
  }

  private async connectToBaseNode(): Promise<void> {
    if (!this.config.baseNodePublicKey || !this.config.baseNodeAddress) {
      return;
    }
    
    console.log('Connecting to base node...');
    console.log(`  Public key: ${this.config.baseNodePublicKey}`);
    console.log(`  Address: ${this.config.baseNodeAddress}`);
    
    if (this.sender) {
      await this.sender.setBaseNode(
        this.config.baseNodePublicKey,
        this.config.baseNodeAddress
      );
    }
    
    if (this.receiver) {
      await this.receiver.setBaseNode(
        this.config.baseNodePublicKey,
        this.config.baseNodeAddress
      );
    }
    
    console.log('✅ Base node configured');
  }

  private async waitForTransactionProgress(txId: string, wallet: TariWallet): Promise<void> {
    console.log(`Monitoring transaction ${txId}...`);
    
    const maxWaitTime = 60000; // 1 minute
    const checkInterval = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await wallet.getTransactionStatus(txId);
        console.log(`  Status: ${status}`);
        
        if (status === 'mined_confirmed' || status === 'cancelled' || status === 'rejected') {
          break;
        }
        
        await this.wait(checkInterval);
      } catch (error) {
        console.log(`  Status check failed: ${error}`);
        break;
      }
    }
  }

  private displayTransactionHistory(history: any[], walletName: string): void {
    if (history.length === 0) {
      console.log(`  No transactions found for ${walletName}`);
      return;
    }
    
    console.log(`  Found ${history.length} transactions for ${walletName}:`);
    
    for (const tx of history) {
      console.log(`    ${tx.id}:`);
      console.log(`      Amount: ${tx.amount} µT`);
      console.log(`      Status: ${tx.status}`);
      console.log(`      Direction: ${tx.isInbound ? 'Inbound' : 'Outbound'}`);
      console.log(`      Time: ${tx.timestamp.toISOString()}`);
    }
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export configuration helper
export function createManualTestConfig(): ManualTestConfig {
  const senderSeedWords = process.env.SENDER_SEED_WORDS?.split(' ');
  const receiverSeedWords = process.env.RECEIVER_SEED_WORDS?.split(' ');
  
  if (!senderSeedWords || senderSeedWords.length !== 24) {
    throw new Error('Set SENDER_SEED_WORDS environment variable (24 space-separated words)');
  }
  
  if (!receiverSeedWords || receiverSeedWords.length !== 24) {
    throw new Error('Set RECEIVER_SEED_WORDS environment variable (24 space-separated words)');
  }
  
  return {
    senderSeedWords,
    receiverSeedWords,
    network: (process.env.TARI_NETWORK as NetworkType) || NetworkType.Testnet,
    baseNodePublicKey: process.env.TARI_BASE_NODE_PUBLIC_KEY,
    baseNodeAddress: process.env.TARI_BASE_NODE_ADDRESS,
    testAmount: BigInt(process.env.TEST_AMOUNT || '1000000'), // 0.001 Tari default
    storagePath: process.env.TEST_STORAGE_PATH || join(tmpdir(), 'manual-test-wallets'),
  };
}
