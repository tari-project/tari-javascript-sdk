/**
 * @fileoverview Mock implementation of error context system for testing
 */

import type { WalletError } from '@tari-project/tarijs-core';

/**
 * Mock withErrorContext decorator for testing
 * Returns a pass-through decorator that preserves original method behavior
 */
export const withErrorContext = jest.fn((context: string, category?: string) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    // Return the original descriptor without modification for tests
    return descriptor;
  };
});

/**
 * Mock error context functions for testing
 */
export const createErrorContext = jest.fn((context: string, category?: string) => ({
  context,
  category,
  timestamp: Date.now()
}));

export const getErrorContext = jest.fn(() => ({}));

export const clearErrorContext = jest.fn();

/**
 * Mock error handling utilities
 */
export const handleWalletError = jest.fn((error: Error, context?: any): WalletError => {
  // Return the error as-is for testing
  return error as any;
});

export const wrapWithContext = jest.fn(<T extends (...args: any[]) => any>(
  fn: T,
  context: string,
  category?: string
): T => {
  // Return the original function for testing
  return fn;
});

/**
 * Reset all mocks - useful for test setup
 */
export const resetErrorContextMocks = () => {
  withErrorContext.mockClear();
  createErrorContext.mockClear();
  getErrorContext.mockClear();
  clearErrorContext.mockClear();
  handleWalletError.mockClear();
  wrapWithContext.mockClear();
};
