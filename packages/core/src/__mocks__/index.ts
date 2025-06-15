/**
 * @fileoverview Comprehensive mock module for core package testing
 */

import { jest } from '@jest/globals';

// Get the actual core module
const actual = jest.requireActual('@tari-project/tarijs-core');

/**
 * Mock FFI bindings for testing
 */
const mockFFIBindings = {
  walletGetBalance: jest.fn(),
  walletGetTransactionStatus: jest.fn(),
  walletGetPendingInboundTransactions: jest.fn(),
  walletGetPendingOutboundTransactions: jest.fn(),
  walletGetFeePerGramStats: jest.fn(),
  walletSendTransaction: jest.fn(),
  walletCancelTransaction: jest.fn(),
  walletGetAllTransactions: jest.fn(),
  // Add more FFI methods as needed
};

/**
 * Mock getFFIBindings function
 */
export const getFFIBindings = jest.fn(() => mockFFIBindings);

/**
 * Mock error context decorator - pass-through for tests
 */
export const withErrorContext = jest.fn((context: string, category?: string) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    return descriptor;
  };
});

/**
 * Mock retry decorator - pass-through for tests
 */
export const withRetry = jest.fn((options?: any) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    return descriptor;
  };
});

/**
 * Mock validation functions
 */
export const validateMicroTari = jest.fn();
export const validateRequired = jest.fn();
export const validateTransactionId = jest.fn();

/**
 * Mock branded type conversion functions
 * Preserve the actual implementations for proper type handling
 */
export const microTariFromFFI = actual.microTariFromFFI || ((value: any) => value);
export const microTariToFFI = actual.microTariToFFI || ((value: any) => BigInt(value));
export const transactionIdFromFFI = actual.transactionIdFromFFI || ((value: any) => value);
export const transactionIdToFFI = actual.transactionIdToFFI || ((value: any) => BigInt(value));
export const transactionIdToString = actual.transactionIdToString || ((value: any) => String(value));

/**
 * Export all other actual exports to preserve real functionality
 */
export * from '@tari-project/tarijs-core';

/**
 * Override specific exports with mocks
 */
export default {
  ...actual,
  getFFIBindings,
  withErrorContext,
  withRetry,
  validateMicroTari,
  validateRequired,
  validateTransactionId,
  mockFFIBindings // Export for test access
};

/**
 * Reset all mocks - useful for beforeEach in tests
 */
export const resetCoreMocks = () => {
  Object.values(mockFFIBindings).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  
  getFFIBindings.mockClear();
  withErrorContext.mockClear();
  withRetry.mockClear();
  validateMicroTari.mockClear();
  validateRequired.mockClear();
  validateTransactionId.mockClear();
};
