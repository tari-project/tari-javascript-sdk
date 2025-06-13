/**
 * Test isolation utilities for proper resource cleanup and state reset
 */

import { ResourceTracker } from '../../packages/core/src/ffi/tracker.js';

/**
 * Test isolation manager for proper cleanup between tests
 */
export class TestIsolation {
  private static trackerInstance: ResourceTracker | null = null;

  /**
   * Setup test isolation before each test
   */
  static beforeEach(): void {
    // Reset the global tracker instance
    (ResourceTracker as any).resetInstance();
    
    // Clear any existing tracker state
    this.trackerInstance = ResourceTracker.getInstance();
    this.trackerInstance.clearAll();
    this.trackerInstance.resetStats();
  }

  /**
   * Cleanup test isolation after each test
   */
  static afterEach(): void {
    if (this.trackerInstance) {
      // Force cleanup of any remaining resources
      this.trackerInstance.forceCleanup();
      
      // Clear all tracking data
      this.trackerInstance.clearAll();
      this.trackerInstance.resetStats();
      
      // Reset the global instance
      (ResourceTracker as any).resetInstance();
      this.trackerInstance = null;
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Get a fresh tracker instance for testing
   */
  static getFreshTracker(): ResourceTracker {
    (ResourceTracker as any).resetInstance();
    const tracker = ResourceTracker.getInstance();
    tracker.clearAll();
    tracker.resetStats();
    return tracker;
  }

  /**
   * Verify no resource leaks after test
   */
  static verifyNoResourceLeaks(): void {
    const tracker = ResourceTracker.getInstance();
    const stats = tracker.getStats();
    
    if (stats.currentActive > 0) {
      const leaks = tracker.detectLeaks();
      const report = tracker.generateDiagnosticReport();
      
      console.warn('Resource leaks detected after test:', {
        stats,
        leaks: leaks.length,
        resourcesByType: report.resourcesByType,
      });
      
      // Clean up for next test
      tracker.clearAll();
      tracker.resetStats();
    }
  }
}

/**
 * Jest setup functions for automatic test isolation
 */
export function setupTestIsolation(): void {
  beforeEach(() => {
    TestIsolation.beforeEach();
  });

  afterEach(() => {
    TestIsolation.afterEach();
  });
}

/**
 * Manual test isolation for specific test suites
 */
export function isolateTest<T>(testFn: () => T | Promise<T>): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      TestIsolation.beforeEach();
      const result = await testFn();
      TestIsolation.verifyNoResourceLeaks();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      TestIsolation.afterEach();
    }
  });
}
