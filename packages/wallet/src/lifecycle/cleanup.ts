/**
 * @fileoverview Cleanup utilities and strategies for wallet resources
 * 
 * Provides reusable cleanup patterns, verification utilities, and
 * standardized cleanup procedures for different resource types.
 */

import { 
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity,
  type WalletHandle
} from '@tari-project/tarijs-core';
import { ResourceType, type ResourceMetadata } from './resource-manager.js';

/**
 * Cleanup strategy interface
 */
export interface CleanupStrategy {
  name: string;
  priority: number;
  canHandle(resourceType: ResourceType): boolean;
  cleanup(handle: any, metadata: ResourceMetadata): Promise<void>;
  verify?(handle: any): Promise<boolean>;
}

/**
 * Cleanup execution result
 */
export interface CleanupResult {
  success: boolean;
  resourceId: string;
  resourceType: ResourceType;
  strategy: string;
  duration: number;
  error?: Error;
}

/**
 * Cleanup batch result
 */
export interface CleanupBatchResult {
  total: number;
  successful: number;
  failed: number;
  results: CleanupResult[];
  totalDuration: number;
}

/**
 * Cleanup verification options
 */
export interface CleanupVerificationOptions {
  checkMemoryLeaks?: boolean;
  checkHandleValidity?: boolean;
  checkResourceCount?: boolean;
  timeoutMs?: number;
}

/**
 * Wallet handle cleanup strategy
 */
export class WalletHandleCleanupStrategy implements CleanupStrategy {
  public readonly name = 'WalletHandleCleanup';
  public readonly priority = 100; // High priority

  public canHandle(resourceType: ResourceType): boolean {
    return resourceType === ResourceType.WalletHandle;
  }

  public async cleanup(handle: WalletHandle, metadata: ResourceMetadata): Promise<void> {
    const { getFFIBindings } = await import('@tari-project/tarijs-core');
    
    try {
      const bindings = getFFIBindings();
      await bindings.destroyWallet(handle);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ResourceCleanupFailed,
        `Failed to destroy wallet handle ${metadata.id}`,
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { resourceId: metadata.id, walletId: metadata.walletId }
        }
      );
    }
  }

  public async verify(handle: WalletHandle): Promise<boolean> {
    try {
      const { getFFIBindings } = await import('@tari-project/tarijs-core');
      const bindings = getFFIBindings();
      
      // Try to perform a minimal operation to check if handle is valid
      // This is a simple check - in real implementation, we'd need a proper FFI method
      return typeof handle === 'object' && handle !== null;
    } catch {
      return false;
    }
  }
}

/**
 * Cache cleanup strategy
 */
export class CacheCleanupStrategy implements CleanupStrategy {
  public readonly name = 'CacheCleanup';
  public readonly priority = 50; // Medium priority

  public canHandle(resourceType: ResourceType): boolean {
    return resourceType === ResourceType.Cache;
  }

  public async cleanup(handle: any, metadata: ResourceMetadata): Promise<void> {
    try {
      if (handle && typeof handle === 'object') {
        // Clear different types of caches
        if (typeof handle.clear === 'function') {
          handle.clear();
        } else if (typeof handle.reset === 'function') {
          handle.reset();
        } else if (typeof handle.flush === 'function') {
          await handle.flush();
        } else if (handle instanceof Map) {
          handle.clear();
        } else if (handle instanceof Set) {
          handle.clear();
        }
      }
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ResourceCleanupFailed,
        `Failed to cleanup cache ${metadata.id}`,
        {
          severity: ErrorSeverity.Warning,
          cause: error as Error,
          context: { resourceId: metadata.id }
        }
      );
    }
  }

  public async verify(handle: any): Promise<boolean> {
    if (!handle || typeof handle !== 'object') {
      return true; // Null/undefined cache is considered clean
    }

    try {
      // Check if cache is empty
      if (handle instanceof Map || handle instanceof Set) {
        return handle.size === 0;
      }
      
      if (typeof handle.size === 'number') {
        return handle.size === 0;
      }
      
      if (typeof handle.length === 'number') {
        return handle.length === 0;
      }

      // For objects, check if empty
      if (typeof handle === 'object') {
        return Object.keys(handle).length === 0;
      }

      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Subscription cleanup strategy
 */
export class SubscriptionCleanupStrategy implements CleanupStrategy {
  public readonly name = 'SubscriptionCleanup';
  public readonly priority = 75; // High-medium priority

  public canHandle(resourceType: ResourceType): boolean {
    return resourceType === ResourceType.Subscription;
  }

  public async cleanup(handle: any, metadata: ResourceMetadata): Promise<void> {
    try {
      if (handle && typeof handle === 'object') {
        // Handle different subscription patterns
        if (typeof handle.unsubscribe === 'function') {
          await handle.unsubscribe();
        } else if (typeof handle.cancel === 'function') {
          await handle.cancel();
        } else if (typeof handle.close === 'function') {
          await handle.close();
        } else if (typeof handle.destroy === 'function') {
          await handle.destroy();
        }
      }
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ResourceCleanupFailed,
        `Failed to cleanup subscription ${metadata.id}`,
        {
          severity: ErrorSeverity.Warning,
          cause: error as Error,
          context: { resourceId: metadata.id }
        }
      );
    }
  }

  public async verify(handle: any): Promise<boolean> {
    if (!handle || typeof handle !== 'object') {
      return true;
    }

    try {
      // Check if subscription is closed/cancelled
      if (typeof handle.closed === 'boolean') {
        return handle.closed;
      }
      
      if (typeof handle.cancelled === 'boolean') {
        return handle.cancelled;
      }
      
      if (typeof handle.isActive === 'boolean') {
        return !handle.isActive;
      }

      return true; // Assume clean if we can't verify
    } catch {
      return false;
    }
  }
}

/**
 * Network connection cleanup strategy
 */
export class NetworkConnectionCleanupStrategy implements CleanupStrategy {
  public readonly name = 'NetworkConnectionCleanup';
  public readonly priority = 90; // High priority

  public canHandle(resourceType: ResourceType): boolean {
    return resourceType === ResourceType.NetworkConnection;
  }

  public async cleanup(handle: any, metadata: ResourceMetadata): Promise<void> {
    try {
      if (handle && typeof handle === 'object') {
        if (typeof handle.close === 'function') {
          await handle.close();
        } else if (typeof handle.disconnect === 'function') {
          await handle.disconnect();
        } else if (typeof handle.end === 'function') {
          handle.end();
        }
      }
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ResourceCleanupFailed,
        `Failed to cleanup network connection ${metadata.id}`,
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { resourceId: metadata.id }
        }
      );
    }
  }

  public async verify(handle: any): Promise<boolean> {
    if (!handle || typeof handle !== 'object') {
      return true;
    }

    try {
      // Check connection state
      if (typeof handle.readyState === 'number') {
        // WebSocket-style states: 0=connecting, 1=open, 2=closing, 3=closed
        return handle.readyState === 3;
      }
      
      if (typeof handle.destroyed === 'boolean') {
        return handle.destroyed;
      }
      
      if (typeof handle.closed === 'boolean') {
        return handle.closed;
      }

      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Generic cleanup strategy for simple resources
 */
export class GenericCleanupStrategy implements CleanupStrategy {
  public readonly name = 'GenericCleanup';
  public readonly priority = 10; // Lowest priority (fallback)

  public canHandle(resourceType: ResourceType): boolean {
    return true; // Can handle any resource type as fallback
  }

  public async cleanup(handle: any, metadata: ResourceMetadata): Promise<void> {
    try {
      if (handle && typeof handle === 'object') {
        // Try common cleanup methods
        const cleanupMethods = ['destroy', 'close', 'cleanup', 'dispose', 'free'];
        
        for (const method of cleanupMethods) {
          if (typeof handle[method] === 'function') {
            await handle[method]();
            return;
          }
        }
      }
    } catch (error) {
      // Generic cleanup failures are typically not critical
      console.warn(`Generic cleanup failed for resource ${metadata.id}:`, error);
    }
  }
}

/**
 * Cleanup executor with strategy pattern
 */
export class CleanupExecutor {
  private readonly strategies: CleanupStrategy[] = [];

  constructor() {
    // Register default strategies in priority order
    this.registerStrategy(new WalletHandleCleanupStrategy());
    this.registerStrategy(new NetworkConnectionCleanupStrategy());
    this.registerStrategy(new SubscriptionCleanupStrategy());
    this.registerStrategy(new CacheCleanupStrategy());
    this.registerStrategy(new GenericCleanupStrategy());
  }

  /**
   * Register a cleanup strategy
   */
  public registerStrategy(strategy: CleanupStrategy): void {
    this.strategies.push(strategy);
    // Sort by priority (higher priority first)
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute cleanup for a single resource
   */
  public async executeCleanup(
    handle: any,
    metadata: ResourceMetadata
  ): Promise<CleanupResult> {
    const startTime = Date.now();
    
    // Find the best strategy for this resource type
    const strategy = this.strategies.find(s => s.canHandle(metadata.type)) || 
                    this.strategies.find(s => s.name === 'GenericCleanup')!;

    try {
      await strategy.cleanup(handle, metadata);
      
      const duration = Date.now() - startTime;
      return {
        success: true,
        resourceId: metadata.id,
        resourceType: metadata.type,
        strategy: strategy.name,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        resourceId: metadata.id,
        resourceType: metadata.type,
        strategy: strategy.name,
        duration,
        error: error as Error
      };
    }
  }

  /**
   * Execute cleanup for multiple resources
   */
  public async executeCleanupBatch(
    resources: Array<{ handle: any; metadata: ResourceMetadata }>
  ): Promise<CleanupBatchResult> {
    const startTime = Date.now();
    const results: CleanupResult[] = [];

    // Execute cleanups in parallel but with some concurrency control
    const batchSize = 5; // Process 5 cleanups at a time
    
    for (let i = 0; i < resources.length; i += batchSize) {
      const batch = resources.slice(i, i + batchSize);
      const batchPromises = batch.map(({ handle, metadata }) => 
        this.executeCleanup(handle, metadata)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalDuration = Date.now() - startTime;

    return {
      total: resources.length,
      successful,
      failed,
      results,
      totalDuration
    };
  }

  /**
   * Verify cleanup was successful
   */
  public async verifyCleanup(
    handle: any,
    resourceType: ResourceType,
    options: CleanupVerificationOptions = {}
  ): Promise<boolean> {
    const {
      checkHandleValidity = true,
      timeoutMs = 5000
    } = options;

    if (!checkHandleValidity) {
      return true;
    }

    try {
      // Find strategy that can verify this resource type
      const strategy = this.strategies.find(s => 
        s.canHandle(resourceType) && typeof s.verify === 'function'
      );

      if (!strategy || !strategy.verify) {
        return true; // Can't verify, assume success
      }

      // Run verification with timeout
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Verification timeout')), timeoutMs);
      });

      const verificationPromise = strategy.verify(handle);
      
      return await Promise.race([verificationPromise, timeoutPromise]);
    } catch (error) {
      console.warn('Cleanup verification failed:', error);
      return false;
    }
  }

  /**
   * Get available strategies
   */
  public getStrategies(): CleanupStrategy[] {
    return [...this.strategies];
  }
}

/**
 * Global cleanup executor instance
 */
export const globalCleanupExecutor = new CleanupExecutor();

/**
 * Utility function to execute cleanup with retry
 */
export async function cleanupWithRetry(
  handle: any,
  metadata: ResourceMetadata,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<CleanupResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await globalCleanupExecutor.executeCleanup(handle, metadata);
      if (result.success) {
        return result;
      }
      lastError = result.error;
    } catch (error) {
      lastError = error as Error;
    }

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  return {
    success: false,
    resourceId: metadata.id,
    resourceType: metadata.type,
    strategy: 'RetryCleanup',
    duration: 0,
    error: lastError || new Error('Max retries exceeded')
  };
}
