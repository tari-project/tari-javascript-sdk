/**
 * @fileoverview Connectivity event mappers
 * 
 * This module provides mappers for converting FFI connectivity events
 * to TypeScript connectivity event types.
 */

import { BaseEventMapper, ValidationUtils } from './base-mapper.js';
import type { ConnectivityEvent } from '../event-types.js';
import { ConnectivityStatus } from '../event-types.js';

/**
 * FFI connectivity event data structure
 */
interface FFIConnectivityData {
  status?: unknown;
  baseNode?: unknown;
  latency?: unknown;
  peerCount?: unknown;
  timestamp?: unknown;
  reason?: unknown;
  currentBlock?: unknown;
  targetBlock?: unknown;
  address?: unknown;
}

/**
 * Mapper for connectivity change events
 */
export class ConnectivityMapper extends BaseEventMapper<ConnectivityEvent> {
  constructor() {
    super('connectivity:changed');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['status'])) {
      return false;
    }

    const ffi = data as FFIConnectivityData;
    
    // Validate status is a valid ConnectivityStatus
    const validStatuses = Object.values(ConnectivityStatus);
    if (!validStatuses.includes(ffi.status as ConnectivityStatus)) {
      return false;
    }

    // Validate optional fields
    return (
      (!ffi.peerCount || ValidationUtils.isValidNumber(ffi.peerCount)) &&
      (!ffi.latency || ValidationUtils.isValidNumber(ffi.latency)) &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): ConnectivityEvent {
    const ffi = data as FFIConnectivityData;
    
    return {
      status: ffi.status as ConnectivityStatus,
      baseNode: ffi.baseNode ? ValidationUtils.toString(ffi.baseNode) : undefined,
      latency: ffi.latency ? ValidationUtils.toNumber(ffi.latency) : undefined,
      peerCount: ffi.peerCount ? ValidationUtils.toNumber(ffi.peerCount) : 0,
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFIConnectivityData;
    
    const validStatuses = Object.values(ConnectivityStatus);
    if (!validStatuses.includes(ffi.status as ConnectivityStatus)) {
      return ValidationUtils.createValidationError(
        this.eventType, 
        'status', 
        `one of: ${validStatuses.join(', ')}`, 
        ffi.status
      );
    }
    
    if (ffi.peerCount && !ValidationUtils.isValidNumber(ffi.peerCount)) {
      return ValidationUtils.createValidationError(this.eventType, 'peerCount', 'number', ffi.peerCount);
    }
    
    if (ffi.latency && !ValidationUtils.isValidNumber(ffi.latency)) {
      return ValidationUtils.createValidationError(this.eventType, 'latency', 'number', ffi.latency);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for base node connection events
 */
export class BaseNodeConnectedMapper extends BaseEventMapper<{ address: string; timestamp: Date }> {
  constructor() {
    super('basenode:connected');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['address'])) {
      return false;
    }

    const ffi = data as FFIConnectivityData;
    return (
      ValidationUtils.isNonEmptyString(ffi.address) &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): { address: string; timestamp: Date } {
    const ffi = data as FFIConnectivityData;
    
    return {
      address: ValidationUtils.toString(ffi.address),
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFIConnectivityData;
    
    if (!ValidationUtils.isNonEmptyString(ffi.address)) {
      return ValidationUtils.createValidationError(this.eventType, 'address', 'non-empty string', ffi.address);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for base node disconnection events
 */
export class BaseNodeDisconnectedMapper extends BaseEventMapper<{ address: string; timestamp: Date }> {
  constructor() {
    super('basenode:disconnected');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['address'])) {
      return false;
    }

    const ffi = data as FFIConnectivityData;
    return (
      ValidationUtils.isNonEmptyString(ffi.address) &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): { address: string; timestamp: Date } {
    const ffi = data as FFIConnectivityData;
    
    return {
      address: ValidationUtils.toString(ffi.address),
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFIConnectivityData;
    
    if (!ValidationUtils.isNonEmptyString(ffi.address)) {
      return ValidationUtils.createValidationError(this.eventType, 'address', 'non-empty string', ffi.address);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for base node change events
 */
export class BaseNodeChangedMapper extends BaseEventMapper<{ 
  oldAddress?: string; 
  newAddress: string; 
  timestamp: Date 
}> {
  constructor() {
    super('basenode:changed');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['newAddress'])) {
      return false;
    }

    const ffi = data as FFIConnectivityData & { newAddress?: unknown; oldAddress?: unknown };
    return (
      ValidationUtils.isNonEmptyString(ffi.newAddress) &&
      (!ffi.oldAddress || ValidationUtils.isNonEmptyString(ffi.oldAddress)) &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): { oldAddress?: string; newAddress: string; timestamp: Date } {
    const ffi = data as FFIConnectivityData & { newAddress?: unknown; oldAddress?: unknown };
    
    return {
      oldAddress: ffi.oldAddress ? ValidationUtils.toString(ffi.oldAddress) : undefined,
      newAddress: ValidationUtils.toString(ffi.newAddress),
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFIConnectivityData & { newAddress?: unknown; oldAddress?: unknown };
    
    if (!ValidationUtils.isNonEmptyString(ffi.newAddress)) {
      return ValidationUtils.createValidationError(this.eventType, 'newAddress', 'non-empty string', ffi.newAddress);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Create and return all connectivity mappers
 */
export function createConnectivityMappers(): {
  connectivity: ConnectivityMapper;
  baseNodeConnected: BaseNodeConnectedMapper;
  baseNodeDisconnected: BaseNodeDisconnectedMapper;
  baseNodeChanged: BaseNodeChangedMapper;
} {
  return {
    connectivity: new ConnectivityMapper(),
    baseNodeConnected: new BaseNodeConnectedMapper(),
    baseNodeDisconnected: new BaseNodeDisconnectedMapper(),
    baseNodeChanged: new BaseNodeChangedMapper()
  };
}

/**
 * Register all connectivity mappers with a registry
 */
export function registerConnectivityMappers(registry: any): void {
  const mappers = createConnectivityMappers();
  
  registry.register(mappers.connectivity);
  registry.register(mappers.baseNodeConnected);
  registry.register(mappers.baseNodeDisconnected);
  registry.register(mappers.baseNodeChanged);
}

/**
 * Helper function to determine connectivity status from various inputs
 */
export function determineConnectivityStatus(
  isConnected: boolean,
  isSyncing: boolean,
  peerCount: number
): ConnectivityStatus {
  if (!isConnected || peerCount === 0) {
    return ConnectivityStatus.Offline;
  }
  
  if (isSyncing) {
    return ConnectivityStatus.Syncing;
  }
  
  return ConnectivityStatus.Online;
}

/**
 * Helper function to validate and normalize peer count
 */
export function normalizePeerCount(value: unknown): number {
  if (ValidationUtils.isValidNumber(value)) {
    return Math.max(0, Math.floor(value));
  }
  return 0;
}

/**
 * Helper function to validate and normalize latency
 */
export function normalizeLatency(value: unknown): number | undefined {
  if (ValidationUtils.isValidNumber(value) && value >= 0) {
    return Math.round(value);
  }
  return undefined;
}
