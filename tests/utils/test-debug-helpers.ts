/**
 * Test debugging and validation infrastructure
 * Provides utilities for diagnosing test failures and performance issues
 */

import { getMockStateManager } from '../../packages/core/src/ffi/__mocks__/mock-state-manager';

export interface TestDebugInfo {
  timerState: {
    hasFakeTimers: boolean;
    pendingTimers: number;
    advancedTime: number;
  };
  mockState: {
    isValid: boolean;
    errors: string[];
    walletCount: number;
    activeCallbacks: number;
  };
  memoryState: {
    hasLeaks: boolean;
    issues: string[];
  };
  asyncOperations: {
    pendingPromises: number;
    pendingSetImmediate: number;
  };
}

/**
 * Test debugger for diagnosing common test failures
 */
export class TestDebugger {
  private static enabled = process.env.ENABLE_TEST_DEBUG === 'true';

  /**
   * Log current timer state for debugging timeout issues
   */
  static logTimerState(): void {
    if (!this.enabled) return;

    console.log('=== Timer State Debug ===');
    console.log('Jest fake timers active:', jest.isMockFunction(setTimeout));
    console.log('Pending timers:', jest.getTimerCount());
    
    // Check for real timers that might be interfering
    if (typeof process.hrtime !== 'undefined') {
      console.log('Process hrtime available:', !!process.hrtime);
    }
  }

  /**
   * Validate mock consistency for isolation issues
   */
  static validateMockConsistency(): boolean {
    if (!this.enabled) return true;

    console.log('=== Mock Validation Debug ===');
    
    const stateManager = getMockStateManager();
    const validation = stateManager.validateState();
    
    if (!validation.isValid) {
      console.log('Mock validation failed:', validation.errors);
      return false;
    }
    
    const leakCheck = stateManager.checkForLeaks();
    if (leakCheck.hasLeaks) {
      console.log('Mock memory leaks detected:', leakCheck.issues);
      return false;
    }
    
    console.log('Mock state is valid');
    return true;
  }

  /**
   * Track async operations for debugging hanging tests
   */
  static trackAsyncOperations(): void {
    if (!this.enabled) return;

    console.log('=== Async Operations Debug ===');
    
    // Track promise rejections
    const originalUnhandled = process.listeners('unhandledRejection');
    console.log('Unhandled rejection listeners:', originalUnhandled.length);
    
    // Track setImmediate callbacks
    const immediateCount = process._getActiveHandles().filter(
      handle => handle.constructor.name === 'Immediate'
    ).length;
    console.log('Pending setImmediate callbacks:', immediateCount);
    
    // Track active handles
    const activeHandles = process._getActiveHandles().length;
    console.log('Active handles:', activeHandles);
  }

  /**
   * Get comprehensive debug information
   */
  static getDebugInfo(): TestDebugInfo {
    const stateManager = getMockStateManager();
    const validation = stateManager.validateState();
    const leakCheck = stateManager.checkForLeaks();
    const latestSnapshot = stateManager.getLatestSnapshot();

    return {
      timerState: {
        hasFakeTimers: jest.isMockFunction(setTimeout),
        pendingTimers: jest.getTimerCount(),
        advancedTime: 0 // Jest doesn't expose this
      },
      mockState: {
        isValid: validation.isValid,
        errors: validation.errors,
        walletCount: latestSnapshot?.walletCount || 0,
        activeCallbacks: latestSnapshot?.activeCallbacks || 0
      },
      memoryState: {
        hasLeaks: leakCheck.hasLeaks,
        issues: leakCheck.issues
      },
      asyncOperations: {
        pendingPromises: 0, // Difficult to track accurately
        pendingSetImmediate: process._getActiveHandles().filter(
          handle => handle.constructor.name === 'Immediate'
        ).length
      }
    };
  }

  /**
   * Run comprehensive diagnostic check
   */
  static runDiagnostics(): { passed: boolean; issues: string[] } {
    if (!this.enabled) return { passed: true, issues: [] };

    const issues: string[] = [];
    
    // Check timer state
    if (jest.getTimerCount() > 0) {
      issues.push(`${jest.getTimerCount()} pending timers detected`);
    }
    
    // Check mock state
    if (!this.validateMockConsistency()) {
      issues.push('Mock state validation failed');
    }
    
    // Check for active handles
    const activeHandles = process._getActiveHandles().length;
    if (activeHandles > 10) {
      issues.push(`High number of active handles: ${activeHandles}`);
    }
    
    return {
      passed: issues.length === 0,
      issues
    };
  }

  /**
   * Enable debug logging
   */
  static enable(): void {
    process.env.ENABLE_TEST_DEBUG = 'true';
    this.enabled = true;
  }

  /**
   * Disable debug logging
   */
  static disable(): void {
    process.env.ENABLE_TEST_DEBUG = 'false';
    this.enabled = false;
  }

  /**
   * Log test completion summary
   */
  static logTestSummary(testName: string, duration: number): void {
    if (!this.enabled) return;

    console.log(`=== Test Completion: ${testName} ===`);
    console.log(`Duration: ${duration}ms`);
    
    const diagnostics = this.runDiagnostics();
    if (!diagnostics.passed) {
      console.log('Issues detected:', diagnostics.issues);
    } else {
      console.log('All diagnostics passed');
    }
  }
}

/**
 * Custom Jest matcher for debugging test state
 */
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveCleanTestState(): R;
    }
  }
}

// Add custom matcher
expect.extend({
  toHaveCleanTestState() {
    const diagnostics = TestDebugger.runDiagnostics();
    
    return {
      message: () => 
        diagnostics.passed 
          ? 'Test state is clean'
          : `Test state has issues: ${diagnostics.issues.join(', ')}`,
      pass: diagnostics.passed,
    };
  },
});

/**
 * Helper to wrap tests with debugging
 */
export function debugTest(testName: string, testFn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const start = Date.now();
    
    try {
      await testFn();
    } finally {
      const duration = Date.now() - start;
      TestDebugger.logTestSummary(testName, duration);
    }
  };
}

/**
 * Timeout detection helper
 */
export function withTimeoutDetection<T>(
  promise: Promise<T>, 
  timeoutMs: number = 5000,
  context: string = 'operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        TestDebugger.logTimerState();
        TestDebugger.trackAsyncOperations();
        reject(new Error(`Timeout after ${timeoutMs}ms in ${context}`));
      }, timeoutMs);
    })
  ]);
}
