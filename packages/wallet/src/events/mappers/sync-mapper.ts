/**
 * @fileoverview Sync progress event mappers
 * 
 * This module provides mappers for converting FFI sync events
 * to TypeScript sync event types.
 */

import { BaseEventMapper, ValidationUtils } from './base-mapper.js';
import type { SyncProgressEvent } from '../event-types.js';

/**
 * FFI sync event data structure
 */
interface FFISyncData {
  current?: unknown;
  total?: unknown;
  percent?: unknown;
  estimatedTimeRemaining?: unknown;
  timestamp?: unknown;
  duration?: unknown;
  error?: unknown;
}

/**
 * Mapper for sync progress events
 */
export class SyncProgressMapper extends BaseEventMapper<SyncProgressEvent> {
  constructor() {
    super('sync:progress');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['current', 'total'])) {
      return false;
    }

    const ffi = data as FFISyncData;
    return (
      ValidationUtils.isValidNumber(ffi.current) &&
      ValidationUtils.isValidNumber(ffi.total) &&
      ffi.current >= 0 &&
      ffi.total >= 0 &&
      ffi.current <= ffi.total &&
      (!ffi.percent || (ValidationUtils.isValidNumber(ffi.percent) && ffi.percent >= 0 && ffi.percent <= 100)) &&
      (!ffi.estimatedTimeRemaining || ValidationUtils.isValidNumber(ffi.estimatedTimeRemaining)) &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): SyncProgressEvent {
    const ffi = data as FFISyncData;
    
    const current = ValidationUtils.toNumber(ffi.current);
    const total = ValidationUtils.toNumber(ffi.total);
    
    // Calculate percent if not provided
    let percent = ffi.percent ? ValidationUtils.toNumber(ffi.percent) : 0;
    if (!ffi.percent && total > 0) {
      percent = Math.round((current / total) * 100);
    }
    
    return {
      current,
      total,
      percent,
      estimatedTimeRemaining: ffi.estimatedTimeRemaining 
        ? ValidationUtils.toNumber(ffi.estimatedTimeRemaining) 
        : undefined,
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFISyncData;
    
    if (!ValidationUtils.isValidNumber(ffi.current)) {
      return ValidationUtils.createValidationError(this.eventType, 'current', 'number', ffi.current);
    }
    
    if (!ValidationUtils.isValidNumber(ffi.total)) {
      return ValidationUtils.createValidationError(this.eventType, 'total', 'number', ffi.total);
    }
    
    const current = ValidationUtils.toNumber(ffi.current);
    const total = ValidationUtils.toNumber(ffi.total);
    
    if (current < 0) {
      return `Invalid ${this.eventType} event: current must be non-negative, got ${current}`;
    }
    
    if (total < 0) {
      return `Invalid ${this.eventType} event: total must be non-negative, got ${total}`;
    }
    
    if (current > total) {
      return `Invalid ${this.eventType} event: current (${current}) cannot exceed total (${total})`;
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for sync started events
 */
export class SyncStartedMapper extends BaseEventMapper<{ timestamp: Date }> {
  constructor() {
    super('sync:started');
  }

  validate(data: unknown): boolean {
    if (!data || typeof data !== 'object') return true; // Can be empty object
    
    const ffi = data as FFISyncData;
    return !ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp);
  }

  map(data: unknown): { timestamp: Date } {
    const ffi = (data as FFISyncData) || {};
    
    return {
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(): string {
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for sync completed events
 */
export class SyncCompletedMapper extends BaseEventMapper<{ timestamp: Date; duration: number }> {
  constructor() {
    super('sync:completed');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['duration']) && 
        !ValidationUtils.hasRequiredProperties(data, [])) {
      return false;
    }

    const ffi = data as FFISyncData;
    return (
      (!ffi.duration || ValidationUtils.isValidNumber(ffi.duration)) &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): { timestamp: Date; duration: number } {
    const ffi = data as FFISyncData;
    
    return {
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date(),
      duration: ffi.duration ? ValidationUtils.toNumber(ffi.duration) : 0
    };
  }

  getValidationError(): string {
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for sync failed events
 */
export class SyncFailedMapper extends BaseEventMapper<{ error: Error; timestamp: Date }> {
  constructor() {
    super('sync:failed');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['error'])) {
      return false;
    }

    const ffi = data as FFISyncData;
    return (
      ffi.error !== null &&
      ffi.error !== undefined &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): { error: Error; timestamp: Date } {
    const ffi = data as FFISyncData;
    
    let error: Error;
    if (ffi.error instanceof Error) {
      error = ffi.error;
    } else {
      error = new Error(ValidationUtils.toString(ffi.error));
    }
    
    return {
      error,
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFISyncData;
    
    if (ffi.error === null || ffi.error === undefined) {
      return ValidationUtils.createValidationError(this.eventType, 'error', 'error message', ffi.error);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Create and return all sync mappers
 */
export function createSyncMappers(): {
  progress: SyncProgressMapper;
  started: SyncStartedMapper;
  completed: SyncCompletedMapper;
  failed: SyncFailedMapper;
} {
  return {
    progress: new SyncProgressMapper(),
    started: new SyncStartedMapper(),
    completed: new SyncCompletedMapper(),
    failed: new SyncFailedMapper()
  };
}

/**
 * Register all sync mappers with a registry
 */
export function registerSyncMappers(registry: any): void {
  const mappers = createSyncMappers();
  
  registry.register(mappers.progress);
  registry.register(mappers.started);
  registry.register(mappers.completed);
  registry.register(mappers.failed);
}

/**
 * Helper function to calculate sync progress percentage
 */
export function calculateSyncProgress(current: number, total: number): number {
  if (total <= 0) return 0;
  if (current >= total) return 100;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

/**
 * Helper function to estimate remaining sync time
 */
export function estimateRemainingTime(
  current: number, 
  total: number, 
  blocksPerSecond: number = 1
): number | undefined {
  if (current >= total || blocksPerSecond <= 0) return undefined;
  
  const remaining = total - current;
  return Math.round(remaining / blocksPerSecond);
}

/**
 * Helper function to validate sync progress values
 */
export function validateSyncProgress(current: number, total: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isInteger(current) || current < 0) {
    return { valid: false, error: 'Current must be a non-negative integer' };
  }
  
  if (!Number.isInteger(total) || total < 0) {
    return { valid: false, error: 'Total must be a non-negative integer' };
  }
  
  if (current > total) {
    return { valid: false, error: 'Current cannot exceed total' };
  }
  
  return { valid: true };
}
