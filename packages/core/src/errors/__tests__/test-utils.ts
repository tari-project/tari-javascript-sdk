/**
 * @fileoverview Testing utilities for error handling
 * 
 * Provides helpers for testing error conditions, mocking FFI errors,
 * and validating error handling behavior in unit tests.
 */

import { WalletError, ErrorContext, createWalletError } from '../wallet-error';
import { WalletErrorCode, ErrorCategory } from '../codes';
import { FFIErrorInfo } from '../ffi-errors';

/**
 * Error test scenario interface
 */
export interface ErrorTestScenario {
  /** Name of the test scenario */
  name: string;
  /** Error code to test */
  code: WalletErrorCode;
  /** Error details message */
  details: string;
  /** Whether this error should be recoverable */
  recoverable?: boolean;
  /** Error context */
  context?: ErrorContext;
  /** Expected behavior */
  expected: {
    /** Expected category */
    category: ErrorCategory;
    /** Expected recoverability */
    recoverable: boolean;
    /** Expected message pattern (regex) */
    messagePattern?: RegExp;
  };
}

/**
 * Factory for creating test errors
 */
export class ErrorTestFactory {
  /**
   * Create a basic wallet error for testing
   */
  static createWalletError(
    code: WalletErrorCode,
    details = 'Test error',
    context?: Partial<ErrorContext>
  ): WalletError {
    return createWalletError(code, details, context as ErrorContext);
  }

  /**
   * Create an FFI error info object for testing
   */
  static createFFIError(
    code: number,
    message = 'Test FFI error',
    recoverable = false,
    context?: string
  ): FFIErrorInfo {
    return {
      code,
      message,
      recoverable,
      context,
    };
  }

  /**
   * Create a mock native error (simulates native module error)
   */
  static createNativeError(
    code: number,
    message = 'Native error'
  ): Error & { code: number } {
    const error = new Error(message) as Error & { code: number };
    error.code = code;
    return error;
  }

  /**
   * Create an error with specific context
   */
  static createErrorWithContext(
    code: WalletErrorCode,
    context: {
      operation?: string;
      network?: string;
      walletId?: string;
      transactionId?: string;
      component?: string;
    }
  ): WalletError {
    return createWalletError(code, 'Test error with context', {
      ...context,
      timestamp: new Date(),
    });
  }

  /**
   * Create a chain of errors (error with cause)
   */
  static createErrorChain(
    primaryCode: WalletErrorCode,
    causeCode: WalletErrorCode,
    details = 'Primary error'
  ): WalletError {
    const cause = this.createWalletError(causeCode, 'Underlying cause');
    return new WalletError(primaryCode, details, { cause });
  }
}

/**
 * Mock FFI error scenarios
 */
export const MockFFIErrors = {
  /**
   * Simulate wallet not found error
   */
  walletNotFound: (): FFIErrorInfo => ({
    code: 103,
    message: 'Wallet not found at specified path',
    recoverable: false,
    context: 'wallet_load',
  }),

  /**
   * Simulate insufficient funds error
   */
  insufficientFunds: (available = '500000', requested = '1000000'): FFIErrorInfo => ({
    code: 201,
    message: `Insufficient funds: available ${available}, requested ${requested}`,
    recoverable: false,
    context: 'send_transaction',
  }),

  /**
   * Simulate network connection error
   */
  networkError: (): FFIErrorInfo => ({
    code: 300,
    message: 'Failed to connect to network',
    recoverable: true,
    context: 'network_connect',
  }),

  /**
   * Simulate database locked error
   */
  databaseLocked: (): FFIErrorInfo => ({
    code: 607,
    message: 'Database is locked by another process',
    recoverable: true,
    context: 'database_access',
  }),

  /**
   * Simulate invalid handle error
   */
  invalidHandle: (handle = '12345'): FFIErrorInfo => ({
    code: 504,
    message: `Invalid handle: ${handle}`,
    recoverable: false,
    context: 'handle_validation',
  }),
};

/**
 * Common error test scenarios
 */
export const ErrorTestScenarios: ErrorTestScenario[] = [
  {
    name: 'Invalid wallet configuration',
    code: WalletErrorCode.InvalidConfig,
    details: 'Missing required network parameter',
    expected: {
      category: ErrorCategory.Configuration,
      recoverable: false,
      messagePattern: /Invalid wallet configuration.*Missing required network parameter/,
    },
  },
  {
    name: 'Insufficient funds for transaction',
    code: WalletErrorCode.InsufficientFunds,
    details: 'Available: 500000, Required: 1000000',
    expected: {
      category: ErrorCategory.Transaction,
      recoverable: false,
      messagePattern: /Insufficient funds.*Available.*Required/,
    },
  },
  {
    name: 'Network connection timeout',
    code: WalletErrorCode.ConnectionTimeout,
    details: 'Connection timed out after 30 seconds',
    recoverable: true,
    expected: {
      category: ErrorCategory.Network,
      recoverable: true,
      messagePattern: /Connection timeout.*30 seconds/,
    },
  },
  {
    name: 'Invalid address format',
    code: WalletErrorCode.InvalidAddress,
    details: 'Address must be 33 emojis or valid base58',
    expected: {
      category: ErrorCategory.Validation,
      recoverable: false,
      messagePattern: /Invalid wallet address format.*33 emojis.*base58/,
    },
  },
  {
    name: 'FFI use after free',
    code: WalletErrorCode.UseAfterFree,
    details: 'Attempted to use destroyed resource',
    expected: {
      category: ErrorCategory.FFI,
      recoverable: false,
      messagePattern: /Use after free.*destroyed resource/,
    },
  },
];

/**
 * Error assertion helpers
 */
export class ErrorAssertions {
  /**
   * Assert that an error is a WalletError with specific code
   */
  static assertWalletError(
    error: unknown,
    expectedCode: WalletErrorCode,
    expectedMessage?: string | RegExp
  ): asserts error is WalletError {
    if (!(error instanceof WalletError)) {
      throw new Error(`Expected WalletError, got ${typeof error}`);
    }

    if (error.code !== expectedCode) {
      throw new Error(`Expected error code ${expectedCode}, got ${error.code}`);
    }

    if (expectedMessage) {
      const messageMatches = typeof expectedMessage === 'string'
        ? error.message.includes(expectedMessage)
        : expectedMessage.test(error.message);

      if (!messageMatches) {
        throw new Error(`Expected message pattern not found in: ${error.message}`);
      }
    }
  }

  /**
   * Assert that an error has specific context
   */
  static assertErrorContext(
    error: WalletError,
    expectedContext: Partial<ErrorContext>
  ): void {
    const context = error.context;
    if (!context) {
      throw new Error('Error has no context');
    }

    for (const [key, expectedValue] of Object.entries(expectedContext)) {
      const actualValue = context[key as keyof ErrorContext];
      if (actualValue !== expectedValue) {
        throw new Error(`Expected context.${key} to be ${expectedValue}, got ${actualValue}`);
      }
    }
  }

  /**
   * Assert that an error is recoverable
   */
  static assertRecoverable(error: WalletError): void {
    if (!error.recoverable) {
      throw new Error(`Expected error ${error.code} to be recoverable`);
    }
  }

  /**
   * Assert that an error is not recoverable
   */
  static assertNotRecoverable(error: WalletError): void {
    if (error.recoverable) {
      throw new Error(`Expected error ${error.code} to not be recoverable`);
    }
  }

  /**
   * Assert that an error has a specific category
   */
  static assertCategory(error: WalletError, expectedCategory: ErrorCategory): void {
    if (error.category !== expectedCategory) {
      throw new Error(`Expected category ${expectedCategory}, got ${error.category}`);
    }
  }

  /**
   * Assert that an error has a cause
   */
  static assertHasCause(error: WalletError): void {
    if (!error.cause) {
      throw new Error('Expected error to have a cause');
    }
  }

  /**
   * Assert that an error serializes correctly
   */
  static assertSerializable(error: WalletError): void {
    try {
      const serialized = JSON.stringify(error.toJSON());
      const parsed = JSON.parse(serialized);
      
      // Check essential fields are present
      const requiredFields = ['name', 'code', 'category', 'message', 'recoverable'];
      for (const field of requiredFields) {
        if (!(field in parsed)) {
          throw new Error(`Missing field ${field} in serialized error`);
        }
      }
    } catch (serializationError) {
      throw new Error(`Error serialization failed: ${serializationError}`);
    }
  }
}

/**
 * Error testing utilities
 */
export class ErrorTestUtils {
  /**
   * Create a function that throws a specific error
   */
  static createThrowingFunction(error: Error): () => never {
    return () => {
      throw error;
    };
  }

  /**
   * Create an async function that throws a specific error
   */
  static createAsyncThrowingFunction(error: Error, delay = 0): () => Promise<never> {
    return async () => {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      throw error;
    };
  }

  /**
   * Create a function that succeeds after N failures
   */
  static createEventuallySucceedingFunction<T>(
    failureCount: number,
    error: Error,
    successValue: T
  ): () => T {
    let attempts = 0;
    return () => {
      attempts++;
      if (attempts <= failureCount) {
        throw error;
      }
      return successValue;
    };
  }

  /**
   * Create an async function that succeeds after N failures
   */
  static createEventuallySucceedingAsyncFunction<T>(
    failureCount: number,
    error: Error,
    successValue: T,
    delay = 0
  ): () => Promise<T> {
    let attempts = 0;
    return async () => {
      attempts++;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      if (attempts <= failureCount) {
        throw error;
      }
      return successValue;
    };
  }

  /**
   * Capture all errors thrown during test execution
   */
  static captureErrors<T>(fn: () => T): { result?: T; errors: Error[] } {
    const errors: Error[] = [];
    let result: T | undefined;

    try {
      result = fn();
    } catch (error) {
      errors.push(error as Error);
    }

    return { result, errors };
  }

  /**
   * Capture all errors thrown during async test execution
   */
  static async captureAsyncErrors<T>(
    fn: () => Promise<T>
  ): Promise<{ result?: T; errors: Error[] }> {
    const errors: Error[] = [];
    let result: T | undefined;

    try {
      result = await fn();
    } catch (error) {
      errors.push(error as Error);
    }

    return { result, errors };
  }

  /**
   * Run test scenario and validate behavior
   */
  static runErrorScenario(scenario: ErrorTestScenario): void {
    const error = ErrorTestFactory.createWalletError(
      scenario.code,
      scenario.details,
      scenario.context
    );

    // Validate category
    ErrorAssertions.assertCategory(error, scenario.expected.category);

    // Validate recoverability
    if (scenario.expected.recoverable) {
      ErrorAssertions.assertRecoverable(error);
    } else {
      ErrorAssertions.assertNotRecoverable(error);
    }

    // Validate message pattern if provided
    if (scenario.expected.messagePattern) {
      ErrorAssertions.assertWalletError(
        error,
        scenario.code,
        scenario.expected.messagePattern
      );
    }

    // Validate serialization
    ErrorAssertions.assertSerializable(error);
  }

  /**
   * Test all error scenarios
   */
  static runAllScenarios(): void {
    for (const scenario of ErrorTestScenarios) {
      try {
        this.runErrorScenario(scenario);
      } catch (testError) {
        throw new Error(`Scenario '${scenario.name}' failed: ${testError}`);
      }
    }
  }
}

/**
 * Mock error context for testing
 */
export const MockContext = {
  /**
   * Basic operation context
   */
  operation: (operation: string): ErrorContext => ({
    operation,
    component: 'test',
    timestamp: new Date(),
  }),

  /**
   * Transaction context
   */
  transaction: (transactionId: string, network = 'testnet'): ErrorContext => ({
    operation: 'send_transaction',
    component: 'wallet',
    network,
    transactionId,
    timestamp: new Date(),
  }),

  /**
   * Wallet context
   */
  wallet: (walletId: string, network = 'testnet'): ErrorContext => ({
    operation: 'wallet_operation',
    component: 'wallet',
    network,
    walletId,
    timestamp: new Date(),
  }),

  /**
   * FFI context
   */
  ffi: (operation: string): ErrorContext => ({
    operation,
    component: 'FFI',
    timestamp: new Date(),
    metadata: {
      ffiOperation: operation,
    },
  }),
};

/**
 * Jest-specific matchers for error testing
 */
export const ErrorMatchers = {
  /**
   * Expect function to throw WalletError with specific code
   */
  toThrowWalletError: (
    received: () => unknown,
    expectedCode: WalletErrorCode,
    expectedMessage?: string | RegExp
  ) => {
    try {
      received();
      return {
        pass: false,
        message: () => 'Expected function to throw WalletError, but it did not throw',
      };
    } catch (error) {
      try {
        ErrorAssertions.assertWalletError(error, expectedCode, expectedMessage);
        return {
          pass: true,
          message: () => `Expected function not to throw WalletError ${expectedCode}`,
        };
      } catch (assertionError) {
        return {
          pass: false,
          message: () => assertionError instanceof Error ? assertionError.message : String(assertionError),
        };
      }
    }
  },

  /**
   * Expect async function to throw WalletError with specific code
   */
  toThrowWalletErrorAsync: async (
    received: () => Promise<unknown>,
    expectedCode: WalletErrorCode,
    expectedMessage?: string | RegExp
  ) => {
    try {
      await received();
      return {
        pass: false,
        message: () => 'Expected async function to throw WalletError, but it did not throw',
      };
    } catch (error) {
      try {
        ErrorAssertions.assertWalletError(error, expectedCode, expectedMessage);
        return {
          pass: true,
          message: () => `Expected async function not to throw WalletError ${expectedCode}`,
        };
      } catch (assertionError) {
        return {
          pass: false,
          message: () => assertionError instanceof Error ? assertionError.message : String(assertionError),
        };
      }
    }
  },
};

/**
 * Export all utilities for easy importing in tests
 */
export {
  WalletError,
  WalletErrorCode,
  ErrorCategory,
  createWalletError,
};
