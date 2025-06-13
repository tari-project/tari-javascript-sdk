/**
 * @fileoverview Result helper utilities for StorageResult operations
 * 
 * Provides utility functions for working with StorageResult values, including
 * transformation, composition, and async result handling patterns.
 */

import { StorageResult, StorageResults, StorageError } from './types/storage-result';

/**
 * Transform the value of a success result, or pass through errors
 */
export function map<T, U>(
  result: StorageResult<T>,
  fn: (value: T) => U
): StorageResult<U> {
  if (StorageResults.isOk(result)) {
    return StorageResults.ok(fn(result.value), result.requiresUserInteraction);
  } else {
    return result; // Pass through the error unchanged
  }
}

/**
 * Transform the value of a success result with a function that returns a StorageResult
 */
export function andThen<T, U>(
  result: StorageResult<T>,
  fn: (value: T) => StorageResult<U>
): StorageResult<U> {
  return StorageResults.match(result, {
    ok: (value) => fn(value),
    error: (error) => ({ kind: "error", error })
  });
}

/**
 * Transform error results, pass through success
 */
export function mapError<T>(
  result: StorageResult<T>,
  fn: (error: StorageError) => StorageError
): StorageResult<T> {
  if (StorageResults.isOk(result)) {
    return result; // Pass through success unchanged
  } else {
    return { kind: "error", error: fn(result.error) };
  }
}

/**
 * Get the value from a result, throwing an error if it failed
 */
export function unwrap<T>(result: StorageResult<T>): T {
  return StorageResults.match(result, {
    ok: (value) => value,
    error: (error) => {
      throw new Error(`StorageResult unwrap failed: ${error.code}: ${error.message || 'Unknown error'}`);
    }
  });
}

/**
 * Get the value from a result, or return a default value
 */
export function unwrapOr<T>(result: StorageResult<T>, defaultValue: T): T {
  return StorageResults.match(result, {
    ok: (value) => value,
    error: () => defaultValue
  });
}

/**
 * Get the value from a result, or compute a default using the error
 */
export function unwrapOrElse<T>(
  result: StorageResult<T>, 
  fn: (error: StorageError) => T
): T {
  return StorageResults.match(result, {
    ok: (value) => value,
    error: (error) => fn(error)
  });
}

/**
 * Convert an async operation that might throw into a StorageResult
 */
export async function fromAsync<T>(
  operation: () => Promise<T>
): Promise<StorageResult<T>> {
  try {
    const value = await operation();
    return StorageResults.ok(value);
  } catch (error) {
    return StorageResults.internalError(
      error instanceof Error ? error.message : 'Unknown async error',
      { stack: error instanceof Error ? error.stack || '' : '' }
    );
  }
}

/**
 * Combine multiple results - succeeds only if all succeed
 */
export function all<T extends readonly unknown[]>(
  ...results: { [K in keyof T]: StorageResult<T[K]> }
): StorageResult<T> {
  const values: unknown[] = [];
  
  for (const result of results) {
    if (StorageResults.isError(result)) {
      return result;
    }
    values.push(result.value);
  }
  
  return StorageResults.ok(values as unknown as T);
}

/**
 * Get the first successful result from an array
 */
export function firstOk<T>(results: StorageResult<T>[]): StorageResult<T> {
  for (const result of results) {
    if (StorageResults.isOk(result)) {
      return result;
    }
  }
  
  // Return the last error if all failed
  const lastResult = results[results.length - 1];
  return lastResult || StorageResults.internalError('No results provided');
}

/**
 * Filter a list of results to only successful ones
 */
export function filterOk<T>(results: StorageResult<T>[]): T[] {
  return results
    .filter(StorageResults.isOk)
    .map(result => result.value);
}

/**
 * Partition results into successful and failed arrays
 */
export function partition<T>(
  results: StorageResult<T>[]
): { ok: T[]; errors: StorageError[] } {
  const ok: T[] = [];
  const errors: StorageError[] = [];
  
  for (const result of results) {
    if (StorageResults.isOk(result)) {
      ok.push(result.value);
    } else {
      errors.push(result.error);
    }
  }
  
  return { ok, errors };
}

/**
 * Convert a legacy boolean-based result to new discriminated union
 */
export function fromLegacy<T>(legacy: {
  success: boolean;
  data?: T;
  error?: string;
  requiresUserInteraction?: boolean;
}): StorageResult<T> {
  if (legacy.success) {
    return StorageResults.ok(legacy.data as T, legacy.requiresUserInteraction);
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
 * Convert a discriminated union result to legacy format for backward compatibility
 */
export function toLegacy<T>(result: StorageResult<T>): 
  | { success: true; data: T; error?: undefined; requiresUserInteraction?: boolean; }
  | { success: false; data?: undefined; error: string; requiresUserInteraction?: boolean; } {
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
