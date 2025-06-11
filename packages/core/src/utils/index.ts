/**
 * @fileoverview Utility functions for Tari JavaScript SDK
 * 
 * This module provides common utilities for memory management,
 * data validation, and helper functions used across packages.
 */

import { TariError, ErrorCode } from '../errors/index.js';

// Validation utilities
export const validateRequired = <T>(
  value: T | null | undefined,
  fieldName: string
): T => {
  if (value === null || value === undefined) {
    throw new TariError(
      ErrorCode.InvalidConfig,
      `Required field '${fieldName}' is missing`
    );
  }
  return value;
};

export const validatePositive = (value: number, fieldName: string): number => {
  if (value <= 0) {
    throw new TariError(
      ErrorCode.InvalidConfig,
      `Field '${fieldName}' must be positive, got ${value}`
    );
  }
  return value;
};

// String utilities
export const isHexString = (value: string): boolean => /^[0-9a-fA-F]+$/.test(value);

export const isBase58String = (value: string): boolean => 
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(value);

// Async utilities
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TariError(ErrorCode.Unknown, errorMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
};

// Memory utilities (placeholders for FFI integration)
export class ResourceTracker {
  private static resources = new Set<object>();

  static register(resource: object): void {
    this.resources.add(resource);
  }

  static unregister(resource: object): void {
    this.resources.delete(resource);
  }

  static getActiveCount(): number {
    return this.resources.size;
  }

  static cleanup(): void {
    this.resources.clear();
  }
}

// Utility types
export type Awaitable<T> = T | Promise<T>;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
