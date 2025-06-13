/**
 * @fileoverview Storage factory for creating platform-appropriate secure storage
 * 
 * Provides factory methods for creating the best available secure storage
 * implementation based on platform capabilities and user preferences.
 */

import { PlatformDetector, type PlatformInfo } from '../detector.js';
import { getCapabilitiesManager, type CapabilityAssessment } from '../capabilities.js';
import type { SecureStorage, StorageConfig, StorageResult } from './secure-storage.js';
import { BackendHealthMonitor, type BackendHealth, type HealthCheckConfig } from './backend-health.js';
import { StorageMigrator, type MigrationPlan, type MigrationProgress, MigrationStrategy } from './migration.js';

/**
 * Storage backend types
 */
export type StorageBackend = 
  | 'keychain'          // macOS Keychain
  | 'credential-store'  // Windows Credential Store
  | 'secret-service'    // Linux Secret Service
  | 'encrypted-file'    // Encrypted file storage
  | 'memory'            // In-memory storage
  | 'auto';             // Automatic selection

/**
 * Factory configuration
 */
export interface FactoryConfig extends StorageConfig {
  /** Force specific backend */
  forceBackend?: StorageBackend;
  /** Test backends before selection */
  testBackends?: boolean;
  /** Fallback to less secure storage if needed */
  allowFallbacks?: boolean;
  /** Enable health monitoring */
  enableHealthMonitoring?: boolean;
  /** Health monitoring configuration */
  healthConfig?: Partial<HealthCheckConfig>;
  /** Enable automatic failover */
  enableAutoFailover?: boolean;
  /** Minimum number of healthy backends to maintain */
  minHealthyBackends?: number;
}

/**
 * Backend availability information
 */
export interface BackendInfo {
  /** Backend type */
  type: StorageBackend;
  /** Is available on current platform */
  available: boolean;
  /** Security level */
  securityLevel: 'hardware' | 'os' | 'encrypted' | 'plaintext';
  /** Estimated performance */
  performance: 'high' | 'medium' | 'low';
  /** Limitations or notes */
  limitations: string[];
}

/**
 * Enhanced multi-backend storage implementation with health monitoring and failover
 */
class EnhancedMultiBackendStorage implements SecureStorage {
  private readonly backends: Map<string, SecureStorage> = new Map();
  private readonly backendIds: Map<SecureStorage, string> = new Map();
  private primaryBackendId?: string;
  private readonly config: FactoryConfig;
  private readonly healthMonitor?: BackendHealthMonitor;
  private readonly migrator?: StorageMigrator;
  private failoverInProgress = false;

  constructor(backends: SecureStorage[], config: FactoryConfig, backendTypes: string[]) {
    this.config = config;
    
    // Store backends with meaningful IDs
    backends.forEach((backend, index) => {
      const id = backendTypes[index] || `backend-${index}`;
      this.backends.set(id, backend);
      this.backendIds.set(backend, id);
    });

    // Set primary backend (first working one)
    this.primaryBackendId = Array.from(this.backends.keys())[0];

    // Initialize health monitoring if enabled
    if (config.enableHealthMonitoring) {
      this.healthMonitor = new BackendHealthMonitor(config.healthConfig);
      
      // Register all backends for monitoring
      for (const [id, backend] of this.backends) {
        this.healthMonitor.registerBackend(id, backend);
      }

      // Set up health change listener for automatic failover
      if (config.enableAutoFailover) {
        this.healthMonitor.addListener((backendId, health) => {
          this.handleHealthChange(backendId, health);
        });
      }
    }

    // Initialize migrator if needed
    if (config.enableAutoFailover) {
      this.migrator = new StorageMigrator({
        validateData: true,
        enableRollback: true,
      });
    }
  }

  async store(key: string, value: Buffer, options?: any): Promise<StorageResult> {
    const primaryBackend = this.getPrimaryBackend();
    if (!primaryBackend) {
      return { success: false, error: 'No storage backend available' };
    }

    const startTime = Date.now();
    const result = await this.executeWithHealthTracking(
      this.primaryBackendId!,
      () => primaryBackend.store(key, value, options)
    );
    
    // If primary fails and fallbacks are allowed, try other backends
    if (!result.success && this.config.allowFallbacks && !this.failoverInProgress) {
      for (const [id, backend] of this.backends) {
        if (id === this.primaryBackendId) continue;
        
        const fallbackResult = await this.executeWithHealthTracking(
          id,
          () => backend.store(key, value, options)
        );
        
        if (fallbackResult.success) {
          return fallbackResult;
        }
      }
    }

    return result;
  }

  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    if (!this.primaryBackend) {
      return { success: false, error: 'No storage backend available' };
    }

    // Try primary backend first
    const result = await this.primaryBackend.retrieve(key, options);
    if (result.success) {
      return result;
    }

    // Try other backends if primary fails
    for (const [, backend] of this.backends) {
      if (backend === this.primaryBackend) continue;
      
      const fallbackResult = await backend.retrieve(key, options);
      if (fallbackResult.success) {
        return fallbackResult;
      }
    }

    return result;
  }

  async remove(key: string): Promise<StorageResult> {
    const results: StorageResult[] = [];
    
    // Remove from all backends
    for (const [, backend] of this.backends) {
      const result = await backend.remove(key);
      results.push(result);
    }

    // Success if any backend succeeded
    const anySuccess = results.some(r => r.success);
    return { 
      success: anySuccess,
      error: anySuccess ? undefined : 'Failed to remove from all backends'
    };
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    // Check all backends
    for (const [, backend] of this.backends) {
      const result = await backend.exists(key);
      if (result.success && result.data) {
        return result;
      }
    }

    return { success: true, data: false };
  }

  async list(): Promise<StorageResult<string[]>> {
    const allKeys = new Set<string>();
    
    // Collect keys from all backends
    for (const [, backend] of this.backends) {
      const result = await backend.list();
      if (result.success && result.data) {
        result.data.forEach(key => allKeys.add(key));
      }
    }

    return { success: true, data: Array.from(allKeys) };
  }

  async getMetadata(key: string): Promise<StorageResult<any>> {
    // Try primary backend first
    if (this.primaryBackend) {
      const result = await this.primaryBackend.getMetadata(key);
      if (result.success) {
        return result;
      }
    }

    // Try other backends
    for (const [, backend] of this.backends) {
      if (backend === this.primaryBackend) continue;
      
      const result = await backend.getMetadata(key);
      if (result.success) {
        return result;
      }
    }

    return { success: false, error: 'Key not found in any backend' };
  }

  async clear(): Promise<StorageResult> {
    const results: StorageResult[] = [];
    
    // Clear all backends
    for (const [, backend] of this.backends) {
      const result = await backend.clear();
      results.push(result);
    }

    // Success if any backend succeeded
    const anySuccess = results.some(r => r.success);
    return { 
      success: anySuccess,
      error: anySuccess ? undefined : 'Failed to clear all backends'
    };
  }

  async getInfo(): Promise<StorageResult<any>> {
    if (!this.primaryBackend) {
      return { success: false, error: 'No storage backend available' };
    }

    return this.primaryBackend.getInfo();
  }

  async test(): Promise<StorageResult> {
    const primaryBackend = this.getPrimaryBackend();
    if (!primaryBackend) {
      return { success: false, error: 'No storage backend available' };
    }

    return this.executeWithHealthTracking(
      this.primaryBackendId!,
      () => primaryBackend.test()
    );
  }

  /**
   * Get current primary backend instance
   */
  private getPrimaryBackend(): SecureStorage | undefined {
    if (!this.primaryBackendId) return undefined;
    return this.backends.get(this.primaryBackendId);
  }

  /**
   * Execute operation with health tracking
   */
  private async executeWithHealthTracking<T>(
    backendId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const responseTime = Date.now() - startTime;
      
      // Record success if health monitoring is enabled
      if (this.healthMonitor && 'success' in (result as any)) {
        if ((result as any).success) {
          this.healthMonitor.recordSuccess(backendId, responseTime);
        } else {
          this.healthMonitor.recordError(
            backendId,
            'operation',
            (result as any).error || 'Operation failed',
            responseTime
          );
        }
      }
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Record error if health monitoring is enabled
      if (this.healthMonitor) {
        this.healthMonitor.recordError(
          backendId,
          'operation',
          error instanceof Error ? error.message : 'Unknown error',
          responseTime
        );
      }
      
      throw error;
    }
  }

  /**
   * Handle health changes for automatic failover
   */
  private async handleHealthChange(backendId: string, health: BackendHealth): Promise<void> {
    // If the primary backend becomes unhealthy, initiate failover
    if (backendId === this.primaryBackendId && 
        health.status === 'unhealthy' && 
        this.config.enableAutoFailover &&
        !this.failoverInProgress) {
      
      await this.initiateFailover();
    }
  }

  /**
   * Initiate automatic failover to a healthy backend
   */
  private async initiateFailover(): Promise<void> {
    if (this.failoverInProgress || !this.healthMonitor || !this.migrator) {
      return;
    }

    this.failoverInProgress = true;

    try {
      // Find the best healthy backend
      const bestBackend = this.healthMonitor.getBestBackend();
      
      if (!bestBackend || bestBackend === this.primaryBackendId) {
        console.warn('No suitable backend found for failover');
        return;
      }

      console.log(`Initiating failover from ${this.primaryBackendId} to ${bestBackend}`);

      // Create migration plan
      const sourceStorage = this.backends.get(this.primaryBackendId!);
      const targetStorage = this.backends.get(bestBackend);

      if (!sourceStorage || !targetStorage) {
        console.error('Failed to get storage instances for failover');
        return;
      }

      const migrationPlan = this.migrator.createMigrationPlan(
        sourceStorage,
        targetStorage,
        {
          strategy: MigrationStrategy.ValidateWhileCopy,
          rollbackEnabled: true,
          preserveSource: true,
        }
      );

      // Execute migration
      const progress = await this.migrator.executeMigration(migrationPlan);
      
      if (progress.status === 'completed') {
        // Update primary backend
        this.primaryBackendId = bestBackend;
        console.log(`Failover completed successfully to ${bestBackend}`);
      } else {
        console.error(`Failover migration failed: ${progress.status}`);
      }

    } catch (error) {
      console.error('Failover failed:', error);
    } finally {
      this.failoverInProgress = false;
    }
  }

  /**
   * Get health information for all backends
   */
  getBackendHealth(): Map<string, BackendHealth> | undefined {
    return this.healthMonitor?.getAllHealth();
  }

  /**
   * Get migration status if migration is in progress
   */
  getMigrationStatus(): MigrationProgress[] {
    return this.migrator?.getActiveMigrations() || [];
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthMonitor) {
      this.healthMonitor.shutdown();
    }
    
    if (this.migrator) {
      this.migrator.cleanup();
    }
  }
}

/**
 * Storage factory for creating platform-appropriate storage instances
 */
export class StorageFactory {
  private static readonly backendCache = new Map<string, SecureStorage>();

  /**
   * Create the best available secure storage for the current platform
   */
  static async create(config: FactoryConfig = {}): Promise<SecureStorage> {
    const platform = PlatformDetector.detect();
    const capabilities = getCapabilitiesManager().getCapabilityAssessment();

    // Use forced backend if specified
    if (config.forceBackend && config.forceBackend !== 'auto') {
      return this.createBackend(config.forceBackend, config);
    }

    // Auto-select best backend
    const { backends, backendTypes } = await this.selectBackends(platform, capabilities, config);
    
    if (backends.length === 0) {
      throw new Error('No storage backends available');
    }

    if (backends.length === 1 && !config.enableHealthMonitoring) {
      return backends[0];
    }

    // Use enhanced multi-backend storage for redundancy and health monitoring
    return new EnhancedMultiBackendStorage(backends, config, backendTypes);
  }

  /**
   * Get information about available backends
   */
  static getAvailableBackends(): BackendInfo[] {
    const platform = PlatformDetector.detect();
    const capabilities = getCapabilitiesManager().getCapabilityAssessment();

    return [
      {
        type: 'keychain',
        available: platform.os === 'darwin' && capabilities.secureStorage.available,
        securityLevel: 'os',
        performance: 'medium',
        limitations: ['4KB size limit', 'Requires user permission'],
      },
      {
        type: 'credential-store',
        available: platform.os === 'win32' && capabilities.secureStorage.available,
        securityLevel: 'os',
        performance: 'medium',
        limitations: ['2.5KB size limit', 'May require UAC'],
      },
      {
        type: 'secret-service',
        available: platform.os === 'linux' && capabilities.secureStorage.available,
        securityLevel: 'os',
        performance: 'low',
        limitations: ['Requires D-Bus', 'May not be available on all distros'],
      },
      {
        type: 'encrypted-file',
        available: capabilities.fileSystem.available,
        securityLevel: 'encrypted',
        performance: 'high',
        limitations: ['Software encryption only'],
      },
      {
        type: 'memory',
        available: true,
        securityLevel: 'plaintext',
        performance: 'high',
        limitations: ['Data lost on restart', 'Not persistent'],
      },
    ];
  }

  /**
   * Test a specific backend
   */
  static async testBackend(type: StorageBackend, config?: FactoryConfig): Promise<boolean> {
    try {
      const backend = await this.createBackend(type, config || {});
      const result = await backend.test();
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Clear all cached backends
   */
  static clearCache(): void {
    this.backendCache.clear();
  }

  /**
   * Select the best backends for the current platform
   */
  private static async selectBackends(
    platform: PlatformInfo,
    capabilities: CapabilityAssessment,
    config: FactoryConfig
  ): Promise<{ backends: SecureStorage[]; backendTypes: string[] }> {
    const backends: SecureStorage[] = [];
    const backendTypes: string[] = [];
    const availableBackends = this.getAvailableBackends().filter(b => b.available);
    
    // Sort by security level and performance
    availableBackends.sort((a, b) => {
      const securityOrder = { hardware: 4, os: 3, encrypted: 2, plaintext: 1 };
      const perfOrder = { high: 3, medium: 2, low: 1 };
      
      const aScore = securityOrder[a.securityLevel] * 10 + perfOrder[a.performance];
      const bScore = securityOrder[b.securityLevel] * 10 + perfOrder[b.performance];
      
      return bScore - aScore;
    });

    // Create backends in order of preference
    for (const info of availableBackends) {
      try {
        const backend = await this.createBackend(info.type, config);
        
        // Test backend if requested
        if (config.testBackends) {
          const testResult = await backend.test();
          if (!testResult.success) {
            continue;
          }
        }
        
        backends.push(backend);
        backendTypes.push(info.type);
        
        // For most secure setups, just use the best backend (unless health monitoring is enabled)
        if (!config.allowFallbacks && !config.enableHealthMonitoring && info.securityLevel === 'os') {
          break;
        }
        
        // Limit number of backends (more allowed if health monitoring is enabled)
        const maxBackends = config.enableHealthMonitoring ? 3 : 2;
        if (backends.length >= maxBackends) {
          break;
        }
      } catch (error) {
        console.warn(`Failed to create ${info.type} backend:`, error);
      }
    }

    return { backends, backendTypes };
  }

  /**
   * Create a specific backend instance
   */
  private static async createBackend(type: StorageBackend, config: FactoryConfig): Promise<SecureStorage> {
    const cacheKey = `${type}-${JSON.stringify(config)}`;
    
    if (this.backendCache.has(cacheKey)) {
      return this.backendCache.get(cacheKey)!;
    }

    let backend: SecureStorage;

    switch (type) {
      case 'keychain':
        backend = await this.createKeychainBackend(config);
        break;
      
      case 'credential-store':
        backend = await this.createCredentialStoreBackend(config);
        break;
      
      case 'secret-service':
        backend = await this.createSecretServiceBackend(config);
        break;
      
      case 'encrypted-file':
        backend = await this.createEncryptedFileBackend(config);
        break;
      
      case 'memory':
        backend = await this.createMemoryBackend(config);
        break;
      
      default:
        throw new Error(`Unknown backend type: ${type}`);
    }

    this.backendCache.set(cacheKey, backend);
    return backend;
  }

  /**
   * Create keychain backend (macOS)
   */
  private static async createKeychainBackend(config: FactoryConfig): Promise<SecureStorage> {
    const { KeychainStorage } = await import('./keychain.js');
    return new KeychainStorage(config);
  }

  /**
   * Create credential store backend (Windows)
   */
  private static async createCredentialStoreBackend(config: FactoryConfig): Promise<SecureStorage> {
    const { CredentialStoreStorage } = await import('./credential-store.js');
    return new CredentialStoreStorage(config);
  }

  /**
   * Create secret service backend (Linux)
   */
  private static async createSecretServiceBackend(config: FactoryConfig): Promise<SecureStorage> {
    const { SecretServiceStorage } = await import('./secret-service.js');
    return new SecretServiceStorage(config);
  }

  /**
   * Create encrypted file backend
   */
  private static async createEncryptedFileBackend(config: FactoryConfig): Promise<SecureStorage> {
    const { EncryptedFileStorage } = await import('./encrypted-file.js');
    return new EncryptedFileStorage(config);
  }

  /**
   * Create memory backend
   */
  private static async createMemoryBackend(config: FactoryConfig): Promise<SecureStorage> {
    const { MemoryStorage } = await import('./memory-storage.js');
    return new MemoryStorage(config);
  }
}

/**
 * Convenience function to create secure storage
 */
export async function createSecureStorage(config?: FactoryConfig): Promise<SecureStorage> {
  return StorageFactory.create(config);
}

/**
 * Get available storage backends for current platform
 */
export function getAvailableStorageBackends(): BackendInfo[] {
  return StorageFactory.getAvailableBackends();
}
