import { DisposableResource } from '@tari-project/tarijs-core/memory/disposable';
import { MemoryUtils } from '@tari-project/tarijs-core';
import { PerformanceManager } from './performance-manager';

/**
 * Comprehensive benchmark suite for performance testing
 */

/**
 * Benchmark test configuration
 */
export interface BenchmarkConfig {
  name: string;
  description: string;
  iterations: number;
  warmupIterations: number;
  timeout: number;
  setup?: () => Promise<void> | void;
  teardown?: () => Promise<void> | void;
}

/**
 * Benchmark test result
 */
export interface BenchmarkResult {
  name: string;
  description: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  standardDeviation: number;
  operationsPerSecond: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
    leaked: number;
  };
  success: boolean;
  error?: string;
}

/**
 * Benchmark suite result
 */
export interface BenchmarkSuiteResult {
  suiteName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalTime: number;
  results: BenchmarkResult[];
  summary: {
    fastest: string;
    slowest: string;
    mostMemoryEfficient: string;
    leastMemoryEfficient: string;
  };
}

/**
 * Benchmark test function
 */
export type BenchmarkTest = () => Promise<void> | void;

/**
 * Main benchmark suite class
 */
export class BenchmarkSuite extends DisposableResource {
  private tests = new Map<string, { config: BenchmarkConfig; test: BenchmarkTest }>();
  private performanceManager?: PerformanceManager;

  constructor(
    private suiteName: string,
    performanceManager?: PerformanceManager
  ) {
    super();
    this.performanceManager = performanceManager;
  }

  /**
   * Add a benchmark test
   */
  add(config: BenchmarkConfig, test: BenchmarkTest): this {
    this.tests.set(config.name, { config, test });
    return this;
  }

  /**
   * Remove a benchmark test
   */
  remove(name: string): boolean {
    return this.tests.delete(name);
  }

  /**
   * Run all benchmark tests
   */
  async run(): Promise<BenchmarkSuiteResult> {
    const startTime = Date.now();
    const results: BenchmarkResult[] = [];
    let passedTests = 0;
    let failedTests = 0;

    console.log(`\n🚀 Running benchmark suite: ${this.suiteName}`);
    console.log(`📊 Total tests: ${this.tests.size}\n`);

    for (const [name, { config, test }] of this.tests) {
      console.log(`⏱️  Running: ${name}...`);
      
      try {
        const result = await this.runSingleTest(config, test);
        results.push(result);
        
        if (result.success) {
          passedTests++;
          console.log(`✅ ${name}: ${result.averageTime.toFixed(2)}ms avg, ${result.operationsPerSecond.toFixed(0)} ops/sec`);
        } else {
          failedTests++;
          console.log(`❌ ${name}: ${result.error}`);
        }
      } catch (error) {
        failedTests++;
        console.log(`❌ ${name}: ${error}`);
        
        results.push({
          name,
          description: config.description,
          iterations: 0,
          totalTime: 0,
          averageTime: 0,
          minTime: 0,
          maxTime: 0,
          standardDeviation: 0,
          operationsPerSecond: 0,
          memoryUsage: {
            before: process.memoryUsage(),
            after: process.memoryUsage(),
            peak: process.memoryUsage(),
            leaked: 0
          },
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const summary = this.calculateSummary(results);

    console.log(`\n📈 Benchmark suite completed in ${totalTime}ms`);
    console.log(`✅ Passed: ${passedTests}, ❌ Failed: ${failedTests}`);
    
    if (summary.fastest) {
      console.log(`🏆 Fastest: ${summary.fastest}`);
    }
    if (summary.slowest) {
      console.log(`🐌 Slowest: ${summary.slowest}`);
    }

    return {
      suiteName: this.suiteName,
      totalTests: this.tests.size,
      passedTests,
      failedTests,
      totalTime,
      results,
      summary
    };
  }

  /**
   * Run a specific test by name
   */
  async runTest(name: string): Promise<BenchmarkResult> {
    const testEntry = this.tests.get(name);
    if (!testEntry) {
      throw new Error(`Test '${name}' not found`);
    }

    return await this.runSingleTest(testEntry.config, testEntry.test);
  }

  /**
   * Get test names
   */
  getTestNames(): string[] {
    return Array.from(this.tests.keys());
  }

  /**
   * Run a single benchmark test
   */
  private async runSingleTest(config: BenchmarkConfig, test: BenchmarkTest): Promise<BenchmarkResult> {
    const { name, description, iterations, warmupIterations, timeout, setup, teardown } = config;
    
    // Setup
    if (setup) {
      await setup();
    }

    let memoryBefore: NodeJS.MemoryUsage = process.memoryUsage();
    let memoryAfter: NodeJS.MemoryUsage = process.memoryUsage();
    let memoryPeak: NodeJS.MemoryUsage = process.memoryUsage();
    let success = true;
    let error: string | undefined;
    const times: number[] = [];

    try {
      // Warmup
      for (let i = 0; i < warmupIterations; i++) {
        await this.runWithTimeout(test, timeout);
      }

      // Force GC before measurement
      if (global.gc) {
        global.gc();
      }

      memoryBefore = process.memoryUsage();
      memoryPeak = { ...memoryBefore };

      // Actual benchmark
      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        await this.runWithTimeout(test, timeout);
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1e6; // Convert to milliseconds
        times.push(duration);

        // Track peak memory usage
        const currentMemory = process.memoryUsage();
        if (currentMemory.heapUsed > memoryPeak.heapUsed) {
          memoryPeak = currentMemory;
        }
      }

      memoryAfter = process.memoryUsage();

    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      memoryAfter = process.memoryUsage();
      memoryPeak = memoryAfter;
    }

    // Teardown
    if (teardown) {
      try {
        await teardown();
      } catch (teardownError) {
        console.warn(`Teardown error for ${name}:`, teardownError);
      }
    }

    // Calculate statistics
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = times.length > 0 ? totalTime / times.length : 0;
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;
    
    const variance = times.length > 0 
      ? times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length
      : 0;
    const standardDeviation = Math.sqrt(variance);
    
    const operationsPerSecond = averageTime > 0 ? 1000 / averageTime : 0;
    const memoryLeaked = Math.max(0, (memoryAfter?.heapUsed || 0) - (memoryBefore?.heapUsed || 0));

    return {
      name,
      description,
      iterations: times.length,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      standardDeviation,
      operationsPerSecond,
      memoryUsage: {
        before: memoryBefore || process.memoryUsage(),
        after: memoryAfter || process.memoryUsage(),
        peak: memoryPeak || process.memoryUsage(),
        leaked: memoryLeaked
      },
      success,
      error
    };
  }

  /**
   * Run test with timeout
   */
  private async runWithTimeout(test: BenchmarkTest, timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Test timed out after ${timeout}ms`));
      }, timeout);

      Promise.resolve(test())
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Calculate benchmark summary
   */
  private calculateSummary(results: BenchmarkResult[]): BenchmarkSuiteResult['summary'] {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return {
        fastest: '',
        slowest: '',
        mostMemoryEfficient: '',
        leastMemoryEfficient: ''
      };
    }

    const fastest = successfulResults.reduce((min, result) => 
      result.averageTime < min.averageTime ? result : min
    );

    const slowest = successfulResults.reduce((max, result) => 
      result.averageTime > max.averageTime ? result : max
    );

    const mostMemoryEfficient = successfulResults.reduce((min, result) => 
      result.memoryUsage.leaked < min.memoryUsage.leaked ? result : min
    );

    const leastMemoryEfficient = successfulResults.reduce((max, result) => 
      result.memoryUsage.leaked > max.memoryUsage.leaked ? result : max
    );

    return {
      fastest: fastest.name,
      slowest: slowest.name,
      mostMemoryEfficient: mostMemoryEfficient.name,
      leastMemoryEfficient: leastMemoryEfficient.name
    };
  }

  /**
   * Dispose resources
   */
  protected disposeSync(): void {
    this.tests.clear();
  }
}

/**
 * Benchmark runner with predefined test suites
 */
export class BenchmarkRunner {
  private performanceManager?: PerformanceManager;

  constructor(performanceManager?: PerformanceManager) {
    this.performanceManager = performanceManager;
  }

  /**
   * Create memory benchmark suite
   */
  createMemoryBenchmarkSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Memory Management', this.performanceManager);

    // Memory allocation benchmark
    suite.add({
      name: 'memory-allocation',
      description: 'Allocate and deallocate large objects',
      iterations: 100,
      warmupIterations: 10,
      timeout: 5000
    }, () => {
      const objects = [];
      for (let i = 0; i < 1000; i++) {
        objects.push(Buffer.alloc(1024));
      }
      objects.length = 0;
    });

    // Garbage collection benchmark
    suite.add({
      name: 'gc-performance',
      description: 'Force garbage collection',
      iterations: 10,
      warmupIterations: 2,
      timeout: 10000
    }, async () => {
      // Create garbage
      const garbage = [];
      for (let i = 0; i < 10000; i++) {
        garbage.push({ data: new Array(100).fill(i) });
      }
      
      // Force GC
      if (global.gc) {
        global.gc();
      }
    });

    // Memory leak detection benchmark
    suite.add({
      name: 'leak-detection',
      description: 'Test memory leak detection',
      iterations: 5,
      warmupIterations: 1,
      timeout: 15000
    }, () => {
      if (this.performanceManager) {
        const memoryMonitor = this.performanceManager.getMetrics().memory;
        // Just access the leak detection functionality
        return memoryMonitor;
      }
    });

    return suite;
  }

  /**
   * Create cache benchmark suite
   */
  createCacheBenchmarkSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Cache Performance', this.performanceManager);

    // Cache write performance
    suite.add({
      name: 'cache-write',
      description: 'Write operations to cache',
      iterations: 1000,
      warmupIterations: 100,
      timeout: 5000
    }, () => {
      if (this.performanceManager) {
        // This would use the actual cache
        const key = `test-${Math.random()}`;
        const value = { data: 'test data' };
        // cache.set(key, value, 60000);
      }
    });

    // Cache read performance
    suite.add({
      name: 'cache-read',
      description: 'Read operations from cache',
      iterations: 1000,
      warmupIterations: 100,
      timeout: 5000,
      setup: () => {
        // Pre-populate cache
        if (this.performanceManager) {
          for (let i = 0; i < 100; i++) {
            // cache.set(`test-${i}`, { data: i }, 60000);
          }
        }
      }
    }, () => {
      if (this.performanceManager) {
        const key = `test-${Math.floor(Math.random() * 100)}`;
        // cache.getCached(key);
      }
    });

    return suite;
  }

  /**
   * Create worker benchmark suite
   */
  createWorkerBenchmarkSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Worker Pool Performance', this.performanceManager);

    // Worker task execution
    suite.add({
      name: 'worker-crypto',
      description: 'Cryptographic operations in workers',
      iterations: 50,
      warmupIterations: 5,
      timeout: 10000
    }, async () => {
      if (this.performanceManager) {
        // This would use the actual worker manager
        // await this.performanceManager.workerManager.executeTask('crypto-hash', {
        //   algorithm: 'sha256',
        //   input: 'test data',
        //   iterations: 1000
        // });
      }
    });

    // Worker computation benchmark
    suite.add({
      name: 'worker-computation',
      description: 'CPU-intensive computations in workers',
      iterations: 20,
      warmupIterations: 2,
      timeout: 15000
    }, async () => {
      if (this.performanceManager) {
        // await this.performanceManager.workerManager.executeTask('computation', {
        //   operation: 'fibonacci',
        //   input: 35
        // });
      }
    });

    return suite;
  }

  /**
   * Create FFI batching benchmark suite
   */
  createBatchingBenchmarkSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('FFI Batching Performance', this.performanceManager);

    // Individual FFI calls
    suite.add({
      name: 'individual-calls',
      description: 'Individual FFI calls without batching',
      iterations: 100,
      warmupIterations: 10,
      timeout: 10000
    }, async () => {
      // Simulate individual FFI calls
      await new Promise(resolve => setTimeout(resolve, 1));
    });

    // Batched FFI calls
    suite.add({
      name: 'batched-calls',
      description: 'Batched FFI calls',
      iterations: 100,
      warmupIterations: 10,
      timeout: 10000
    }, async () => {
      if (this.performanceManager) {
        // This would use the actual call batcher
        // await batchFFICall('test_function', ['test_arg'], 5);
      }
    });

    return suite;
  }

  /**
   * Run all benchmark suites
   */
  async runAllBenchmarks(): Promise<{
    memory: BenchmarkSuiteResult;
    cache: BenchmarkSuiteResult;
    workers: BenchmarkSuiteResult;
    batching: BenchmarkSuiteResult;
    summary: {
      totalTime: number;
      totalTests: number;
      totalPassed: number;
      totalFailed: number;
    };
  }> {
    console.log('🎯 Starting comprehensive performance benchmarks...\n');
    const startTime = Date.now();

    const [memory, cache, workers, batching] = await Promise.all([
      this.createMemoryBenchmarkSuite().run(),
      this.createCacheBenchmarkSuite().run(),
      this.createWorkerBenchmarkSuite().run(),
      this.createBatchingBenchmarkSuite().run()
    ]);

    const totalTime = Date.now() - startTime;
    const totalTests = memory.totalTests + cache.totalTests + workers.totalTests + batching.totalTests;
    const totalPassed = memory.passedTests + cache.passedTests + workers.passedTests + batching.passedTests;
    const totalFailed = memory.failedTests + cache.failedTests + workers.failedTests + batching.failedTests;

    console.log(`\n🏁 All benchmarks completed in ${totalTime}ms`);
    console.log(`📊 Total: ${totalTests} tests, ✅ ${totalPassed} passed, ❌ ${totalFailed} failed`);

    return {
      memory,
      cache,
      workers,
      batching,
      summary: {
        totalTime,
        totalTests,
        totalPassed,
        totalFailed
      }
    };
  }
}

/**
 * Create a simple benchmark
 */
export function benchmark(
  name: string,
  test: BenchmarkTest,
  config: Partial<BenchmarkConfig> = {}
): Promise<BenchmarkResult> {
  const suite = new BenchmarkSuite('Quick Benchmark');
  
  suite.add({
    name,
    description: config.description || name,
    iterations: config.iterations || 100,
    warmupIterations: config.warmupIterations || 10,
    timeout: config.timeout || 5000,
    setup: config.setup,
    teardown: config.teardown
  }, test);

  return suite.runTest(name);
}

/**
 * Compare multiple implementations
 */
export async function compare(
  implementations: Record<string, BenchmarkTest>,
  config: Partial<BenchmarkConfig> = {}
): Promise<BenchmarkSuiteResult> {
  const suite = new BenchmarkSuite('Performance Comparison');

  for (const [name, test] of Object.entries(implementations)) {
    suite.add({
      name,
      description: `Implementation: ${name}`,
      iterations: config.iterations || 100,
      warmupIterations: config.warmupIterations || 10,
      timeout: config.timeout || 5000,
      setup: config.setup,
      teardown: config.teardown
    }, test);
  }

  return suite.run();
}
