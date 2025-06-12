/**
 * @fileoverview Wallet lifecycle management and resource cleanup
 * 
 * Provides comprehensive lifecycle management for wallet instances including
 * initialization hooks, cleanup procedures, and resource disposal patterns.
 */

import { 
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity,
  type WalletHandle
} from '@tari-project/tarijs-core';
import { WalletState, type WalletStateManager } from './wallet-state.js';

/**
 * Lifecycle event types
 */
export enum LifecycleEvent {
  BeforeInit = 'before_init',
  AfterInit = 'after_init',
  BeforeDestroy = 'before_destroy',
  AfterDestroy = 'after_destroy',
  OnError = 'on_error',
  OnStateChange = 'on_state_change'
}

/**
 * Lifecycle event handler
 */
export type LifecycleEventHandler<T = any> = (event: LifecycleEventData<T>) => void | Promise<void>;

/**
 * Lifecycle event data
 */
export interface LifecycleEventData<T = any> {
  event: LifecycleEvent;
  walletId: string;
  timestamp: Date;
  data?: T;
  error?: Error;
}

/**
 * Resource cleanup function
 */
export type CleanupFunction = () => Promise<void> | void;

/**
 * Lifecycle hooks for wallet operations
 */
export interface LifecycleHooks {
  beforeInit?: LifecycleEventHandler;
  afterInit?: LifecycleEventHandler;
  beforeDestroy?: LifecycleEventHandler;
  afterDestroy?: LifecycleEventHandler;
  onError?: LifecycleEventHandler<Error>;
  onStateChange?: LifecycleEventHandler<{ from: WalletState; to: WalletState }>;
}

/**
 * Wallet lifecycle manager with hooks and cleanup tracking
 */
export class WalletLifecycleManager {
  private readonly walletId: string;
  private readonly stateManager: WalletStateManager;
  private readonly hooks: LifecycleHooks;
  private readonly cleanupFunctions: CleanupFunction[] = [];
  private readonly resources: Set<any> = new Set();
  
  private initialized = false;
  private destroyed = false;

  constructor(
    walletId: string,
    stateManager: WalletStateManager,
    hooks: LifecycleHooks = {}
  ) {
    this.walletId = walletId;
    this.stateManager = stateManager;
    this.hooks = hooks;
  }

  /**
   * Initialize the wallet lifecycle
   */
  async initialize(handle: WalletHandle): Promise<void> {
    if (this.initialized) {
      throw new WalletError(
        WalletErrorCode.WalletExists,
        'Wallet lifecycle already initialized'
      );
    }

    if (this.destroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Cannot initialize destroyed wallet lifecycle'
      );
    }

    try {
      // Fire before init hook
      await this.fireHook('beforeInit');

      // Register the main wallet handle as a resource
      this.addResource(handle);

      // Mark as initialized
      this.initialized = true;
      this.stateManager.transition(WalletState.Ready, 'Lifecycle initialized');

      // Fire after init hook
      await this.fireHook('afterInit');

    } catch (error) {
      this.stateManager.setError(error as Error, 'Initialization failed');
      await this.fireHook('onError', error as Error);
      throw error;
    }
  }

  /**
   * Destroy the wallet and clean up all resources
   */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return; // Already destroyed
    }

    try {
      // Transition to destroying state
      this.stateManager.transition(WalletState.Destroying, 'Starting cleanup');

      // Fire before destroy hook
      await this.fireHook('beforeDestroy');

      // Run all cleanup functions in reverse order
      const cleanupPromises: Promise<void>[] = [];
      
      for (let i = this.cleanupFunctions.length - 1; i >= 0; i--) {
        const cleanup = this.cleanupFunctions[i];
        cleanupPromises.push(
          Promise.resolve(cleanup()).catch(error => {
            console.warn(`Cleanup function ${i} failed:`, error);
          })
        );
      }

      // Wait for all cleanup to complete
      await Promise.allSettled(cleanupPromises);

      // Clear all resources
      this.resources.clear();
      this.cleanupFunctions.length = 0;

      // Mark as destroyed
      this.destroyed = true;
      this.stateManager.transition(WalletState.Destroyed, 'Cleanup completed');

      // Fire after destroy hook
      await this.fireHook('afterDestroy');

    } catch (error) {
      this.stateManager.setError(error as Error, 'Destruction failed');
      await this.fireHook('onError', error as Error);
      throw error;
    }
  }

  /**
   * Add a resource to be tracked for cleanup
   */
  addResource(resource: any): void {
    if (this.destroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Cannot add resources to destroyed wallet'
      );
    }

    this.resources.add(resource);
  }

  /**
   * Remove a resource from tracking
   */
  removeResource(resource: any): void {
    this.resources.delete(resource);
  }

  /**
   * Add a cleanup function to be called during destruction
   */
  addCleanup(cleanup: CleanupFunction): void {
    if (this.destroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Cannot add cleanup functions to destroyed wallet'
      );
    }

    this.cleanupFunctions.push(cleanup);
  }

  /**
   * Check if the lifecycle is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if the lifecycle is destroyed
   */
  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get the number of tracked resources
   */
  get resourceCount(): number {
    return this.resources.size;
  }

  /**
   * Get the number of cleanup functions
   */
  get cleanupCount(): number {
    return this.cleanupFunctions.length;
  }

  /**
   * Get lifecycle statistics
   */
  getStats(): LifecycleStats {
    return {
      walletId: this.walletId,
      initialized: this.initialized,
      destroyed: this.destroyed,
      resourceCount: this.resourceCount,
      cleanupCount: this.cleanupCount,
      stateStats: this.stateManager.getStats()
    };
  }

  // Private methods

  private async fireHook(hookName: keyof LifecycleHooks, data?: any): Promise<void> {
    const handler = this.hooks[hookName];
    if (!handler) return;

    try {
      const eventData: LifecycleEventData = {
        event: this.hookNameToEvent(hookName),
        walletId: this.walletId,
        timestamp: new Date(),
        data,
        error: data instanceof Error ? data : undefined
      };

      await handler(eventData);
    } catch (error) {
      console.warn(`Lifecycle hook '${hookName}' failed:`, error);
      // Don't throw from hook failures to avoid cascading errors
    }
  }

  private hookNameToEvent(hookName: keyof LifecycleHooks): LifecycleEvent {
    switch (hookName) {
      case 'beforeInit': return LifecycleEvent.BeforeInit;
      case 'afterInit': return LifecycleEvent.AfterInit;
      case 'beforeDestroy': return LifecycleEvent.BeforeDestroy;
      case 'afterDestroy': return LifecycleEvent.AfterDestroy;
      case 'onError': return LifecycleEvent.OnError;
      case 'onStateChange': return LifecycleEvent.OnStateChange;
      default: throw new Error(`Unknown hook name: ${hookName}`);
    }
  }
}

/**
 * Lifecycle statistics
 */
export interface LifecycleStats {
  walletId: string;
  initialized: boolean;
  destroyed: boolean;
  resourceCount: number;
  cleanupCount: number;
  stateStats: any; // WalletStateStats from wallet-state.ts
}

/**
 * Resource disposal utility for TypeScript 5.2+ using Symbol.dispose
 */
export class DisposableWalletResource implements Disposable {
  constructor(
    private readonly resource: any,
    private readonly cleanup: CleanupFunction
  ) {}

  [Symbol.dispose](): void {
    Promise.resolve(this.cleanup()).catch(error => {
      console.warn('Resource disposal failed:', error);
    });
  }
}

/**
 * Async resource disposal utility for TypeScript 5.2+ using Symbol.asyncDispose
 */
export class AsyncDisposableWalletResource implements AsyncDisposable {
  constructor(
    private readonly resource: any,
    private readonly cleanup: CleanupFunction
  ) {}

  async [Symbol.asyncDispose](): Promise<void> {
    await this.cleanup();
  }
}

/**
 * Create a disposable resource wrapper
 */
export function createDisposableResource<T extends object>(
  resource: T,
  cleanup: CleanupFunction
): T & Disposable {
  const disposable = new DisposableWalletResource(resource, cleanup);
  return Object.assign(resource, {
    [Symbol.dispose]: disposable[Symbol.dispose].bind(disposable)
  });
}

/**
 * Create an async disposable resource wrapper
 */
export function createAsyncDisposableResource<T extends object>(
  resource: T,
  cleanup: CleanupFunction
): T & AsyncDisposable {
  const disposable = new AsyncDisposableWalletResource(resource, cleanup);
  return Object.assign(resource, {
    [Symbol.asyncDispose]: disposable[Symbol.asyncDispose].bind(disposable)
  });
}

/**
 * Utility function for automatic resource cleanup with using statement
 */
export function withResource<T, R>(
  resource: T & (Disposable | AsyncDisposable),
  operation: (resource: T) => Promise<R>
): Promise<R> {
  return operation(resource);
}
