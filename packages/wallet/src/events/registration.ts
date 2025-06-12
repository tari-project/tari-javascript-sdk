/**
 * @fileoverview Event registration system for managing FFI callbacks
 * 
 * This module handles the registration and lifecycle management of
 * FFI callbacks, ensuring proper cleanup and state tracking.
 */

import { 
  setWalletEventCallback, 
  removeWalletEventCallback,
  parseFFIEventPayload,
  createSafeEventCallback,
  type FFIEventCallback,
  type FFIEventPayload
} from '@tari-project/tarijs-core/ffi/callbacks';
import type { WalletHandle } from '@tari-project/tarijs-core';
import type { WalletEventSystem } from './event-system.js';

/**
 * Registration state for a wallet
 */
interface RegistrationState {
  walletHandle: WalletHandle;
  isRegistered: boolean;
  ffiCallback?: FFIEventCallback;
  registeredAt?: Date;
  eventCount: number;
  lastEventTime?: Date;
}

/**
 * Event registration configuration
 */
export interface RegistrationConfig {
  /** Enable automatic registration when first listener is added */
  autoRegister?: boolean;
  /** Enable automatic cleanup when last listener is removed */
  autoCleanup?: boolean;
  /** Maximum time to wait for registration (ms) */
  registrationTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Event registration system managing FFI callback lifecycle
 */
export class EventRegistrationManager {
  private registrations = new Map<WalletHandle, RegistrationState>();
  private config: Required<RegistrationConfig>;

  constructor(config: RegistrationConfig = {}) {
    this.config = {
      autoRegister: config.autoRegister ?? true,
      autoCleanup: config.autoCleanup ?? true,
      registrationTimeout: config.registrationTimeout ?? 5000,
      debug: config.debug ?? false
    };
  }

  /**
   * Register FFI callback for a wallet
   */
  async register(
    walletHandle: WalletHandle,
    eventSystem: WalletEventSystem
  ): Promise<void> {
    if (this.isRegistered(walletHandle)) {
      if (this.config.debug) {
        console.debug(`[Registration] Wallet ${walletHandle} already registered`);
      }
      return;
    }

    if (this.config.debug) {
      console.debug(`[Registration] Registering wallet ${walletHandle}`);
    }

    // Create FFI callback that forwards events to the event system
    const ffiCallback = createSafeEventCallback(
      (payloadJson: string) => {
        this.handleFFIEvent(walletHandle, payloadJson, eventSystem);
      },
      (error, payload) => {
        this.handleFFIError(walletHandle, error, payload, eventSystem);
      }
    );

    try {
      // Register with native FFI with timeout
      await this.withTimeout(
        setWalletEventCallback(walletHandle, ffiCallback),
        this.config.registrationTimeout,
        `Registration timeout for wallet ${walletHandle}`
      );

      // Update registration state
      const state: RegistrationState = {
        walletHandle,
        isRegistered: true,
        ffiCallback,
        registeredAt: new Date(),
        eventCount: 0
      };

      this.registrations.set(walletHandle, state);

      if (this.config.debug) {
        console.debug(`[Registration] Successfully registered wallet ${walletHandle}`);
      }

    } catch (error) {
      const message = `Failed to register FFI callback for wallet ${walletHandle}`;
      if (this.config.debug) {
        console.error(`[Registration] ${message}:`, error);
      }
      throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Unregister FFI callback for a wallet
   */
  async unregister(walletHandle: WalletHandle): Promise<void> {
    const state = this.registrations.get(walletHandle);
    if (!state || !state.isRegistered) {
      if (this.config.debug) {
        console.debug(`[Registration] Wallet ${walletHandle} not registered`);
      }
      return;
    }

    if (this.config.debug) {
      console.debug(`[Registration] Unregistering wallet ${walletHandle}`);
    }

    try {
      // Remove from native FFI
      await removeWalletEventCallback(walletHandle);

      // Update state
      state.isRegistered = false;
      state.ffiCallback = undefined;

      if (this.config.debug) {
        console.debug(
          `[Registration] Successfully unregistered wallet ${walletHandle} ` +
          `(processed ${state.eventCount} events)`
        );
      }

    } catch (error) {
      const message = `Failed to unregister FFI callback for wallet ${walletHandle}`;
      if (this.config.debug) {
        console.error(`[Registration] ${message}:`, error);
      }
      throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a wallet is registered
   */
  isRegistered(walletHandle: WalletHandle): boolean {
    const state = this.registrations.get(walletHandle);
    return state?.isRegistered ?? false;
  }

  /**
   * Get registration state for a wallet
   */
  getRegistrationState(walletHandle: WalletHandle): RegistrationState | undefined {
    return this.registrations.get(walletHandle);
  }

  /**
   * Get all registered wallet handles
   */
  getRegisteredWallets(): WalletHandle[] {
    return Array.from(this.registrations.entries())
      .filter(([, state]) => state.isRegistered)
      .map(([handle]) => handle);
  }

  /**
   * Get registration statistics
   */
  getStats() {
    const states = Array.from(this.registrations.values());
    const registered = states.filter(s => s.isRegistered);

    return {
      totalWallets: states.length,
      registeredWallets: registered.length,
      totalEvents: states.reduce((sum, s) => sum + s.eventCount, 0),
      averageEventsPerWallet: registered.length > 0 
        ? registered.reduce((sum, s) => sum + s.eventCount, 0) / registered.length 
        : 0,
      oldestRegistration: registered
        .map(s => s.registeredAt)
        .filter(Boolean)
        .sort()
        .at(0),
      lastEventTime: states
        .map(s => s.lastEventTime)
        .filter(Boolean)
        .sort()
        .at(-1)
    };
  }

  /**
   * Auto-register a wallet if auto-registration is enabled
   */
  async autoRegister(
    walletHandle: WalletHandle,
    eventSystem: WalletEventSystem
  ): Promise<void> {
    if (this.config.autoRegister && !this.isRegistered(walletHandle)) {
      await this.register(walletHandle, eventSystem);
    }
  }

  /**
   * Auto-cleanup a wallet if no listeners remain and auto-cleanup is enabled
   */
  async autoCleanup(
    walletHandle: WalletHandle,
    hasListeners: boolean
  ): Promise<void> {
    if (this.config.autoCleanup && !hasListeners && this.isRegistered(walletHandle)) {
      await this.unregister(walletHandle);
    }
  }

  /**
   * Cleanup all registrations
   */
  async dispose(): Promise<void> {
    const wallets = this.getRegisteredWallets();
    
    if (this.config.debug) {
      console.debug(`[Registration] Disposing ${wallets.length} registrations`);
    }

    // Unregister all wallets
    const promises = wallets.map(handle => 
      this.unregister(handle).catch(error => {
        if (this.config.debug) {
          console.error(`[Registration] Error disposing wallet ${handle}:`, error);
        }
      })
    );

    await Promise.allSettled(promises);
    this.registrations.clear();

    if (this.config.debug) {
      console.debug('[Registration] Disposal complete');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RegistrationConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.debug) {
      console.debug('[Registration] Configuration updated', this.config);
    }
  }

  /**
   * Handle incoming FFI event
   */
  private async handleFFIEvent(
    walletHandle: WalletHandle,
    payloadJson: string,
    eventSystem: WalletEventSystem
  ): Promise<void> {
    try {
      // Parse the event payload
      const payload = parseFFIEventPayload(payloadJson);
      
      // Validate wallet handle matches
      if (payload.wallet_handle !== walletHandle) {
        console.warn(
          `[Registration] Wallet handle mismatch: expected ${walletHandle}, ` +
          `got ${payload.wallet_handle}`
        );
        return;
      }

      // Update event statistics
      const state = this.registrations.get(walletHandle);
      if (state) {
        state.eventCount++;
        state.lastEventTime = new Date();
      }

      if (this.config.debug) {
        console.debug(
          `[Registration] Received event '${payload.event_type}' for wallet ${walletHandle}`
        );
      }

      // Forward to event system for type-safe emission
      await eventSystem.emit(payload.event_type as any, payload.data as any);

    } catch (error) {
      const errorMsg = `Failed to process FFI event for wallet ${walletHandle}`;
      if (this.config.debug) {
        console.error(`[Registration] ${errorMsg}:`, error);
      }

      // Emit error event through event system
      try {
        await eventSystem.emit('error', {
          error: error instanceof Error ? error : new Error(String(error)),
          event: 'ffi_event_processing',
          data: { payloadJson, walletHandle },
          timestamp: new Date(),
          context: { source: 'event_registration' }
        });
      } catch (emitError) {
        console.error('[Registration] Failed to emit error event:', emitError);
      }
    }
  }

  /**
   * Handle FFI callback errors
   */
  private async handleFFIError(
    walletHandle: WalletHandle,
    error: Error,
    payload: string | undefined,
    eventSystem: WalletEventSystem
  ): Promise<void> {
    if (this.config.debug) {
      console.error(`[Registration] FFI callback error for wallet ${walletHandle}:`, error);
    }

    try {
      await eventSystem.emit('error', {
        error,
        event: 'ffi_callback_error',
        data: { payload, walletHandle },
        timestamp: new Date(),
        context: { source: 'event_registration' }
      });
    } catch (emitError) {
      console.error('[Registration] Failed to emit FFI error event:', emitError);
    }
  }

  /**
   * Add timeout to a promise
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  }
}

/**
 * Create a new event registration manager
 */
export function createEventRegistrationManager(
  config?: RegistrationConfig
): EventRegistrationManager {
  return new EventRegistrationManager(config);
}
