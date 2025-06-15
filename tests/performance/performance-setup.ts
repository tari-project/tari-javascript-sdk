/**
 * Performance test setup - benchmarking and memory monitoring
 */

import { performance, PerformanceObserver } from 'perf_hooks';
import { promises as fs } from 'fs';
import { join } from 'path';

interface BenchmarkResult {
  testName: string;
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface PerformanceTestContext {
  startTime: number;
  startMemory: NodeJS.MemoryUsage;
  marks: Map<string, number>;
  results: BenchmarkResult[];
}

let currentContext: PerformanceTestContext | null = null;
const allResults: BenchmarkResult[] = [];

// Performance observer for detailed metrics
const obs = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log(`Performance: ${entry.name} took ${entry.duration.toFixed(2)}ms`);
  }
});
obs.observe({ entryTypes: ['measure', 'mark'] });

// Setup before each performance test
beforeEach(() => {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  const startTime = performance.now();
  const startMemory = process.memoryUsage();
  
  currentContext = {
    startTime,
    startMemory,
    marks: new Map(),
    results: [],
  };
  
  // Mark test start
  performance.mark('test-start');
});

// Cleanup after each performance test
afterEach(async () => {
  if (!currentContext) return;
  
  performance.mark('test-end');
  performance.measure('test-duration', 'test-start', 'test-end');
  
  const endTime = performance.now();
  const endMemory = process.memoryUsage();
  const duration = endTime - currentContext.startTime;
  
  // Calculate memory delta
  const memoryDelta: NodeJS.MemoryUsage = {
    rss: endMemory.rss - currentContext.startMemory.rss,
    heapTotal: endMemory.heapTotal - currentContext.startMemory.heapTotal,
    heapUsed: endMemory.heapUsed - currentContext.startMemory.heapUsed,
    external: endMemory.external - currentContext.startMemory.external,
    arrayBuffers: endMemory.arrayBuffers - currentContext.startMemory.arrayBuffers,
  };
  
  const result: BenchmarkResult = {
    testName: expect.getState().currentTestName || 'unknown',
    duration,
    memoryUsage: memoryDelta,
    timestamp: Date.now(),
  };
  
  currentContext.results.push(result);
  allResults.push(result);
  
  // Log performance summary
  console.log(`\nPerformance Summary for "${result.testName}":`);
  console.log(`  Duration: ${duration.toFixed(2)}ms`);
  console.log(`  Memory Delta: ${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB heap`);
  console.log(`  RSS Delta: ${(memoryDelta.rss / 1024 / 1024).toFixed(2)}MB`);
  
  currentContext = null;
  
  // Force cleanup
  if (global.gc) {
    global.gc();
  }
});

// Save results after all tests
afterAll(async () => {
  // Disconnect performance observer to prevent logging after tests
  obs.disconnect();
  
  if (allResults.length > 0) {
    const resultsPath = join(process.cwd(), 'performance-results.json');
    await fs.writeFile(resultsPath, JSON.stringify(allResults, null, 2));
    console.log(`\nPerformance results saved to: ${resultsPath}`);
    
    // Summary statistics
    const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = totalDuration / allResults.length;
    const maxDuration = Math.max(...allResults.map(r => r.duration));
    const minDuration = Math.min(...allResults.map(r => r.duration));
    
    console.log('\nPerformance Test Summary:');
    console.log(`  Total tests: ${allResults.length}`);
    console.log(`  Total duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min duration: ${minDuration.toFixed(2)}ms`);
    console.log(`  Max duration: ${maxDuration.toFixed(2)}ms`);
  }
});

// Global utilities for performance tests
global.testUtils = {
  ...global.testUtils,
  
  // Performance test specific utilities
  benchmark: {
    // Mark a performance point
    mark: (name: string) => {
      if (currentContext) {
        const timestamp = performance.now();
        currentContext.marks.set(name, timestamp);
        performance.mark(name);
      }
    },
    
    // Measure between two marks
    measure: (name: string, startMark: string, endMark?: string) => {
      if (currentContext) {
        const end = endMark || performance.now();
        performance.measure(name, startMark, end);
        
        const startTime = currentContext.marks.get(startMark);
        const endTime = typeof end === 'string' 
          ? currentContext.marks.get(end) 
          : end;
          
        if (startTime && endTime) {
          return endTime - startTime;
        }
      }
      return 0;
    },
    
    // Get current memory usage
    getMemoryUsage: () => process.memoryUsage(),
    
    // Force garbage collection
    gc: () => {
      if (global.gc) {
        global.gc();
      }
    },
    
    // Warm up function (run multiple times to avoid cold start effects)
    warmup: async (fn: () => Promise<void> | void, iterations = 3) => {
      for (let i = 0; i < iterations; i++) {
        await fn();
      }
    },
    
    // Run a function multiple times and get average performance
    profile: async (
      name: string, 
      fn: () => Promise<void> | void, 
      iterations = 10
    ): Promise<{ 
      avgDuration: number; 
      minDuration: number; 
      maxDuration: number;
      memoryDelta: NodeJS.MemoryUsage;
    }> => {
      const durations: number[] = [];
      const startMemory = process.memoryUsage();
      
      // Warmup
      await global.testUtils.benchmark.warmup(fn);
      
      // Benchmark runs
      for (let i = 0; i < iterations; i++) {
        if (global.gc) global.gc();
        
        const start = performance.now();
        await fn();
        const end = performance.now();
        
        durations.push(end - start);
      }
      
      const endMemory = process.memoryUsage();
      const memoryDelta: NodeJS.MemoryUsage = {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
      };
      
      const result = {
        avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        memoryDelta,
      };
      
      console.log(`Profile "${name}": avg=${result.avgDuration.toFixed(2)}ms, ` +
                  `min=${result.minDuration.toFixed(2)}ms, max=${result.maxDuration.toFixed(2)}ms`);
      
      return result;
    },
    
    // Assert performance thresholds
    expectPerformance: (actualMs: number, maxMs: number, testName: string) => {
      if (actualMs > maxMs) {
        throw new Error(
          `Performance threshold exceeded for "${testName}": ` +
          `${actualMs.toFixed(2)}ms > ${maxMs}ms (limit)`
        );
      }
    },
    
    // Assert memory thresholds
    expectMemoryUsage: (actualBytes: number, maxBytes: number, testName: string) => {
      if (actualBytes > maxBytes) {
        throw new Error(
          `Memory threshold exceeded for "${testName}": ` +
          `${(actualBytes / 1024 / 1024).toFixed(2)}MB > ${(maxBytes / 1024 / 1024).toFixed(2)}MB (limit)`
        );
      }
    },
  },
};

// Performance-specific matchers
expect.extend({
  toBeWithinPerformanceThreshold(received: number, threshold: number) {
    const pass = received <= threshold;
    return {
      message: () => 
        pass 
          ? `expected ${received}ms to exceed ${threshold}ms threshold`
          : `expected ${received}ms to be within ${threshold}ms threshold`,
      pass,
    };
  },
  
  toHaveMemoryUsageBelow(received: NodeJS.MemoryUsage, maxBytes: number) {
    const actualBytes = received.heapUsed;
    const pass = actualBytes <= maxBytes;
    return {
      message: () => 
        pass 
          ? `expected memory usage ${(actualBytes/1024/1024).toFixed(2)}MB to exceed ${(maxBytes/1024/1024).toFixed(2)}MB`
          : `expected memory usage ${(actualBytes/1024/1024).toFixed(2)}MB to be below ${(maxBytes/1024/1024).toFixed(2)}MB`,
      pass,
    };
  },
});

// TypeScript declarations
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinPerformanceThreshold(threshold: number): R;
      toHaveMemoryUsageBelow(maxBytes: number): R;
    }
  }
}
