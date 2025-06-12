/**
 * @fileoverview Central event system for the Tari Wallet SDK
 * 
 * This module provides the main event system orchestration, integrating
 * native FFI callbacks with the TypeScript event emitter.
 */

import { TypedWalletEventEmitter } from './event-emitter.js';
import type { 
  WalletEventMap, 
  EventListener, 
  EventSubscription,
  MultiEventSubscription,
  EventHandlerMap,
  EventOptions
} from './event-types.js';

/**
 * Configuration for the event system
 */
export interface EventSystemConfig {
  /** Maximum listeners per event (default: 100) */
  maxListeners?: number;
  /** Enable debug logging for events (default: false) */
  debug?: boolean;
  /** Timeout for async event handlers in ms (default: 30000) */
  handlerTimeout?: number;
}

/**
 * Event system statistics
 */
export interface EventSystemStats {
  /** Total number of active listeners across all events */
  totalListeners: number;
  /** Number of events with active listeners */
  activeEvents: number;
  /** Events with the most listeners */
  topEvents: Array<{ event: string; count: number }>;
  /** Whether FFI callback is registered */
  ffiCallbackRegistered: boolean;
}

/**
 * Central event system managing wallet events and FFI integration
 */
export class WalletEventSystem {
  private emitter: TypedWalletEventEmitter;
  private config: Required<EventSystemConfig>;
  private ffiCallbackRegistered = false;
  private isDisposed = false;

  constructor(config: EventSystemConfig = {}) {
    this.config = {
      maxListeners: config.maxListeners ?? 100,
      debug: config.debug ?? false,
      handlerTimeout: config.handlerTimeout ?? 30000
    };

    this.emitter = new TypedWalletEventEmitter();
    this.emitter.setMaxListeners(this.config.maxListeners);

    if (this.config.debug) {
      this.setupDebugLogging();
    }
  }

  /**
   * Add an event listener
   */
  on<K extends keyof WalletEventMap>(
    event: K,
    listener: EventListener<WalletEventMap[K]>,
    options?: EventOptions
  ): EventSubscription {
    this.checkDisposed();
    
    const subscription = this.emitter.on(event, this.wrapListener(listener), options);
    
    if (this.config.debug) {
      console.debug(`[EventSystem] Added listener for '${String(event)}'`);
    }

    return subscription;
  }

  /**
   * Add a one-time event listener
   */
  once<K extends keyof WalletEventMap>(
    event: K,
    listener: EventListener<WalletEventMap[K]>
  ): EventSubscription {
    this.checkDisposed();
    
    const subscription = this.emitter.once(event, this.wrapListener(listener));
    
    if (this.config.debug) {
      console.debug(`[EventSystem] Added one-time listener for '${String(event)}'`);
    }

    return subscription;
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof WalletEventMap>(
    event: K,
    listener: EventListener<WalletEventMap[K]>
  ): void {
    this.emitter.off(event, listener);
    
    if (this.config.debug) {
      console.debug(`[EventSystem] Removed listener for '${String(event)}'`);
    }
  }

  /**
   * Remove all listeners for an event or all events
   */
  removeAllListeners<K extends keyof WalletEventMap>(event?: K): void {
    this.emitter.removeAllListeners(event);
    
    if (this.config.debug) {
      const eventStr = event ? String(event) : 'all events';
      console.debug(`[EventSystem] Removed all listeners for ${eventStr}`);
    }
  }

  /**
   * Emit an event (internal use - typically called from FFI bridge)
   */
  async emit<K extends keyof WalletEventMap>(
    event: K,
    data: WalletEventMap[K]
  ): Promise<void> {
    this.checkDisposed();
    
    if (this.config.debug) {
      console.debug(`[EventSystem] Emitting '${String(event)}'`, data);
    }

    await this.emitter.emit(event, data);
  }

  /**
   * Subscribe to multiple events at once
   */
  subscribe(handlers: EventHandlerMap): MultiEventSubscription {
    this.checkDisposed();
    
    // Wrap all handlers
    const wrappedHandlers: EventHandlerMap = {};
    for (const [event, handler] of Object.entries(handlers) as Array<[keyof WalletEventMap, EventListener<any>]>) {
      if (handler) {
        wrappedHandlers[event] = this.wrapListener(handler);
      }
    }

    const subscription = this.emitter.subscribe(wrappedHandlers);
    
    if (this.config.debug) {
      console.debug(`[EventSystem] Bulk subscription for ${Object.keys(handlers).length} events`);
    }

    return subscription;
  }

  /**
   * Check if there are listeners for an event
   */
  hasListeners<K extends keyof WalletEventMap>(event: K): boolean {
    return this.emitter.hasListeners(event);
  }

  /**
   * Get the number of listeners for an event
   */
  getListenerCount<K extends keyof WalletEventMap>(event: K): number {
    return this.emitter.getListenerCount(event);
  }

  /**
   * Get all event names that have listeners
   */
  getEventNames(): Array<keyof WalletEventMap> {
    return this.emitter.getEventNames();
  }

  /**
   * Get event system statistics
   */
  getStats(): EventSystemStats {
    const eventNames = this.getEventNames();
    const eventCounts = eventNames.map(event => ({
      event: String(event),
      count: this.getListenerCount(event)
    }));

    return {
      totalListeners: eventCounts.reduce((sum, { count }) => sum + count, 0),
      activeEvents: eventNames.length,
      topEvents: eventCounts.sort((a, b) => b.count - a.count).slice(0, 5),
      ffiCallbackRegistered: this.ffiCallbackRegistered
    };
  }

  /**
   * Mark FFI callback as registered (internal use)
   */
  setFFICallbackRegistered(registered: boolean): void {
    this.ffiCallbackRegistered = registered;
    
    if (this.config.debug) {
      console.debug(`[EventSystem] FFI callback registration: ${registered}`);
    }
  }

  /**
   * Check if FFI callback is registered
   */
  isFFICallbackRegistered(): boolean {
    return this.ffiCallbackRegistered;
  }

  /**
   * Update event system configuration
   */
  updateConfig(config: Partial<EventSystemConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.maxListeners !== undefined) {
      this.emitter.setMaxListeners(config.maxListeners);
    }
    
    if (this.config.debug) {
      console.debug('[EventSystem] Configuration updated', this.config);
    }
  }

  /**
   * Dispose of the event system and cleanup all resources
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.emitter.dispose();
    this.ffiCallbackRegistered = false;
    this.isDisposed = true;
    
    if (this.config.debug) {
      console.debug('[EventSystem] Disposed');
    }
  }

  /**
   * Check if the event system has been disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Wrap listener with timeout and error handling
   */
  private wrapListener<T>(listener: EventListener<T>): EventListener<T> {
    return async (data: T): Promise<void> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Event handler timeout after ${this.config.handlerTimeout}ms`));
        }, this.config.handlerTimeout);
      });

      try {
        // Race between handler execution and timeout
        await Promise.race([
          listener(data),
          timeoutPromise
        ]);
      } catch (error) {
        // Log error if debug enabled
        if (this.config.debug) {
          console.error('[EventSystem] Handler error:', error);
        }
        
        // Re-throw to let emitter handle it
        throw error;
      }
    };
  }

  /**
   * Setup debug logging for all events
   */
  private setupDebugLogging(): void {
    // This could be enhanced to log all events
    console.debug('[EventSystem] Debug logging enabled');
  }

  /**
   * Check if event system is disposed
   */
  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error('EventSystem has been disposed');
    }
  }
}

/**
 * Create a new wallet event system
 */
export function createWalletEventSystem(config?: EventSystemConfig): WalletEventSystem {
  return new WalletEventSystem(config);
}
