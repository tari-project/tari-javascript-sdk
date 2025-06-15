/**
 * Global teardown for performance tests
 * Cleans up resources and generates final performance report
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';

interface PerformanceSummary {
  startTime: string;
  endTime: string;
  duration: number;
  testsRun: number;
  systemInfo: {
    initialMemory: NodeJS.MemoryUsage;
    finalMemory: NodeJS.MemoryUsage;
    memoryDelta: NodeJS.MemoryUsage;
    initialLoad: number[];
    finalLoad: number[];
  };
  performance: {
    averageTestDuration: number;
    slowestTest: string;
    fastestTest: string;
    totalMemoryUsed: number;
    gcCollections: number;
  };
  recommendations: string[];
}

export default async function globalTeardown(): Promise<void> {
  console.log('\n🧹 Performance Test Teardown');
  console.log('=============================');

  try {
    // Collect final system information
    const finalSystemInfo = await collectFinalSystemInfo();
    
    // Generate performance summary
    const summary = await generatePerformanceSummary(finalSystemInfo);
    
    // Save comprehensive report
    await savePerformanceReport(summary);
    
    // Cleanup temporary files
    await cleanupTemporaryFiles();
    
    // Final memory cleanup
    await performFinalCleanup();
    
    // Log summary
    await logFinalSummary(summary);
    
    console.log('✅ Performance test teardown complete\n');
    
  } catch (error) {
    console.error('❌ Error during performance test teardown:', error);
    throw error;
  }
}

async function collectFinalSystemInfo() {
  const loadAvg = os.loadavg();
  const memoryUsage = process.memoryUsage();
  
  return {
    timestamp: new Date().toISOString(),
    loadAverage: loadAvg,
    memoryUsage,
    uptime: os.uptime(),
    freeMemory: os.freemem(),
  };
}

async function generatePerformanceSummary(finalInfo: any): Promise<PerformanceSummary> {
  console.log('📊 Generating Performance Summary...');
  
  // Try to load performance results
  let testResults: any[] = [];
  let benchmarkResults: any = null;
  
  try {
    const resultsPath = join(process.cwd(), 'benchmark-results.json');
    const resultsData = await fs.readFile(resultsPath, 'utf8');
    benchmarkResults = JSON.parse(resultsData);
    testResults = benchmarkResults.tests || [];
  } catch {
    console.log('  ℹ️  No benchmark results found');
  }
  
  // Try to load baseline data
  let baselineData: any = null;
  try {
    const baselinePath = join(process.cwd(), 'performance-baselines.json');
    const baselineContent = await fs.readFile(baselinePath, 'utf8');
    baselineData = JSON.parse(baselineContent);
  } catch {
    console.log('  ℹ️  No baseline data found');
  }
  
  // Calculate performance metrics
  const durations = testResults.filter(t => t.duration > 0).map(t => t.duration);
  const averageTestDuration = durations.length > 0 
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
    : 0;
  
  const slowestTest = testResults.length > 0 
    ? testResults.reduce((prev, curr) => prev.duration > curr.duration ? prev : curr)
    : null;
    
  const fastestTest = testResults.length > 0 
    ? testResults.reduce((prev, curr) => prev.duration < curr.duration ? prev : curr)
    : null;
  
  // Calculate memory delta
  const initialMemory = baselineData?.systemInfo?.memoryUsage || process.memoryUsage();
  const finalMemory = finalInfo.memoryUsage;
  const memoryDelta: NodeJS.MemoryUsage = {
    rss: finalMemory.rss - initialMemory.rss,
    heapTotal: finalMemory.heapTotal - (initialMemory.heapTotal || 0),
    heapUsed: finalMemory.heapUsed - (initialMemory.heapUsed || 0),
    external: finalMemory.external - (initialMemory.external || 0),
    arrayBuffers: finalMemory.arrayBuffers - (initialMemory.arrayBuffers || 0),
  };
  
  // Generate recommendations
  const recommendations = generateRecommendations({
    testResults,
    averageTestDuration,
    memoryDelta,
    finalInfo,
  });
  
  return {
    startTime: baselineData?.timestamp || new Date().toISOString(),
    endTime: finalInfo.timestamp,
    duration: Date.now() - (baselineData ? new Date(baselineData.timestamp).getTime() : Date.now()),
    testsRun: testResults.length,
    systemInfo: {
      initialMemory,
      finalMemory,
      memoryDelta,
      initialLoad: baselineData?.systemInfo?.loadAverage || [0, 0, 0],
      finalLoad: finalInfo.loadAverage,
    },
    performance: {
      averageTestDuration,
      slowestTest: slowestTest?.testName || 'N/A',
      fastestTest: fastestTest?.testName || 'N/A',
      totalMemoryUsed: memoryDelta.heapUsed,
      gcCollections: 0, // Would need to track this during tests
    },
    recommendations,
  };
}

function generateRecommendations(data: any): string[] {
  const recommendations: string[] = [];
  
  // Performance recommendations
  if (data.averageTestDuration > 5000) {
    recommendations.push('Consider optimizing test performance - average duration is high (>5s)');
  }
  
  if (data.testResults.some((t: any) => t.duration > 30000)) {
    recommendations.push('Some tests are very slow (>30s) - consider breaking them down or optimizing');
  }
  
  // Memory recommendations
  const memoryDeltaMB = data.memoryDelta.heapUsed / 1024 / 1024;
  if (memoryDeltaMB > 100) {
    recommendations.push(`High memory usage detected (${memoryDeltaMB.toFixed(1)}MB) - check for memory leaks`);
  }
  
  if (data.memoryDelta.heapUsed > data.memoryDelta.heapTotal * 0.8) {
    recommendations.push('Memory usage approaching heap limit - consider increasing heap size');
  }
  
  // System recommendations
  const loadIncrease = data.finalInfo.loadAverage[0] - data.initialInfo?.loadAverage?.[0] || 0;
  if (loadIncrease > 1.0) {
    recommendations.push('System load increased significantly during tests - consider running fewer parallel tests');
  }
  
  // Test suite recommendations
  if (data.testResults.length < 5) {
    recommendations.push('Consider adding more performance tests for better coverage');
  }
  
  const failedTests = data.testResults.filter((t: any) => t.status === 'failed').length;
  if (failedTests > 0) {
    recommendations.push(`${failedTests} performance tests failed - investigate test environment or implementation`);
  }
  
  // General recommendations
  if (recommendations.length === 0) {
    recommendations.push('Performance test suite looks healthy - good job!');
  }
  
  return recommendations;
}

async function savePerformanceReport(summary: PerformanceSummary): Promise<void> {
  console.log('💾 Saving Performance Report...');
  
  const reportPath = join(process.cwd(), 'performance-summary.json');
  const reportData = {
    generated: new Date().toISOString(),
    summary,
    metadata: {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
    },
  };
  
  try {
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`  ✅ Performance report saved: ${reportPath}`);
  } catch (error) {
    console.error(`  ❌ Failed to save performance report: ${error}`);
  }
  
  // Also save a human-readable version
  const readableReport = generateReadableReport(summary);
  const readablePath = join(process.cwd(), 'performance-summary.txt');
  
  try {
    await fs.writeFile(readablePath, readableReport);
    console.log(`  ✅ Readable report saved: ${readablePath}`);
  } catch (error) {
    console.error(`  ❌ Failed to save readable report: ${error}`);
  }
}

function generateReadableReport(summary: PerformanceSummary): string {
  const lines: string[] = [];
  
  lines.push('PERFORMANCE TEST SUMMARY');
  lines.push('========================');
  lines.push('');
  
  lines.push(`Test Duration: ${(summary.duration / 1000).toFixed(2)}s`);
  lines.push(`Tests Run: ${summary.testsRun}`);
  lines.push(`Average Test Duration: ${summary.performance.averageTestDuration.toFixed(2)}ms`);
  lines.push('');
  
  lines.push('MEMORY USAGE:');
  lines.push(`  Heap Delta: ${(summary.systemInfo.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  lines.push(`  RSS Delta: ${(summary.systemInfo.memoryDelta.rss / 1024 / 1024).toFixed(2)}MB`);
  lines.push('');
  
  lines.push('PERFORMANCE:');
  lines.push(`  Slowest Test: ${summary.performance.slowestTest}`);
  lines.push(`  Fastest Test: ${summary.performance.fastestTest}`);
  lines.push('');
  
  if (summary.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS:');
    summary.recommendations.forEach(rec => {
      lines.push(`  • ${rec}`);
    });
    lines.push('');
  }
  
  lines.push(`Generated: ${summary.endTime}`);
  
  return lines.join('\n');
}

async function cleanupTemporaryFiles(): Promise<void> {
  console.log('🗑️  Cleaning up temporary files...');
  
  const tempFiles = [
    'performance-results.json',
    '.performance-temp.json',
  ];
  
  for (const file of tempFiles) {
    try {
      const filePath = join(process.cwd(), file);
      await fs.unlink(filePath);
      console.log(`  ✅ Cleaned up: ${file}`);
    } catch {
      // File doesn't exist or can't be deleted - that's ok
    }
  }
}

async function performFinalCleanup(): Promise<void> {
  console.log('🧼 Performing final cleanup...');
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('  ✅ Garbage collection forced');
  }
  
  // Clear any remaining performance marks
  try {
    const { performance } = require('perf_hooks');
    performance.clearMarks();
    performance.clearMeasures();
    console.log('  ✅ Performance marks cleared');
  } catch {
    // Performance hooks not available
  }
  
  // Reset environment variables
  delete process.env.JEST_PERFORMANCE_MODE;
  console.log('  ✅ Environment variables cleaned');
}

async function logFinalSummary(summary: PerformanceSummary): Promise<void> {
  console.log('\n📋 Final Performance Summary:');
  console.log(`   Tests Run: ${summary.testsRun}`);
  console.log(`   Duration: ${(summary.duration / 1000).toFixed(2)}s`);
  console.log(`   Avg Test Time: ${summary.performance.averageTestDuration.toFixed(2)}ms`);
  console.log(`   Memory Used: ${(summary.systemInfo.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  
  if (summary.recommendations.length > 0) {
    console.log('\n💡 Key Recommendations:');
    summary.recommendations.slice(0, 3).forEach(rec => {
      console.log(`   • ${rec}`);
    });
  }
}
