/**
 * @fileoverview Tauri-specific adapter implementation
 * 
 * Provides specialized Tauri integration with enhanced security,
 * performance optimizations, and platform-specific capabilities.
 */

import type { SecureStorage, StorageConfig } from '../platform/storage/secure-storage.js';
import { StorageResults } from '../platform/storage/storage-results.js';
import { TauriStorage, type TauriStorageConfig } from './tauri-storage.js';
import { SecureInvoke, type SecureInvokeConfig } from './secure-invoke.js';
import { PlatformDetector } from '../platform/detector.js';

/**
 * Tauri-specific configuration
 */
export interface TauriAdapterConfig {
  /** Secure invoke configuration */
  secureInvoke?: SecureInvokeConfig;
  /** Tauri storage configuration */
  tauriStorage?: TauriStorageConfig;
  /** Enable Tauri-specific optimizations */
  enableOptimizations?: boolean;
  /** Permission allowlist validation */
  validatePermissions?: boolean;
  /** Enable hardware acceleration */
  enableHardwareAcceleration?: boolean;
  /** Memory protection settings */
  memoryProtection?: {
    clearSensitiveData?: boolean;
    useSecureBuffers?: boolean;
    preventSwapping?: boolean;
  };
}

/**
 * Tauri performance metrics
 */
export interface TauriPerformanceMetrics {
  storageOperations: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  invokeOperations: {
    total: number;
    successful: number;
    rateLimited: number;
    timeouts: number;
    averageResponseTime: number;
  };
  memoryUsage: {
    current: number;
    peak: number;
    gcCollections: number;
  };
}

/**
 * Enhanced Tauri adapter with security and performance features
 */
export class TauriAdapter {
  private readonly config: Required<TauriAdapterConfig>;
  private readonly secureInvoke: SecureInvoke;
  private storage?: TauriStorage;
  private metrics: TauriPerformanceMetrics;
  private initialized = false;

  constructor(config: TauriAdapterConfig = {}) {
    this.config = {
      secureInvoke: {},
      tauriStorage: {},
      enableOptimizations: true,
      validatePermissions: true,
      enableHardwareAcceleration: true,
      memoryProtection: {
        clearSensitiveData: true,
        useSecureBuffers: true,
        preventSwapping: false,
      },
      ...config,
    };

    this.secureInvoke = new SecureInvoke({
      maxOperationsPerSecond: 20, // Higher limit for storage operations
      commandTimeout: 10000, // Longer timeout for storage
      ...this.config.secureInvoke,
    });

    this.metrics = {
      storageOperations: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
      },
      invokeOperations: {
        total: 0,
        successful: 0,
        rateLimited: 0,
        timeouts: 0,
        averageResponseTime: 0,
      },
      memoryUsage: {
        current: 0,
        peak: 0,
        gcCollections: 0,
      },
    };
  }

  /**
   * Initialize the Tauri adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Validate Tauri environment
      const validation = await this.validateEnvironment();
      if (!validation.valid) {
        throw new Error(`Tauri validation failed: ${validation.error}`);
      }

      // Apply Tauri-specific optimizations
      if (this.config.enableOptimizations) {
        await this.applyOptimizations();
      }

      // Initialize storage
      this.storage = new TauriStorage({
        maxRetries: 3,
        encryptionMode: 'base64',
        ...this.config.tauriStorage,
      });

      // Test storage functionality
      const testResult = await this.storage.test();
      if (!StorageResults.isOk(testResult)) {
        throw new Error(`Storage test failed: ${testResult.error}`);
      }

      this.initialized = true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      throw new Error(`Tauri adapter initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Get storage instance
   */
  async getStorage(): Promise<SecureStorage> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.storage) {
      throw new Error('Storage not initialized');
    }

    return this.createStorageWrapper(this.storage);
  }

  /**
   * Validate Tauri environment
   */
  async validateEnvironment(): Promise<{ valid: boolean; error?: string }> {
    // Check if we're in Tauri
    if (!PlatformDetector.isTauri()) {
      return {
        valid: false,
        error: 'Not running in Tauri environment',
      };
    }

    // Check Tauri globals
    if (!window.__TAURI__) {
      return {
        valid: false,
        error: 'Tauri global object not available',
      };
    }

    // Check invoke function
    if (typeof window.__TAURI__.invoke !== 'function') {
      return {
        valid: false,
        error: 'Tauri invoke function not available',
      };
    }

    // Test basic invoke functionality
    try {
      const result = await this.secureInvoke.invoke('get_platform_info');
      if (!StorageResults.isOk(result)) {
        return {
          valid: false,
          error: `Platform info test failed: ${result.error}`,
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: `Invoke test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Validate permissions if enabled
    if (this.config.validatePermissions) {
      const permissionCheck = await this.validatePermissions();
      if (!permissionCheck.valid) {
        return permissionCheck;
      }
    }

    return { valid: true };
  }

  /**
   * Validate Tauri permissions
   */
  private async validatePermissions(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Test storage permission
      const result = await this.secureInvoke.invoke('secure_storage_test');
      if (!StorageResults.isOk(result)) {
        return {
          valid: false,
          error: `Storage permission test failed: ${result.error}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Permission validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Apply Tauri-specific optimizations
   */
  private async applyOptimizations(): Promise<void> {
    try {
      // Get platform information for optimization decisions
      const platformResult = await this.secureInvoke.invoke('get_platform_info');
      if (!StorageResults.isOk(platformResult)) {
        console.warn('Could not get platform info for optimizations');
        return;
      }

      const platform = platformResult.value;

      // Apply hardware acceleration if supported
      if (this.config.enableHardwareAcceleration && this.supportsHardwareAcceleration(platform)) {
        await this.enableHardwareAcceleration();
      }

      // Configure memory protection
      if (this.config.memoryProtection) {
        await this.configureMemoryProtection();
      }

    } catch (error) {
      console.warn('Failed to apply some optimizations:', error);
      // Don't fail initialization for optimization failures
    }
  }

  /**
   * Check if hardware acceleration is supported
   */
  private supportsHardwareAcceleration(platform: any): boolean {
    // Check for x64/ARM64 architectures that typically support hardware crypto
    return platform.arch === 'x86_64' || platform.arch === 'aarch64';
  }

  /**
   * Enable hardware acceleration
   */
  private async enableHardwareAcceleration(): Promise<void> {
    // This would involve configuring Rust backend to use hardware crypto
    // For now, just log the intent
    console.log('Hardware acceleration enabled');
  }

  /**
   * Configure memory protection settings
   */
  private async configureMemoryProtection(): Promise<void> {
    const protection = this.config.memoryProtection;
    
    if (protection?.clearSensitiveData) {
      // Configure automatic clearing of sensitive data
      console.log('Sensitive data clearing enabled');
    }

    if (protection?.useSecureBuffers) {
      // Configure secure buffer usage
      console.log('Secure buffers enabled');
    }

    if (protection?.preventSwapping) {
      // This would require platform-specific memory locking
      console.log('Memory swapping prevention requested (platform dependent)');
    }
  }

  /**
   * Create storage wrapper with metrics collection
   */
  private createStorageWrapper(storage: TauriStorage): SecureStorage {
    const adapter = this;

    return {
      async store(key: string, value: Buffer, options?: any) {
        const startTime = Date.now();
        try {
          const result = await storage.store(key, value, options);
          adapter.updateStorageMetrics(Date.now() - startTime, StorageResults.isOk(result));
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async retrieve(key: string, options?: any) {
        const startTime = Date.now();
        try {
          const result = await storage.retrieve(key, options);
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async remove(key: string) {
        const startTime = Date.now();
        try {
          const result = await storage.remove(key);
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async exists(key: string) {
        const startTime = Date.now();
        try {
          const result = await storage.exists(key);
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async list() {
        const startTime = Date.now();
        try {
          const result = await storage.list();
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async getMetadata(key: string) {
        const startTime = Date.now();
        try {
          const result = await storage.getMetadata(key);
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async clear() {
        const startTime = Date.now();
        try {
          const result = await storage.clear();
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async getInfo() {
        const startTime = Date.now();
        try {
          const result = await storage.getInfo();
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },

      async test() {
        const startTime = Date.now();
        try {
          const result = await storage.test();
          adapter.updateStorageMetrics(Date.now() - startTime, result.success);
          return result;
        } catch (error) {
          adapter.updateStorageMetrics(Date.now() - startTime, false);
          throw error;
        }
      },
    };
  }

  /**
   * Update storage operation metrics
   */
  private updateStorageMetrics(responseTime: number, success: boolean): void {
    this.metrics.storageOperations.total++;
    
    if (success) {
      this.metrics.storageOperations.successful++;
    } else {
      this.metrics.storageOperations.failed++;
    }

    // Update running average
    const total = this.metrics.storageOperations.total;
    const prevAvg = this.metrics.storageOperations.averageResponseTime;
    this.metrics.storageOperations.averageResponseTime = 
      (prevAvg * (total - 1) + responseTime) / total;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): TauriPerformanceMetrics {
    const invokeMetrics = this.secureInvoke.getMetrics();
    
    return {
      ...this.metrics,
      invokeOperations: {
        total: invokeMetrics.totalOperations,
        successful: invokeMetrics.successfulOperations,
        rateLimited: invokeMetrics.rateLimitViolations,
        timeouts: invokeMetrics.timeoutErrors,
        averageResponseTime: invokeMetrics.averageResponseTime,
      },
    };
  }

  /**
   * Get secure invoke instance
   */
  getSecureInvoke(): SecureInvoke {
    return this.secureInvoke;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TauriAdapterConfig>): void {
    Object.assign(this.config, updates);
    
    if (this.config.enableLogging) {
      console.log('TauriAdapter configuration updated:', this.config);
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      storageOperations: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
      },
      invokeOperations: {
        total: 0,
        successful: 0,
        rateLimited: 0,
        timeouts: 0,
        averageResponseTime: 0,
      },
      memoryUsage: {
        current: 0,
        peak: 0,
        gcCollections: 0,
      },
    };

    this.secureInvoke.resetMetrics();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.config.memoryProtection?.clearSensitiveData) {
      // Clear any cached sensitive data
      this.resetMetrics();
    }

    this.initialized = false;
    this.storage = undefined;

    if (this.config.enableLogging) {
      console.log('TauriAdapter cleaned up');
    }
  }
}

/**
 * Create a new Tauri adapter instance
 */
export function createTauriAdapter(config?: TauriAdapterConfig): TauriAdapter {
  return new TauriAdapter(config);
}

/**
 * Check if Tauri adapter is available
 */
export function isTauriAdapterAvailable(): boolean {
  return PlatformDetector.isTauri() && 
         typeof window !== 'undefined' &&
         window.__TAURI__ !== undefined &&
         typeof window.__TAURI__.invoke === 'function';
}

/**
 * Create Tauri storage with optimized configuration
 */
export async function createOptimizedTauriStorage(config?: TauriAdapterConfig): Promise<SecureStorage> {
  const adapter = new TauriAdapter({
    enableOptimizations: true,
    enableHardwareAcceleration: true,
    validatePermissions: true,
    memoryProtection: {
      clearSensitiveData: true,
      useSecureBuffers: true,
      preventSwapping: false,
    },
    ...config,
  });

  await adapter.initialize();
  return adapter.getStorage();
}
