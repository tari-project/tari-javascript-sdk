/**
 * @fileoverview Callback lifecycle manager for wallet events
 * 
 * This module provides centralized management of callback registration
 * tied to wallet lifecycle, ensuring proper resource cleanup.
 */

import type { WalletHandle } from '@tari-project/tarijs-core';
import { EventRegistrationManager, type RegistrationConfig } from './registration.js';
import type { WalletEventSystem } from './event-system.js';

/**
 * Callback manager state
 */
export interface CallbackManagerState {
  isActive: boolean;
  registeredWallets: number;
  totalEvents: number;
  lastActivity?: Date;
}

/**
 * Callback manager configuration
 */
export interface CallbackManagerConfig extends RegistrationConfig {
  /** Enable health monitoring */
  healthMonitoring?: boolean;
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Maximum idle time before warning (ms) */
  maxIdleTime?: number;
}

/**
 * Central callback manager coordinating FFI registration with wallet lifecycle
 */
export class CallbackManager {
  private registrationManager: EventRegistrationManager;
  private eventSystems = new Map<WalletHandle, WalletEventSystem>();
  private config: Required<CallbackManagerConfig>;
  private healthTimer?: NodeJS.Timeout;
  private isDisposed = false;

  constructor(config: CallbackManagerConfig = {}) {
    this.config = {
      autoRegister: config.autoRegister ?? true,
      autoCleanup: config.autoCleanup ?? true,
      registrationTimeout: config.registrationTimeout ?? 5000,
      debug: config.debug ?? false,
      healthMonitoring: config.healthMonitoring ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
      maxIdleTime: config.maxIdleTime ?? 300000 // 5 minutes
    };

    this.registrationManager = new EventRegistrationManager({
      autoRegister: this.config.autoRegister,
      autoCleanup: this.config.autoCleanup,
      registrationTimeout: this.config.registrationTimeout,
      debug: this.config.debug
    });

    if (this.config.healthMonitoring) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Register a wallet with its event system
   */
  async registerWallet(
    walletHandle: WalletHandle,
    eventSystem: WalletEventSystem
  ): Promise<void> {
    this.checkDisposed();

    if (this.config.debug) {
      console.debug(`[CallbackManager] Registering wallet ${walletHandle}`);
    }

    // Store event system reference
    this.eventSystems.set(walletHandle, eventSystem);

    try {
      // Register FFI callback
      await this.registrationManager.register(walletHandle, eventSystem);

      // Mark FFI callback as registered in event system
      eventSystem.setFFICallbackRegistered(true);

      if (this.config.debug) {
        console.debug(`[CallbackManager] Successfully registered wallet ${walletHandle}`);
      }

    } catch (error: unknown) {
      // Cleanup on failure
      this.eventSystems.delete(walletHandle);
      eventSystem.setFFICallbackRegistered(false);
      throw error;
    }
  }

  /**
   * Unregister a wallet and cleanup resources
   */
  async unregisterWallet(walletHandle: WalletHandle): Promise<void> {
    this.checkDisposed();

    if (this.config.debug) {
      console.debug(`[CallbackManager] Unregistering wallet ${walletHandle}`);
    }

    const eventSystem = this.eventSystems.get(walletHandle);

    try {
      // Unregister FFI callback
      await this.registrationManager.unregister(walletHandle);

      // Update event system state
      if (eventSystem) {
        eventSystem.setFFICallbackRegistered(false);
      }

      if (this.config.debug) {
        console.debug(`[CallbackManager] Successfully unregistered wallet ${walletHandle}`);
      }

    } catch (error: unknown) {
      if (this.config.debug) {
        console.error(`[CallbackManager] Error unregistering wallet ${walletHandle}:`, error);
      }
      throw error;

    } finally {
      // Always cleanup local references
      this.eventSystems.delete(walletHandle);
    }
  }

  /**
   * Check if a wallet is registered
   */
  isWalletRegistered(walletHandle: WalletHandle): boolean {
    return this.registrationManager.isRegistered(walletHandle);
  }

  /**
   * Get event system for a wallet
   */
  getEventSystem(walletHandle: WalletHandle): WalletEventSystem | undefined {
    return this.eventSystems.get(walletHandle);
  }

  /**
   * Get all registered wallet handles
   */
  getRegisteredWallets(): WalletHandle[] {
    return this.registrationManager.getRegisteredWallets();
  }

  /**
   * Auto-register wallet if needed (when first listener is added)
   */
  async ensureWalletRegistered(
    walletHandle: WalletHandle,
    eventSystem: WalletEventSystem
  ): Promise<void> {
    if (!this.isWalletRegistered(walletHandle)) {
      if (this.config.autoRegister) {
        await this.registerWallet(walletHandle, eventSystem);
      } else {
        throw new Error(
          `Wallet ${walletHandle} is not registered and auto-registration is disabled`
        );
      }
    }
  }

  /**
   * Auto-cleanup wallet if no listeners remain
   */
  async maybeCleanupWallet(
    walletHandle: WalletHandle,
    hasListeners: boolean
  ): Promise<void> {
    if (this.config.autoCleanup && !hasListeners && this.isWalletRegistered(walletHandle)) {
      await this.unregisterWallet(walletHandle);
    }
  }

  /**
   * Get callback manager state
   */
  getState(): CallbackManagerState {
    const stats = this.registrationManager.getStats();
    
    return {
      isActive: !this.isDisposed,
      registeredWallets: stats.registeredWallets,
      totalEvents: stats.totalEvents,
      lastActivity: stats.lastEventTime
    };
  }

  /**
   * Get detailed statistics
   */
  getDetailedStats() {
    const registrationStats = this.registrationManager.getStats();
    const eventSystemStats = Array.from(this.eventSystems.entries()).map(([handle, system]) => ({
      walletHandle: handle,
      ...system.getStats()
    }));

    return {
      registration: registrationStats,
      eventSystems: eventSystemStats,
      manager: this.getState()
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CallbackManagerConfig>): void {
    this.config = { ...this.config, ...config };

    // Update registration manager config
    this.registrationManager.updateConfig({
      autoRegister: this.config.autoRegister,
      autoCleanup: this.config.autoCleanup,
      registrationTimeout: this.config.registrationTimeout,
      debug: this.config.debug
    });

    // Update health monitoring
    if (this.config.healthMonitoring && !this.healthTimer) {
      this.startHealthMonitoring();
    } else if (!this.config.healthMonitoring && this.healthTimer) {
      this.stopHealthMonitoring();
    }

    if (this.config.debug) {
      console.debug('[CallbackManager] Configuration updated', this.config);
    }
  }

  /**
   * Perform health check on all registrations
   */
  performHealthCheck(): {
    healthy: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const state = this.getState();

    // Check if disposed
    if (this.isDisposed) {
      errors.push('CallbackManager has been disposed');
      return { healthy: false, warnings, errors };
    }

    // Check for idle time
    if (state.lastActivity && this.config.maxIdleTime > 0) {
      const idleTime = Date.now() - state.lastActivity.getTime();
      if (idleTime > this.config.maxIdleTime) {
        warnings.push(`No event activity for ${Math.round(idleTime / 1000)}s`);
      }
    }

    // Check registration consistency
    const registeredCount = this.getRegisteredWallets().length;
    const eventSystemCount = this.eventSystems.size;
    
    if (registeredCount !== eventSystemCount) {
      errors.push(
        `Registration mismatch: ${registeredCount} registered, ${eventSystemCount} event systems`
      );
    }

    // Check event system health
    for (const [handle, system] of this.eventSystems) {
      if (system.disposed) {
        errors.push(`Event system for wallet ${handle} is disposed`);
      }
      
      if (!system.isFFICallbackRegistered()) {
        warnings.push(`FFI callback not registered for wallet ${handle}`);
      }
    }

    const healthy = errors.length === 0;

    if (this.config.debug && (!healthy || warnings.length > 0)) {
      console.debug('[CallbackManager] Health check results:', { healthy, warnings, errors });
    }

    return { healthy, warnings, errors };
  }

  /**
   * Dispose of the callback manager and cleanup all resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) return;

    if (this.config.debug) {
      console.debug('[CallbackManager] Disposing...');
    }

    this.isDisposed = true;

    // Stop health monitoring
    this.stopHealthMonitoring();

    // Dispose registration manager
    await this.registrationManager.dispose();

    // Clear event system references
    this.eventSystems.clear();

    if (this.config.debug) {
      console.debug('[CallbackManager] Disposed');
    }
  }

  /**
   * Check if manager is disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthTimer) return;

    this.healthTimer = setInterval(() => {
      if (!this.isDisposed) {
        this.performHealthCheck();
      }
    }, this.config.healthCheckInterval);

    if (this.config.debug) {
      console.debug(
        `[CallbackManager] Health monitoring started (interval: ${this.config.healthCheckInterval}ms)`
      );
    }
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;

      if (this.config.debug) {
        console.debug('[CallbackManager] Health monitoring stopped');
      }
    }
  }

  /**
   * Check if manager is disposed
   */
  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error('CallbackManager has been disposed');
    }
  }
}

/**
 * Create a new callback manager
 */
export function createCallbackManager(config?: CallbackManagerConfig): CallbackManager {
  return new CallbackManager(config);
}
