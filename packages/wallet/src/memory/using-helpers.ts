import { Disposable, AsyncDisposable, DisposableStack, AsyncDisposableStack } from '@tari/core/memory/using-polyfill';
import { DisposableResource } from '@tari/core/memory/disposable';

/**
 * Helper functions for using declarations and resource management
 * Provides compatibility patterns for environments without native using support
 */

/**
 * Execute operation with a disposable resource, ensuring cleanup
 * This is a compatibility function for environments without using declarations
 */
export async function withResource<T extends Disposable, R>(
  resource: T,
  operation: (resource: T) => Promise<R>
): Promise<R> {
  try {
    return await operation(resource);
  } finally {
    try {
      resource[Symbol.dispose]();
    } catch (error) {
      console.warn('Error disposing resource:', error);
    }
  }
}

/**
 * Execute operation with multiple disposable resources
 */
export async function withResources<R>(
  resources: Disposable[],
  operation: (resources: Disposable[]) => Promise<R>
): Promise<R> {
  try {
    return await operation(resources);
  } finally {
    // Dispose in reverse order (LIFO)
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
 * Execute operation with an async disposable resource
 */
export async function withAsyncResource<T extends AsyncDisposable, R>(
  resource: T,
  operation: (resource: T) => Promise<R>
): Promise<R> {
  try {
    return await operation(resource);
  } finally {
    try {
      await resource[Symbol.asyncDispose]();
    } catch (error) {
      console.warn('Error disposing async resource:', error);
    }
  }
}

/**
 * Execute operation with multiple async disposable resources
 */
export async function withAsyncResources<R>(
  resources: AsyncDisposable[],
  operation: (resources: AsyncDisposable[]) => Promise<R>
): Promise<R> {
  try {
    return await operation(resources);
  } finally {
    // Dispose in reverse order (LIFO)
    for (let i = resources.length - 1; i >= 0; i--) {
      try {
        await resources[i][Symbol.asyncDispose]();
      } catch (error) {
        console.warn(`Error disposing async resource ${i}:`, error);
      }
    }
  }
}

/**
 * Create a scoped resource manager
 */
export function createResourceScope(): ResourceScope {
  return new ResourceScope();
}

/**
 * Resource scope manager for automatic cleanup
 */
export class ResourceScope implements Disposable, AsyncDisposable {
  private readonly stack = new AsyncDisposableStack();
  private disposed = false;

  /**
   * Add a disposable resource to the scope
   */
  use<T extends Disposable | AsyncDisposable>(resource: T): T {
    if (this.disposed) {
      throw new Error('ResourceScope has been disposed');
    }
    return this.stack.use(resource);
  }

  /**
   * Add a cleanup function to the scope
   */
  defer(cleanup: () => void | Promise<void>): void {
    if (this.disposed) {
      throw new Error('ResourceScope has been disposed');
    }
    
    const disposable = {
      [Symbol.dispose]: () => {
        const result = cleanup();
        if (result instanceof Promise) {
          console.warn('Async cleanup function in sync dispose context');
        }
      },
      [Symbol.asyncDispose]: async () => {
        await cleanup();
      }
    };
    
    this.stack.use(disposable);
  }

  /**
   * Execute operation with this scope, disposing all resources after
   */
  async with<R>(operation: (scope: ResourceScope) => Promise<R>): Promise<R> {
    try {
      return await operation(this);
    } finally {
      await this[Symbol.asyncDispose]();
    }
  }

  /**
   * Synchronous disposal
   */
  [Symbol.dispose](): void {
    if (!this.disposed) {
      this.disposed = true;
      // Note: This will log warnings for async resources
      this.stack[Symbol.dispose]();
    }
  }

  /**
   * Asynchronous disposal
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.disposed) {
      this.disposed = true;
      await this.stack[Symbol.asyncDispose]();
    }
  }

  /**
   * Check if scope has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get number of resources in scope
   */
  get size(): number {
    return this.stack.size;
  }
}

/**
 * Utility for managing temporary resources with automatic cleanup
 */
export class TemporaryResourceManager {
  private readonly activeResources = new Map<string, Disposable | AsyncDisposable>();
  private readonly cleanupTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Register a temporary resource with automatic cleanup after timeout
   */
  register<T extends Disposable | AsyncDisposable>(
    id: string,
    resource: T,
    timeoutMs: number = 300000 // 5 minutes default
  ): T {
    // Clean up existing resource with same ID
    this.unregister(id);

    this.activeResources.set(id, resource);
    
    // Set cleanup timer
    const timer = setTimeout(() => {
      this.unregister(id);
    }, timeoutMs);
    
    this.cleanupTimers.set(id, timer);
    
    return resource;
  }

  /**
   * Unregister and dispose a resource
   */
  unregister(id: string): void {
    const resource = this.activeResources.get(id);
    const timer = this.cleanupTimers.get(id);

    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(id);
    }

    if (resource) {
      this.activeResources.delete(id);
      
      if ('asyncDispose' in resource && typeof resource[Symbol.asyncDispose] === 'function') {
        resource[Symbol.asyncDispose]().catch(error => {
          console.warn(`Error disposing async resource ${id}:`, error);
        });
      } else if ('dispose' in resource && typeof resource[Symbol.dispose] === 'function') {
        try {
          resource[Symbol.dispose]();
        } catch (error) {
          console.warn(`Error disposing resource ${id}:`, error);
        }
      }
    }
  }

  /**
   * Get a registered resource
   */
  get<T extends Disposable | AsyncDisposable>(id: string): T | undefined {
    return this.activeResources.get(id) as T | undefined;
  }

  /**
   * Extend the lifetime of a resource
   */
  extend(id: string, additionalTimeMs: number): boolean {
    const timer = this.cleanupTimers.get(id);
    if (!timer || !this.activeResources.has(id)) {
      return false;
    }

    // Clear existing timer
    clearTimeout(timer);

    // Set new timer
    const newTimer = setTimeout(() => {
      this.unregister(id);
    }, additionalTimeMs);
    
    this.cleanupTimers.set(id, newTimer);
    return true;
  }

  /**
   * Get all active resource IDs
   */
  getActiveIds(): string[] {
    return Array.from(this.activeResources.keys());
  }

  /**
   * Clean up all resources
   */
  async dispose(): Promise<void> {
    const errors: Error[] = [];

    // Clear all timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();

    // Dispose all resources
    for (const [id, resource] of this.activeResources) {
      try {
        if ('asyncDispose' in resource && typeof resource[Symbol.asyncDispose] === 'function') {
          await resource[Symbol.asyncDispose]();
        } else if ('dispose' in resource && typeof resource[Symbol.dispose] === 'function') {
          resource[Symbol.dispose]();
        }
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(`Error disposing ${id}: ${error}`));
      }
    }

    this.activeResources.clear();

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposal errors occurred');
    }
  }

  /**
   * Get statistics about managed resources
   */
  getStats(): {
    totalActive: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const resource of this.activeResources.values()) {
      const type = resource.constructor.name;
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      totalActive: this.activeResources.size,
      byType
    };
  }
}

/**
 * Global temporary resource manager instance
 */
export const globalTemporaryResources = new TemporaryResourceManager();

/**
 * Decorator for automatic resource disposal
 */
export function autoDispose<T extends Disposable>(timeoutMs: number = 300000) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      if (result && typeof result[Symbol.dispose] === 'function') {
        const id = `${target.constructor.name}.${propertyKey}.${Date.now()}`;
        globalTemporaryResources.register(id, result, timeoutMs);
      }
      
      return result;
    };

    return descriptor;
  };
}

/**
 * Helper for creating disposable wrappers around regular objects
 */
export function makeDisposable<T>(
  value: T,
  disposeCallback: (value: T) => void | Promise<void>
): T & Disposable & AsyncDisposable {
  return Object.assign(value as any, {
    [Symbol.dispose]: () => {
      const result = disposeCallback(value);
      if (result instanceof Promise) {
        console.warn('Async dispose callback in sync context');
      }
    },
    [Symbol.asyncDispose]: async () => {
      await disposeCallback(value);
    }
  });
}

/**
 * Helper for creating a disposable timeout
 */
export function createDisposableTimeout(
  callback: () => void,
  delayMs: number
): Disposable {
  const timer = setTimeout(callback, delayMs);
  
  return {
    [Symbol.dispose]: () => {
      clearTimeout(timer);
    }
  };
}

/**
 * Helper for creating a disposable interval
 */
export function createDisposableInterval(
  callback: () => void,
  intervalMs: number
): Disposable {
  const timer = setInterval(callback, intervalMs);
  
  return {
    [Symbol.dispose]: () => {
      clearInterval(timer);
    }
  };
}

/**
 * Helper for creating a disposable event listener
 */
export function createDisposableEventListener<T extends EventTarget>(
  target: T,
  event: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
): Disposable {
  target.addEventListener(event, listener, options);
  
  return {
    [Symbol.dispose]: () => {
      target.removeEventListener(event, listener, options);
    }
  };
}
