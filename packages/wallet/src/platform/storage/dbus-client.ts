/**
 * @fileoverview D-Bus client for Linux Secret Service communication
 * 
 * Provides low-level D-Bus session management and method calling
 * with proper error handling and connection lifecycle.
 */

import { EventEmitter } from 'events';
import type { MessageBus, ProxyObject, ClientInterface } from 'dbus-next';

/**
 * D-Bus session configuration
 */
export interface DbusSessionConfig {
  /** D-Bus service name */
  serviceName: string;
  /** D-Bus object path */
  objectPath: string;
  /** D-Bus interface name */
  interfaceName: string;
  /** Session timeout in milliseconds */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * D-Bus method call result
 */
export interface DbusResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * D-Bus session state
 */
export type DbusSessionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * D-Bus client for Linux Secret Service
 */
export class DbusClient extends EventEmitter {
  private bus: MessageBus | null = null;
  private proxy: ProxyObject | null = null;
  private interface: ClientInterface | null = null;
  private state: DbusSessionState = 'disconnected';
  private readonly config: Required<DbusSessionConfig>;

  constructor(config: DbusSessionConfig) {
    super();
    this.config = {
      timeout: 10000,
      debug: false,
      ...config,
    };
  }

  /**
   * Connect to D-Bus and create interface proxy
   */
  async connect(): Promise<DbusResult> {
    if (this.state === 'connected') {
      return { success: true };
    }

    try {
      this.setState('connecting');
      
      // Dynamic import to handle environments where dbus-next is not available
      const dbus = await this.importDbusNext();
      if (!dbus) {
        return { success: false, error: 'D-Bus not available' };
      }

      // Connect to session bus
      this.bus = dbus.sessionBus();
      
      if (!this.bus) {
        throw new Error('Failed to connect to D-Bus session bus');
      }
      
      // Get proxy object
      this.proxy = await this.bus.getProxyObject(
        this.config.serviceName,
        this.config.objectPath
      );

      // Get interface
      this.interface = this.proxy.getInterface(this.config.interfaceName);

      // Set up error handling
      this.bus.on('error', (error) => {
        this.log('D-Bus error:', error);
        this.setState('error');
        this.emit('error', error);
      });

      this.bus.on('disconnect', (() => {
        this.log('D-Bus disconnected');
        this.setState('disconnected');
        this.emit('disconnect');
      }) as any);

      this.setState('connected');
      this.emit('connect');
      
      return { success: true };
    } catch (error) {
      this.setState('error');
      const errorMessage = error instanceof Error ? error.message : 'Unknown D-Bus error';
      this.log('Failed to connect to D-Bus:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Disconnect from D-Bus
   */
  async disconnect(): Promise<void> {
    if (this.bus) {
      try {
        this.bus.disconnect();
      } catch (error) {
        this.log('Error during disconnect:', error);
      }
    }

    this.bus = null;
    this.proxy = null;
    this.interface = null;
    this.setState('disconnected');
    this.emit('disconnect');
  }

  /**
   * Call a D-Bus method
   */
  async call<T = any>(method: string, ...args: any[]): Promise<DbusResult<T>> {
    if (!this.interface) {
      const connectResult = await this.connect();
      if (!connectResult.success) {
        return connectResult;
      }
    }

    try {
      this.log(`Calling D-Bus method: ${method}`, args);
      
      // Set up timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Method call timeout: ${method}`)), this.config.timeout);
      });

      // Call method with timeout
      const result = await Promise.race([
        this.interface!.call(method, ...args),
        timeoutPromise,
      ]);

      this.log(`D-Bus method result: ${method}`, result);
      return { success: true, data: result as T };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown method call error';
      this.log(`D-Bus method error: ${method}`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get a property value
   */
  async getProperty<T = any>(propertyName: string): Promise<DbusResult<T>> {
    if (!this.interface) {
      const connectResult = await this.connect();
      if (!connectResult.success) {
        return connectResult;
      }
    }

    try {
      this.log(`Getting D-Bus property: ${propertyName}`);
      
      const result = await this.interface!.get(propertyName);
      this.log(`D-Bus property result: ${propertyName}`, result);
      
      return { success: true, data: result as T };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown property error';
      this.log(`D-Bus property error: ${propertyName}`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Set a property value
   */
  async setProperty(propertyName: string, value: any): Promise<DbusResult> {
    if (!this.interface) {
      const connectResult = await this.connect();
      if (!connectResult.success) {
        return connectResult;
      }
    }

    try {
      this.log(`Setting D-Bus property: ${propertyName}`, value);
      
      await this.interface!.set(propertyName, value);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown property error';
      this.log(`D-Bus property set error: ${propertyName}`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Get current state
   */
  getState(): DbusSessionState {
    return this.state;
  }

  /**
   * Create a new client for a different interface
   */
  createChildClient(config: Partial<DbusSessionConfig>): DbusClient {
    return new DbusClient({
      ...this.config,
      ...config,
    });
  }

  /**
   * Set session state and emit event
   */
  private setState(newState: DbusSessionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }

  /**
   * Log debug messages
   */
  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[DbusClient] ${message}`, ...args);
    }
  }

  /**
   * Dynamically import dbus-next with fallback
   */
  private async importDbusNext(): Promise<any> {
    try {
      // Try to import dbus-next
      const dbus = await import('dbus-next');
      return dbus;
    } catch (error) {
      this.log('dbus-next not available:', error);
      return null;
    }
  }
}

/**
 * Create a D-Bus client for Secret Service
 */
export function createSecretServiceClient(debug: boolean = false): DbusClient {
  return new DbusClient({
    serviceName: 'org.freedesktop.secrets',
    objectPath: '/org/freedesktop/secrets',
    interfaceName: 'org.freedesktop.Secret.Service',
    debug,
  });
}

/**
 * Create a D-Bus client for a collection
 */
export function createCollectionClient(collectionPath: string, debug: boolean = false): DbusClient {
  return new DbusClient({
    serviceName: 'org.freedesktop.secrets',
    objectPath: collectionPath,
    interfaceName: 'org.freedesktop.Secret.Collection',
    debug,
  });
}

/**
 * Create a D-Bus client for an item
 */
export function createItemClient(itemPath: string, debug: boolean = false): DbusClient {
  return new DbusClient({
    serviceName: 'org.freedesktop.secrets',
    objectPath: itemPath,
    interfaceName: 'org.freedesktop.Secret.Item',
    debug,
  });
}
