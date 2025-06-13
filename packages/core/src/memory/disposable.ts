import { Disposable, AsyncDisposable } from './using-polyfill';

/**
 * Abstract base class for disposable resources
 * Provides common disposal patterns and tracking
 */
export abstract class DisposableResource implements Disposable, AsyncDisposable {
  private disposed = false;
  private readonly disposalStack: string[] = [];

  constructor() {
    // Track disposal stack for debugging
    if (process.env.NODE_ENV === 'development') {
      const stack = new Error().stack;
      if (stack) {
        this.disposalStack.push(...stack.split('\n').slice(2, 6));
      }
    }
  }

  /**
   * Synchronous disposal implementation
   */
  [Symbol.dispose](): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        this.disposeSync();
      } catch (error) {
        console.error('Error during synchronous disposal:', error);
        if (process.env.NODE_ENV === 'development') {
          console.error('Disposal stack:', this.disposalStack);
        }
        throw error;
      }
    }
  }

  /**
   * Asynchronous disposal implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.disposed) {
      this.disposed = true;
      try {
        await this.disposeAsync();
      } catch (error) {
        console.error('Error during asynchronous disposal:', error);
        if (process.env.NODE_ENV === 'development') {
          console.error('Disposal stack:', this.disposalStack);
        }
        throw error;
      }
    }
  }

  /**
   * Check if the resource has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Throw error if resource has been disposed
   */
  protected checkDisposed(): void {
    if (this.disposed) {
      throw new Error(`${this.constructor.name} has been disposed and cannot be used`);
    }
  }

  /**
   * Synchronous disposal implementation - override in subclasses
   */
  protected abstract disposeSync(): void;

  /**
   * Asynchronous disposal implementation - override in subclasses
   * Default implementation calls disposeSync()
   */
  protected async disposeAsync(): Promise<void> {
    this.disposeSync();
  }
}

/**
 * Base class for resources that wrap native FFI handles
 */
export abstract class FFIResource extends DisposableResource {
  protected handle: any;
  protected disposed = false;

  constructor(handle: any) {
    super();
    this.handle = handle;
  }

  /**
   * Get the native handle
   */
  get nativeHandle(): any {
    this.checkDisposed();
    return this.handle;
  }

  /**
   * Default synchronous disposal for FFI resources
   */
  protected disposeSync(): void {
    if (this.handle && !this.disposed) {
      try {
        this.releaseHandle();
      } finally {
        this.handle = null;
        this.disposed = true;
      }
    }
  }

  /**
   * Release the native handle - override in subclasses
   */
  protected abstract releaseHandle(): void;

  /**
   * Check if resource is disposed
   */
  get isDisposed(): boolean {
    return this.disposed || !this.handle;
  }
}

/**
 * Utility for automatically disposing resources after a timeout
 */
export class AutoDisposer<T extends Disposable> {
  private timer?: NodeJS.Timeout;

  constructor(
    private resource: T,
    timeoutMs: number
  ) {
    this.timer = setTimeout(() => {
      this.dispose();
    }, timeoutMs);
  }

  /**
   * Get the resource
   */
  get value(): T {
    if (!this.resource) {
      throw new Error('Resource has been disposed');
    }
    return this.resource;
  }

  /**
   * Cancel auto-disposal and return the resource
   */
  cancel(): T {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const resource = this.resource;
    (this.resource as any) = null;
    return resource;
  }

  /**
   * Manually dispose the resource
   */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.resource) {
      this.resource[Symbol.dispose]();
      (this.resource as any) = null;
    }
  }
}

/**
 * Resource manager for tracking and disposing multiple resources
 */
export class ResourceManager implements Disposable {
  private readonly resources = new Map<string, Disposable>();
  private disposed = false;

  /**
   * Register a resource with an identifier
   */
  register<T extends Disposable>(id: string, resource: T): T {
    if (this.disposed) {
      throw new Error('ResourceManager has been disposed');
    }
    
    // Dispose existing resource with same ID
    const existing = this.resources.get(id);
    if (existing) {
      existing[Symbol.dispose]();
    }
    
    this.resources.set(id, resource);
    return resource;
  }

  /**
   * Unregister and dispose a resource
   */
  unregister(id: string): void {
    const resource = this.resources.get(id);
    if (resource) {
      this.resources.delete(id);
      resource[Symbol.dispose]();
    }
  }

  /**
   * Get a registered resource
   */
  get<T extends Disposable>(id: string): T | undefined {
    return this.resources.get(id) as T | undefined;
  }

  /**
   * Check if a resource is registered
   */
  has(id: string): boolean {
    return this.resources.has(id);
  }

  /**
   * Get all registered resource IDs
   */
  getIds(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Dispose all resources
   */
  [Symbol.dispose](): void {
    if (this.disposed) return;
    
    this.disposed = true;
    const errors: Error[] = [];

    for (const [id, resource] of this.resources) {
      try {
        resource[Symbol.dispose]();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(`Error disposing ${id}: ${error}`));
      }
    }

    this.resources.clear();

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple resource disposal errors occurred');
    }
  }

  /**
   * Get number of registered resources
   */
  get size(): number {
    return this.resources.size;
  }

  /**
   * Check if manager has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}
