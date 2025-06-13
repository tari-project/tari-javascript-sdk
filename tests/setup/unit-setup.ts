/**
 * Unit test setup - ensures all FFI calls are mocked
 */

import { getMockNativeBindings, resetMockNativeBindings } from '../../packages/core/src/ffi/__mocks__/native';

// Ensure Jest mocking is properly configured
jest.mock('@tari-project/tarijs-core/native', () => {
  return getMockNativeBindings();
});

// Set up mock before each test
beforeEach(() => {
  // Reset mock state to ensure test isolation
  resetMockNativeBindings();
  
  // Clear all mocks
  jest.clearAllMocks();
});

// Global test utilities for unit tests
global.testUtils = {
  ...global.testUtils,
  
  // Unit test specific utilities
  createMockFFI: () => getMockNativeBindings(),
  
  // Helper to verify no real FFI calls are made
  verifyNoRealFFICalls: () => {
    // In unit tests, all FFI should be mocked
    expect(jest.isMockFunction(getMockNativeBindings().walletCreate)).toBe(true);
  },
  
  // Helper to set mock failure conditions
  setMockFailure: (shouldFail: boolean = true) => {
    const mockFFI = getMockNativeBindings();
    if (typeof mockFFI.setFailureMode === 'function') {
      mockFFI.setFailureMode(shouldFail);
    }
  },
  
  // Helper to set mock latency
  setMockLatency: (ms: number) => {
    const mockFFI = getMockNativeBindings();
    if (typeof mockFFI.setLatency === 'function') {
      mockFFI.setLatency(ms);
    }
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
