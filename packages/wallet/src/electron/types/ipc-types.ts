/**
 * @fileoverview Type-safe IPC types and conversion utilities for Electron
 * 
 * Provides type-safe conversion layer between IPC boundary and internal types,
 * handling TariAddress<->string and bigint<->number conversions with validation.
 */

/**
 * IPC-safe error types for consistent error handling across IPC boundaries
 */
export type IPCError = 
  | { code: "ValidationError", detail: string }
  | { code: "SerializationError", message: string }
  | { code: "ConversionError", field: string, expectedType: string, receivedType: string }
  | { code: "UnknownError", cause: string };

/**
 * Standard IPC response format with proper typing
 */
export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
  timestamp: number;
}

/**
 * IPC-safe representation of TariAddress as string
 */
export type IPCTariAddress = string;

/**
 * IPC-safe representation of bigint as number (with validation)
 */
export type IPCBigInt = number;

/**
 * Type conversion utilities for IPC boundary crossing
 */
export class IPCTypeConverter {
  /**
   * Convert TariAddress to IPC-safe string representation
   */
  static addressToString(address: any): IPCTariAddress {
    if (typeof address === 'string') {
      return address;
    }
    
    if (address && typeof address.toString === 'function') {
      return address.toString();
    }
    
    if (address && typeof address.toHex === 'function') {
      return address.toHex();
    }
    
    throw new Error(`Cannot convert TariAddress to string: ${typeof address}`);
  }

  /**
   * Convert string back to TariAddress (validation only - actual construction in consumer)
   */
  static validateAddressString(address: string): string {
    if (typeof address !== 'string') {
      throw new Error(`Expected string address, got ${typeof address}`);
    }
    
    if (address.length === 0) {
      throw new Error('Address string cannot be empty');
    }
    
    // Basic hex validation if it looks like a hex string
    if (address.startsWith('0x') || /^[0-9a-fA-F]+$/.test(address)) {
      if (address.replace('0x', '').length % 2 !== 0) {
        throw new Error('Invalid hex address format');
      }
    }
    
    return address;
  }

  /**
   * Convert bigint to IPC-safe number with bounds checking
   */
  static bigintToNumber(value: bigint): IPCBigInt {
    if (typeof value !== 'bigint') {
      throw new Error(`Expected bigint, got ${typeof value}`);
    }
    
    // Check if the bigint fits in a safe integer range
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`BigInt value ${value} exceeds MAX_SAFE_INTEGER`);
    }
    
    if (value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new Error(`BigInt value ${value} is below MIN_SAFE_INTEGER`);
    }
    
    return Number(value);
  }

  /**
   * Convert number back to bigint with validation
   */
  static numberToBigint(value: number): bigint {
    if (typeof value !== 'number') {
      throw new Error(`Expected number, got ${typeof value}`);
    }
    
    if (!Number.isInteger(value)) {
      throw new Error(`Expected integer, got ${value}`);
    }
    
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Number ${value} is not a safe integer`);
    }
    
    return BigInt(value);
  }

  /**
   * Create standardized IPC error response
   */
  static createErrorResponse(error: IPCError, requestId?: string): IpcResponse<never> {
    let errorMessage: string;
    
    switch (error.code) {
      case "ValidationError":
        errorMessage = `Validation failed: ${error.detail}`;
        break;
      case "SerializationError":
        errorMessage = `Serialization failed: ${error.message}`;
        break;
      case "ConversionError":
        errorMessage = `Type conversion failed for field '${error.field}': expected ${error.expectedType}, got ${error.receivedType}`;
        break;
      case "UnknownError":
        errorMessage = `Unknown error: ${error.cause}`;
        break;
      default:
        const _exhaustive: never = error;
        errorMessage = `Unhandled error type: ${_exhaustive}`;
    }
    
    return {
      success: false,
      error: errorMessage,
      requestId,
      timestamp: Date.now(),
    };
  }

  /**
   * Create standardized IPC success response
   */
  static createSuccessResponse<T>(data: T, requestId?: string): IpcResponse<T> {
    return {
      success: true,
      data,
      requestId,
      timestamp: Date.now(),
    };
  }

  /**
   * Safe error handling for unknown error types
   */
  static handleUnknownError(error: unknown, context: string): IPCError {
    if (error instanceof Error) {
      return {
        code: "UnknownError",
        cause: `${context}: ${error.message}`,
      };
    }
    
    if (typeof error === 'string') {
      return {
        code: "UnknownError", 
        cause: `${context}: ${error}`,
      };
    }
    
    return {
      code: "UnknownError",
      cause: `${context}: Unknown error of type ${typeof error}`,
    };
  }
}

/**
 * Type guards for IPC types
 */
export class IPCTypeGuards {
  /**
   * Check if value is a valid IPC address string
   */
  static isValidAddressString(value: unknown): value is IPCTariAddress {
    return typeof value === 'string' && value.length > 0;
  }

  /**
   * Check if value is a valid IPC bigint number
   */
  static isValidBigintNumber(value: unknown): value is IPCBigInt {
    return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value);
  }
}
