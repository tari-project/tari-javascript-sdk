/**
 * @fileoverview Enhanced StorageResult interface with strict generic constraints
 * 
 * Provides type-safe storage result types that properly handle success/failure states
 * with correct typing for data fields in all scenarios.
 */

/**
 * Base storage result for operations that return data
 */
export interface StorageSuccess<T> {
  success: true;
  data: T;
  error?: undefined;
  requiresUserInteraction?: boolean;
}

/**
 * Storage error result
 */
export interface StorageFailure {
  success: false;
  data?: undefined;
  error: string;
  requiresUserInteraction?: boolean;
}

/**
 * Union type for storage results that may return data
 */
export type StorageResult<T> = StorageSuccess<T> | StorageFailure;

/**
 * For operations that don't return data (like store, delete)
 */
export interface StorageOperationSuccess {
  success: true;
  data?: undefined;
  error?: undefined;
  requiresUserInteraction?: boolean;
}

/**
 * Union type for storage operations that don't return data
 */
export type StorageOperationResult = StorageOperationSuccess | StorageFailure;

/**
 * Helper functions for creating properly typed storage results
 */
export const StorageResults = {
  /**
   * Create a success result with data
   */
  success<T>(data: T, requiresUserInteraction?: boolean): StorageSuccess<T> {
    return { success: true, data, requiresUserInteraction };
  },

  /**
   * Create a success result for operations without data
   */
  operationSuccess(requiresUserInteraction?: boolean): StorageOperationSuccess {
    return { success: true, requiresUserInteraction };
  },

  /**
   * Create a failure result
   */
  failure(error: string, requiresUserInteraction?: boolean): StorageFailure {
    return { success: false, error, requiresUserInteraction };
  },

  /**
   * Type guard for success results
   */
  isSuccess<T>(result: StorageResult<T>): result is StorageSuccess<T> {
    return result.success === true;
  },

  /**
   * Type guard for failure results
   */
  isFailure<T>(result: StorageResult<T>): result is StorageFailure {
    return result.success === false;
  }
};

/**
 * Legacy StorageResult interface for backward compatibility
 * @deprecated Use the new union types instead
 */
export interface LegacyStorageResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  requiresUserInteraction?: boolean;
}

/**
 * Convert legacy result to new typed result
 */
export function convertLegacyResult<T>(
  legacy: LegacyStorageResult<T>
): StorageResult<T> | StorageOperationResult {
  if (legacy.success) {
    if (legacy.data !== undefined) {
      return StorageResults.success(legacy.data, legacy.requiresUserInteraction);
    } else {
      return StorageResults.operationSuccess(legacy.requiresUserInteraction);
    }
  } else {
    return StorageResults.failure(
      legacy.error || 'Unknown error',
      legacy.requiresUserInteraction
    );
  }
}
