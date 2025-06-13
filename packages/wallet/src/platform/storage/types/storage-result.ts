/**
 * @fileoverview Enhanced StorageResult with FFI-safe discriminated union pattern
 * 
 * Provides type-safe storage result types using discriminated unions for predictable
 * FFI boundary crossing with serializable error types and ergonomic helper functions.
 */

/**
 * Storage error types for cross-language compatibility
 */
export type StorageErrorCode = 
  | "not_found"
  | "permission_denied" 
  | "validation_error"
  | "quota_exceeded"
  | "connection_failed"
  | "authentication_required"
  | "operation_cancelled"
  | "unsupported_operation"
  | "internal_error";

/**
 * FFI-safe storage error with serializable data
 */
export interface StorageError {
  /** Error type for pattern matching */
  code: StorageErrorCode;
  /** Human-readable error message */
  message?: string;
  /** Additional context data (must be JSON-serializable) */
  details?: Record<string, string | number | boolean>;
  /** Whether user interaction is required to resolve */
  requiresUserInteraction?: boolean;
}

/**
 * Success result with data using discriminated union
 */
export interface StorageSuccess<T> {
  kind: "ok";
  value: T;
  requiresUserInteraction?: boolean;
}

/**
 * Error result using discriminated union
 */
export interface StorageFailure {
  kind: "error";
  error: StorageError;
}

/**
 * Primary StorageResult type using discriminated union pattern
 * This replaces the boolean-based approach for better FFI compatibility
 */
export type StorageResult<T> = StorageSuccess<T> | StorageFailure;

/**
 * Operation-only result for methods that don't return data
 */
export type StorageOperationResult = StorageResult<void>;

/**
 * Helper functions for creating properly typed storage results
 */
export const StorageResults = {
  /**
   * Create a success result with data
   */
  ok<T>(value: T, requiresUserInteraction?: boolean): StorageSuccess<T> {
    return { kind: "ok", value, requiresUserInteraction };
  },

  /**
   * Create an error result
   */
  error(
    code: StorageErrorCode, 
    message?: string, 
    details?: Record<string, string | number | boolean>,
    requiresUserInteraction?: boolean
  ): StorageFailure {
    return { 
      kind: "error", 
      error: { code, message, details, requiresUserInteraction } 
    };
  },

  /**
   * Create common error types
   */
  notFound(message?: string, details?: Record<string, string | number | boolean>): StorageFailure {
    return this.error("not_found", message || "Item not found", details);
  },

  permissionDenied(message?: string, requiresUserInteraction?: boolean): StorageFailure {
    return this.error("permission_denied", message || "Permission denied", undefined, requiresUserInteraction);
  },

  validationError(message: string, details?: Record<string, string | number | boolean>): StorageFailure {
    return this.error("validation_error", message, details);
  },

  quotaExceeded(message?: string): StorageFailure {
    return this.error("quota_exceeded", message || "Storage quota exceeded");
  },

  operationCancelled(message?: string): StorageFailure {
    return this.error("operation_cancelled", message || "Operation was cancelled", undefined, true);
  },

  internalError(message: string, details?: Record<string, string | number | boolean>): StorageFailure {
    return this.error("internal_error", message, details);
  },

  /**
   * Type guard for success results
   */
  isOk<T>(result: StorageResult<T>): result is StorageSuccess<T> {
    return result.kind === "ok";
  },

  /**
   * Type guard for error results
   */
  isError<T>(result: StorageResult<T>): result is StorageFailure {
    return result.kind === "error";
  },

  /**
   * Pattern matching for StorageResult
   */
  match<T, U>(
    result: StorageResult<T>,
    patterns: {
      ok: (value: T, requiresUserInteraction?: boolean) => U;
      error: (error: StorageError) => U;
    }
  ): U {
    switch (result.kind) {
      case "ok":
        return patterns.ok(result.value, result.requiresUserInteraction);
      case "error":
        return patterns.error(result.error);
      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = result;
        throw new Error(`Unhandled StorageResult variant: ${_exhaustive}`);
    }
  }
};

/**
 * Legacy StorageResult interface for backward compatibility
 * @deprecated Use the new discriminated union types instead
 */
export interface LegacyStorageResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  requiresUserInteraction?: boolean;
}

/**
 * Convert legacy result to new discriminated union format
 */
export function convertLegacyResult<T>(
  legacy: LegacyStorageResult<T>
): StorageResult<T> {
  if (legacy.success) {
    // Handle both data and void operations
    const value = legacy.data !== undefined ? legacy.data : (undefined as unknown as T);
    return StorageResults.ok(value, legacy.requiresUserInteraction);
  } else {
    return StorageResults.error(
      "internal_error",
      legacy.error || 'Unknown legacy error',
      undefined,
      legacy.requiresUserInteraction
    );
  }
}

/**
 * Convert new discriminated union to legacy format
 */
export function convertToLegacy<T>(result: StorageResult<T>): LegacyStorageResult<T> {
  if (StorageResults.isOk(result)) {
    return {
      success: true,
      data: result.value,
      requiresUserInteraction: result.requiresUserInteraction
    };
  } else {
    return {
      success: false,
      error: result.error.message || `${result.error.code} error`,
      requiresUserInteraction: result.error.requiresUserInteraction
    };
  }
}
