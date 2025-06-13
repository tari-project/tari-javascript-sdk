/**
 * @fileoverview Custom typed EventEmitter implementation
 * 
 * Provides a type-safe alternative to Node.js EventEmitter that avoids
 * constraint issues with EventMap types.
 */

/**
 * Custom typed EventEmitter to avoid Node.js EventMap constraints
 */
export class TypedEventEmitter<T extends Record<string, (...args: any[]) => void> = Record<string, (...args: any[]) => void>> {
  private events = new Map<keyof T, Array<T[keyof T]>>();

  public emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
    const listeners = this.events.get(event) as Array<T[K]> | undefined;
    if (listeners) {
      listeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }

  on<K extends keyof T>(event: K, listener: T[K]): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    (this.events.get(event) as Array<T[K]>).push(listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: T[K]): this {
    const listeners = this.events.get(event) as Array<T[K]> | undefined;
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  listenerCount<K extends keyof T>(event: K): number {
    return (this.events.get(event) as Array<T[K]> | undefined)?.length || 0;
  }

  eventNames(): Array<keyof T> {
    return Array.from(this.events.keys());
  }
}
