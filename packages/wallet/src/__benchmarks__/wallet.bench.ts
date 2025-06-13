/**
 * Performance benchmarks for wallet operations
 * Measures operation timings and memory usage
 */

import Benchmark from 'benchmark';
import { TariWallet } from '../wallet';
import { WalletConfigFactory } from '../testing/factories';
import { WalletConfigBuilder } from '../testing/builders';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Benchmark configuration
interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  maxTime: number; // seconds
  minSamples: number;
}

const BENCHMARK_CONFIG: BenchmarkConfig = {
  iterations: 100,
  warmupIterations: 10,
  maxTime: 60,
  minSamples: 20,
};

/**
 * Wallet benchmark suite
 */
export class WalletBenchmarkSuite {
  private suite: Benchmark.Suite;
  private wallets: TariWallet[] = [];
  private results: BenchmarkResult[] = [];

  constructor(private config: BenchmarkConfig = BENCHMARK_CONFIG) {
    this.suite = new Benchmark.Suite('WalletBenchmarks', {
      onStart: () => console.log('🚀 Starting wallet benchmarks...'),
      onComplete: () => this.generateReport(),
    });
  }

  /**
   * Run all wallet benchmarks
   */
  async runAllBenchmarks(): Promise<BenchmarkResult[]> {
    console.log('📊 Setting up wallet benchmark suite...');
    
    // Setup benchmarks
    await this.setupWalletCreationBenchmarks();
    await this.setupWalletOperationBenchmarks();
    await this.setupTransactionBenchmarks();
    await this.setupBalanceBenchmarks();
    await this.setupAddressBenchmarks();
    
    // Run benchmarks
    return new Promise((resolve) => {
      this.suite
        .on('cycle', (event: Benchmark.Event) => {
          console.log(`  ${String(event.target)}`);
          
          if (event.target) {
            this.results.push({
              name: event.target.name || 'Unknown',
              hz: event.target.hz || 0,
              mean: event.target.stats?.mean || 0,
              deviation: event.target.stats?.deviation || 0,
              variance: event.target.stats?.variance || 0,
              samples: event.target.stats?.sample?.length || 0,
              error: event.target.error,
            });
          }
        })
        .on('complete', async () => {
          await this.cleanup();
          resolve(this.results);
        })
        .run({ async: true });
    });
  }

  /**
   * Setup wallet creation benchmarks
   */
  private async setupWalletCreationBenchmarks(): Promise<void> {
    // Benchmark: Wallet creation
    this.suite.add('wallet_creation', {
      defer: true,
      fn: async (deferred: any) => {
        const config = WalletConfigBuilder.create()
          .testnet()
          .storagePath(this.getTempPath())
          .build();
        
        const wallet = await TariWallet.create(config);
        this.wallets.push(wallet);
        
        deferred.resolve();
      },
      setup: () => {
        // Warmup
      },
      teardown: async () => {
        // Cleanup will be done in main cleanup
      },
    });

    // Benchmark: Wallet creation with seed words
    this.suite.add('wallet_creation_with_seeds', {
      defer: true,
      fn: async (deferred: any) => {
        const seedWords = this.generateTestSeedWords();
        const config = WalletConfigBuilder.create()
          .testnet()
          .storagePath(this.getTempPath())
          .withSeedWords(seedWords)
          .build();
        
        const wallet = await TariWallet.create(config);
        this.wallets.push(wallet);
        
        deferred.resolve();
      },
    });

    // Benchmark: Wallet destruction
    this.suite.add('wallet_destruction', {
      defer: true,
      fn: async (deferred: any) => {
        if (this.wallets.length > 0) {
          const wallet = this.wallets.pop();
          if (wallet) {
            await wallet.destroy();
          }
        }
        deferred.resolve();
      },
      setup: async () => {
        // Create wallet for destruction
        const config = WalletConfigBuilder.create()
          .testnet()
          .storagePath(this.getTempPath())
          .build();
        
        const wallet = await TariWallet.create(config);
        this.wallets.push(wallet);
      },
    });
  }

  /**
   * Setup wallet operation benchmarks
   */
  private async setupWalletOperationBenchmarks(): Promise<void> {
    // Create a persistent wallet for operations
    const config = WalletConfigBuilder.create()
      .testnet()
      .storagePath(this.getTempPath())
      .build();
    
    const testWallet = await TariWallet.create(config);
    this.wallets.push(testWallet);

    // Benchmark: Get wallet address
    this.suite.add('get_address', {
      defer: true,
      fn: async (deferred: any) => {
        await testWallet.getAddress();
        deferred.resolve();
      },
    });

    // Benchmark: Get seed words
    this.suite.add('get_seed_words', {
      defer: true,
      fn: async (deferred: any) => {
        await testWallet.getSeedWords();
        deferred.resolve();
      },
    });

    // Benchmark: Address validation
    this.suite.add('validate_address', {
      defer: true,
      fn: async (deferred: any) => {
        const address = await testWallet.getAddress();
        await testWallet.validateAddress(address);
        deferred.resolve();
      },
    });

    // Benchmark: Emoji ID conversion
    this.suite.add('address_to_emoji_id', {
      defer: true,
      fn: async (deferred: any) => {
        const address = await testWallet.getAddress();
        await testWallet.addressToEmojiId(address);
        deferred.resolve();
      },
    });
  }

  /**
   * Setup transaction benchmarks
   */
  private async setupTransactionBenchmarks(): Promise<void> {
    // Create wallets for transaction tests
    const senderConfig = WalletConfigBuilder.create()
      .testnet()
      .storagePath(this.getTempPath())
      .build();
    
    const receiverConfig = WalletConfigBuilder.create()
      .testnet()
      .storagePath(this.getTempPath())
      .build();
    
    const sender = await TariWallet.create(senderConfig);
    const receiver = await TariWallet.create(receiverConfig);
    
    this.wallets.push(sender, receiver);
    
    const receiverAddress = await receiver.getAddress();

    // Benchmark: Fee estimation
    this.suite.add('estimate_fee', {
      defer: true,
      fn: async (deferred: any) => {
        try {
          await sender.estimateFee(1000000n); // 0.001 Tari
        } catch {
          // Fee estimation might fail without funds, that's ok for benchmarking
        }
        deferred.resolve();
      },
    });

    // Benchmark: Transaction validation (without sending)
    this.suite.add('validate_transaction_params', {
      defer: true,
      fn: async (deferred: any) => {
        // Just validate the parameters without sending
        const amount = 1000000n;
        const isValidAmount = amount > 0n;
        const isValidAddress = receiverAddress.startsWith('tari://');
        
        if (isValidAmount && isValidAddress) {
          // Parameters are valid
        }
        
        deferred.resolve();
      },
    });

    // Benchmark: Get transaction history
    this.suite.add('get_transaction_history', {
      defer: true,
      fn: async (deferred: any) => {
        await sender.getTransactionHistory({ limit: 10 });
        deferred.resolve();
      },
    });

    // Benchmark: Get pending transactions
    this.suite.add('get_pending_transactions', {
      defer: true,
      fn: async (deferred: any) => {
        await sender.getPendingTransactions();
        deferred.resolve();
      },
    });
  }

  /**
   * Setup balance benchmarks
   */
  private async setupBalanceBenchmarks(): Promise<void> {
    // Create wallet for balance tests
    const config = WalletConfigBuilder.create()
      .testnet()
      .storagePath(this.getTempPath())
      .build();
    
    const wallet = await TariWallet.create(config);
    this.wallets.push(wallet);

    // Benchmark: Get balance
    this.suite.add('get_balance', {
      defer: true,
      fn: async (deferred: any) => {
        await wallet.getBalance();
        deferred.resolve();
      },
    });

    // Benchmark: Balance calculations
    this.suite.add('balance_calculations', {
      defer: true,
      fn: async (deferred: any) => {
        const balance = await wallet.getBalance();
        
        // Perform common balance calculations
        const total = balance.available + balance.pendingIncoming + balance.timelocked;
        const spendable = balance.available;
        const pending = balance.pendingIncoming + balance.pendingOutgoing;
        
        // Use values to prevent optimization
        if (total >= 0n && spendable >= 0n && pending >= 0n) {
          // Calculations complete
        }
        
        deferred.resolve();
      },
    });
  }

  /**
   * Setup address benchmarks
   */
  private async setupAddressBenchmarks(): Promise<void> {
    // Create wallet for address tests
    const config = WalletConfigBuilder.create()
      .testnet()
      .storagePath(this.getTempPath())
      .build();
    
    const wallet = await TariWallet.create(config);
    this.wallets.push(wallet);
    
    const address = await wallet.getAddress();
    const emojiId = await wallet.addressToEmojiId(address);

    // Benchmark: Address format validation
    this.suite.add('address_format_validation', {
      defer: true,
      fn: async (deferred: any) => {
        const isValid = address.startsWith('tari://') && 
                       address.includes('testnet') && 
                       address.length > 20;
        
        if (isValid) {
          // Address format is valid
        }
        
        deferred.resolve();
      },
    });

    // Benchmark: Emoji ID to address conversion
    this.suite.add('emoji_id_to_address', {
      defer: true,
      fn: async (deferred: any) => {
        await wallet.emojiIdToAddress(emojiId);
        deferred.resolve();
      },
    });

    // Benchmark: Address comparison
    this.suite.add('address_comparison', {
      defer: true,
      fn: async (deferred: any) => {
        const address1 = await wallet.getAddress();
        const address2 = await wallet.getAddress();
        const isEqual = address1 === address2;
        
        if (isEqual) {
          // Addresses match
        }
        
        deferred.resolve();
      },
    });
  }

  /**
   * Generate comprehensive benchmark report
   */
  private generateReport(): void {
    console.log('\n📊 Wallet Benchmark Results\n');
    console.log('=' * 80);
    
    // Sort results by performance (ops/sec)
    const sortedResults = this.results.sort((a, b) => b.hz - a.hz);
    
    console.log(`${'Operation'.<40} ${'Ops/sec'.<12} ${'Mean (ms)'.<12} ${'±'.<8} ${'Samples'.<8}`);
    console.log('-' * 80);
    
    for (const result of sortedResults) {
      const opsPerSec = result.hz.toFixed(2);
      const meanMs = (result.mean * 1000).toFixed(3);
      const deviation = (result.deviation * 1000).toFixed(2);
      
      console.log(
        `${result.name.<40} ${opsPerSec.<12} ${meanMs.<12} ${`±${deviation}`.<8} ${result.samples.<8}`
      );
    }
    
    console.log('-' * 80);
    
    // Performance analysis
    this.analyzePerformance();
    
    // Memory usage analysis
    this.analyzeMemoryUsage();
    
    // Recommendations
    this.generateRecommendations();
  }

  /**
   * Analyze performance characteristics
   */
  private analyzePerformance(): void {
    console.log('\n🔍 Performance Analysis:\n');
    
    const fastOperations = this.results.filter(r => r.hz > 100);
    const slowOperations = this.results.filter(r => r.hz < 10);
    const errorOperations = this.results.filter(r => r.error);
    
    console.log(`Fast operations (>100 ops/sec): ${fastOperations.length}`);
    if (fastOperations.length > 0) {
      fastOperations.forEach(op => {
        console.log(`  • ${op.name}: ${op.hz.toFixed(2)} ops/sec`);
      });
    }
    
    console.log(`\nSlow operations (<10 ops/sec): ${slowOperations.length}`);
    if (slowOperations.length > 0) {
      slowOperations.forEach(op => {
        console.log(`  • ${op.name}: ${op.hz.toFixed(2)} ops/sec`);
      });
    }
    
    console.log(`\nError operations: ${errorOperations.length}`);
    if (errorOperations.length > 0) {
      errorOperations.forEach(op => {
        console.log(`  • ${op.name}: ${op.error}`);
      });
    }
  }

  /**
   * Analyze memory usage patterns
   */
  private analyzeMemoryUsage(): void {
    console.log('\n💾 Memory Usage Analysis:\n');
    
    if (process.memoryUsage) {
      const memory = process.memoryUsage();
      
      console.log(`RSS (Resident Set Size): ${(memory.rss / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Heap Total: ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Heap Used: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`External: ${(memory.external / 1024 / 1024).toFixed(2)} MB`);
      
      const heapUsagePercent = (memory.heapUsed / memory.heapTotal) * 100;
      console.log(`Heap Usage: ${heapUsagePercent.toFixed(1)}%`);
      
      if (heapUsagePercent > 80) {
        console.log('⚠️  High heap usage detected');
      }
    }
    
    // Force garbage collection if available
    if (global.gc) {
      console.log('\n🧹 Running garbage collection...');
      global.gc();
      
      const memoryAfterGC = process.memoryUsage();
      console.log(`Heap after GC: ${(memoryAfterGC.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(): void {
    console.log('\n💡 Performance Recommendations:\n');
    
    const recommendations: string[] = [];
    
    // Analyze operation patterns
    const creationOps = this.results.filter(r => r.name.includes('creation'));
    const getOps = this.results.filter(r => r.name.includes('get_'));
    const validationOps = this.results.filter(r => r.name.includes('validate'));
    
    if (creationOps.some(op => op.hz < 5)) {
      recommendations.push('Consider wallet connection pooling for frequent creation/destruction');
    }
    
    if (getOps.some(op => op.hz < 50)) {
      recommendations.push('Implement caching for frequently accessed data (addresses, balances)');
    }
    
    if (validationOps.some(op => op.hz < 100)) {
      recommendations.push('Optimize address validation with client-side checks before FFI calls');
    }
    
    // Memory recommendations
    const memory = process.memoryUsage();
    if (memory.heapUsed / memory.heapTotal > 0.8) {
      recommendations.push('High memory usage detected - consider implementing object pooling');
    }
    
    // Error rate recommendations
    const errorRate = this.results.filter(r => r.error).length / this.results.length;
    if (errorRate > 0.1) {
      recommendations.push('High error rate detected - review error handling and retry logic');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Performance looks good! No specific recommendations at this time.');
    }
    
    recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  }

  /**
   * Cleanup benchmark resources
   */
  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up benchmark resources...');
    
    for (const wallet of this.wallets) {
      try {
        await wallet.destroy();
      } catch (error) {
        console.warn(`Warning: Failed to cleanup wallet: ${error}`);
      }
    }
    
    this.wallets = [];
    console.log('✅ Benchmark cleanup complete');
  }

  // Helper methods
  
  private getTempPath(): string {
    return join(tmpdir(), `wallet-bench-${randomUUID()}`);
  }

  private generateTestSeedWords(): string[] {
    // Generate deterministic test seed words
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    ];
    return words;
  }
}

/**
 * Benchmark result interface
 */
interface BenchmarkResult {
  name: string;
  hz: number;
  mean: number;
  deviation: number;
  variance: number;
  samples: number;
  error?: any;
}

/**
 * Run wallet benchmarks
 */
export async function runWalletBenchmarks(): Promise<BenchmarkResult[]> {
  const suite = new WalletBenchmarkSuite();
  return await suite.runAllBenchmarks();
}

// Export for direct usage
export default WalletBenchmarkSuite;
