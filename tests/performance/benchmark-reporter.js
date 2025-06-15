/**
 * Custom Jest reporter for performance benchmarks
 * Collects and reports performance metrics and trends
 */

const fs = require('fs').promises;
const path = require('path');

class BenchmarkReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options || {};
    this.outputFile = this.options.outputFile || './benchmark-results.json';
    this.enableTrends = this.options.enableTrends !== false;
    this.enableMemoryTracking = this.options.enableMemoryTracking !== false;
    
    this.testResults = [];
    this.suiteResults = [];
    this.startTime = Date.now();
  }

  onRunStart() {
    console.log('🚀 Starting Performance Benchmark Suite');
    console.log('=========================================');
  }

  onTestStart(test) {
    console.log(`📊 Running performance test: ${test.path}`);
  }

  onTestResult(test, testResult) {
    const { testResults, perfStats } = testResult;
    
    for (const result of testResults) {
      const performanceData = {
        testName: result.fullName,
        testFile: test.path,
        status: result.status,
        duration: result.duration || 0,
        timestamp: Date.now(),
        memory: this.enableMemoryTracking ? process.memoryUsage() : null,
      };
      
      // Extract custom performance metrics from console output or test metadata
      if (result.failureMessages) {
        const perfMetrics = this.extractPerformanceMetrics(result.failureMessages);
        if (perfMetrics) {
          performanceData.metrics = perfMetrics;
        }
      }
      
      this.testResults.push(performanceData);
      
      // Log performance info
      if (result.status === 'passed') {
        console.log(`  ✅ ${result.title}: ${performanceData.duration}ms`);
        if (performanceData.metrics) {
          Object.entries(performanceData.metrics).forEach(([key, value]) => {
            console.log(`     ${key}: ${value}`);
          });
        }
      } else {
        console.log(`  ❌ ${result.title}: FAILED`);
      }
    }
  }

  onRunComplete(contexts, results) {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    
    console.log('\n📈 Performance Benchmark Summary');
    console.log('=================================');
    console.log(`Total tests: ${this.testResults.length}`);
    console.log(`Total suite duration: ${totalDuration}ms`);
    console.log(`Passed: ${results.numPassedTests}`);
    console.log(`Failed: ${results.numFailedTests}`);
    
    if (this.testResults.length > 0) {
      const avgDuration = this.testResults
        .filter(r => r.duration > 0)
        .reduce((sum, r) => sum + r.duration, 0) / this.testResults.length;
      console.log(`Average test duration: ${avgDuration.toFixed(2)}ms`);
      
      // Find slowest tests
      const slowestTests = this.testResults
        .filter(r => r.duration > 0)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);
      
      if (slowestTests.length > 0) {
        console.log('\n🐌 Slowest tests:');
        slowestTests.forEach((test, i) => {
          console.log(`  ${i + 1}. ${test.testName}: ${test.duration}ms`);
        });
      }
      
      // Memory usage summary
      if (this.enableMemoryTracking) {
        const memoryUsages = this.testResults
          .filter(r => r.memory)
          .map(r => r.memory.heapUsed);
        
        if (memoryUsages.length > 0) {
          const avgMemory = memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length;
          const maxMemory = Math.max(...memoryUsages);
          console.log(`\n💾 Memory Usage:`);
          console.log(`  Average heap: ${(avgMemory / 1024 / 1024).toFixed(2)}MB`);
          console.log(`  Peak heap: ${(maxMemory / 1024 / 1024).toFixed(2)}MB`);
        }
      }
    }
    
    // Save detailed results
    this.saveResults().catch(error => {
      console.error('Failed to save benchmark results:', error);
    });
  }

  async saveResults() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.testResults.length,
        totalDuration: Date.now() - this.startTime,
        passed: this.testResults.filter(r => r.status === 'passed').length,
        failed: this.testResults.filter(r => r.status === 'failed').length,
      },
      tests: this.testResults,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage(),
        cpus: require('os').cpus().length,
      },
    };
    
    // Add trends if enabled
    if (this.enableTrends) {
      report.trends = await this.calculateTrends();
    }
    
    try {
      await fs.writeFile(this.outputFile, JSON.stringify(report, null, 2));
      console.log(`\n📄 Detailed results saved to: ${this.outputFile}`);
    } catch (error) {
      console.error(`❌ Failed to save results to ${this.outputFile}:`, error.message);
    }
  }

  async calculateTrends() {
    try {
      // Try to load previous results for trend analysis
      const previousResults = await fs.readFile(this.outputFile, 'utf8');
      const previous = JSON.parse(previousResults);
      
      if (previous.tests && Array.isArray(previous.tests)) {
        const trends = {};
        
        for (const currentTest of this.testResults) {
          const previousTest = previous.tests.find(t => 
            t.testName === currentTest.testName && t.testFile === currentTest.testFile
          );
          
          if (previousTest && previousTest.duration && currentTest.duration) {
            const change = currentTest.duration - previousTest.duration;
            const percentChange = (change / previousTest.duration) * 100;
            
            trends[currentTest.testName] = {
              previous: previousTest.duration,
              current: currentTest.duration,
              change,
              percentChange: parseFloat(percentChange.toFixed(2)),
              trend: change > 0 ? 'slower' : change < 0 ? 'faster' : 'same',
            };
          }
        }
        
        return trends;
      }
    } catch {
      // No previous results available
    }
    
    return {};
  }

  extractPerformanceMetrics(messages) {
    // Extract custom performance metrics from test output
    const metrics = {};
    
    for (const message of messages) {
      // Look for performance markers in output
      const perfRegex = /Performance: (\w+) took ([\d.]+)ms/g;
      let match;
      
      while ((match = perfRegex.exec(message)) !== null) {
        metrics[match[1]] = `${match[2]}ms`;
      }
      
      // Look for memory markers
      const memRegex = /Memory Delta: ([\d.]+)MB/g;
      match = memRegex.exec(message);
      if (match) {
        metrics.memoryDelta = `${match[1]}MB`;
      }
    }
    
    return Object.keys(metrics).length > 0 ? metrics : null;
  }
}

module.exports = BenchmarkReporter;
