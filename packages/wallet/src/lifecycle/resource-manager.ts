/**
 * @fileoverview Advanced resource management with FinalizationRegistry and automatic cleanup
 * 
 * Provides sophisticated resource tracking, automatic garbage collection cleanup,
 * and comprehensive resource lifecycle management for Tari wallet instances.
 */

import { 
  getFFIBindings,
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity,
  type WalletHandle
} from '@tari-project/tarijs-core';

/**
 * Resource types that can be managed
 */
export enum ResourceType {
  WalletHandle = 'wallet_handle',
  Address = 'address',
  Transaction = 'transaction',
  Contact = 'contact',
  Subscription = 'subscription',
  Cache = 'cache',
  FileHandle = 'file_handle',
  NetworkConnection = 'network_connection'
}

/**
 * Resource metadata for tracking
 */
export interface ResourceMetadata {
  id: string;
  type: ResourceType;
  handle: any;
  created: Date;
  lastAccessed: Date;
  refCount: number;
  walletId: string;
  tags?: string[];
}

/**
 * Cleanup function for resources
 */
export type ResourceCleanupFunction = (handle: any, metadata: ResourceMetadata) => Promise<void> | void;

/**
 * Resource manager statistics
 */
export interface ResourceManagerStats {
  totalResources: number;
  resourcesByType: Record<ResourceType, number>;
  memoryPressure: 'low' | 'medium' | 'high';
  cleanupOperations: number;
  failedCleanups: number;
  averageResourceAge: number;
  oldestResource?: {
    id: string;
    age: number;
    type: ResourceType;
  };
}

/**
 * Resource manager configuration
 */
export interface ResourceManagerConfig {
  enableFinalizationRegistry?: boolean;
  maxResources?: number;
  maxAge?: number; // milliseconds
  memoryPressureThreshold?: number; // MB
  cleanupInterval?: number; // milliseconds
  enableAutoCleanup?: boolean;
  logCleanup?: boolean;
}

/**
 * Advanced resource manager with FinalizationRegistry backup cleanup
 * 
 * This class provides comprehensive resource management including:
 * - Automatic cleanup via FinalizationRegistry when objects are garbage collected
 * - Manual cleanup tracking and execution
 * - Resource leak detection and prevention
 * - Memory pressure monitoring
 * - Resource age tracking and automatic cleanup
 */
export class ResourceManager {
  private static instance: ResourceManager | null = null;
  
  private readonly resources = new Map<string, ResourceMetadata>();
  private readonly cleanupFunctions = new Map<ResourceType, ResourceCleanupFunction>();
  private readonly finalizationRegistry: FinalizationRegistry<{ id: string; type: ResourceType; handle: any }>;
  private readonly config: Required<ResourceManagerConfig>;
  
  private cleanupCount = 0;
  private failedCleanupCount = 0;
  private cleanupInterval?: NodeJS.Timeout;
  private memoryMonitorInterval?: NodeJS.Timeout;

  private constructor(config: ResourceManagerConfig = {}) {
    this.config = {
      enableFinalizationRegistry: true,
      maxResources: 1000,
      maxAge: 30 * 60 * 1000, // 30 minutes
      memoryPressureThreshold: 500, // 500 MB
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      enableAutoCleanup: true,
      logCleanup: false,
      ...config
    };

    // Setup FinalizationRegistry for automatic cleanup
    this.finalizationRegistry = new FinalizationRegistry((heldValue) => {
      this.performFinalizationCleanup(heldValue);
    });

    // Setup default cleanup functions
    this.setupDefaultCleanupFunctions();

    // Start automatic cleanup if enabled
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }

    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  /**
   * Get the singleton resource manager instance
   */
  public static getInstance(config?: ResourceManagerConfig): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager(config);
    }
    return ResourceManager.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (ResourceManager.instance) {
      ResourceManager.instance.destroy();
      ResourceManager.instance = null;
    }
  }

  /**
   * Register a resource for management
   */
  public registerResource<T extends object>(
    resource: T,
    type: ResourceType,
    handle: any,
    walletId: string,
    tags?: string[]
  ): string {
    const id = this.generateResourceId();
    const metadata: ResourceMetadata = {
      id,
      type,
      handle,
      created: new Date(),
      lastAccessed: new Date(),
      refCount: 1,
      walletId,
      tags
    };

    this.resources.set(id, metadata);

    // Register with FinalizationRegistry if enabled
    if (this.config.enableFinalizationRegistry) {
      this.finalizationRegistry.register(resource, { id, type, handle });
    }

    // Check resource limits
    this.checkResourceLimits();

    if (this.config.logCleanup) {
      console.debug(`Resource registered: ${id} (${type}) for wallet ${walletId}`);
    }

    return id;
  }

  /**
   * Register a cleanup function for a resource type
   */
  public registerCleanupFunction(type: ResourceType, cleanup: ResourceCleanupFunction): void {
    this.cleanupFunctions.set(type, cleanup);
  }

  /**
   * Manually cleanup a specific resource
   */
  public async cleanupResource(resourceId: string): Promise<boolean> {
    const metadata = this.resources.get(resourceId);
    if (!metadata) {
      return false;
    }

    try {
      await this.executeResourceCleanup(metadata);
      this.resources.delete(resourceId);
      this.cleanupCount++;
      
      if (this.config.logCleanup) {
        console.debug(`Resource cleaned up: ${resourceId} (${metadata.type})`);
      }
      
      return true;
    } catch (error: unknown) {
      this.failedCleanupCount++;
      console.warn(`Failed to cleanup resource ${resourceId}:`, error);
      return false;
    }
  }

  /**
   * Cleanup all resources for a specific wallet
   */
  public async cleanupWalletResources(walletId: string): Promise<void> {
    const walletResources = Array.from(this.resources.values())
      .filter(metadata => metadata.walletId === walletId);

    const cleanupPromises = walletResources.map(metadata => 
      this.cleanupResource(metadata.id)
    );

    const results = await Promise.allSettled(cleanupPromises);
    const failed = results.filter(result => result.status === 'rejected').length;

    if (failed > 0) {
      console.warn(`Failed to cleanup ${failed}/${walletResources.length} resources for wallet ${walletId}`);
    }

    if (this.config.logCleanup) {
      console.debug(`Cleaned up ${walletResources.length - failed}/${walletResources.length} resources for wallet ${walletId}`);
    }
  }

  /**
   * Update resource access time (for age tracking)
   */
  public touchResource(resourceId: string): void {
    const metadata = this.resources.get(resourceId);
    if (metadata) {
      metadata.lastAccessed = new Date();
    }
  }

  /**
   * Increment resource reference count
   */
  public addRef(resourceId: string): void {
    const metadata = this.resources.get(resourceId);
    if (metadata) {
      metadata.refCount++;
      metadata.lastAccessed = new Date();
    }
  }

  /**
   * Decrement resource reference count and cleanup if zero
   */
  public async release(resourceId: string): Promise<void> {
    const metadata = this.resources.get(resourceId);
    if (!metadata) {
      return;
    }

    metadata.refCount--;
    if (metadata.refCount <= 0) {
      await this.cleanupResource(resourceId);
    }
  }

  /**
   * Get resource manager statistics
   */
  public getStats(): ResourceManagerStats {
    const resourcesByType: Record<ResourceType, number> = {} as any;
    let totalAge = 0;
    let oldestResource: { id: string; age: number; type: ResourceType } | undefined;

    for (const type of Object.values(ResourceType)) {
      resourcesByType[type] = 0;
    }

    const now = Date.now();
    for (const metadata of this.resources.values()) {
      resourcesByType[metadata.type]++;
      
      const age = now - metadata.created.getTime();
      totalAge += age;

      if (!oldestResource || age > oldestResource.age) {
        oldestResource = {
          id: metadata.id,
          age,
          type: metadata.type
        };
      }
    }

    return {
      totalResources: this.resources.size,
      resourcesByType,
      memoryPressure: this.getMemoryPressure(),
      cleanupOperations: this.cleanupCount,
      failedCleanups: this.failedCleanupCount,
      averageResourceAge: this.resources.size > 0 ? totalAge / this.resources.size : 0,
      oldestResource
    };
  }

  /**
   * Force cleanup of old resources
   */
  public async cleanupOldResources(): Promise<number> {
    const now = Date.now();
    const oldResources = Array.from(this.resources.values())
      .filter(metadata => (now - metadata.lastAccessed.getTime()) > this.config.maxAge);

    let cleaned = 0;
    for (const metadata of oldResources) {
      if (await this.cleanupResource(metadata.id)) {
        cleaned++;
      }
    }

    if (this.config.logCleanup && cleaned > 0) {
      console.debug(`Cleaned up ${cleaned} old resources`);
    }

    return cleaned;
  }

  /**
   * Check if resource manager is healthy
   */
  public isHealthy(): boolean {
    const stats = this.getStats();
    return (
      stats.totalResources < this.config.maxResources &&
      stats.memoryPressure !== 'high' &&
      stats.failedCleanups < 10
    );
  }

  /**
   * Destroy the resource manager and cleanup all resources
   */
  public async destroy(): Promise<void> {
    // Stop intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    // Cleanup all remaining resources
    const resourceIds = Array.from(this.resources.keys());
    const cleanupPromises = resourceIds.map(id => this.cleanupResource(id));
    await Promise.allSettled(cleanupPromises);

    this.resources.clear();
    this.cleanupFunctions.clear();
  }

  // Private methods

  private generateResourceId(): string {
    return `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupDefaultCleanupFunctions(): void {
    // Wallet handle cleanup
    this.registerCleanupFunction(ResourceType.WalletHandle, async (handle: WalletHandle) => {
      try {
        const bindings = getFFIBindings();
        await bindings.destroyWallet(handle);
      } catch (error: unknown) {
        console.warn('Failed to destroy wallet handle:', error);
      }
    });

    // Generic cleanup for other resource types
    this.registerCleanupFunction(ResourceType.Address, async () => {
      // No specific cleanup needed for addresses
    });

    this.registerCleanupFunction(ResourceType.Transaction, async () => {
      // Transaction cleanup if needed
    });

    this.registerCleanupFunction(ResourceType.Cache, async (handle: any) => {
      if (handle && typeof handle.clear === 'function') {
        handle.clear();
      }
    });

    this.registerCleanupFunction(ResourceType.Subscription, async (handle: any) => {
      if (handle && typeof handle.unsubscribe === 'function') {
        handle.unsubscribe();
      }
    });

    this.registerCleanupFunction(ResourceType.NetworkConnection, async (handle: any) => {
      if (handle && typeof handle.close === 'function') {
        await handle.close();
      }
    });
  }

  private async executeResourceCleanup(metadata: ResourceMetadata): Promise<void> {
    const cleanupFunction = this.cleanupFunctions.get(metadata.type);
    if (cleanupFunction) {
      await cleanupFunction(metadata.handle, metadata);
    }
  }

  private async performFinalizationCleanup(heldValue: { id: string; type: ResourceType; handle: any }): Promise<void> {
    if (this.config.logCleanup) {
      console.warn(`FinalizationRegistry triggered cleanup for resource ${heldValue.id} (${heldValue.type})`);
    }

    try {
      const cleanupFunction = this.cleanupFunctions.get(heldValue.type);
      if (cleanupFunction) {
        const metadata = this.resources.get(heldValue.id);
        if (metadata) {
          await cleanupFunction(heldValue.handle, metadata);
          this.resources.delete(heldValue.id);
        }
      }
    } catch (error: unknown) {
      console.warn(`FinalizationRegistry cleanup failed for ${heldValue.id}:`, error);
      this.failedCleanupCount++;
    }
  }

  private checkResourceLimits(): void {
    if (this.resources.size > this.config.maxResources) {
      console.warn(`Resource limit exceeded: ${this.resources.size}/${this.config.maxResources}`);
      // Force cleanup of old resources
      this.cleanupOldResources().catch(error => {
        console.warn('Failed to cleanup old resources:', error);
      });
    }
  }

  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupOldResources();
      } catch (error: unknown) {
        console.warn('Auto-cleanup failed:', error);
      }
    }, this.config.cleanupInterval);
  }

  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      try {
        const memoryUsage = process.memoryUsage();
        const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
        
        if (memoryMB > this.config.memoryPressureThreshold) {
          console.warn(`High memory usage detected: ${memoryMB.toFixed(1)} MB`);
          this.cleanupOldResources().catch(error => {
            console.warn('Memory pressure cleanup failed:', error);
          });
        }
      } catch (error: unknown) {
        // Ignore memory monitoring errors
      }
    }, 30000); // Check every 30 seconds
  }

  private getMemoryPressure(): 'low' | 'medium' | 'high' {
    try {
      const memoryUsage = process.memoryUsage();
      const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
      
      if (memoryMB > this.config.memoryPressureThreshold) {
        return 'high';
      } else if (memoryMB > this.config.memoryPressureThreshold * 0.7) {
        return 'medium';
      }
      return 'low';
    } catch {
      return 'low';
    }
  }
}

/**
 * Global resource manager instance
 */
export const globalResourceManager = ResourceManager.getInstance();
