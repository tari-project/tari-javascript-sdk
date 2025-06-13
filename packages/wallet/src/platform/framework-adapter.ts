/**
 * @fileoverview Unified framework adapter for Electron/Tauri/Node
 * 
 * Provides framework-agnostic storage interface with automatic detection
 * and appropriate backend selection regardless of runtime environment.
 */

import type { SecureStorage, StorageResult, StorageConfig } from './storage/secure-storage.js';
import { PlatformDetector, type PlatformInfo, type RuntimeEnvironment } from './detector.js';
import { getCapabilitiesManager, type CapabilityAssessment } from './capabilities.js';

/**
 * Framework capabilities
 */
export interface FrameworkCapabilities {
  /** Secure storage available */
  secureStorage: boolean;
  /** IPC communication available */
  ipcCommunication: boolean;
  /** Native modules supported */
  nativeModules: boolean;
  /** Performance characteristics */
  performance: {
    memoryFootprint: 'low' | 'medium' | 'high';
    startupTime: 'fast' | 'medium' | 'slow';
    ipcLatency: 'low' | 'medium' | 'high';
  };
  /** Security features */
  security: {
    processIsolation: boolean;
    permissionSystem: boolean;
    memoryProtection: boolean;
    codeIntegrity: boolean;
  };
}

/**
 * Framework adapter interface
 */
export interface FrameworkAdapter {
  /** Framework identifier */
  readonly framework: RuntimeEnvironment;
  /** Framework capabilities */
  readonly capabilities: FrameworkCapabilities;
  /** Create storage instance */
  createStorage(config?: StorageConfig): Promise<SecureStorage>;
  /** Get framework-specific optimization recommendations */
  getOptimizations(): string[];
  /** Validate framework environment */
  validate(): Promise<{ valid: boolean; error?: string }>;
  /** Framework-specific initialization */
  initialize?(): Promise<void>;
  /** Cleanup resources */
  cleanup?(): Promise<void>;
}

/**
 * Tauri framework adapter
 */
class TauriAdapter implements FrameworkAdapter {
  readonly framework: RuntimeEnvironment = 'tauri';
  readonly capabilities: FrameworkCapabilities;

  constructor() {
    this.capabilities = {
      secureStorage: true,
      ipcCommunication: true,
      nativeModules: false,
      performance: {
        memoryFootprint: 'low',
        startupTime: 'fast',
        ipcLatency: 'low',
      },
      security: {
        processIsolation: true,
        permissionSystem: true,
        memoryProtection: true,
        codeIntegrity: true,
      },
    };
  }

  async createStorage(config?: StorageConfig): Promise<SecureStorage> {
    const { TauriStorage } = await import('../tauri/tauri-storage.js');
    return new TauriStorage({
      enableValidation: config?.enableValidation ?? true,
      enableLogging: config?.enableLogging ?? false,
      commandTimeout: 5000,
      maxRetries: 3,
    });
  }

  getOptimizations(): string[] {
    return [
      'use-rust-async-runtime',
      'enable-zero-copy-serialization',
      'use-tauri-invoke-batching',
      'enable-hardware-crypto-acceleration',
      'use-memory-safe-buffers',
      'minimize-ipc-overhead',
      'enable-permission-allowlist',
    ];
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (typeof window === 'undefined' || !window.__TAURI__) {
      return {
        valid: false,
        error: 'Tauri runtime not available',
      };
    }

    if (typeof window.__TAURI__.invoke !== 'function') {
      return {
        valid: false,
        error: 'Tauri invoke function not available',
      };
    }

    try {
      // Test basic functionality
      const storage = await this.createStorage({ enableLogging: false });
      const testResult = await storage.test();
      
      return {
        valid: testResult.success,
        error: testResult.error,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Tauri validation failed',
      };
    }
  }

  async initialize(): Promise<void> {
    // Tauri-specific initialization if needed
    // This could include setting up permissions, etc.
  }

  async cleanup(): Promise<void> {
    // Cleanup Tauri-specific resources if needed
  }
}

/**
 * Electron framework adapter
 */
class ElectronAdapter implements FrameworkAdapter {
  readonly framework: RuntimeEnvironment;
  readonly capabilities: FrameworkCapabilities;

  constructor(runtime: 'electron-main' | 'electron-renderer') {
    this.framework = runtime;
    this.capabilities = {
      secureStorage: runtime === 'electron-main',
      ipcCommunication: true,
      nativeModules: runtime === 'electron-main',
      performance: {
        memoryFootprint: 'high',
        startupTime: 'medium',
        ipcLatency: 'medium',
      },
      security: {
        processIsolation: true,
        permissionSystem: false,
        memoryProtection: false,
        codeIntegrity: false,
      },
    };
  }

  async createStorage(config?: StorageConfig): Promise<SecureStorage> {
    if (this.framework === 'electron-main') {
      // Use direct native storage in main process
      const { StorageFactory } = await import('./storage/storage-factory.js');
      return StorageFactory.create({
        forceBackend: 'auto',
        enableHealthMonitoring: true,
        enableCaching: true,
        ...config,
      });
    } else {
      // Use IPC storage in renderer process
      const { ElectronStorageClient } = await import('../electron/secure-storage-ipc.js');
      return new ElectronStorageClient();
    }
  }

  getOptimizations(): string[] {
    const optimizations = [
      'use-v8-snapshots',
      'optimize-ipc-serialization',
      'enable-context-isolation',
    ];

    if (this.framework === 'electron-main') {
      optimizations.push(
        'use-worker-threads',
        'enable-native-modules',
        'optimize-memory-usage'
      );
    }

    return optimizations;
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      if (typeof process === 'undefined' || !process.versions?.electron) {
        return {
          valid: false,
          error: 'Electron runtime not available',
        };
      }

      const storage = await this.createStorage({ enableLogging: false });
      const testResult = await storage.test();
      
      return {
        valid: testResult.success,
        error: testResult.error,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Electron validation failed',
      };
    }
  }

  async initialize(): Promise<void> {
    // Electron-specific initialization
    if (this.framework === 'electron-main') {
      // Initialize main process resources
    } else {
      // Initialize renderer process IPC
    }
  }

  async cleanup(): Promise<void> {
    // Cleanup Electron-specific resources
  }
}

/**
 * Node.js framework adapter
 */
class NodeAdapter implements FrameworkAdapter {
  readonly framework: RuntimeEnvironment = 'node';
  readonly capabilities: FrameworkCapabilities;

  constructor() {
    this.capabilities = {
      secureStorage: true,
      ipcCommunication: false,
      nativeModules: true,
      performance: {
        memoryFootprint: 'medium',
        startupTime: 'fast',
        ipcLatency: 'low',
      },
      security: {
        processIsolation: false,
        permissionSystem: false,
        memoryProtection: false,
        codeIntegrity: false,
      },
    };
  }

  async createStorage(config?: StorageConfig): Promise<SecureStorage> {
    const { StorageFactory } = await import('./storage/storage-factory.js');
    return StorageFactory.create({
      forceBackend: 'auto',
      enableHealthMonitoring: false,
      enableCaching: true,
      ...config,
    });
  }

  getOptimizations(): string[] {
    return [
      'use-worker-threads',
      'enable-native-modules',
      'optimize-memory-usage',
      'use-async-operations',
    ];
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      if (typeof process === 'undefined' || !process.versions?.node) {
        return {
          valid: false,
          error: 'Node.js runtime not available',
        };
      }

      const storage = await this.createStorage({ enableLogging: false });
      const testResult = await storage.test();
      
      return {
        valid: testResult.success,
        error: testResult.error,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Node.js validation failed',
      };
    }
  }
}

/**
 * Browser framework adapter (fallback)
 */
class BrowserAdapter implements FrameworkAdapter {
  readonly framework: RuntimeEnvironment = 'browser';
  readonly capabilities: FrameworkCapabilities;

  constructor() {
    this.capabilities = {
      secureStorage: false,
      ipcCommunication: false,
      nativeModules: false,
      performance: {
        memoryFootprint: 'medium',
        startupTime: 'medium',
        ipcLatency: 'high',
      },
      security: {
        processIsolation: true,
        permissionSystem: false,
        memoryProtection: false,
        codeIntegrity: false,
      },
    };
  }

  async createStorage(config?: StorageConfig): Promise<SecureStorage> {
    const { MemoryStorage } = await import('./storage/memory-storage.js');
    return new MemoryStorage(config);
  }

  getOptimizations(): string[] {
    return [
      'use-web-workers',
      'optimize-bundle-size',
      'enable-service-worker-caching',
      'use-indexeddb-fallback',
    ];
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (typeof window === 'undefined') {
      return {
        valid: false,
        error: 'Browser environment not available',
      };
    }

    return { valid: true };
  }
}

/**
 * Framework detection and selection priority
 */
const FRAMEWORK_PRIORITY: RuntimeEnvironment[] = [
  'tauri',           // Highest priority - best security and performance
  'electron-main',   // Good security with native access
  'node',           // Good for server environments
  'electron-renderer', // Limited but functional
  'browser',        // Fallback with limited capabilities
];

/**
 * Unified framework manager
 */
export class FrameworkManager {
  private static instance?: FrameworkManager;
  private currentAdapter?: FrameworkAdapter;
  private readonly platform: PlatformInfo;
  private readonly capabilities: CapabilityAssessment;

  private constructor() {
    this.platform = PlatformDetector.detect();
    this.capabilities = getCapabilitiesManager().getCapabilityAssessment();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FrameworkManager {
    if (!FrameworkManager.instance) {
      FrameworkManager.instance = new FrameworkManager();
    }
    return FrameworkManager.instance;
  }

  /**
   * Get current framework adapter
   */
  async getCurrentAdapter(): Promise<FrameworkAdapter> {
    if (this.currentAdapter) {
      return this.currentAdapter;
    }

    this.currentAdapter = await this.detectAndCreateAdapter();
    return this.currentAdapter;
  }

  /**
   * Create storage using best available framework
   */
  async createStorage(config?: StorageConfig): Promise<SecureStorage> {
    const adapter = await this.getCurrentAdapter();
    return adapter.createStorage(config);
  }

  /**
   * Get framework-specific capabilities
   */
  async getFrameworkCapabilities(): Promise<FrameworkCapabilities> {
    const adapter = await this.getCurrentAdapter();
    return adapter.capabilities;
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<string[]> {
    const adapter = await this.getCurrentAdapter();
    return adapter.getOptimizations();
  }

  /**
   * Validate current framework environment
   */
  async validateEnvironment(): Promise<{ valid: boolean; error?: string; framework: string }> {
    const adapter = await this.getCurrentAdapter();
    const validation = await adapter.validate();
    
    return {
      ...validation,
      framework: adapter.framework,
    };
  }

  /**
   * Force specific framework adapter
   */
  async setFramework(framework: RuntimeEnvironment): Promise<void> {
    this.currentAdapter = this.createAdapterForFramework(framework);
    
    if (this.currentAdapter.initialize) {
      await this.currentAdapter.initialize();
    }
  }

  /**
   * Get current framework information
   */
  async getFrameworkInfo(): Promise<{
    framework: RuntimeEnvironment;
    capabilities: FrameworkCapabilities;
    optimizations: string[];
    platform: PlatformInfo;
  }> {
    const adapter = await this.getCurrentAdapter();
    
    return {
      framework: adapter.framework,
      capabilities: adapter.capabilities,
      optimizations: adapter.getOptimizations(),
      platform: this.platform,
    };
  }

  /**
   * Detect and create appropriate framework adapter
   */
  private async detectAndCreateAdapter(): Promise<FrameworkAdapter> {
    const runtime = this.platform.runtime;
    
    // Try frameworks in priority order
    for (const framework of FRAMEWORK_PRIORITY) {
      if (framework === runtime) {
        const adapter = this.createAdapterForFramework(framework);
        const validation = await adapter.validate();
        
        if (validation.valid) {
          if (adapter.initialize) {
            await adapter.initialize();
          }
          return adapter;
        }
      }
    }

    // Fallback to browser adapter
    const fallback = new BrowserAdapter();
    console.warn('Using fallback browser storage adapter - limited functionality');
    return fallback;
  }

  /**
   * Create adapter for specific framework
   */
  private createAdapterForFramework(framework: RuntimeEnvironment): FrameworkAdapter {
    switch (framework) {
      case 'tauri':
        return new TauriAdapter();
      case 'electron-main':
        return new ElectronAdapter('electron-main');
      case 'electron-renderer':
        return new ElectronAdapter('electron-renderer');
      case 'node':
        return new NodeAdapter();
      case 'browser':
        return new BrowserAdapter();
      default:
        return new BrowserAdapter();
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.currentAdapter?.cleanup) {
      await this.currentAdapter.cleanup();
    }
    this.currentAdapter = undefined;
  }
}

/**
 * Get global framework manager instance
 */
export function getFrameworkManager(): FrameworkManager {
  return FrameworkManager.getInstance();
}

/**
 * Create storage using best available framework
 */
export async function createFrameworkStorage(config?: StorageConfig): Promise<SecureStorage> {
  const manager = getFrameworkManager();
  return manager.createStorage(config);
}

/**
 * Get current framework information
 */
export async function getFrameworkInfo() {
  const manager = getFrameworkManager();
  return manager.getFrameworkInfo();
}

/**
 * Validate current framework environment
 */
export async function validateFrameworkEnvironment() {
  const manager = getFrameworkManager();
  return manager.validateEnvironment();
}
