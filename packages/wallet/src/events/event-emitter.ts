/**
 * @fileoverview TypeScript-first event emitter for the Tari Wallet SDK
 * 
 * This module provides a custom event emitter with strong TypeScript typing,
 * memory leak prevention, and native FFI callback integration support.
 */

import type { 
  WalletEventMap, 
  EventListener, 
  EventSubscription, 
  MultiEventSubscription,
  EventHandlerMap,
  EventOptions
} from './event-types.js';

/**
 * Internal subscription tracker
 */
interface InternalSubscription<T = unknown> {
  listener: EventListener<T>;
  options?: EventOptions;
  isActive: boolean;
  lastCalled?: number;
  debounceTimer?: NodeJS.Timeout;
}

/**
 * Subscription implementation
 */
class SubscriptionImpl implements EventSubscription {
  constructor(
    private emitter: TypedWalletEventEmitter,
    private event: keyof WalletEventMap,
    private listener: EventListener<any>
  ) {}

  unsubscribe(): void {
    this.emitter.off(this.event, this.listener);
  }

  isActive(): boolean {
    return this.emitter.hasListener(this.event, this.listener);
  }
}

/**
 * Multi-event subscription implementation
 */
class MultiSubscriptionImpl implements MultiEventSubscription {
  private subscriptions: EventSubscription[] = [];

  constructor(subscriptions: EventSubscription[]) {
    this.subscriptions = subscriptions;
  }

  unsubscribe(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  isActive(): boolean {
    return this.subscriptions.some(sub => sub.isActive());
  }

  getActiveCount(): number {
    return this.subscriptions.filter(sub => sub.isActive()).length;
  }
}

/**
 * Type-safe wallet event emitter with memory leak prevention and native integration support
 */
export class TypedWalletEventEmitter {
  private listeners = new Map<keyof WalletEventMap, Set<InternalSubscription>>();
  private isDisposed = false;
  private maxListeners = 100; // Memory leak prevention

  /**
   * Add an event listener for the specified event
   */
  on<K extends keyof WalletEventMap>(
    event: K,
    listener: EventListener<WalletEventMap[K]>,
    options?: EventOptions
  ): EventSubscription {
    this.checkDisposed();
    this.checkMaxListeners(event);

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const subscription: InternalSubscription<WalletEventMap[K]> = {
      listener,
      options,
      isActive: true
    };

    this.listeners.get(event)!.add(subscription);

    return new SubscriptionImpl(this, event, listener);
  }

  /**
   * Add a one-time event listener
   */
  once<K extends keyof WalletEventMap>(
    event: K,
    listener: EventListener<WalletEventMap[K]>
  ): EventSubscription {
    return this.on(event, listener, { once: true });
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof WalletEventMap>(
    event: K,
    listener: EventListener<WalletEventMap[K]>
  ): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    for (const subscription of eventListeners) {
      if (subscription.listener === listener) {
        subscription.isActive = false;
        if (subscription.debounceTimer) {
          clearTimeout(subscription.debounceTimer);
        }
        eventListeners.delete(subscription);
        break;
      }
    }

    // Clean up empty event listener sets
    if (eventListeners.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   */
  removeAllListeners<K extends keyof WalletEventMap>(event?: K): void {
    if (event) {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        // Clear debounce timers
        eventListeners.forEach(sub => {
          sub.isActive = false;
          if (sub.debounceTimer) {
            clearTimeout(sub.debounceTimer);
          }
        });
        this.listeners.delete(event);
      }
    } else {
      // Remove all listeners
      this.listeners.forEach(eventListeners => {
        eventListeners.forEach(sub => {
          sub.isActive = false;
          if (sub.debounceTimer) {
            clearTimeout(sub.debounceTimer);
          }
        });
      });
      this.listeners.clear();
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  async emit<K extends keyof WalletEventMap>(
    event: K,
    data: WalletEventMap[K]
  ): Promise<void> {
    this.checkDisposed();

    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.size === 0) return;

    const promises: Promise<void>[] = [];

    for (const subscription of Array.from(eventListeners)) {
      if (!subscription.isActive) {
        eventListeners.delete(subscription);
        continue;
      }

      const promise = this.executeListener(subscription, data, event, eventListeners);
      promises.push(promise);
    }

    // Wait for all listeners to complete
    await Promise.allSettled(promises);
  }

  /**
   * Subscribe to multiple events at once
   */
  subscribe(handlers: EventHandlerMap): MultiEventSubscription {
    const subscriptions: EventSubscription[] = [];

    for (const [event, handler] of Object.entries(handlers) as Array<[keyof WalletEventMap, EventListener<any>]>) {
      if (handler) {
        subscriptions.push(this.on(event, handler));
      }
    }

    return new MultiSubscriptionImpl(subscriptions);
  }

  /**
   * Check if there are listeners for an event
   */
  hasListeners<K extends keyof WalletEventMap>(event: K): boolean {
    const eventListeners = this.listeners.get(event);
    return eventListeners ? eventListeners.size > 0 : false;
  }

  /**
   * Check if a specific listener is registered for an event
   */
  hasListener<K extends keyof WalletEventMap>(
    event: K,
    listener: EventListener<WalletEventMap[K]>
  ): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return false;

    for (const subscription of eventListeners) {
      if (subscription.listener === listener && subscription.isActive) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the number of listeners for an event
   */
  getListenerCount<K extends keyof WalletEventMap>(event: K): number {
    const eventListeners = this.listeners.get(event);
    return eventListeners ? Array.from(eventListeners).filter(sub => sub.isActive).length : 0;
  }

  /**
   * Get all event names that have listeners
   */
  getEventNames(): Array<keyof WalletEventMap> {
    return Array.from(this.listeners.keys()).filter(event => this.hasListeners(event));
  }

  /**
   * Set maximum number of listeners per event (memory leak prevention)
   */
  setMaxListeners(max: number): void {
    this.maxListeners = max;
  }

  /**
   * Dispose of the event emitter and cleanup all resources
   */
  dispose(): void {
    this.removeAllListeners();
    this.isDisposed = true;
  }

  /**
   * Check if the emitter has been disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Execute a listener with proper error handling and options support
   */
  private async executeListener<K extends keyof WalletEventMap>(
    subscription: InternalSubscription<WalletEventMap[K]>,
    data: WalletEventMap[K],
    event: K,
    eventListeners: Set<InternalSubscription>
  ): Promise<void> {
    try {
      const { listener, options } = subscription;

      // Handle debouncing
      if (options?.debounce) {
        if (subscription.debounceTimer) {
          clearTimeout(subscription.debounceTimer);
        }
        
        return new Promise<void>((resolve) => {
          subscription.debounceTimer = setTimeout(async () => {
            await this.callListener(listener, data, subscription, eventListeners);
            resolve();
          }, options.debounce);
        });
      }

      // Handle delay
      if (options?.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }

      await this.callListener(listener, data, subscription, eventListeners);

    } catch (error: unknown) {
      // Emit error event for listener failures (if not already an error event)
      if (event !== 'error') {
        this.emit('error', {
          error: error instanceof Error ? error : new Error(String(error)),
          event: String(event),
          data,
          timestamp: new Date(),
          context: { subscription: 'listener_execution' }
        }).catch(() => {
          // Prevent infinite error loops
          console.error('Failed to emit error event:', error);
        });
      }
    }
  }

  /**
   * Call the listener function and handle once option
   */
  private async callListener<T>(
    listener: EventListener<T>,
    data: T,
    subscription: InternalSubscription<T>,
    eventListeners: Set<InternalSubscription>
  ): Promise<void> {
    // Call the listener
    await listener(data);

    // Handle once option
    if (subscription.options?.once) {
      subscription.isActive = false;
      eventListeners.delete(subscription);
    }
  }

  /**
   * Check if emitter is disposed
   */
  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error('EventEmitter has been disposed');
    }
  }

  /**
   * Check max listeners to prevent memory leaks
   */
  private checkMaxListeners(event: keyof WalletEventMap): void {
    const count = this.getListenerCount(event);
    if (count >= this.maxListeners) {
      console.warn(
        `Maximum listeners (${this.maxListeners}) exceeded for event '${String(event)}'. ` +
        'This may indicate a memory leak. Consider removing unused listeners.'
      );
    }
  }
}

/**
 * Create a new typed wallet event emitter
 */
export function createWalletEventEmitter(): TypedWalletEventEmitter {
  return new TypedWalletEventEmitter();
}
