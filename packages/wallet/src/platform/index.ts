/**
 * @fileoverview Platform features integration and main API
 * 
 * Provides unified access to all platform-specific features with automatic
 * detection and configuration based on runtime environment.
 */

export * from './detector.js';
export * from './capabilities.js';
export * from './runtime.js';

// Storage exports
export * from './storage/secure-storage.js';
export * from './storage/storage-factory.js';
export * from './storage/encryption.js';

// Platform-specific storage
export { KeychainStorage } from './storage/keychain.js';
export { CredentialStoreStorage } from './storage/credential-store.js';
export { SecretServiceStorage } from './storage/secret-service.js';
export { EncryptedFileStorage } from './storage/encrypted-file.js';
export { MemoryStorage } from './storage/memory-storage.js';

// Electron integration (conditional exports)
export type { ElectronWalletService } from '../electron/main/wallet-service.js';
export type { IpcHandlersManager as ElectronIPCHandlers } from '../electron/main/ipc-handlers.js';
export type { ElectronWalletBridge } from '../electron/renderer/wallet-bridge.js';

// Worker integration
export * from '../workers/ffi-proxy.js';

import { PlatformDetector, type PlatformInfo } from './detector.js';
import { getCapabilitiesManager, type CapabilityAssessment, type OptimizationRecommendations } from './capabilities.js';
import { getRuntimeManager, type RuntimeContext } from './runtime.js';
import { createSecureStorage, type StorageBackend } from './storage/storage-factory.js';
import { getElectronWalletService } from '../electron/main/wallet-service.js';
import { getElectronWalletBridge } from '../electron/renderer/wallet-bridge.js';
import { getWorkerFFIProxy } from '../workers/ffi-proxy.js';

/**
 * Platform features configuration
 */
export interface PlatformConfig {
  /** Preferred storage backend */
  storageBackend?: StorageBackend;
  /** Enable Electron integration */
  enableElectron?: boolean;
  /** Enable worker FFI proxy */
  enableWorkerFFI?: boolean;
  /** Enable platform optimizations */
  enableOptimizations?: boolean;
  /** Custom storage encryption key */
  encryptionKey?: Buffer;
}

/**
 * Platform features manager
 */
export class PlatformManager {
  private readonly config: Required<PlatformConfig>;
  private platform?: PlatformInfo;
  private capabilities?: CapabilityAssessment;
  private runtime?: RuntimeContext;
  private secureStorage?: any;

  constructor(config: Partial<PlatformConfig> = {}) {
    this.config = {
      storageBackend: 'auto',
      enableElectron: true,
      enableWorkerFFI: true,
      enableOptimizations: true,
      encryptionKey: Buffer.from('default-key'),
      ...config,
    };
  }

  /**
   * Initialize platform features
   */
  async initialize(): Promise<void> {
    // Detect platform
    this.platform = PlatformDetector.detect();
    
    // Get capabilities
    this.capabilities = getCapabilitiesManager().getCapabilityAssessment();
    
    // Get runtime context
    this.runtime = getRuntimeManager().getCurrentContext();
    
    // Initialize storage
    await this.initializeStorage();
    
    // Initialize platform-specific features
    await this.initializePlatformFeatures();
    
    console.log('Platform features initialized:', {
      os: this.platform.os,
      runtime: this.platform.runtime,
      storage: this.secureStorage?.constructor.name,
    });
  }

  /**
   * Get platform information
   */
  getPlatformInfo(): PlatformInfo {
    if (!this.platform) {
      throw new Error('Platform not initialized');
    }
    return this.platform;
  }

  /**
   * Get capability assessment
   */
  getCapabilities(): CapabilityAssessment {
    if (!this.capabilities) {
      throw new Error('Capabilities not initialized');
    }
    return this.capabilities;
  }

  /**
   * Get runtime context
   */
  getRuntimeContext(): RuntimeContext {
    if (!this.runtime) {
      throw new Error('Runtime not initialized');
    }
    return this.runtime;
  }

  /**
   * Get secure storage instance
   */
  getSecureStorage(): any {
    if (!this.secureStorage) {
      throw new Error('Secure storage not initialized');
    }
    return this.secureStorage;
  }

  /**
   * Get wallet service (Electron main process)
   */
  getWalletService(): any {
    if (!this.config.enableElectron || !PlatformDetector.isElectronMain()) {
      throw new Error('Wallet service not available');
    }
    return getElectronWalletService();
  }

  /**
   * Get wallet bridge (Electron renderer)
   */
  getWalletBridge(): any {
    if (!this.config.enableElectron || !PlatformDetector.isElectronRenderer()) {
      throw new Error('Wallet bridge not available');
    }
    return getElectronWalletBridge();
  }

  /**
   * Get FFI proxy (Worker threads)
   */
  getFFIProxy(): any {
    if (!this.config.enableWorkerFFI || !this.capabilities?.workerThreads.available) {
      throw new Error('FFI proxy not available');
    }
    return getWorkerFFIProxy();
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): OptimizationRecommendations {
    return getCapabilitiesManager().getOptimizationRecommendations();
  }

  /**
   * Check if a feature is available
   */
  isFeatureAvailable(feature: string): boolean {
    switch (feature) {
      case 'secure-storage':
        return this.capabilities?.secureStorage.available || false;
      case 'worker-threads':
        return this.capabilities?.workerThreads.available || false;
      case 'electron':
        return PlatformDetector.isElectron();
      case 'native-modules':
        return this.capabilities?.nativeModules.available || false;
      default:
        return false;
    }
  }

  /**
   * Apply platform optimizations
   */
  async applyOptimizations(): Promise<void> {
    if (!this.config.enableOptimizations) {
      return;
    }

    const recommendations = this.getOptimizationRecommendations();
    
    // Apply memory strategy
    if (recommendations.memoryStrategy === 'aggressive') {
      // Configure aggressive memory usage
      console.log('Applying aggressive memory strategy');
    }

    // Configure concurrency
    console.log(`Configuring concurrency level: ${recommendations.concurrency}`);

    // Apply platform-specific optimizations
    for (const optimization of recommendations.optimizations) {
      console.log(`Applying optimization: ${optimization}`);
    }
  }

  /**
   * Initialize secure storage
   */
  private async initializeStorage(): Promise<void> {
    try {
      this.secureStorage = await createSecureStorage({
        forceBackend: this.config.storageBackend === 'auto' ? undefined : this.config.storageBackend,
        testBackends: true,
        allowFallbacks: true,
        encryptionKey: this.config.encryptionKey,
      });
    } catch (error) {
      console.warn('Failed to initialize secure storage:', error);
      // Fallback to memory storage
      const { MemoryStorage } = await import('./storage/memory-storage.js');
      this.secureStorage = new MemoryStorage();
    }
  }

  /**
   * Initialize platform-specific features
   */
  private async initializePlatformFeatures(): Promise<void> {
    if (!this.platform) return;

    // Initialize Electron features
    if (this.config.enableElectron && PlatformDetector.isElectron()) {
      if (PlatformDetector.isElectronMain()) {
        // Initialize main process features
        const walletService = getElectronWalletService();
        console.log('Electron wallet service initialized');
      } else if (PlatformDetector.isElectronRenderer()) {
        // Initialize renderer features
        const walletBridge = getElectronWalletBridge();
        console.log('Electron wallet bridge initialized');
      }
    }

    // Initialize worker FFI proxy
    if (this.config.enableWorkerFFI && this.capabilities?.workerThreads.available) {
      const ffiProxy = getWorkerFFIProxy();
      if (ffiProxy.isAvailable()) {
        console.log('Worker FFI proxy initialized');
      }
    }

    // Apply optimizations
    await this.applyOptimizations();
  }

  /**
   * Dispose platform manager
   */
  dispose(): void {
    // Clean up resources
    if (this.secureStorage && typeof this.secureStorage.dispose === 'function') {
      this.secureStorage.dispose();
    }
  }
}

/**
 * Global platform manager instance
 */
let globalPlatformManager: PlatformManager | undefined;

/**
 * Get global platform manager
 */
export function getPlatformManager(): PlatformManager {
  if (!globalPlatformManager) {
    globalPlatformManager = new PlatformManager();
  }
  return globalPlatformManager;
}

/**
 * Initialize platform features with configuration
 */
export async function initializePlatform(config?: Partial<PlatformConfig>): Promise<PlatformManager> {
  if (globalPlatformManager) {
    globalPlatformManager.dispose();
  }
  
  globalPlatformManager = new PlatformManager(config);
  await globalPlatformManager.initialize();
  
  return globalPlatformManager;
}

/**
 * Quick platform feature checks
 */
export const platform = {
  isNode: () => PlatformDetector.isNode(),
  isElectron: () => PlatformDetector.isElectron(),
  isElectronMain: () => PlatformDetector.isElectronMain(),
  isElectronRenderer: () => PlatformDetector.isElectronRenderer(),
  isBrowser: () => PlatformDetector.isBrowser(),
  hasSecureStorage: () => PlatformDetector.hasCapability('secureStorage'),
  hasWorkerThreads: () => PlatformDetector.hasCapability('workerThreads'),
  hasNativeModules: () => PlatformDetector.hasCapability('nativeModules'),
};
