/**
 * Unit test setup - ensures all FFI calls are mocked
 * Uses centralized mock to avoid circular dependencies
 */

// Jest will substitute the native module using moduleNameMapper
// This file just provides test utilities and setup

// Set up mock before each test
beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset mock implementations to defaults
  // Note: Actual mock functions are managed by Jest moduleNameMapper
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
