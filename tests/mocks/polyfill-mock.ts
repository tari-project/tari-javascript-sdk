/**
 * Mock polyfills for missing APIs during testing
 * Provides fallback implementations for browser/runtime APIs
 */

// Mock Disposable interface for resource management
export interface Disposable {
  dispose(): void;
}

// Mock AsyncDisposable interface for async resource management
export interface AsyncDisposable {
  dispose(): Promise<void>;
}

// Mock DisposableStack for managing multiple disposables
export class DisposableStack implements Disposable {
  private disposed = false;
  private resources: Array<Disposable | AsyncDisposable> = [];

  add<T extends Disposable | AsyncDisposable>(resource: T): T {
    if (this.disposed) {
      throw new Error('DisposableStack has been disposed');
    }
    this.resources.push(resource);
    return resource;
  }

  dispose(): void {
    if (this.disposed) return;
    
    this.disposed = true;
    
    // Dispose all resources in reverse order
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const resource = this.resources[i];
      try {
        if ('dispose' in resource && typeof resource.dispose === 'function') {
          resource.dispose();
        }
      } catch (error) {
        // Log error but continue disposing other resources
        console.warn('Error disposing resource:', error);
      }
    }
    
    this.resources.length = 0;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

// Mock AsyncDisposableStack for managing async disposables
export class AsyncDisposableStack implements AsyncDisposable {
  private disposed = false;
  private resources: Array<Disposable | AsyncDisposable> = [];

  add<T extends Disposable | AsyncDisposable>(resource: T): T {
    if (this.disposed) {
      throw new Error('AsyncDisposableStack has been disposed');
    }
    this.resources.push(resource);
    return resource;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    
    this.disposed = true;
    
    // Dispose all resources in reverse order
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const resource = this.resources[i];
      try {
        if ('dispose' in resource && typeof resource.dispose === 'function') {
          await resource.dispose();
        }
      } catch (error) {
        // Log error but continue disposing other resources
        console.warn('Error disposing resource:', error);
      }
    }
    
    this.resources.length = 0;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

// Mock using() function for automatic resource management
export function using<T extends Disposable>(resource: T, fn: (resource: T) => void): void;
export function using<T extends Disposable>(resource: T, fn: (resource: T) => Promise<void>): Promise<void>;
export function using<T extends Disposable>(
  resource: T, 
  fn: (resource: T) => void | Promise<void>
): void | Promise<void> {
  try {
    const result = fn(resource);
    
    if (result && typeof result.then === 'function') {
      // Handle async case
      return result.finally(() => {
        if (resource && typeof resource.dispose === 'function') {
          resource.dispose();
        }
      });
    } else {
      // Handle sync case
      if (resource && typeof resource.dispose === 'function') {
        resource.dispose();
      }
      return result;
    }
  } catch (error) {
    // Ensure disposal even on error
    if (resource && typeof resource.dispose === 'function') {
      resource.dispose();
    }
    throw error;
  }
}

// Mock usingAsync() function for async resource management
export async function usingAsync<T extends AsyncDisposable>(
  resource: T, 
  fn: (resource: T) => Promise<void>
): Promise<void> {
  try {
    await fn(resource);
  } finally {
    if (resource && typeof resource.dispose === 'function') {
      await resource.dispose();
    }
  }
}

// Export all mock implementations
export {
  Disposable,
  AsyncDisposable,
  DisposableStack,
  AsyncDisposableStack,
  using,
  usingAsync,
};

// Default export for convenience
export default {
  Disposable,
  AsyncDisposable,
  DisposableStack,
  AsyncDisposableStack,
  using,
  usingAsync,
};
