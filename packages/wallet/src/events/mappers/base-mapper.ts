/**
 * @fileoverview Base mapper for converting FFI events to TypeScript types
 * 
 * This module provides the foundation for type-safe event payload
 * transformation from FFI JSON to TypeScript interfaces.
 */

import type { WalletEventMap } from '../event-types.js';

/**
 * Base mapper interface for event transformation
 */
export interface EventMapper<T = unknown> {
  /** Event type this mapper handles */
  readonly eventType: string;
  
  /** Validate FFI event data */
  validate(data: unknown): boolean;
  
  /** Transform FFI data to TypeScript type */
  map(data: unknown): T;
  
  /** Get validation error message */
  getValidationError(data: unknown): string;
}

/**
 * Abstract base class for event mappers
 */
export abstract class BaseEventMapper<T = unknown> implements EventMapper<T> {
  constructor(public readonly eventType: string) {}

  abstract validate(data: unknown): boolean;
  abstract map(data: unknown): T;
  abstract getValidationError(data: unknown): string;

  /**
   * Map with validation - throws on invalid data
   */
  mapSafe(data: unknown): T {
    if (!this.validate(data)) {
      throw new Error(this.getValidationError(data));
    }
    return this.map(data);
  }

  /**
   * Map with validation - returns null on invalid data
   */
  mapOrNull(data: unknown): T | null {
    try {
      return this.mapSafe(data);
    } catch {
      return null;
    }
  }
}

/**
 * Validation utilities for common data types
 */
export const ValidationUtils = {
  /**
   * Check if value is a non-empty string
   */
  isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  },

  /**
   * Check if value is a valid number
   */
  isValidNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  },

  /**
   * Check if value is a valid bigint string
   */
  isBigIntString(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    try {
      BigInt(value);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if value is a valid timestamp
   */
  isValidTimestamp(value: unknown): value is number {
    return this.isValidNumber(value) && value > 0;
  },

  /**
   * Check if value is a valid date string or timestamp
   */
  isValidDate(value: unknown): boolean {
    if (this.isValidTimestamp(value)) return true;
    if (typeof value === 'string') {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
    return false;
  },

  /**
   * Check if object has required properties
   */
  hasRequiredProperties(obj: unknown, properties: string[]): obj is Record<string, unknown> {
    if (!obj || typeof obj !== 'object') return false;
    const record = obj as Record<string, unknown>;
    return properties.every(prop => prop in record);
  },

  /**
   * Validate array of specific type
   */
  isArrayOf<T>(value: unknown, validator: (item: unknown) => item is T): value is T[] {
    return Array.isArray(value) && value.every(validator);
  },

  /**
   * Safe conversion to string
   */
  toString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    return JSON.stringify(value);
  },

  /**
   * Safe conversion to number
   */
  toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }
    throw new Error(`Cannot convert ${typeof value} to number`);
  },

  /**
   * Safe conversion to bigint
   */
  toBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
    if (typeof value === 'string') return BigInt(value);
    throw new Error(`Cannot convert ${typeof value} to bigint`);
  },

  /**
   * Safe conversion to Date
   */
  toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') return new Date(value);
    throw new Error(`Cannot convert ${typeof value} to Date`);
  },

  /**
   * Create validation error message
   */
  createValidationError(eventType: string, field: string, expected: string, actual: unknown): string {
    return `Invalid ${eventType} event: ${field} should be ${expected}, got ${typeof actual}`;
  }
};

/**
 * Registry for event mappers
 */
export class EventMapperRegistry {
  private mappers = new Map<string, EventMapper>();

  /**
   * Register an event mapper
   */
  register<T>(mapper: EventMapper<T>): void {
    this.mappers.set(mapper.eventType, mapper);
  }

  /**
   * Get mapper for event type
   */
  get<T>(eventType: string): EventMapper<T> | undefined {
    return this.mappers.get(eventType) as EventMapper<T> | undefined;
  }

  /**
   * Map event data using registered mapper
   */
  map<T>(eventType: string, data: unknown): T {
    const mapper = this.get<T>(eventType);
    if (!mapper) {
      throw new Error(`No mapper registered for event type: ${eventType}`);
    }
    return mapper.map(data);
  }

  /**
   * Check if mapper exists for event type
   */
  has(eventType: string): boolean {
    return this.mappers.has(eventType);
  }

  /**
   * Get all registered event types
   */
  getEventTypes(): string[] {
    return Array.from(this.mappers.keys());
  }

  /**
   * Remove mapper for event type
   */
  unregister(eventType: string): boolean {
    return this.mappers.delete(eventType);
  }

  /**
   * Clear all mappers
   */
  clear(): void {
    this.mappers.clear();
  }

  /**
   * Get mapper count
   */
  get size(): number {
    return this.mappers.size;
  }
}

/**
 * Default event mapper registry instance
 */
export const defaultMapperRegistry = new EventMapperRegistry();

/**
 * Helper function to create a simple mapper
 */
export function createSimpleMapper<T>(
  eventType: string,
  validator: (data: unknown) => data is T,
  errorMessage?: string
): EventMapper<T> {
  return new (class extends BaseEventMapper<T> {
    validate(data: unknown): boolean {
      return validator(data);
    }

    map(data: unknown): T {
      return data as T;
    }

    getValidationError(): string {
      return errorMessage ?? `Invalid data for event type: ${eventType}`;
    }
  })(eventType);
}

/**
 * Helper function to create a transformation mapper
 */
export function createTransformMapper<TInput, TOutput>(
  eventType: string,
  validator: (data: unknown) => data is TInput,
  transformer: (input: TInput) => TOutput,
  errorMessage?: string
): EventMapper<TOutput> {
  return new (class extends BaseEventMapper<TOutput> {
    validate(data: unknown): boolean {
      return validator(data);
    }

    map(data: unknown): TOutput {
      return transformer(data as TInput);
    }

    getValidationError(): string {
      return errorMessage ?? `Invalid data for event type: ${eventType}`;
    }
  })(eventType);
}
