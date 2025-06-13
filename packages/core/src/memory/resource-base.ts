import { FFIResource } from './disposable';

/**
 * Base class for all FFI resources in the Tari SDK
 * Provides common patterns for resource management and disposal
 */
export abstract class TariFFIResource extends FFIResource {
  protected resourceType: string;
  private createdAt: number;
  private lastAccessedAt: number;

  constructor(handle: any, resourceType: string) {
    super(handle);
    this.resourceType = resourceType;
    this.createdAt = Date.now();
    this.lastAccessedAt = this.createdAt;
  }

  /**
   * Get resource type identifier
   */
  get type(): string {
    return this.resourceType;
  }

  /**
   * Get creation timestamp
   */
  get createdAt(): number {
    return this.createdAt;
  }

  /**
   * Get last accessed timestamp
   */
  get lastAccessedAt(): number {
    return this.lastAccessedAt;
  }

  /**
   * Get resource age in milliseconds
   */
  get age(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Get time since last access in milliseconds
   */
  get timeSinceLastAccess(): number {
    return Date.now() - this.lastAccessedAt;
  }

  /**
   * Override to track access
   */
  get nativeHandle(): any {
    this.checkDisposed();
    this.lastAccessedAt = Date.now();
    return this.handle;
  }

  /**
   * Default release implementation for Tari FFI resources
   * Logs the disposal for debugging purposes
   */
  protected releaseHandle(): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`Disposing ${this.resourceType} (age: ${this.age}ms, last access: ${this.timeSinceLastAccess}ms ago)`);
    }
    
    // Subclasses should override this method to call the appropriate FFI disposal function
    this.performFFICleanup();
  }

  /**
   * Perform actual FFI cleanup - override in subclasses
   */
  protected abstract performFFICleanup(): void;

  /**
   * Create a string representation for debugging
   */
  toString(): string {
    return `${this.resourceType}(handle=${this.handle ? 'valid' : 'null'}, disposed=${this.isDisposed})`;
  }
}

/**
 * Resource factory for creating and tracking FFI resources
 */
export class TariResourceFactory {
  private static readonly activeResources = new WeakSet<TariFFIResource>();
  private static totalCreated = 0;
  private static totalDisposed = 0;

  /**
   * Create a new FFI resource and track it
   */
  static create<T extends TariFFIResource>(
    resourceClass: new (handle: any, ...args: any[]) => T,
    handle: any,
    ...args: any[]
  ): T {
    const resource = new resourceClass(handle, ...args);
    this.activeResources.add(resource);
    this.totalCreated++;
    
    if (process.env.NODE_ENV === 'development') {
      console.debug(`Created ${resource.type} (total created: ${this.totalCreated})`);
    }
    
    return resource;
  }

  /**
   * Get resource statistics for monitoring
   */
  static getStats(): {
    totalCreated: number;
    totalDisposed: number;
    estimatedActive: number;
  } {
    return {
      totalCreated: this.totalCreated,
      totalDisposed: this.totalDisposed,
      estimatedActive: this.totalCreated - this.totalDisposed
    };
  }

  /**
   * Reset statistics (for testing)
   */
  static resetStats(): void {
    this.totalCreated = 0;
    this.totalDisposed = 0;
  }

  /**
   * Mark a resource as disposed (called internally)
   */
  static markDisposed(): void {
    this.totalDisposed++;
  }
}

/**
 * Common patterns for FFI resource management
 */
export class ResourcePatterns {
  /**
   * Execute an operation with a temporary resource that gets disposed automatically
   */
  static async withResource<T extends TariFFIResource, R>(
    resource: T,
    operation: (resource: T) => Promise<R>
  ): Promise<R> {
    try {
      return await operation(resource);
    } finally {
      resource[Symbol.dispose]();
    }
  }

  /**
   * Execute an operation with multiple temporary resources
   */
  static async withResources<R>(
    resources: TariFFIResource[],
    operation: (resources: TariFFIResource[]) => Promise<R>
  ): Promise<R> {
    try {
      return await operation(resources);
    } finally {
      // Dispose in reverse order
      for (let i = resources.length - 1; i >= 0; i--) {
        try {
          resources[i][Symbol.dispose]();
        } catch (error) {
          console.warn(`Error disposing resource ${i}:`, error);
        }
      }
    }
  }

  /**
   * Create a resource pool with automatic cleanup
   */
  static createPool<T extends TariFFIResource>(
    factory: () => T,
    maxSize: number = 10,
    maxAge: number = 300000 // 5 minutes
  ): ResourcePool<T> {
    return new ResourcePool(factory, maxSize, maxAge);
  }
}

/**
 * Simple resource pool implementation
 */
class ResourcePool<T extends TariFFIResource> {
  private readonly pool: T[] = [];
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private factory: () => T,
    private maxSize: number,
    private maxAge: number
  ) {
    // Cleanup expired resources every minute
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Get a resource from the pool or create a new one
   */
  acquire(): T {
    // Try to get a resource from the pool
    const resource = this.pool.pop();
    if (resource && !resource.isDisposed && resource.age < this.maxAge) {
      return resource;
    }

    // Dispose expired resource if we got one
    if (resource) {
      resource[Symbol.dispose]();
    }

    // Create new resource
    return this.factory();
  }

  /**
   * Return a resource to the pool
   */
  release(resource: T): void {
    if (resource.isDisposed || resource.age >= this.maxAge) {
      resource[Symbol.dispose]();
      return;
    }

    if (this.pool.length < this.maxSize) {
      this.pool.push(resource);
    } else {
      // Pool is full, dispose the resource
      resource[Symbol.dispose]();
    }
  }

  /**
   * Clean up expired resources
   */
  private cleanup(): void {
    const now = Date.now();
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const resource = this.pool[i];
      if (resource.isDisposed || (now - resource.createdAt) >= this.maxAge) {
        this.pool.splice(i, 1);
        if (!resource.isDisposed) {
          resource[Symbol.dispose]();
        }
      }
    }
  }

  /**
   * Dispose all resources and cleanup timer
   */
  dispose(): void {
    clearInterval(this.cleanupTimer);
    while (this.pool.length > 0) {
      const resource = this.pool.pop()!;
      if (!resource.isDisposed) {
        resource[Symbol.dispose]();
      }
    }
  }

  /**
   * Get pool statistics
   */
  get stats(): { poolSize: number; maxSize: number } {
    return {
      poolSize: this.pool.length,
      maxSize: this.maxSize
    };
  }
}
