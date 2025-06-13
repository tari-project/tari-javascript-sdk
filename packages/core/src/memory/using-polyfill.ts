/**
 * Polyfill for Symbol.dispose and Symbol.asyncDispose
 * Ensures compatibility with older Node.js versions and environments
 * that don't have native support for explicit resource management
 */

// Polyfill Symbol.dispose if not available
if (typeof Symbol.dispose === 'undefined') {
  (Symbol as any).dispose = Symbol.for('dispose');
}

// Polyfill Symbol.asyncDispose if not available
if (typeof Symbol.asyncDispose === 'undefined') {
  (Symbol as any).asyncDispose = Symbol.for('asyncDispose');
}

/**
 * Type definitions for disposable resources
 */
export interface Disposable {
  [Symbol.dispose](): void;
}

export interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Utility to check if an object is disposable
 */
export function isDisposable(obj: any): obj is Disposable {
  return obj != null && typeof obj[Symbol.dispose] === 'function';
}

/**
 * Utility to check if an object is async disposable
 */
export function isAsyncDisposable(obj: any): obj is AsyncDisposable {
  return obj != null && typeof obj[Symbol.asyncDispose] === 'function';
}

/**
 * Safely dispose a resource if it's disposable
 */
export function safeDispose(resource: any): void {
  if (isDisposable(resource)) {
    try {
      resource[Symbol.dispose]();
    } catch (error) {
      console.warn('Error during resource disposal:', error);
    }
  }
}

/**
 * Safely dispose a resource asynchronously if it's async disposable
 */
export async function safeAsyncDispose(resource: any): Promise<void> {
  if (isAsyncDisposable(resource)) {
    try {
      await resource[Symbol.asyncDispose]();
    } catch (error) {
      console.warn('Error during async resource disposal:', error);
    }
  } else if (isDisposable(resource)) {
    // Fallback to sync disposal wrapped in Promise
    try {
      resource[Symbol.dispose]();
    } catch (error) {
      console.warn('Error during resource disposal:', error);
    }
  }
}

/**
 * Stack for tracking disposable resources with LIFO disposal order
 */
export class DisposableStack implements Disposable {
  private readonly resources: Disposable[] = [];
  private disposed = false;

  /**
   * Add a disposable resource to the stack
   */
  use<T extends Disposable>(resource: T): T {
    if (this.disposed) {
      throw new Error('DisposableStack has already been disposed');
    }
    this.resources.push(resource);
    return resource;
  }

  /**
   * Dispose all resources in LIFO order
   */
  [Symbol.dispose](): void {
    if (this.disposed) return;
    
    this.disposed = true;
    const errors: Error[] = [];

    // Dispose in reverse order (LIFO)
    for (let i = this.resources.length - 1; i >= 0; i--) {
      try {
        this.resources[i][Symbol.dispose]();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.resources.length = 0;

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposal errors occurred');
    }
  }

  /**
   * Get number of resources in the stack
   */
  get size(): number {
    return this.resources.length;
  }

  /**
   * Check if the stack has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Stack for tracking async disposable resources with LIFO disposal order
 */
export class AsyncDisposableStack implements AsyncDisposable {
  private readonly resources: (Disposable | AsyncDisposable)[] = [];
  private disposed = false;

  /**
   * Add a disposable or async disposable resource to the stack
   */
  use<T extends Disposable | AsyncDisposable>(resource: T): T {
    if (this.disposed) {
      throw new Error('AsyncDisposableStack has already been disposed');
    }
    this.resources.push(resource);
    return resource;
  }

  /**
   * Dispose all resources in LIFO order
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    const errors: Error[] = [];

    // Dispose in reverse order (LIFO)
    for (let i = this.resources.length - 1; i >= 0; i--) {
      try {
        await safeAsyncDispose(this.resources[i]);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.resources.length = 0;

    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposal errors occurred');
    }
  }

  /**
   * Get number of resources in the stack
   */
  get size(): number {
    return this.resources.length;
  }

  /**
   * Check if the stack has been disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}
