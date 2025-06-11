/**
 * Abstract FFI resource base class with TypeScript 5.2+ disposal pattern
 * Provides deterministic cleanup via Symbol.dispose and FinalizationRegistry fallback
 */

// Polyfill for Symbol.dispose if not available
(Symbol as any).dispose ??= Symbol('Symbol.dispose');

import { TariError, ErrorCode } from '../errors/index.js';
import type { WalletHandle } from './types.js';

/**
 * Type for resource disposal logic
 */
type DisposalLogic = () => void | Promise<void>;

/**
 * Resource type enumeration for debugging and tracking
 */
export enum ResourceType {
  Wallet = 'wallet',
  Transaction = 'transaction',
  Contact = 'contact',
  Unknown = 'unknown',
}

/**
 * Abstract base class for FFI resources with automatic disposal
 * 
 * Provides:
 * - TypeScript 5.2+ using pattern support via Symbol.dispose
 * - FinalizationRegistry fallback for garbage collection cleanup
 * - Resource type tracking for debugging
 * - Double-disposal protection
 * - Stack trace capture for leak debugging (development only)
 */
export abstract class FFIResource implements Disposable {
  private static readonly registry = new FinalizationRegistry<{
    logic: DisposalLogic;
    type: ResourceType;
    handle?: WalletHandle;
    stack?: string;
  }>((cleanup) => {
    console.warn(
      `FFI Resource leaked - cleaned up by garbage collector`,
      {
        type: cleanup.type,
        handle: cleanup.handle,
        stack: cleanup.stack ? cleanup.stack.split('\n').slice(0, 5) : undefined,
      }
    );
    
    try {
      const result = cleanup.logic();
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error('Error during GC cleanup:', error);
        });
      }
    } catch (error) {
      console.error('Error during GC cleanup:', error);
    }
  });

  private readonly disposalLogic: DisposalLogic;
  private readonly resourceType: ResourceType;
  private readonly createdAt: Date;
  private readonly creationStack?: string;
  private disposed = false;

  protected constructor(
    resourceType: ResourceType,
    disposalLogic: DisposalLogic,
    captureStack = process.env.NODE_ENV === 'development'
  ) {
    this.resourceType = resourceType;
    this.disposalLogic = disposalLogic;
    this.createdAt = new Date();
    
    // Capture stack trace for leak debugging in development
    if (captureStack) {
      this.creationStack = new Error().stack;
    }

    // Register with FinalizationRegistry for GC cleanup
    FFIResource.registry.register(
      this,
      {
        logic: disposalLogic,
        type: resourceType,
        handle: this.getHandle?.(),
        stack: this.creationStack,
      },
      this
    );
  }

  /**
   * TypeScript 5.2+ disposal pattern implementation
   * Called automatically when using 'using' keyword
   */
  [Symbol.dispose](): void {
    this.dispose();
  }

  /**
   * Explicit disposal method
   * Can be called manually or via Symbol.dispose
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    try {
      // Unregister from FinalizationRegistry to prevent double cleanup
      FFIResource.registry.unregister(this);

      // Call the disposal logic
      const result = this.disposalLogic();
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error('Error during resource disposal:', error);
        });
      }
    } catch (error) {
      console.error('Error during resource disposal:', error);
      throw new TariError(
        ErrorCode.FFICallFailed,
        `Failed to dispose ${this.resourceType} resource: ${error instanceof Error ? error.message : String(error)}`,
        false,
        error instanceof Error ? error : undefined,
        {
          resourceType: this.resourceType,
          handle: this.getHandle?.(),
          createdAt: this.createdAt,
        }
      );
    }
  }

  /**
   * Check if resource has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get resource type for debugging
   */
  get type(): ResourceType {
    return this.resourceType;
  }

  /**
   * Get creation timestamp
   */
  get createdAt(): Date {
    return this.createdAt;
  }

  /**
   * Ensure resource hasn't been disposed before use
   */
  protected ensureNotDisposed(): void {
    if (this.disposed) {
      throw new TariError(
        ErrorCode.UseAfterFree,
        `Cannot use disposed ${this.resourceType} resource`,
        false,
        undefined,
        {
          resourceType: this.resourceType,
          handle: this.getHandle?.(),
          disposedAt: new Date(),
        }
      );
    }
  }

  /**
   * Get the native handle for this resource (if applicable)
   * Subclasses should override if they have a handle
   */
  protected getHandle?(): WalletHandle;

  /**
   * Get creation stack trace (development only)
   */
  getCreationStack(): string | undefined {
    return this.creationStack;
  }

  /**
   * Get resource information for debugging
   */
  getResourceInfo(): {
    type: ResourceType;
    handle?: WalletHandle;
    disposed: boolean;
    createdAt: Date;
    stack?: string[];
  } {
    return {
      type: this.resourceType,
      handle: this.getHandle?.(),
      disposed: this.disposed,
      createdAt: this.createdAt,
      stack: this.creationStack ? this.creationStack.split('\n').slice(0, 10) : undefined,
    };
  }

  /**
   * Static method to get total number of active resources (for testing)
   * Note: This is approximate as FinalizationRegistry doesn't provide size
   */
  static getActiveResourceCount(): number {
    // This is a placeholder - actual tracking will be handled by ResourceTracker
    return 0;
  }
}

/**
 * Utility function to create a disposal function for native handles
 */
export function createNativeDisposal(
  nativeModule: any,
  methodName: string,
  handle: WalletHandle
): DisposalLogic {
  return async () => {
    if (nativeModule && typeof nativeModule[methodName] === 'function') {
      await nativeModule[methodName](handle);
    }
  };
}

/**
 * Type guard to check if an object is a disposable resource
 */
export function isDisposableResource(obj: unknown): obj is FFIResource {
  return obj instanceof FFIResource;
}

/**
 * Utility to safely dispose of resources
 */
export async function safeDispose(resource: unknown): Promise<void> {
  if (isDisposableResource(resource)) {
    resource.dispose();
  }
}

/**
 * Utility to dispose of multiple resources
 */
export async function disposeAll(resources: unknown[]): Promise<void> {
  const errors: Error[] = [];
  
  for (const resource of resources) {
    try {
      await safeDispose(resource);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error);
      }
    }
  }

  if (errors.length > 0) {
    throw new TariError(
      ErrorCode.FFICallFailed,
      `Failed to dispose ${errors.length} resources`,
      false,
      undefined,
      { errors: errors.map(e => e.message) }
    );
  }
}
