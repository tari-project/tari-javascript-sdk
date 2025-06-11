/**
 * @fileoverview Error handling infrastructure for Tari JavaScript SDK
 * 
 * This module provides comprehensive error handling with typed error codes,
 * context enrichment, and structured error information for debugging.
 */

export enum ErrorCode {
  // Initialization errors (1000-1099)
  InvalidConfig = 1000,
  InitializationFailed = 1001,
  
  // FFI errors (5000-5099)
  FFICallFailed = 5000,
  UseAfterFree = 5001,
  ResourceDestroyed = 5002,
  
  // General errors (9000-9099)
  Unknown = 9000,
  NotImplemented = 9001,
}

export class TariError extends Error {
  public readonly code: ErrorCode;
  public readonly details: string;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    details: string,
    recoverable = false,
    cause?: Error,
    context: Record<string, unknown> | undefined = undefined
  ) {
    super(`${TariError.getMessageForCode(code)}: ${details}`);
    this.name = 'TariError';
    this.code = code;
    this.details = details;
    this.recoverable = recoverable;
    this.context = context;
    
    if (cause) {
      this.cause = cause;
    }
  }

  static getMessageForCode(code: ErrorCode): string {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.InvalidConfig]: 'Invalid configuration',
      [ErrorCode.InitializationFailed]: 'Initialization failed',
      [ErrorCode.FFICallFailed]: 'FFI call failed',
      [ErrorCode.UseAfterFree]: 'Use after free',
      [ErrorCode.ResourceDestroyed]: 'Resource destroyed',
      [ErrorCode.Unknown]: 'Unknown error',
      [ErrorCode.NotImplemented]: 'Feature not implemented',
    };
    return messages[code] || 'Unknown error';
  }

  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      context: this.context,
      stack: this.stack,
    };
  }
}

// Helper function for creating errors with context
export const createError = (
  code: ErrorCode,
  details: string,
  context?: Record<string, unknown>
): TariError => new TariError(code, details, false, undefined, context);
