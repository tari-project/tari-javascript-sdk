// =============================================================================
// SIMPLE ERROR MAPPING - Mirror iOS/Android Error Handling
// No complex error hierarchies, just simple code mapping
// =============================================================================

/**
 * Error codes matching Tari FFI library
 * These map directly to the LibWalletError enum in Rust
 */
export enum TariErrorCode {
  Success = 0,
  InvalidArgument = 1,
  InvalidSeed = 2,
  NetworkError = 3,
  InsufficientBalance = 4,
  TransactionError = 5,
  DatabaseError = 6,
  KeyError = 7,
  AddressError = 8,
  EncryptionError = 9,
  ValidationError = 10,
  ConnectionError = 11,
  SyncError = 12,
  ConfigError = 13,
  UnknownError = 999,
}

/**
 * Simple FFI error class - mirrors iOS/Android pattern
 * No complex inheritance, just basic error with code and context
 */
export class TariFFIError extends Error {
  constructor(
    message: string,
    public code: TariErrorCode = TariErrorCode.UnknownError,
    public context?: any
  ) {
    super(message);
    this.name = 'TariFFIError';
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, TariFFIError.prototype);
  }
  
  /**
   * Check if this error is of a specific type
   */
  isErrorCode(code: TariErrorCode): boolean {
    return this.code === code;
  }
  
  /**
   * Convert to simple object for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context
    };
  }
}

// =============================================================================
// ERROR CODE MAPPING (mirrors mobile wallet error handling)
// =============================================================================

/**
 * Map numeric error code to human-readable message
 * Mirrors iOS/Android error mapping functions
 */
export function mapErrorCode(code: number): { message: string; code: TariErrorCode } {
  switch (code) {
    case TariErrorCode.Success:
      return { message: 'Operation completed successfully', code: TariErrorCode.Success };
      
    case TariErrorCode.InvalidArgument:
      return { message: 'Invalid argument provided to function', code: TariErrorCode.InvalidArgument };
      
    case TariErrorCode.InvalidSeed:
      return { message: 'Invalid seed words provided', code: TariErrorCode.InvalidSeed };
      
    case TariErrorCode.NetworkError:
      return { message: 'Network communication error', code: TariErrorCode.NetworkError };
      
    case TariErrorCode.InsufficientBalance:
      return { message: 'Insufficient balance for transaction', code: TariErrorCode.InsufficientBalance };
      
    case TariErrorCode.TransactionError:
      return { message: 'Transaction processing failed', code: TariErrorCode.TransactionError };
      
    case TariErrorCode.DatabaseError:
      return { message: 'Database operation failed', code: TariErrorCode.DatabaseError };
      
    case TariErrorCode.KeyError:
      return { message: 'Cryptographic key operation failed', code: TariErrorCode.KeyError };
      
    case TariErrorCode.AddressError:
      return { message: 'Address validation or conversion failed', code: TariErrorCode.AddressError };
      
    case TariErrorCode.EncryptionError:
      return { message: 'Encryption or decryption failed', code: TariErrorCode.EncryptionError };
      
    case TariErrorCode.ValidationError:
      return { message: 'Data validation failed', code: TariErrorCode.ValidationError };
      
    case TariErrorCode.ConnectionError:
      return { message: 'Failed to establish connection', code: TariErrorCode.ConnectionError };
      
    case TariErrorCode.SyncError:
      return { message: 'Wallet synchronization failed', code: TariErrorCode.SyncError };
      
    case TariErrorCode.ConfigError:
      return { message: 'Configuration error', code: TariErrorCode.ConfigError };
      
    default:
      return { message: `Unknown error (code: ${code})`, code: TariErrorCode.UnknownError };
  }
}

/**
 * Create a TariFFIError from an error code
 * Convenience function for consistent error creation
 */
export function createFFIError(code: number, context?: string, additionalContext?: any): TariFFIError {
  const errorInfo = mapErrorCode(code);
  const message = context ? `${context}: ${errorInfo.message}` : errorInfo.message;
  return new TariFFIError(message, errorInfo.code, additionalContext);
}

// =============================================================================
// ERROR CHECKING UTILITIES (mirrors mobile wallet helpers)
// =============================================================================

/**
 * Check if an error is recoverable (can be retried)
 * Mirrors iOS/Android error classification
 */
export function isRecoverableError(error: TariFFIError): boolean {
  const recoverableCodes = [
    TariErrorCode.NetworkError,
    TariErrorCode.ConnectionError,
    TariErrorCode.SyncError
  ];
  
  return recoverableCodes.includes(error.code);
}

/**
 * Check if an error is a user input error
 * Mirrors iOS/Android user error classification
 */
export function isUserError(error: TariFFIError): boolean {
  const userErrorCodes = [
    TariErrorCode.InvalidArgument,
    TariErrorCode.InvalidSeed,
    TariErrorCode.InsufficientBalance,
    TariErrorCode.AddressError
  ];
  
  return userErrorCodes.includes(error.code);
}

/**
 * Check if an error is a system/internal error
 * Mirrors iOS/Android system error classification
 */
export function isSystemError(error: TariFFIError): boolean {
  const systemErrorCodes = [
    TariErrorCode.DatabaseError,
    TariErrorCode.KeyError,
    TariErrorCode.EncryptionError,
    TariErrorCode.ConfigError
  ];
  
  return systemErrorCodes.includes(error.code);
}

/**
 * Get user-friendly error message for display
 * Mirrors iOS/Android user message helpers
 */
export function getUserFriendlyMessage(error: TariFFIError): string {
  switch (error.code) {
    case TariErrorCode.InvalidSeed:
      return 'Please check your seed words and try again';
      
    case TariErrorCode.InsufficientBalance:
      return 'You don\'t have enough funds for this transaction';
      
    case TariErrorCode.NetworkError:
    case TariErrorCode.ConnectionError:
      return 'Please check your internet connection and try again';
      
    case TariErrorCode.AddressError:
      return 'Please check the address and try again';
      
    case TariErrorCode.TransactionError:
      return 'Transaction failed. Please try again';
      
    case TariErrorCode.DatabaseError:
      return 'A storage error occurred. Please restart the app';
      
    case TariErrorCode.SyncError:
      return 'Failed to sync with network. Please try again';
      
    default:
      return 'An unexpected error occurred. Please try again';
  }
}

// =============================================================================
// ERROR LOGGING UTILITIES (mirrors mobile wallet logging)
// =============================================================================

/**
 * Log error with appropriate level based on error type
 * Mirrors iOS/Android error logging patterns
 */
export function logError(error: TariFFIError, context?: string): void {
  const prefix = context ? `[${context}]` : '[TariSDK]';
  const message = `${prefix} ${error.message}`;
  
  if (isUserError(error)) {
    console.warn(message, { code: error.code, context: error.context });
  } else if (isSystemError(error)) {
    console.error(message, { code: error.code, context: error.context });
  } else {
    console.log(message, { code: error.code, context: error.context });
  }
}

/**
 * Convert any error to TariFFIError for consistent handling
 * Mirrors iOS/Android error normalization
 */
export function normalizeError(error: unknown, defaultCode: TariErrorCode = TariErrorCode.UnknownError): TariFFIError {
  if (error instanceof TariFFIError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new TariFFIError(error.message, defaultCode, { originalError: error });
  }
  
  const message = typeof error === 'string' ? error : 'Unknown error occurred';
  return new TariFFIError(message, defaultCode, { originalError: error });
}

// =============================================================================
// ERROR REPORTING UTILITIES
// =============================================================================

/**
 * Create error report for debugging
 * Useful for support and debugging scenarios
 */
export function createErrorReport(error: TariFFIError, additionalContext?: any): object {
  return {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      codeName: TariErrorCode[error.code] || 'UNKNOWN',
      context: error.context
    },
    classification: {
      isRecoverable: isRecoverableError(error),
      isUserError: isUserError(error),
      isSystemError: isSystemError(error)
    },
    userFriendlyMessage: getUserFriendlyMessage(error),
    additionalContext,
    sdk: {
      name: '@tari/sdk',
      version: '0.1.0' // TODO: Get from package.json
    }
  };
}
