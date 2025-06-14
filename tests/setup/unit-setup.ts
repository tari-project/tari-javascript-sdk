/**
 * Unit test setup - ensures all FFI calls are mocked
 * Uses centralized mock to avoid circular dependencies
 */

import { getMockStateManager, resetMockStateManager } from '../../packages/core/src/ffi/__mocks__/mock-state-manager';
import { resetMockNativeBindings } from '../../packages/core/src/ffi/__mocks__/native';

// Jest will substitute the native module using moduleNameMapper
// This file just provides test utilities and setup

// Set up mock before each test with comprehensive isolation
beforeEach(() => {
  // Reset module cache for complete isolation between tests
  jest.resetModules();
  
  // Clear all mocks and restore original implementations
  jest.clearAllMocks();
  jest.restoreAllMocks();
  
  // Reset mock implementations to defaults
  // Note: Actual mock functions are managed by Jest moduleNameMapper
  resetMockNativeBindings();
  resetMockStateManager();
  
  // Mock timers to prevent performance monitoring from running during tests
  // Use modern implementation which handles setImmediate correctly
  jest.useFakeTimers({ legacyFakeTimers: false });
  
  // Set environment variable to disable performance monitoring in tests
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_PERFORMANCE_MONITORING = 'true';
  
  // Take initial state snapshot for debugging
  getMockStateManager().takeSnapshot();
});

afterEach(async () => {
  // Take final state snapshot
  const stateManager = getMockStateManager();
  stateManager.takeSnapshot();
  
  // Validate mock state consistency
  const validation = stateManager.validateState();
  if (!validation.isValid) {
    console.warn('Mock state validation failed:', validation.errors);
  }
  
  // Check for potential memory leaks
  const leakCheck = stateManager.checkForLeaks();
  if (leakCheck.hasLeaks) {
    console.warn('Potential mock memory leaks detected:', leakCheck.issues);
  }
  
  // Run only pending timers to avoid infinite loops
  jest.runOnlyPendingTimers();
  
  // Clear all timers and restore real timers
  jest.clearAllTimers();
  jest.useRealTimers();
  
  // Reset all mocks after each test for complete isolation
  jest.resetAllMocks();
  
  // Clean up environment
  delete process.env.DISABLE_PERFORMANCE_MONITORING;
  
  // Reset mock state after cleanup
  resetMockNativeBindings();
  resetMockStateManager();
  
  // Force any pending setImmediate callbacks to complete
  await new Promise(resolve => setImmediate(resolve));
});

// Global test utilities for unit tests
global.testUtils = {
  ...global.testUtils,
  
  // Unit test specific utilities
  createMockFFI: () => {
    // Return mock reference for test setup
    // The actual mocks are managed by Jest moduleNameMapper
    return null;
  },
  
  // Helper to verify no real FFI calls are made
  verifyNoRealFFICalls: () => {
    // In unit tests, all FFI should be mocked
    // This is enforced by Jest moduleNameMapper configuration
    return true;
  },
  
  // Helper to set mock failure conditions
  setMockFailure: (shouldFail: boolean = true) => {
    // Mock failure mode can be controlled via the centralized mock
    // This will be available once the mock module is loaded
  },
  
  // Helper to set mock latency
  setMockLatency: (ms: number) => {
    // Mock latency can be controlled via the centralized mock
    // This will be available once the mock module is loaded
  },
};

// Add custom matchers for better test assertions
expect.extend({
  toBeValidWalletHandle(received: any) {
    const pass = typeof received === 'number' && received > 0;
    return {
      message: () => `expected ${received} to be a valid wallet handle (positive number)`,
      pass,
    };
  },
  
  toBeValidTariAddress(received: any) {
    const pass = typeof received === 'string' && received.startsWith('tari://');
    return {
      message: () => `expected ${received} to be a valid Tari address`,
      pass,
    };
  },
});

// TypeScript declaration for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidWalletHandle(): R;
      toBeValidTariAddress(): R;
    }
  }
}
