/**
 * @fileoverview Transaction event mappers
 * 
 * This module provides mappers for converting FFI transaction events
 * to TypeScript transaction event types.
 */

import { BaseEventMapper, ValidationUtils } from './base-mapper.js';
import type { 
  PendingInboundTransaction, 
  CompletedTransaction, 
  CancelledTransaction,
  TransactionValidationEvent
} from '../event-types.js';
import { TransactionStatus } from '../../types/index.js';

/**
 * FFI transaction event data structure
 */
interface FFITransactionData {
  id?: unknown;
  amount?: unknown;
  fee?: unknown;
  source?: unknown;
  destination?: unknown;
  message?: unknown;
  status?: unknown;
  timestamp?: unknown;
  confirmations?: unknown;
  blockHeight?: unknown;
  blockHash?: unknown;
  reason?: unknown;
  cancelledAt?: unknown;
  isInbound?: unknown;
}

/**
 * Mapper for pending inbound transaction events
 */
export class PendingInboundTransactionMapper extends BaseEventMapper<PendingInboundTransaction> {
  constructor() {
    super('tx:received');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['id', 'amount', 'source'])) {
      return false;
    }

    const ffi = data as FFITransactionData;
    return (
      ValidationUtils.isBigIntString(ffi.id) &&
      ValidationUtils.isBigIntString(ffi.amount) &&
      ValidationUtils.isNonEmptyString(ffi.source) &&
      (!ffi.timestamp || ValidationUtils.isValidTimestamp(ffi.timestamp))
    );
  }

  map(data: unknown): PendingInboundTransaction {
    const ffi = data as FFITransactionData;
    
    return {
      id: ValidationUtils.toBigInt(ffi.id),
      amount: ValidationUtils.toBigInt(ffi.amount),
      fee: ffi.fee ? ValidationUtils.toBigInt(ffi.fee) : 0n,
      status: TransactionStatus.Pending,
      message: ValidationUtils.toString(ffi.message || ''),
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date(),
      isInbound: true,
      confirmations: 0,
      source: ValidationUtils.toString(ffi.source)
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFITransactionData;
    
    if (!ValidationUtils.isBigIntString(ffi.id)) {
      return ValidationUtils.createValidationError(this.eventType, 'id', 'bigint string', ffi.id);
    }
    if (!ValidationUtils.isBigIntString(ffi.amount)) {
      return ValidationUtils.createValidationError(this.eventType, 'amount', 'bigint string', ffi.amount);
    }
    if (!ValidationUtils.isNonEmptyString(ffi.source)) {
      return ValidationUtils.createValidationError(this.eventType, 'source', 'non-empty string', ffi.source);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for completed transaction events (broadcast and mined)
 */
export class CompletedTransactionMapper extends BaseEventMapper<CompletedTransaction> {
  constructor(eventType: 'tx:broadcast' | 'tx:mined') {
    super(eventType);
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['id'])) {
      return false;
    }

    const ffi = data as FFITransactionData;
    const hasValidId = ValidationUtils.isBigIntString(ffi.id);
    
    if (this.eventType === 'tx:mined') {
      return (
        hasValidId &&
        ValidationUtils.isValidNumber(ffi.blockHeight) &&
        ValidationUtils.isNonEmptyString(ffi.blockHash) &&
        (!ffi.confirmations || ValidationUtils.isValidNumber(ffi.confirmations))
      );
    }

    // For tx:broadcast
    return hasValidId && (!ffi.amount || ValidationUtils.isBigIntString(ffi.amount));
  }

  map(data: unknown): CompletedTransaction {
    const ffi = data as FFITransactionData;
    
    const base = {
      id: ValidationUtils.toBigInt(ffi.id),
      amount: ffi.amount ? ValidationUtils.toBigInt(ffi.amount) : 0n,
      fee: ffi.fee ? ValidationUtils.toBigInt(ffi.fee) : 0n,
      message: ValidationUtils.toString(ffi.message || ''),
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date(),
      isInbound: Boolean(ffi.isInbound),
      confirmations: ffi.confirmations ? ValidationUtils.toNumber(ffi.confirmations) : 0
    };

    if (this.eventType === 'tx:mined') {
      return {
        ...base,
        status: TransactionStatus.MinedConfirmed,
        blockHeight: ValidationUtils.toNumber(ffi.blockHeight),
        blockHash: ValidationUtils.toString(ffi.blockHash)
      };
    }

    // For tx:broadcast
    return {
      ...base,
      status: TransactionStatus.MinedConfirmed, // Completed transactions are confirmed
      blockHeight: 0,
      blockHash: ''
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFITransactionData;
    
    if (!ValidationUtils.isBigIntString(ffi.id)) {
      return ValidationUtils.createValidationError(this.eventType, 'id', 'bigint string', ffi.id);
    }

    if (this.eventType === 'tx:mined') {
      if (!ValidationUtils.isValidNumber(ffi.blockHeight)) {
        return ValidationUtils.createValidationError(this.eventType, 'blockHeight', 'number', ffi.blockHeight);
      }
      if (!ValidationUtils.isNonEmptyString(ffi.blockHash)) {
        return ValidationUtils.createValidationError(this.eventType, 'blockHash', 'string', ffi.blockHash);
      }
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for cancelled transaction events
 */
export class CancelledTransactionMapper extends BaseEventMapper<CancelledTransaction> {
  constructor() {
    super('tx:cancelled');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['id', 'reason'])) {
      return false;
    }

    const ffi = data as FFITransactionData;
    return (
      ValidationUtils.isBigIntString(ffi.id) &&
      ValidationUtils.isNonEmptyString(ffi.reason) &&
      (!ffi.cancelledAt || ValidationUtils.isValidTimestamp(ffi.cancelledAt))
    );
  }

  map(data: unknown): CancelledTransaction {
    const ffi = data as FFITransactionData;
    
    return {
      id: ValidationUtils.toBigInt(ffi.id),
      amount: ffi.amount ? ValidationUtils.toBigInt(ffi.amount) : 0n,
      fee: ffi.fee ? ValidationUtils.toBigInt(ffi.fee) : 0n,
      status: TransactionStatus.Cancelled,
      message: ValidationUtils.toString(ffi.message || ''),
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date(),
      isInbound: Boolean(ffi.isInbound),
      confirmations: 0,
      reason: ValidationUtils.toString(ffi.reason),
      cancelledAt: ffi.cancelledAt ? ValidationUtils.toDate(ffi.cancelledAt) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as FFITransactionData;
    
    if (!ValidationUtils.isBigIntString(ffi.id)) {
      return ValidationUtils.createValidationError(this.eventType, 'id', 'bigint string', ffi.id);
    }
    if (!ValidationUtils.isNonEmptyString(ffi.reason)) {
      return ValidationUtils.createValidationError(this.eventType, 'reason', 'non-empty string', ffi.reason);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Mapper for transaction validation events
 */
export class TransactionValidationMapper extends BaseEventMapper<TransactionValidationEvent> {
  constructor() {
    super('tx:validation');
  }

  validate(data: unknown): boolean {
    if (!ValidationUtils.hasRequiredProperties(data, ['transactionId', 'isValid'])) {
      return false;
    }

    const ffi = data as any;
    return (
      ValidationUtils.isBigIntString(ffi.transactionId) &&
      typeof ffi.isValid === 'boolean' &&
      (!ffi.validationErrors || Array.isArray(ffi.validationErrors))
    );
  }

  map(data: unknown): TransactionValidationEvent {
    const ffi = data as any;
    
    return {
      transactionId: ValidationUtils.toBigInt(ffi.transactionId),
      isValid: Boolean(ffi.isValid),
      validationErrors: Array.isArray(ffi.validationErrors) 
        ? ffi.validationErrors.map(ValidationUtils.toString)
        : undefined,
      timestamp: ffi.timestamp ? ValidationUtils.toDate(ffi.timestamp) : new Date()
    };
  }

  getValidationError(data: unknown): string {
    const ffi = data as any;
    
    if (!ValidationUtils.isBigIntString(ffi.transactionId)) {
      return ValidationUtils.createValidationError(this.eventType, 'transactionId', 'bigint string', ffi.transactionId);
    }
    if (typeof ffi.isValid !== 'boolean') {
      return ValidationUtils.createValidationError(this.eventType, 'isValid', 'boolean', ffi.isValid);
    }
    
    return `Invalid data for ${this.eventType}`;
  }
}

/**
 * Create and register all transaction mappers
 */
export function createTransactionMappers(): {
  pendingInbound: PendingInboundTransactionMapper;
  broadcast: CompletedTransactionMapper;
  mined: CompletedTransactionMapper;
  cancelled: CancelledTransactionMapper;
  validation: TransactionValidationMapper;
} {
  return {
    pendingInbound: new PendingInboundTransactionMapper(),
    broadcast: new CompletedTransactionMapper('tx:broadcast'),
    mined: new CompletedTransactionMapper('tx:mined'),
    cancelled: new CancelledTransactionMapper(),
    validation: new TransactionValidationMapper()
  };
}

/**
 * Register all transaction mappers with a registry
 */
export function registerTransactionMappers(registry: any): void {
  const mappers = createTransactionMappers();
  
  registry.register(mappers.pendingInbound);
  registry.register(mappers.broadcast);
  registry.register(mappers.mined);
  registry.register(mappers.cancelled);
  registry.register(mappers.validation);
}
