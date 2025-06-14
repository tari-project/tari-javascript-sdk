import { safeDispose, isDisposable, isAsyncDisposable } from '@tari-project/tarijs-core';
import { DisposableResource } from '@tari-project/tarijs-core/memory/disposable';

/**
 * Automatic disposal utilities for short-lived resources
 */

/**
 * Auto-dispose wrapper that automatically disposes resources after a specified time
 */
export class AutoDisposeWrapper<T extends Disposable | AsyncDisposable> implements AsyncDisposable {
  private disposed = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private resource: T,
    private timeoutMs: number,
    private onDispose?: (resource: T) => void
  ) {
    this.startTimer();
  }

  /**
   * Get the wrapped resource
   */
  get value(): T {
    if (this.disposed) {
      throw new Error('Resource has been auto-disposed');
    }
    return this.resource;
  }

  /**
   * Reset the auto-dispose timer
   */
  resetTimer(): void {
    if (this.disposed) return;
    
    this.stopTimer();
    this.startTimer();
  }

  /**
   * Cancel auto-disposal and return the resource
   */
  cancel(): T {
    if (this.disposed) {
      throw new Error('Resource has already been disposed');
    }
    
    this.stopTimer();
    const resource = this.resource;
    (this.resource as any) = null;
    return resource;
  }

  /**
   * Manually dispose the resource
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    this.stopTimer();
    
    if (this.onDispose) {
      this.onDispose(this.resource);
    }
    
    if (typeof (this.resource as any)[Symbol.asyncDispose] === 'function') {
      await (this.resource as any)[Symbol.asyncDispose]();
    } else if (typeof (this.resource as any)[Symbol.dispose] === 'function') {
      (this.resource as any)[Symbol.dispose]();
    }
    
    (this.resource as any) = null;
  }

  /**
   * Start the auto-dispose timer
   */
  private startTimer(): void {
    this.timer = setTimeout(() => {
      this[Symbol.asyncDispose]().catch(error => {
        console.error('Error during auto-disposal:', error);
      });
    }, this.timeoutMs);
  }

  /**
   * Stop the auto-dispose timer
   */
  private stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Check if resource has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get time remaining until auto-disposal
   */
  get timeRemaining(): number {
    if (this.disposed || !this.timer) {
      return 0;
    }
    // Note: This is an approximation since we don't track start time
    return this.timeoutMs;
  }
}

/**
 * Reference counting resource wrapper
 */
export class RefCountedResource<T extends Disposable | AsyncDisposable> implements AsyncDisposable {
  private refCount = 0;
  private disposed = false;

  constructor(
    private resource: T,
    private onLastRelease?: (resource: T) => Promise<void>
  ) {}

  /**
   * Acquire a reference to the resource
   */
  acquire(): RefCountedHandle<T> {
    if (this.disposed) {
      throw new Error('Resource has been disposed');
    }
    
    this.refCount++;
    return new RefCountedHandle(this, this.resource);
  }

  /**
   * Release a reference (internal use)
   */
  async release(): Promise<void> {
    if (this.disposed) return;
    
    this.refCount--;
    if (this.refCount <= 0) {
      await this.dispose();
    }
  }

  /**
   * Force disposal regardless of reference count
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  /**
   * Internal disposal method
   */
  private async dispose(): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    this.refCount = 0;
    
    if (this.onLastRelease) {
      await this.onLastRelease(this.resource);
    }
    
    if (typeof (this.resource as any)[Symbol.asyncDispose] === 'function') {
      await (this.resource as any)[Symbol.asyncDispose]();
    } else if (typeof (this.resource as any)[Symbol.dispose] === 'function') {
      (this.resource as any)[Symbol.dispose]();
    }
  }

  /**
   * Get current reference count
   */
  get referenceCount(): number {
    return this.refCount;
  }

  /**
   * Check if resource has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Handle for a reference-counted resource
 */
export class RefCountedHandle<T extends Disposable | AsyncDisposable> implements AsyncDisposable {
  private released = false;

  constructor(
    private parent: RefCountedResource<T>,
    private resource: T
  ) {}

  /**
   * Get the resource
   */
  get value(): T {
    if (this.released) {
      throw new Error('Handle has been released');
    }
    return this.resource;
  }

  /**
   * Release this handle
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.released) return;
    
    this.released = true;
    await this.parent.release();
  }

  /**
   * Check if handle has been released
   */
  get isReleased(): boolean {
    return this.released;
  }
}

/**
 * Lazy resource wrapper that creates the resource only when first accessed
 */
export class LazyResource<T extends Disposable | AsyncDisposable> implements AsyncDisposable {
  private resource?: T;
  private creating?: Promise<T>;
  private disposed = false;

  constructor(
    private factory: () => Promise<T> | T,
    private autoDisposeMs?: number
  ) {}

  /**
   * Get the resource, creating it if necessary
   */
  async get(): Promise<T> {
    if (this.disposed) {
      throw new Error('LazyResource has been disposed');
    }
    
    if (this.resource) {
      return this.resource;
    }
    
    if (this.creating) {
      return await this.creating;
    }
    
    this.creating = Promise.resolve(this.factory());
    
    try {
      this.resource = await this.creating;
      
      // Set up auto-disposal if specified
      if (this.autoDisposeMs) {
        setTimeout(() => {
          this[Symbol.asyncDispose]().catch(error => {
            console.error('Error during lazy resource auto-disposal:', error);
          });
        }, this.autoDisposeMs);
      }
      
      return this.resource;
    } finally {
      this.creating = undefined;
    }
  }

  /**
   * Check if resource has been created
   */
  get isCreated(): boolean {
    return this.resource !== undefined;
  }

  /**
   * Check if resource is currently being created
   */
  get isCreating(): boolean {
    return this.creating !== undefined;
  }

  /**
   * Dispose the resource if it has been created
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    
    // Wait for creation to complete if in progress
    if (this.creating) {
      try {
        await this.creating;
      } catch {
        // Ignore creation errors during disposal
      }
    }
    
    if (this.resource) {
      if (typeof (this.resource as any)[Symbol.asyncDispose] === 'function') {
        await (this.resource as any)[Symbol.asyncDispose]();
      } else if (typeof (this.resource as any)[Symbol.dispose] === 'function') {
        (this.resource as any)[Symbol.dispose]();
      }
      this.resource = undefined;
    }
  }

  /**
   * Check if resource has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Pool of reusable resources with automatic lifecycle management
 */
export class ResourcePool<T extends Disposable | AsyncDisposable> implements AsyncDisposable {
  private readonly available: T[] = [];
  private readonly inUse = new Set<T>();
  private disposed = false;

  constructor(
    private factory: () => Promise<T> | T,
    private maxSize: number = 10,
    private maxAge: number = 300000, // 5 minutes
    private validator?: (resource: T) => boolean | Promise<boolean>
  ) {}

  /**
   * Acquire a resource from the pool
   */
  async acquire(): Promise<PooledResource<T>> {
    if (this.disposed) {
      throw new Error('Resource pool has been disposed');
    }
    
    // Try to get an available resource
    while (this.available.length > 0) {
      const resource = this.available.pop()!;
      
      // Validate resource if validator is provided
      if (this.validator) {
        const isValid = await this.validator(resource);
        if (!isValid) {
          await this.disposeResource(resource);
          continue;
        }
      }
      
      this.inUse.add(resource);
      return new PooledResource(this, resource);
    }
    
    // Create new resource if pool isn't at capacity
    if (this.inUse.size < this.maxSize) {
      const resource = await this.factory();
      this.inUse.add(resource);
      return new PooledResource(this, resource);
    }
    
    throw new Error('Resource pool is at capacity');
  }

  /**
   * Return a resource to the pool (internal use)
   */
  async return(resource: T): Promise<void> {
    if (this.disposed) {
      await this.disposeResource(resource);
      return;
    }
    
    this.inUse.delete(resource);
    
    // Validate resource before returning to pool
    if (this.validator) {
      const isValid = await this.validator(resource);
      if (!isValid) {
        await this.disposeResource(resource);
        return;
      }
    }
    
    this.available.push(resource);
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.available.length + this.inUse.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Dispose the entire pool
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    const errors: Error[] = [];
    
    // Dispose available resources
    for (const resource of this.available) {
      try {
        await this.disposeResource(resource);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.available.length = 0;
    
    // Dispose in-use resources
    for (const resource of this.inUse) {
      try {
        await this.disposeResource(resource);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.inUse.clear();
    
    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposal errors occurred');
    }
  }

  /**
   * Dispose a single resource
   */
  private async disposeResource(resource: T): Promise<void> {
    if (typeof (resource as any)[Symbol.asyncDispose] === 'function') {
      await (resource as any)[Symbol.asyncDispose]();
    } else if (typeof (resource as any)[Symbol.dispose] === 'function') {
      (resource as any)[Symbol.dispose]();
    }
  }
}

/**
 * Wrapper for a pooled resource
 */
export class PooledResource<T extends Disposable | AsyncDisposable> implements AsyncDisposable {
  private returned = false;

  constructor(
    private pool: ResourcePool<T>,
    private resource: T
  ) {}

  /**
   * Get the resource
   */
  get value(): T {
    if (this.returned) {
      throw new Error('Pooled resource has been returned');
    }
    return this.resource;
  }

  /**
   * Return the resource to the pool
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.returned) return;
    
    this.returned = true;
    await this.pool.return(this.resource);
  }

  /**
   * Check if resource has been returned
   */
  get isReturned(): boolean {
    return this.returned;
  }
}

/**
 * Pool statistics
 */
export interface PoolStats {
  available: number;
  inUse: number;
  total: number;
  maxSize: number;
}

/**
 * Factory for creating auto-dispose utilities
 */
export class AutoDisposeFactory {
  /**
   * Wrap a resource with auto-disposal
   */
  static wrap<T extends Disposable | AsyncDisposable>(
    resource: T,
    timeoutMs: number,
    onDispose?: (resource: T) => void
  ): AutoDisposeWrapper<T> {
    return new AutoDisposeWrapper(resource, timeoutMs, onDispose);
  }

  /**
   * Create a reference-counted resource
   */
  static refCounted<T extends Disposable | AsyncDisposable>(
    resource: T,
    onLastRelease?: (resource: T) => Promise<void>
  ): RefCountedResource<T> {
    return new RefCountedResource(resource, onLastRelease);
  }

  /**
   * Create a lazy resource
   */
  static lazy<T extends Disposable | AsyncDisposable>(
    factory: () => Promise<T> | T,
    autoDisposeMs?: number
  ): LazyResource<T> {
    return new LazyResource(factory, autoDisposeMs);
  }

  /**
   * Create a resource pool
   */
  static pool<T extends Disposable | AsyncDisposable>(
    factory: () => Promise<T> | T,
    maxSize?: number,
    maxAge?: number,
    validator?: (resource: T) => boolean | Promise<boolean>
  ): ResourcePool<T> {
    return new ResourcePool(factory, maxSize, maxAge, validator);
  }
}
