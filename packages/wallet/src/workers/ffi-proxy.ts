/**
 * @fileoverview Worker thread FFI proxy for Tari wallet operations
 * 
 * Provides a proxy system for FFI calls from worker threads since workers
 * cannot directly access native modules in most environments.
 */

import { MessagePort, Worker, isMainThread, parentPort } from 'worker_threads';
import { PlatformDetector } from '../platform/detector.js';

/**
 * FFI method call request
 */
export interface FFIRequest {
  id: string;
  method: string;
  args: any[];
  timestamp: number;
}

/**
 * FFI method call response
 */
export interface FFIResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: number;
}

/**
 * FFI proxy configuration
 */
export interface FFIProxyConfig {
  /** Timeout for FFI calls in milliseconds */
  timeout: number;
  /** Maximum concurrent requests */
  maxConcurrentRequests: number;
  /** Enable request queuing */
  enableQueue: boolean;
}

/**
 * Worker FFI proxy for making FFI calls from worker threads
 */
export class WorkerFFIProxy {
  private readonly config: Required<FFIProxyConfig>;
  private readonly pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }>();
  private requestCounter = 0;
  private messagePort?: MessagePort;
  private isConnected = false;

  constructor(config: Partial<FFIProxyConfig> = {}) {
    this.config = {
      timeout: 30000, // 30 seconds
      maxConcurrentRequests: 10,
      enableQueue: true,
      ...config,
    };

    this.initializeProxy();
  }

  /**
   * Call an FFI method through the proxy
   */
  async call(method: string, ...args: any[]): Promise<any> {
    if (!this.isConnected) {
      throw new Error('FFI proxy not connected');
    }

    if (this.pendingRequests.size >= this.config.maxConcurrentRequests) {
      if (!this.config.enableQueue) {
        throw new Error('Too many concurrent FFI requests');
      }
      // Wait for some requests to complete
      await this.waitForSlot();
    }

    const request: FFIRequest = {
      id: this.generateRequestId(),
      method,
      args,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      // Store the promise resolvers
      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timestamp: request.timestamp,
      });

      // Set timeout
      setTimeout(() => {
        const pending = this.pendingRequests.get(request.id);
        if (pending) {
          this.pendingRequests.delete(request.id);
          reject(new Error(`FFI call timeout: ${method}`));
        }
      }, this.config.timeout);

      // Send request
      try {
        this.sendRequest(request);
      } catch (error) {
        this.pendingRequests.delete(request.id);
        reject(error);
      }
    });
  }

  /**
   * Check if FFI proxy is available
   */
  isAvailable(): boolean {
    return this.isConnected && PlatformDetector.hasCapability('workerThreads');
  }

  /**
   * Get proxy statistics
   */
  getStats(): {
    pendingRequests: number;
    isConnected: boolean;
    requestsSent: number;
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      isConnected: this.isConnected,
      requestsSent: this.requestCounter,
    };
  }

  /**
   * Dispose the proxy
   */
  dispose(): void {
    this.isConnected = false;
    
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('FFI proxy disposed'));
    }
    this.pendingRequests.clear();

    // Close message port if available
    if (this.messagePort) {
      this.messagePort.close();
    }
  }

  /**
   * Initialize the proxy based on environment
   */
  private initializeProxy(): void {
    const platform = PlatformDetector.detect();
    
    if (!platform.capabilities.workerThreads) {
      console.warn('Worker threads not available, FFI proxy disabled');
      return;
    }

    if (isMainThread) {
      // In main thread, we don't need the proxy
      this.isConnected = true;
    } else {
      // In worker thread, set up communication with main thread
      this.setupWorkerCommunication();
    }
  }

  /**
   * Set up communication in worker thread
   */
  private setupWorkerCommunication(): void {
    if (!parentPort) {
      console.error('No parent port available in worker');
      return;
    }

    // Listen for FFI responses
    parentPort.on('message', (message: any) => {
      if (message.type === 'ffi-response') {
        this.handleResponse(message.data as FFIResponse);
      }
    });

    // Set up message port if provided
    parentPort.on('message', (message: any) => {
      if (message.type === 'ffi-port' && message.port) {
        this.messagePort = message.port;
        this.setupMessagePort();
      }
    });

    this.isConnected = true;
  }

  /**
   * Set up dedicated message port
   */
  private setupMessagePort(): void {
    if (!this.messagePort) return;

    this.messagePort.on('message', (response: FFIResponse) => {
      this.handleResponse(response);
    });

    this.messagePort.start();
  }

  /**
   * Send FFI request
   */
  private sendRequest(request: FFIRequest): void {
    if (isMainThread) {
      // In main thread, call FFI directly
      this.callFFIDirect(request);
    } else if (this.messagePort) {
      // Use dedicated message port
      this.messagePort.postMessage(request);
    } else if (parentPort) {
      // Use parent port
      parentPort.postMessage({
        type: 'ffi-request',
        data: request,
      });
    } else {
      throw new Error('No communication channel available');
    }
  }

  /**
   * Handle FFI response
   */
  private handleResponse(response: FFIResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.success) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error || 'FFI call failed'));
    }
  }

  /**
   * Call FFI directly in main thread
   */
  private async callFFIDirect(request: FFIRequest): Promise<void> {
    try {
      // This would call the actual FFI method
      // For now, simulate the call
      const result = await this.simulateFFICall(request.method, request.args);
      
      const response: FFIResponse = {
        id: request.id,
        success: true,
        result,
        timestamp: Date.now(),
      };

      // Simulate async response
      setTimeout(() => this.handleResponse(response), 0);
    } catch (error) {
      const response: FFIResponse = {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      setTimeout(() => this.handleResponse(response), 0);
    }
  }

  /**
   * Simulate FFI call (placeholder for actual implementation)
   */
  private async simulateFFICall(method: string, args: any[]): Promise<any> {
    // In a real implementation, this would call the actual FFI methods
    // from the minotari_wallet_ffi library
    switch (method) {
      case 'wallet_create':
        return { success: true, wallet_id: 'mock-wallet-id' };
      case 'wallet_get_balance':
        return { available: 1000000, pending_incoming: 0, pending_outgoing: 0 };
      case 'wallet_get_address':
        return 'mock-address-12345';
      default:
        throw new Error(`Unknown FFI method: ${method}`);
    }
  }

  /**
   * Wait for a request slot to become available
   */
  private async waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.pendingRequests.size < this.config.maxConcurrentRequests) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `ffi-${Date.now()}-${++this.requestCounter}`;
  }
}

/**
 * Main thread FFI handler for processing worker requests
 */
export class MainThreadFFIHandler {
  private readonly handlers = new Map<string, Worker>();

  /**
   * Set up FFI handling for a worker
   */
  setupWorker(worker: Worker): void {
    const workerId = this.generateWorkerId();
    this.handlers.set(workerId, worker);

    worker.on('message', (message: any) => {
      if (message.type === 'ffi-request') {
        this.handleFFIRequest(worker, message.data as FFIRequest);
      }
    });

    worker.on('exit', () => {
      this.handlers.delete(workerId);
    });
  }

  /**
   * Handle FFI request from worker
   */
  private async handleFFIRequest(worker: Worker, request: FFIRequest): Promise<void> {
    try {
      // Call the actual FFI method here
      const result = await this.callFFIMethod(request.method, request.args);
      
      const response: FFIResponse = {
        id: request.id,
        success: true,
        result,
        timestamp: Date.now(),
      };

      worker.postMessage({
        type: 'ffi-response',
        data: response,
      });
    } catch (error) {
      const response: FFIResponse = {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      worker.postMessage({
        type: 'ffi-response',
        data: response,
      });
    }
  }

  /**
   * Call actual FFI method
   */
  private async callFFIMethod(method: string, args: any[]): Promise<any> {
    // This would call the actual minotari_wallet_ffi methods
    // For now, return mock data
    return { mock: true, method, args };
  }

  /**
   * Generate worker ID
   */
  private generateWorkerId(): string {
    return `worker-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Dispose handler
   */
  dispose(): void {
    this.handlers.clear();
  }
}

/**
 * Global FFI proxy instance
 */
let globalFFIProxy: WorkerFFIProxy | undefined;

/**
 * Get global FFI proxy
 */
export function getWorkerFFIProxy(): WorkerFFIProxy {
  if (!globalFFIProxy) {
    globalFFIProxy = new WorkerFFIProxy();
  }
  return globalFFIProxy;
}

/**
 * Set custom FFI proxy
 */
export function setWorkerFFIProxy(proxy: WorkerFFIProxy): void {
  if (globalFFIProxy) {
    globalFFIProxy.dispose();
  }
  globalFFIProxy = proxy;
}
