/**
 * Global setup for performance tests
 * Initializes environment and validates system resources
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';

interface SystemInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: number;
  freeMemory: number;
  availableMemory: number;
  loadAverage: number[];
  uptime: number;
}

interface PerformanceConfig {
  minMemoryMB: number;
  maxLoadAverage: number;
  warmupIterations: number;
  enableGC: boolean;
  networkTimeout: number;
}

const PERFORMANCE_CONFIG: PerformanceConfig = {
  minMemoryMB: 1024,  // Minimum 1GB free memory
  maxLoadAverage: 2.0, // Maximum system load
  warmupIterations: 3,  // Warmup iterations for stable measurements
  enableGC: true,      // Enable garbage collection
  networkTimeout: 30000, // 30s network timeout
};

export default async function globalSetup(): Promise<void> {
  console.log('🚀 Setting up Performance Test Environment');
  console.log('==========================================');

  // Gather system information
  const systemInfo = await gatherSystemInfo();
  await logSystemInfo(systemInfo);

  // Validate system resources
  await validateSystemResources(systemInfo);

  // Setup performance monitoring
  await setupPerformanceMonitoring();

  // Initialize baseline measurements
  await initializeBaselines();

  // Setup network connectivity check
  await validateNetworkConnectivity();

  // Create results directory
  await ensureResultsDirectory();

  console.log('✅ Performance test environment ready\n');
}

async function gatherSystemInfo(): Promise<SystemInfo> {
  const cpuInfo = os.cpus();
  const loadAvg = os.loadavg();
  
  return {
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: cpuInfo.length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    availableMemory: os.freemem(),
    loadAverage: loadAvg,
    uptime: os.uptime(),
  };
}

async function logSystemInfo(info: SystemInfo): Promise<void> {
  console.log('📊 System Information:');
  console.log(`  Node.js: ${info.nodeVersion}`);
  console.log(`  Platform: ${info.platform} (${info.arch})`);
  console.log(`  CPUs: ${info.cpus}`);
  console.log(`  Total Memory: ${(info.totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`);
  console.log(`  Free Memory: ${(info.freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB`);
  console.log(`  Load Average: [${info.loadAverage.map(l => l.toFixed(2)).join(', ')}]`);
  console.log(`  Uptime: ${(info.uptime / 3600).toFixed(2)} hours`);
}

async function validateSystemResources(info: SystemInfo): Promise<void> {
  console.log('\n🔍 Validating System Resources:');

  // Check free memory
  const freeMemoryMB = info.freeMemory / 1024 / 1024;
  if (freeMemoryMB < PERFORMANCE_CONFIG.minMemoryMB) {
    console.warn(`⚠️  Low memory: ${freeMemoryMB.toFixed(0)}MB free (minimum: ${PERFORMANCE_CONFIG.minMemoryMB}MB)`);
    console.warn('   Performance tests may be unreliable due to memory pressure');
  } else {
    console.log(`  ✅ Memory: ${freeMemoryMB.toFixed(0)}MB available`);
  }

  // Check system load
  const currentLoad = info.loadAverage[0];
  if (currentLoad > PERFORMANCE_CONFIG.maxLoadAverage) {
    console.warn(`⚠️  High system load: ${currentLoad.toFixed(2)} (maximum: ${PERFORMANCE_CONFIG.maxLoadAverage})`);
    console.warn('   Performance measurements may be inconsistent');
  } else {
    console.log(`  ✅ System Load: ${currentLoad.toFixed(2)}`);
  }

  // Check CPU count for meaningful parallelization
  if (info.cpus < 2) {
    console.warn('⚠️  Single CPU detected - parallel performance tests may not be meaningful');
  } else {
    console.log(`  ✅ CPUs: ${info.cpus} cores available`);
  }
}

async function setupPerformanceMonitoring(): Promise<void> {
  console.log('\n⚙️  Setting up Performance Monitoring:');

  // Enable garbage collection if available
  if (PERFORMANCE_CONFIG.enableGC && global.gc) {
    console.log('  ✅ Garbage collection enabled');
    global.gc(); // Initial cleanup
  } else if (PERFORMANCE_CONFIG.enableGC) {
    console.warn('  ⚠️  Garbage collection not available (run with --expose-gc)');
  }

  // Set high-resolution time origin
  process.hrtime.bigint(); // Initialize high-res timer
  console.log('  ✅ High-resolution timing initialized');

  // Configure Node.js performance hooks
  const { performance } = require('perf_hooks');
  performance.mark('global-setup-start');
  console.log('  ✅ Performance marks initialized');

  // Set environment variables for performance tests
  process.env.JEST_PERFORMANCE_MODE = 'true';
  process.env.NODE_ENV = 'performance';
  console.log('  ✅ Environment variables configured');
}

async function initializeBaselines(): Promise<void> {
  console.log('\n📏 Initializing Performance Baselines:');

  // Measure baseline function call overhead
  const iterations = 10000;
  const start = process.hrtime.bigint();
  
  for (let i = 0; i < iterations; i++) {
    // Empty function call to measure overhead
    (() => {})();
  }
  
  const end = process.hrtime.bigint();
  const baselineNs = Number(end - start) / iterations;
  
  // Store baseline measurements
  const baselines = {
    functionCallOverheadNs: baselineNs,
    systemInfo: await gatherSystemInfo(),
    timestamp: new Date().toISOString(),
  };

  const baselinesPath = join(process.cwd(), 'performance-baselines.json');
  await fs.writeFile(baselinesPath, JSON.stringify(baselines, null, 2));
  
  console.log(`  ✅ Function call overhead: ${baselineNs.toFixed(2)}ns`);
  console.log(`  ✅ Baselines saved to: performance-baselines.json`);
}

async function validateNetworkConnectivity(): Promise<void> {
  console.log('\n🌐 Validating Network Connectivity:');

  try {
    // Simple connectivity check - try to resolve a domain
    const dns = await import('dns');
    const util = await import('util');
    const lookup = util.promisify(dns.lookup);
    
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DNS lookup timeout')), 5000)
    );
    
    await Promise.race([
      lookup('google.com'),
      timeout
    ]);
    
    console.log('  ✅ Network connectivity available');
    
    // Set network timeout for performance tests
    process.env.PERFORMANCE_NETWORK_TIMEOUT = PERFORMANCE_CONFIG.networkTimeout.toString();
    
  } catch (error) {
    console.warn('  ⚠️  Network connectivity limited - some performance tests may fail');
    console.warn(`     Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function ensureResultsDirectory(): Promise<void> {
  console.log('\n📁 Setting up Results Directory:');

  const resultsDir = join(process.cwd(), 'performance-results');
  
  try {
    await fs.mkdir(resultsDir, { recursive: true });
    console.log(`  ✅ Results directory: ${resultsDir}`);
    
    // Create subdirectories for different test types
    const subdirs = ['benchmarks', 'network', 'memory', 'trends'];
    for (const subdir of subdirs) {
      await fs.mkdir(join(resultsDir, subdir), { recursive: true });
    }
    
    console.log(`  ✅ Subdirectories created: ${subdirs.join(', ')}`);
    
  } catch (error) {
    console.error(`  ❌ Failed to create results directory: ${error}`);
    throw error;
  }
}
