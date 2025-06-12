/**
 * @fileoverview Event system lifecycle management
 * 
 * This module manages the lifecycle of event systems tied to wallet instances,
 * ensuring proper initialization, cleanup, and resource management.
 */

import type { WalletHandle } from '@tari-project/tarijs-core';
import { WalletEventSystem, type EventSystemConfig } from './event-system.js';
import { CallbackManager, type CallbackManagerConfig } from './callback-manager.js';

/**
 * Lifecycle hook for event system operations
 */
export interface LifecycleHook {
  /** Called when event system is created */
  onCreate?: (walletHandle: WalletHandle, eventSystem: WalletEventSystem) => void | Promise<void>;
  /** Called when event system is started */
  onStart?: (walletHandle: WalletHandle, eventSystem: WalletEventSystem) => void | Promise<void>;
  /** Called when event system is stopped */
  onStop?: (walletHandle: WalletHandle, eventSystem: WalletEventSystem) => void | Promise<void>;
  /** Called when event system is destroyed */
  onDestroy?: (walletHandle: WalletHandle) => void | Promise<void>;
  /** Called on event system errors */
  onError?: (walletHandle: WalletHandle, error: Error) => void | Promise<void>;
}

/**
 * Event system lifecycle configuration
 */
export interface LifecycleConfig {
  /** Event system configuration */
  eventSystem?: EventSystemConfig;
  /** Callback manager configuration */
  callbackManager?: CallbackManagerConfig;
  /** Lifecycle hooks */
  hooks?: LifecycleHook;
  /** Enable automatic cleanup on process exit */
  autoCleanupOnExit?: boolean;
  /** Cleanup timeout in ms */
  cleanupTimeout?: number;
}

/**
 * Event system lifecycle manager
 */
export class EventSystemLifecycleManager {
  private eventSystems = new Map<WalletHandle, WalletEventSystem>();
  private callbackManager: CallbackManager;
  private config: Required<LifecycleConfig>;
  private exitHandlerRegistered = false;
  private isDisposed = false;

  constructor(config: LifecycleConfig = {}) {
    this.config = {
      eventSystem: config.eventSystem ?? {},
      callbackManager: config.callbackManager ?? {},
      hooks: config.hooks ?? {},
      autoCleanupOnExit: config.autoCleanupOnExit ?? true,
      cleanupTimeout: config.cleanupTimeout ?? 10000
    };

    this.callbackManager = new CallbackManager(this.config.callbackManager);

    if (this.config.autoCleanupOnExit) {
      this.registerExitHandler();
    }
  }

  /**
   * Create and start event system for a wallet
   */
  async createEventSystem(walletHandle: WalletHandle): Promise<WalletEventSystem> {
    this.checkDisposed();

    if (this.eventSystems.has(walletHandle)) {
      throw new Error(`Event system already exists for wallet ${walletHandle}`);
    }

    try {
      // Create event system
      const eventSystem = new WalletEventSystem(this.config.eventSystem);
      
      // Call onCreate hook
      await this.callHook('onCreate', walletHandle, eventSystem);

      // Store event system
      this.eventSystems.set(walletHandle, eventSystem);

      // Register with callback manager
      await this.callbackManager.registerWallet(walletHandle, eventSystem);

      // Call onStart hook
      await this.callHook('onStart', walletHandle, eventSystem);

      return eventSystem;

    } catch (error: unknown) {
      // Cleanup on failure
      this.eventSystems.delete(walletHandle);
      
      await this.callHook('onError', walletHandle, 
        error instanceof Error ? error : new Error(String(error))
      );

      throw error;
    }
  }

  /**
   * Get existing event system for a wallet
   */
  getEventSystem(walletHandle: WalletHandle): WalletEventSystem | undefined {
    return this.eventSystems.get(walletHandle);
  }

  /**
   * Stop and destroy event system for a wallet
   */
  async destroyEventSystem(walletHandle: WalletHandle): Promise<void> {
    this.checkDisposed();

    const eventSystem = this.eventSystems.get(walletHandle);
    if (!eventSystem) {
      return; // Already destroyed or never created
    }

    try {
      // Call onStop hook
      await this.callHook('onStop', walletHandle, eventSystem);

      // Unregister from callback manager
      await this.callbackManager.unregisterWallet(walletHandle);

      // Dispose event system
      eventSystem.dispose();

      // Remove from tracking
      this.eventSystems.delete(walletHandle);

      // Call onDestroy hook
      await this.callHook('onDestroy', walletHandle);

    } catch (error: unknown) {
      await this.callHook('onError', walletHandle,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Get or create event system for a wallet
   */
  async getOrCreateEventSystem(walletHandle: WalletHandle): Promise<WalletEventSystem> {
    let eventSystem = this.getEventSystem(walletHandle);
    
    if (!eventSystem) {
      eventSystem = await this.createEventSystem(walletHandle);
    }
    
    return eventSystem;
  }

  /**
   * Get all managed wallet handles
   */
  getManagedWallets(): WalletHandle[] {
    return Array.from(this.eventSystems.keys());
  }

  /**
   * Check if wallet has an active event system
   */
  hasEventSystem(walletHandle: WalletHandle): boolean {
    const eventSystem = this.eventSystems.get(walletHandle);
    return eventSystem ? !eventSystem.disposed : false;
  }

  /**
   * Get lifecycle manager statistics
   */
  getStats() {
    const managedWallets = this.getManagedWallets();
    const callbackStats = this.callbackManager.getDetailedStats();
    
    return {
      managedWallets: managedWallets.length,
      activeEventSystems: managedWallets.filter(h => this.hasEventSystem(h)).length,
      isDisposed: this.isDisposed,
      callbackManager: callbackStats
    };
  }

  /**
   * Perform health check on all managed systems
   */
  performHealthCheck(): {
    healthy: boolean;
    walletChecks: Array<{
      walletHandle: WalletHandle;
      healthy: boolean;
      issues: string[];
    }>;
    managerHealth: ReturnType<CallbackManager['performHealthCheck']>;
  } {
    const walletChecks = this.getManagedWallets().map(walletHandle => {
      const issues: string[] = [];
      const eventSystem = this.eventSystems.get(walletHandle);

      if (!eventSystem) {
        issues.push('Event system not found');
      } else if (eventSystem.disposed) {
        issues.push('Event system is disposed');
      } else if (!eventSystem.isFFICallbackRegistered()) {
        issues.push('FFI callback not registered');
      }

      return {
        walletHandle,
        healthy: issues.length === 0,
        issues
      };
    });

    const managerHealth = this.callbackManager.performHealthCheck();
    const healthy = walletChecks.every(check => check.healthy) && managerHealth.healthy;

    return {
      healthy,
      walletChecks,
      managerHealth
    };
  }

  /**
   * Update lifecycle configuration
   */
  updateConfig(config: Partial<LifecycleConfig>): void {
    this.config = { ...this.config, ...config };

    // Update callback manager config
    if (config.callbackManager) {
      this.callbackManager.updateConfig(config.callbackManager);
    }

    // Update event system configs
    if (config.eventSystem) {
      for (const eventSystem of this.eventSystems.values()) {
        eventSystem.updateConfig(config.eventSystem);
      }
    }
  }

  /**
   * Dispose of the lifecycle manager and all managed systems
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) return;

    this.isDisposed = true;

    // Destroy all event systems with timeout
    const destroyPromises = this.getManagedWallets().map(walletHandle =>
      this.destroyEventSystem(walletHandle).catch(error => {
        console.error(`Error destroying event system for wallet ${walletHandle}:`, error);
      })
    );

    try {
      await Promise.race([
        Promise.allSettled(destroyPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Cleanup timeout')), this.config.cleanupTimeout)
        )
      ]);
    } catch (error: unknown) {
      console.error('Lifecycle cleanup timeout or error:', error);
    }

    // Dispose callback manager
    await this.callbackManager.dispose();

    // Clear event systems map
    this.eventSystems.clear();
  }

  /**
   * Check if lifecycle manager is disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Call a lifecycle hook safely
   */
  private async callHook(
    hookName: keyof LifecycleHook,
    walletHandle: WalletHandle,
    eventSystemOrError?: WalletEventSystem | Error
  ): Promise<void> {
    const hook = this.config.hooks[hookName];
    if (!hook) return;

    try {
      if (hookName === 'onError' && eventSystemOrError instanceof Error) {
        await (hook as LifecycleHook['onError'])?.(walletHandle, eventSystemOrError);
      } else if (hookName === 'onDestroy') {
        await (hook as LifecycleHook['onDestroy'])?.(walletHandle);
      } else if (eventSystemOrError instanceof WalletEventSystem) {
        await (hook as LifecycleHook['onCreate'])?.(walletHandle, eventSystemOrError);
      }
    } catch (error: unknown) {
      console.error(`Error in lifecycle hook '${hookName}':`, error);
    }
  }

  /**
   * Register process exit handler for cleanup
   */
  private registerExitHandler(): void {
    if (this.exitHandlerRegistered) return;

    const cleanup = () => {
      if (!this.isDisposed) {
        console.log('Cleaning up event systems...');
        this.dispose().catch(error => {
          console.error('Error during exit cleanup:', error);
        });
      }
    };

    // Register cleanup handlers
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      cleanup();
    });

    this.exitHandlerRegistered = true;
  }

  /**
   * Check if lifecycle manager is disposed
   */
  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error('EventSystemLifecycleManager has been disposed');
    }
  }
}

/**
 * Create a new event system lifecycle manager
 */
export function createEventSystemLifecycleManager(
  config?: LifecycleConfig
): EventSystemLifecycleManager {
  return new EventSystemLifecycleManager(config);
}

/**
 * Global lifecycle manager instance (singleton pattern)
 */
let globalLifecycleManager: EventSystemLifecycleManager | undefined;

/**
 * Get or create global lifecycle manager
 */
export function getGlobalLifecycleManager(
  config?: LifecycleConfig
): EventSystemLifecycleManager {
  if (!globalLifecycleManager) {
    globalLifecycleManager = createEventSystemLifecycleManager(config);
  }
  return globalLifecycleManager;
}

/**
 * Reset global lifecycle manager (for testing)
 */
export function resetGlobalLifecycleManager(): void {
  if (globalLifecycleManager) {
    globalLifecycleManager.dispose().catch(console.error);
    globalLifecycleManager = undefined;
  }
}
