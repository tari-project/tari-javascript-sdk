/**
 * Handle wrapper with validation and lifecycle management
 * Provides type-safe access to native FFI handles with runtime validation
 */

import { TariError, ErrorCode } from '../errors/index.js';
import { FFIResource, ResourceType, createNativeDisposal } from './resource.js';
import type { WalletHandle } from './types.js';
import { isWalletHandle, createWalletHandle, unwrapWalletHandle } from './types.js';

/**
 * Configuration for resource handle creation
 */
export interface ResourceHandleConfig {
  /** The native handle value */
  handle: WalletHandle;
  /** Resource type for debugging */
  resourceType: ResourceType;
  /** Native module reference for cleanup */
  nativeModule?: any;
  /** Method name for cleanup (defaults to appropriate method based on type) */
  cleanupMethod?: string;
  /** Whether to capture stack trace for debugging */
  captureStack?: boolean;
}

/**
 * Metadata associated with a resource handle
 */
export interface HandleMetadata {
  /** When the handle was created */
  createdAt: Date;
  /** Last time the handle was accessed */
  lastAccessed: Date;
  /** Number of times the handle has been accessed */
  accessCount: number;
  /** Resource type */
  type: ResourceType;
}

/**
 * Abstract base class for resource handles with lifecycle management
 * 
 * Provides:
 * - Type-safe handle wrapping with branded types
 * - Automatic validation on access
 * - Usage tracking for debugging
 * - Integration with disposal system
 */
export abstract class ResourceHandle extends FFIResource {
  private readonly handle: WalletHandle;
  private readonly metadata: HandleMetadata;
  private readonly nativeModule?: any;
  private readonly cleanupMethod: string;

  protected constructor(config: ResourceHandleConfig) {
    const cleanupMethod = config.cleanupMethod || ResourceHandle.getDefaultCleanupMethod(config.resourceType);
    
    super(
      config.resourceType,
      createNativeDisposal(config.nativeModule, cleanupMethod, config.handle),
      config.captureStack
    );

    this.handle = config.handle;
    this.nativeModule = config.nativeModule;
    this.cleanupMethod = cleanupMethod;
    this.metadata = {
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      type: config.resourceType,
    };

    this.validateHandle();
  }

  /**
   * Get the wrapped handle value with validation
   */
  protected getHandleValue(): WalletHandle {
    this.ensureNotDisposed();
    this.updateAccessMetadata();
    return this.handle;
  }

  /**
   * Get the raw handle number for FFI calls
   */
  protected getRawHandle(): number {
    return unwrapWalletHandle(this.getHandleValue());
  }

  /**
   * Implementation of getHandle for base class
   */
  protected getHandle(): WalletHandle {
    return this.handle;
  }

  /**
   * Get handle metadata
   */
  getMetadata(): HandleMetadata {
    return { ...this.metadata };
  }

  /**
   * Validate the handle is in a valid state
   */
  private validateHandle(): void {
    if (!isWalletHandle(this.handle)) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Invalid handle value provided to ResourceHandle',
        false,
        undefined,
        {
          handle: this.handle,
          resourceType: this.type,
        }
      );
    }
  }

  /**
   * Update access tracking metadata
   */
  private updateAccessMetadata(): void {
    this.metadata.lastAccessed = new Date();
    this.metadata.accessCount++;
  }

  /**
   * Get default cleanup method name for resource type
   */
  private static getDefaultCleanupMethod(type: ResourceType): string {
    switch (type) {
      case ResourceType.Wallet:
        return 'walletDestroy';
      case ResourceType.Transaction:
        return 'transactionDestroy';
      case ResourceType.Contact:
        return 'contactDestroy';
      default:
        return 'destroy';
    }
  }

  /**
   * Check if this handle represents the same resource as another
   */
  equals(other: ResourceHandle): boolean {
    return this.handle === other.handle && this.type === other.type;
  }

  /**
   * Get a string representation of the handle
   */
  toString(): string {
    return `${this.type}Handle(${this.handle})`;
  }

  /**
   * Get detailed handle information for debugging
   */
  getDebugInfo(): {
    handle: WalletHandle;
    rawHandle: number;
    type: ResourceType;
    disposed: boolean;
    metadata: HandleMetadata;
    cleanupMethod: string;
    hasNativeModule: boolean;
  } {
    return {
      handle: this.handle,
      rawHandle: unwrapWalletHandle(this.handle),
      type: this.type,
      disposed: this.isDisposed,
      metadata: this.getMetadata(),
      cleanupMethod: this.cleanupMethod,
      hasNativeModule: !!this.nativeModule,
    };
  }
}

/**
 * Factory class for creating resource handles
 */
export class HandleFactory {
  /**
   * Create a resource handle from a raw handle value
   */
  static create(config: ResourceHandleConfig): ResourceHandle {
    return new ConcreteResourceHandle(config);
  }

  /**
   * Create a wallet handle
   */
  static createWallet(
    handle: number | WalletHandle,
    nativeModule?: any,
    captureStack?: boolean
  ): ResourceHandle {
    const walletHandle = typeof handle === 'number' ? createWalletHandle(handle) : handle;
    
    return HandleFactory.create({
      handle: walletHandle,
      resourceType: ResourceType.Wallet,
      nativeModule,
      captureStack,
    });
  }

  /**
   * Validate and wrap a raw handle value
   */
  static validateAndWrap(
    rawHandle: unknown,
    resourceType: ResourceType,
    nativeModule?: any
  ): ResourceHandle {
    if (typeof rawHandle !== 'number' || !Number.isInteger(rawHandle) || rawHandle <= 0) {
      throw new TariError(
        ErrorCode.InvalidConfig,
        'Handle must be a positive integer',
        false,
        undefined,
        { rawHandle, resourceType }
      );
    }

    const handle = createWalletHandle(rawHandle);
    return HandleFactory.create({
      handle,
      resourceType,
      nativeModule,
    });
  }
}

/**
 * Concrete implementation of ResourceHandle
 * Private to this module - use HandleFactory to create instances
 */
class ConcreteResourceHandle extends ResourceHandle {
  constructor(config: ResourceHandleConfig) {
    super(config);
  }

  /**
   * Get the handle value for external use
   */
  getValue(): WalletHandle {
    return this.getHandleValue();
  }

  /**
   * Get the raw handle number for FFI calls
   */
  getRaw(): number {
    return this.getRawHandle();
  }
}

/**
 * Utility functions for handle management
 */

/**
 * Check if a value is a valid handle
 */
export function isValidHandle(value: unknown): value is WalletHandle {
  return isWalletHandle(value);
}

/**
 * Convert a raw handle to a branded handle
 */
export function wrapHandle(rawHandle: number): WalletHandle {
  if (!Number.isInteger(rawHandle) || rawHandle <= 0) {
    throw new TariError(
      ErrorCode.InvalidConfig,
      'Handle must be a positive integer',
      false,
      undefined,
      { rawHandle }
    );
  }
  return createWalletHandle(rawHandle);
}

/**
 * Extract raw handle from branded handle
 */
export function unwrapHandle(handle: WalletHandle): number {
  return unwrapWalletHandle(handle);
}

/**
 * Type guard for ResourceHandle instances
 */
export function isResourceHandle(obj: unknown): obj is ResourceHandle {
  return obj instanceof ResourceHandle;
}

/**
 * Utility to safely get handle value from a resource
 */
export function getHandleValue(resource: unknown): WalletHandle | undefined {
  if (isResourceHandle(resource)) {
    try {
      return (resource as ConcreteResourceHandle).getValue();
    } catch {
      return undefined;
    }
  }
  return undefined;
}
