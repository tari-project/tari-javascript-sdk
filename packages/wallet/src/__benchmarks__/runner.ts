/**
 * Benchmark runner for CI/CD integration and reporting
 */

import { runWalletBenchmarks } from './wallet.bench';
import { promises as fs } from 'fs';
import { join } from 'path';

interface BenchmarkReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    memory: NodeJS.MemoryUsage;
  };
  results: Array<{
    name: string;
    hz: number;
    mean: number;
    deviation: number;
    samples: number;
    error?: any;
  }>;
  summary: {
    totalOperations: number;
    fastOperations: number;
    slowOperations: number;
    errorOperations: number;
    averagePerformance: number;
  };
  recommendations: string[];
}

/**
 * Main benchmark runner
 */
export class BenchmarkRunner {
  private outputDir: string;

  constructor(outputDir: string = './benchmark-results') {
    this.outputDir = outputDir;
  }

  /**
   * Run all benchmarks and generate reports
   */
  async runBenchmarks(): Promise<BenchmarkReport> {
    console.log('🚀 Starting comprehensive wallet benchmarks...');
    console.log(`Output directory: ${this.outputDir}`);
    console.log('');

    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });

    try {
      // Run wallet benchmarks
      const results = await runWalletBenchmarks();

      // Generate report
      const report = this.generateReport(results);

      // Save results
      await this.saveResults(report);

      // Display summary
      this.displaySummary(report);

      return report;

    } catch (error) {
      console.error('❌ Benchmark execution failed:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive benchmark report
   */
  private generateReport(results: any[]): BenchmarkReport {
    const timestamp = new Date().toISOString();
    const environment = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage(),
    };

    // Calculate summary statistics
    const totalOperations = results.length;
    const fastOperations = results.filter(r => r.hz > 100).length;
    const slowOperations = results.filter(r => r.hz < 10).length;
    const errorOperations = results.filter(r => r.error).length;
    const averagePerformance = results.reduce((sum, r) => sum + r.hz, 0) / totalOperations;

    // Generate recommendations
    const recommendations = this.generateRecommendations(results);

    return {
      timestamp,
      environment,
      results,
      summary: {
        totalOperations,
        fastOperations,
        slowOperations,
        errorOperations,
        averagePerformance,
      },
      recommendations,
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(results: any[]): string[] {
    const recommendations: string[] = [];

    // Performance analysis
    const creationOps = results.filter(r => r.name.includes('creation'));
    const balanceOps = results.filter(r => r.name.includes('balance'));
    const addressOps = results.filter(r => r.name.includes('address'));
    const transactionOps = results.filter(r => r.name.includes('transaction'));

    // Wallet creation performance
    const avgCreationPerf = creationOps.reduce((sum, op) => sum + op.hz, 0) / creationOps.length;
    if (avgCreationPerf < 5) {
      recommendations.push('Wallet creation is slow - consider connection pooling or caching');
    }

    // Balance operation performance
    const avgBalancePerf = balanceOps.reduce((sum, op) => sum + op.hz, 0) / balanceOps.length;
    if (avgBalancePerf < 50) {
      recommendations.push('Balance operations are slow - implement result caching');
    }

    // Address operation performance
    const avgAddressPerf = addressOps.reduce((sum, op) => sum + op.hz, 0) / addressOps.length;
    if (avgAddressPerf < 100) {
      recommendations.push('Address operations could be optimized with client-side validation');
    }

    // Transaction operation performance
    const avgTransactionPerf = transactionOps.reduce((sum, op) => sum + op.hz, 0) / transactionOps.length;
    if (avgTransactionPerf < 20) {
      recommendations.push('Transaction operations are slow - review FFI call optimization');
    }

    // Error rate analysis
    const errorRate = results.filter(r => r.error).length / results.length;
    if (errorRate > 0.1) {
      recommendations.push('High error rate detected - improve error handling and retry logic');
    }

    // Memory usage analysis
    const memory = process.memoryUsage();
    const heapUsagePercent = (memory.heapUsed / memory.heapTotal) * 100;
    if (heapUsagePercent > 80) {
      recommendations.push('High memory usage - consider implementing object pooling');
    }

    // Variance analysis
    const highVarianceOps = results.filter(r => r.deviation > r.mean * 0.5);
    if (highVarianceOps.length > results.length * 0.3) {
      recommendations.push('High performance variance detected - investigate system load');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance benchmarks look good - no specific issues detected');
    }

    return recommendations;
  }

  /**
   * Save benchmark results to files
   */
  private async saveResults(report: BenchmarkReport): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save JSON report
    const jsonPath = join(this.outputDir, `benchmark-${timestamp}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    console.log(`💾 JSON report saved to: ${jsonPath}`);

    // Save CSV for data analysis
    const csvPath = join(this.outputDir, `benchmark-${timestamp}.csv`);
    await this.saveCsvReport(report, csvPath);
    console.log(`📊 CSV report saved to: ${csvPath}`);

    // Save markdown summary
    const mdPath = join(this.outputDir, `benchmark-${timestamp}.md`);
    await this.saveMarkdownReport(report, mdPath);
    console.log(`📝 Markdown report saved to: ${mdPath}`);

    // Save latest.json for CI/CD
    const latestPath = join(this.outputDir, 'latest.json');
    await fs.writeFile(latestPath, JSON.stringify(report, null, 2));
    console.log(`🔗 Latest results linked: ${latestPath}`);
  }

  /**
   * Save CSV format for data analysis
   */
  private async saveCsvReport(report: BenchmarkReport, path: string): Promise<void> {
    const headers = ['Operation', 'Ops/sec', 'Mean (ms)', 'Deviation (ms)', 'Samples', 'Error'];
    const rows = report.results.map(result => [
      result.name,
      result.hz.toFixed(2),
      (result.mean * 1000).toFixed(3),
      (result.deviation * 1000).toFixed(3),
      result.samples.toString(),
      result.error ? 'Yes' : 'No',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    await fs.writeFile(path, csv);
  }

  /**
   * Save markdown format for documentation
   */
  private async saveMarkdownReport(report: BenchmarkReport, path: string): Promise<void> {
    const markdown = `# Wallet Performance Benchmark Report

**Generated:** ${report.timestamp}

## Environment

- **Node.js:** ${report.environment.nodeVersion}
- **Platform:** ${report.environment.platform}
- **Architecture:** ${report.environment.arch}
- **Memory (RSS):** ${(report.environment.memory.rss / 1024 / 1024).toFixed(2)} MB
- **Heap Used:** ${(report.environment.memory.heapUsed / 1024 / 1024).toFixed(2)} MB

## Summary

- **Total Operations:** ${report.summary.totalOperations}
- **Fast Operations (>100 ops/sec):** ${report.summary.fastOperations}
- **Slow Operations (<10 ops/sec):** ${report.summary.slowOperations}
- **Error Operations:** ${report.summary.errorOperations}
- **Average Performance:** ${report.summary.averagePerformance.toFixed(2)} ops/sec

## Detailed Results

| Operation | Ops/sec | Mean (ms) | ±Deviation (ms) | Samples |
|-----------|---------|-----------|-----------------|---------|
${report.results.map(r => 
  `| ${r.name} | ${r.hz.toFixed(2)} | ${(r.mean * 1000).toFixed(3)} | ±${(r.deviation * 1000).toFixed(2)} | ${r.samples} |`
).join('\n')}

## Performance Analysis

### Fast Operations (>100 ops/sec)
${report.results.filter(r => r.hz > 100).map(r => `- **${r.name}:** ${r.hz.toFixed(2)} ops/sec`).join('\n') || 'None'}

### Slow Operations (<10 ops/sec)
${report.results.filter(r => r.hz < 10).map(r => `- **${r.name}:** ${r.hz.toFixed(2)} ops/sec`).join('\n') || 'None'}

### Error Operations
${report.results.filter(r => r.error).map(r => `- **${r.name}:** ${r.error}`).join('\n') || 'None'}

## Recommendations

${report.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

---

*This report was generated automatically by the Tari JavaScript SDK benchmark suite.*
`;

    await fs.writeFile(path, markdown);
  }

  /**
   * Display benchmark summary
   */
  private displaySummary(report: BenchmarkReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 BENCHMARK SUMMARY');
    console.log('='.repeat(80));

    console.log(`\n🎯 Performance Overview:`);
    console.log(`  Total operations tested: ${report.summary.totalOperations}`);
    console.log(`  Average performance: ${report.summary.averagePerformance.toFixed(2)} ops/sec`);
    console.log(`  Fast operations (>100 ops/sec): ${report.summary.fastOperations}`);
    console.log(`  Slow operations (<10 ops/sec): ${report.summary.slowOperations}`);
    console.log(`  Error operations: ${report.summary.errorOperations}`);

    console.log(`\n🚀 Top Performers:`);
    const topPerformers = report.results
      .sort((a, b) => b.hz - a.hz)
      .slice(0, 3);
    
    topPerformers.forEach((op, index) => {
      console.log(`  ${index + 1}. ${op.name}: ${op.hz.toFixed(2)} ops/sec`);
    });

    console.log(`\n🐌 Slowest Operations:`);
    const slowest = report.results
      .sort((a, b) => a.hz - b.hz)
      .slice(0, 3);
    
    slowest.forEach((op, index) => {
      console.log(`  ${index + 1}. ${op.name}: ${op.hz.toFixed(2)} ops/sec`);
    });

    if (report.summary.errorOperations > 0) {
      console.log(`\n❌ Operations with Errors:`);
      const errorOps = report.results.filter(r => r.error);
      errorOps.forEach(op => {
        console.log(`  • ${op.name}: ${op.error}`);
      });
    }

    console.log(`\n💡 Key Recommendations:`);
    report.recommendations.slice(0, 3).forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });

    console.log(`\n📁 Results saved to: ${this.outputDir}`);
    console.log('='.repeat(80));
  }

  /**
   * Compare with previous benchmark results
   */
  async compareWithPrevious(): Promise<void> {
    try {
      const latestPath = join(this.outputDir, 'latest.json');
      const previousData = await fs.readFile(latestPath, 'utf-8');
      const previousReport: BenchmarkReport = JSON.parse(previousData);

      console.log('\n📈 Performance Comparison with Previous Run:');
      console.log(`Previous run: ${previousReport.timestamp}`);
      console.log('Current vs Previous:');

      // This would need the current report to compare
      // Implementation would depend on how this method is called
      
    } catch (error) {
      console.log('\nℹ️  No previous benchmark results found for comparison');
    }
  }
}

/**
 * CLI entry point for benchmark runner
 */
export async function runBenchmarkCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const outputDir = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || './benchmark-results';
  
  console.log('🎯 Tari JavaScript SDK Benchmark Runner');
  console.log('=========================================\n');

  try {
    const runner = new BenchmarkRunner(outputDir);
    const report = await runner.runBenchmarks();

    // Check for performance regressions (for CI/CD)
    const hasRegressions = report.summary.errorOperations > 0 || 
                          report.summary.averagePerformance < 10;

    if (hasRegressions) {
      console.log('\n⚠️  Performance regressions detected!');
      process.exit(1);
    } else {
      console.log('\n✅ All benchmarks completed successfully');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Benchmark run failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runBenchmarkCLI().catch(console.error);
}
