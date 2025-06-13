/**
 * @fileoverview Secure IPC channels for Electron storage operations
 * 
 * Provides secure communication between main and renderer processes
 * with proper context isolation and security boundaries.
 */

// Conditional Electron imports for environments where Electron might not be available
let ipcMain: any, ipcRenderer: any, contextBridge: any, webContents: any;
try {
  const electron = require('electron');
  ({ ipcMain, ipcRenderer, contextBridge, webContents } = electron);
} catch (error) {
  // Electron not available - this is fine for non-Electron environments
}

interface IpcMainInvokeEvent {
  senderFrame?: { origin: string };
}
import type { SecureStorage, StorageResult } from '../platform/storage/secure-storage.js';
import { StorageResults } from '../platform/storage/types/storage-result.js';
import { StorageFactory, type FactoryConfig } from '../platform/storage/storage-factory.js';

export interface ElectronStorageConfig extends FactoryConfig {
  /** Allow renderer process to access storage directly */
  allowRendererAccess?: boolean;
  /** Restrict operations to specific origins */
  allowedOrigins?: string[];
  /** Enable operation logging */
  enableLogging?: boolean;
  /** Maximum payload size for operations */
  maxPayloadSize?: number;
  /** Rate limiting configuration */
  rateLimit?: {
    maxOperationsPerSecond: number;
    maxOperationsPerMinute: number;
  };
}

export interface StorageRequest {
  operation: 'store' | 'retrieve' | 'remove' | 'exists' | 'list' | 'clear' | 'test';
  key?: string;
  data?: Buffer;
  options?: any;
  requestId: string;
  timestamp: number;
}

export interface StorageResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId: string;
  timestamp: number;
}

/**
 * Rate limiter for storage operations
 */
class OperationRateLimiter {
  private operationCounts = new Map<string, { perSecond: number; perMinute: number; lastReset: number }>();
  private config: { maxOperationsPerSecond: number; maxOperationsPerMinute: number };

  constructor(config: { maxOperationsPerSecond: number; maxOperationsPerMinute: number }) {
    this.config = config;
  }

  /**
   * Check if operation is allowed for the given origin
   */
  isAllowed(origin: string): boolean {
    const now = Date.now();
    const counts = this.operationCounts.get(origin) || { perSecond: 0, perMinute: 0, lastReset: now };

    // Reset counters every second and minute
    const secondsSinceReset = (now - counts.lastReset) / 1000;
    if (secondsSinceReset >= 60) {
      counts.perSecond = 0;
      counts.perMinute = 0;
      counts.lastReset = now;
    } else if (secondsSinceReset >= 1) {
      counts.perSecond = 0;
    }

    // Check limits
    if (counts.perSecond >= this.config.maxOperationsPerSecond) {
      return false;
    }
    if (counts.perMinute >= this.config.maxOperationsPerMinute) {
      return false;
    }

    // Increment counters
    counts.perSecond++;
    counts.perMinute++;
    this.operationCounts.set(origin, counts);

    return true;
  }

  /**
   * Get current usage for an origin
   */
  getUsage(origin: string): { perSecond: number; perMinute: number } {
    const counts = this.operationCounts.get(origin) || { perSecond: 0, perMinute: 0, lastReset: Date.now() };
    return { perSecond: counts.perSecond, perMinute: counts.perMinute };
  }
}

/**
 * Security validator for storage operations
 */
class StorageSecurityValidator {
  private config: ElectronStorageConfig;

  constructor(config: ElectronStorageConfig) {
    this.config = config;
  }

  /**
   * Validate that the request is from an allowed origin
   */
  validateOrigin(event: IpcMainInvokeEvent): boolean {
    if (!this.config.allowedOrigins || this.config.allowedOrigins.length === 0) {
      return true; // No restrictions
    }

    const senderFrame = event.senderFrame;
    if (!senderFrame) {
      return false;
    }

    const origin = senderFrame.origin;
    return this.config.allowedOrigins.includes(origin);
  }

  /**
   * Validate storage request structure and content
   */
  validateRequest(request: StorageRequest): { valid: boolean; error?: string } {
    // Check request structure
    if (!request.operation || !request.requestId || !request.timestamp) {
      return { valid: false, error: 'Invalid request structure' };
    }

    // Check timestamp (prevent replay attacks)
    const now = Date.now();
    const requestAge = now - request.timestamp;
    if (requestAge > 30000 || requestAge < -5000) { // 30 seconds max age, 5 seconds clock skew
      return { valid: false, error: 'Request timestamp out of range' };
    }

    // Check payload size
    if (request.data && this.config.maxPayloadSize) {
      if (request.data.length > this.config.maxPayloadSize) {
        return { valid: false, error: 'Payload size exceeds limit' };
      }
    }

    // Validate key format
    if (request.key !== undefined) {
      if (typeof request.key !== 'string' || request.key.length === 0 || request.key.length > 256) {
        return { valid: false, error: 'Invalid key format' };
      }

      // Check for path traversal attempts
      if (request.key.includes('..') || request.key.includes('/') || request.key.includes('\\')) {
        return { valid: false, error: 'Invalid characters in key' };
      }
    }

    return { valid: true };
  }

  /**
   * Sanitize response data before sending to renderer
   */
  sanitizeResponse(response: StorageResponse): StorageResponse {
    // Remove sensitive information from error messages
    if (response.error) {
      // Don't expose full file paths or internal details
      response.error = this.sanitizeErrorMessage(response.error);
    }

    return response;
  }

  private sanitizeErrorMessage(error: string): string {
    // Remove file paths
    error = error.replace(/\/[^\s]*/g, '[PATH]');
    error = error.replace(/[A-Z]:\\[^\s]*/g, '[PATH]');
    
    // Remove internal implementation details
    error = error.replace(/at \w+\.[^\s]*/g, '[INTERNAL]');
    
    return error;
  }
}

/**
 * Main process storage handler with security controls
 */
export class ElectronStorageHandler {
  private storage?: SecureStorage;
  private config: ElectronStorageConfig;
  private validator: StorageSecurityValidator;
  private rateLimiter?: OperationRateLimiter;
  private operationLog: Array<{ timestamp: number; origin: string; operation: string; success: boolean }> = [];

  constructor(config: ElectronStorageConfig = {}) {
    this.config = {
      allowRendererAccess: false,
      enableLogging: true,
      maxPayloadSize: 1024 * 1024, // 1MB default
      ...config,
    };

    this.validator = new StorageSecurityValidator(this.config);

    if (this.config.rateLimit) {
      this.rateLimiter = new OperationRateLimiter(this.config.rateLimit);
    }
  }

  /**
   * Initialize storage and set up IPC handlers
   */
  async initialize(): Promise<void> {
    // Create storage instance
    this.storage = await StorageFactory.create({
      ...this.config,
      enableHealthMonitoring: true,
      enableAutoFailover: true,
    });

    // Set up IPC handlers
    this.setupIpcHandlers();
  }

  /**
   * Setup secure IPC handlers
   */
  private setupIpcHandlers(): void {
    // Main storage operations
    ipcMain.handle('secure-storage:operation', async (event: IpcMainInvokeEvent, request: StorageRequest) => {
      return this.handleStorageOperation(event, request);
    });

    // Health monitoring
    ipcMain.handle('secure-storage:health', async (event: IpcMainInvokeEvent) => {
      return this.handleHealthCheck(event);
    });

    // Configuration
    ipcMain.handle('secure-storage:config', async (event: IpcMainInvokeEvent) => {
      return this.handleConfigRequest(event);
    });
  }

  /**
   * Handle storage operation with security validation
   */
  private async handleStorageOperation(event: IpcMainInvokeEvent, request: StorageRequest): Promise<StorageResponse> {
    const startTime = Date.now();
    let success = false;

    try {
      // Validate origin
      if (!this.validator.validateOrigin(event)) {
        throw new Error('Origin not allowed');
      }

      // Check rate limiting
      const origin = event.senderFrame?.origin || 'unknown';
      if (this.rateLimiter && !this.rateLimiter.isAllowed(origin)) {
        throw new Error('Rate limit exceeded');
      }

      // Validate request
      const validation = this.validator.validateRequest(request);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      if (!this.storage) {
        throw new Error('Storage not initialized');
      }

      // Execute operation
      let result: StorageResult<any>;
      
      switch (request.operation) {
        case 'store':
          if (!request.key || !request.data) {
            throw new Error('Key and data required for store operation');
          }
          result = await this.storage.store(request.key, request.data, request.options);
          break;

        case 'retrieve':
          if (!request.key) {
            throw new Error('Key required for retrieve operation');
          }
          result = await this.storage.retrieve(request.key, request.options);
          break;

        case 'remove':
          if (!request.key) {
            throw new Error('Key required for remove operation');
          }
          result = await this.storage.remove(request.key);
          break;

        case 'exists':
          if (!request.key) {
            throw new Error('Key required for exists operation');
          }
          result = await this.storage.exists(request.key);
          break;

        case 'list':
          result = await this.storage.list();
          break;

        case 'clear':
          // Extra validation for destructive operation
          if (!this.config.allowRendererAccess) {
            throw new Error('Clear operation not allowed from renderer');
          }
          result = await this.storage.clear();
          break;

        case 'test':
          result = await this.storage.test();
          break;

        default:
          throw new Error(`Unknown operation: ${request.operation}`);
      }

      success = StorageResults.isOk(result);

      const response: StorageResponse = {
        success: StorageResults.isOk(result),
        data: StorageResults.isOk(result) ? result.value : undefined,
        error: StorageResults.isError(result) ? result.error.message : undefined,
        requestId: request.requestId,
        timestamp: Date.now(),
      };

      return this.validator.sanitizeResponse(response);

    } catch (error) {
      const response: StorageResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: request.requestId,
        timestamp: Date.now(),
      };

      return this.validator.sanitizeResponse(response);

    } finally {
      // Log operation
      if (this.config.enableLogging) {
        this.logOperation(event, request, success, Date.now() - startTime);
      }
    }
  }

  /**
   * Handle health check request
   */
  private async handleHealthCheck(event: IpcMainInvokeEvent): Promise<any> {
    if (!this.validator.validateOrigin(event)) {
      throw new Error('Origin not allowed');
    }

    if (!this.storage) {
      return { error: 'Storage not initialized' };
    }

    // Get health information if available
    const healthInfo = (this.storage as any).getBackendHealth?.() || null;
    const migrationStatus = (this.storage as any).getMigrationStatus?.() || [];

    return {
      health: healthInfo ? Object.fromEntries(healthInfo) : null,
      migrations: migrationStatus,
      operationLog: this.operationLog.slice(-50), // Last 50 operations
    };
  }

  /**
   * Handle configuration request
   */
  private async handleConfigRequest(event: IpcMainInvokeEvent): Promise<any> {
    if (!this.validator.validateOrigin(event)) {
      throw new Error('Origin not allowed');
    }

    // Return safe configuration information
    return {
      allowedOrigins: this.config.allowedOrigins || [],
      maxPayloadSize: this.config.maxPayloadSize,
      rateLimit: this.config.rateLimit || null,
      enableLogging: this.config.enableLogging,
    };
  }

  /**
   * Log storage operation
   */
  private logOperation(event: IpcMainInvokeEvent, request: StorageRequest, success: boolean, duration: number): void {
    const origin = event.senderFrame?.origin || 'unknown';
    
    this.operationLog.push({
      timestamp: Date.now(),
      origin,
      operation: request.operation,
      success,
    });

    // Limit log size
    if (this.operationLog.length > 1000) {
      this.operationLog = this.operationLog.slice(-500);
    }

    if (this.config.enableLogging) {
      console.log(`Storage operation: ${request.operation} from ${origin} - ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    ipcMain.removeAllListeners('secure-storage:operation');
    ipcMain.removeAllListeners('secure-storage:health');
    ipcMain.removeAllListeners('secure-storage:config');

    if (this.storage && 'destroy' in this.storage) {
      (this.storage as any).destroy();
    }
  }
}

/**
 * Renderer process storage client
 */
export class ElectronStorageClient implements SecureStorage {
  private requestCounter = 0;

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${++this.requestCounter}`;
  }

  /**
   * Execute a storage operation via IPC
   */
  private async executeOperation(operation: string, key?: string, data?: Buffer, options?: any): Promise<StorageResult<any>> {
    const request: StorageRequest = {
      operation: operation as any,
      key,
      data,
      options,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    try {
      const response: StorageResponse = await ipcRenderer.invoke('secure-storage:operation', request);
      
      if (response.success) {
        return StorageResults.ok(response.data);
      } else {
        return StorageResults.internalError(response.error || 'Unknown error');
      }
    } catch (error) {
      return StorageResults.internalError(
        error instanceof Error ? error.message : 'IPC communication error'
      );
    }
  }

  async store(key: string, value: Buffer, options?: any): Promise<StorageResult<void>> {
    return this.executeOperation('store', key, value, options);
  }

  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    return this.executeOperation('retrieve', key, undefined, options);
  }

  async remove(key: string): Promise<StorageResult<void>> {
    return this.executeOperation('remove', key);
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    return this.executeOperation('exists', key);
  }

  async list(): Promise<StorageResult<string[]>> {
    return this.executeOperation('list');
  }

  async getMetadata(key: string): Promise<StorageResult<any>> {
    // Not supported via IPC for security reasons
    return StorageResults.internalError('Metadata access not supported via IPC');
  }

  async clear(): Promise<StorageResult<void>> {
    return this.executeOperation('clear');
  }

  async getInfo(): Promise<StorageResult<any>> {
    try {
      const config = await ipcRenderer.invoke('secure-storage:config');
      return StorageResults.ok(config);
    } catch (error) {
      return StorageResults.internalError(
        error instanceof Error ? error.message : 'Failed to get storage info'
      );
    }
  }

  async test(): Promise<StorageResult<void>> {
    return this.executeOperation('test');
  }

  /**
   * Get health information
   */
  async getHealth(): Promise<any> {
    try {
      return await ipcRenderer.invoke('secure-storage:health');
    } catch (error) {
      throw new Error(`Failed to get health info: ${error}`);
    }
  }
}

/**
 * Context bridge API for secure renderer access
 */
export const electronStorageApi = {
  // Storage operations
  store: (key: string, value: Buffer, options?: any) => {
    const client = new ElectronStorageClient();
    return client.store(key, value, options);
  },

  retrieve: (key: string, options?: any) => {
    const client = new ElectronStorageClient();
    return client.retrieve(key, options);
  },

  remove: (key: string) => {
    const client = new ElectronStorageClient();
    return client.remove(key);
  },

  exists: (key: string) => {
    const client = new ElectronStorageClient();
    return client.exists(key);
  },

  list: () => {
    const client = new ElectronStorageClient();
    return client.list();
  },

  clear: () => {
    const client = new ElectronStorageClient();
    return client.clear();
  },

  test: () => {
    const client = new ElectronStorageClient();
    return client.test();
  },

  // Health monitoring
  getHealth: async () => {
    const client = new ElectronStorageClient();
    return client.getHealth();
  },

  // Configuration
  getInfo: () => {
    const client = new ElectronStorageClient();
    return client.getInfo();
  },
};

/**
 * Setup context bridge for renderer process
 */
export function setupElectronStorageContextBridge(): void {
  contextBridge.exposeInMainWorld('electronStorage', electronStorageApi);
}

/**
 * Utility functions for Electron integration
 */
export class ElectronStorageUtils {
  /**
   * Create a secure storage configuration for Electron
   */
  static createElectronConfig(options: {
    allowedOrigins?: string[];
    enableRateLimit?: boolean;
    maxPayloadSize?: number;
    enableHealthMonitoring?: boolean;
  } = {}): ElectronStorageConfig {
    return {
      allowRendererAccess: true,
      allowedOrigins: options.allowedOrigins || ['app://localhost'],
      enableLogging: true,
      maxPayloadSize: options.maxPayloadSize || 1024 * 1024, // 1MB
      rateLimit: options.enableRateLimit ? {
        maxOperationsPerSecond: 10,
        maxOperationsPerMinute: 100,
      } : undefined,
      enableHealthMonitoring: options.enableHealthMonitoring ?? true,
      enableAutoFailover: true,
      testBackends: true,
      allowFallbacks: true,
    };
  }

  /**
   * Setup complete Electron storage integration
   */
  static async setupElectronStorage(config?: ElectronStorageConfig): Promise<ElectronStorageHandler> {
    const handler = new ElectronStorageHandler(config);
    await handler.initialize();
    return handler;
  }

  /**
   * Check if running in Electron environment
   */
  static isElectron(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.process === 'object' && 
           window.process.type === 'renderer';
  }

  /**
   * Get Electron version information
   */
  static getElectronVersion(): { electron?: string; chrome?: string; node?: string } {
    if (!this.isElectron()) {
      return {};
    }

    return {
      electron: window.process?.versions?.electron,
      chrome: window.process?.versions?.chrome,
      node: window.process?.versions?.node,
    };
  }
}
