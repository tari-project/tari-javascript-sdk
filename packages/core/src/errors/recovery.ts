/**
 * @fileoverview Error recovery strategies for automatic error handling
 * 
 * Provides automated recovery mechanisms for different types of wallet errors,
 * including connection recovery, resource cleanup, and state restoration.
 */

import { WalletError, isWalletError, createWalletError } from './wallet-error';
import { WalletErrorCode, ErrorCategory } from './codes';
import { createEnrichedErrorContext } from './context';
import { retry, RetryConfigs } from './retry';

/**
 * Recovery action result
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** Recovery action taken */
  action: string;
  /** Additional details about recovery */
  details?: string;
  /** Time taken for recovery in milliseconds */
  timeTaken: number;
  /** Whether the original operation should be retried */
  shouldRetry: boolean;
  /** Recovery metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Recovery strategy interface
 */
export interface RecoveryStrategy {
  /** Name of the recovery strategy */
  name: string;
  /** Error codes this strategy can handle */
  handles: Set<WalletErrorCode>;
  /** Execute recovery action */
  execute(error: WalletError, context?: Record<string, unknown>): Promise<RecoveryResult>;
  /** Check if this strategy can handle the error */
  canHandle(error: WalletError): boolean;
  /** Priority for strategy selection (higher = more preferred) */
  priority: number;
}

/**
 * Abstract base recovery strategy
 */
abstract class BaseRecoveryStrategy implements RecoveryStrategy {
  constructor(
    public name: string,
    public handles: Set<WalletErrorCode>,
    public priority: number = 100
  ) {}

  abstract execute(error: WalletError, context?: Record<string, unknown>): Promise<RecoveryResult>;

  canHandle(error: WalletError): boolean {
    return this.handles.has(error.code);
  }

  protected createResult(
    success: boolean,
    action: string,
    details?: string,
    shouldRetry = true,
    metadata?: Record<string, unknown>
  ): RecoveryResult {
    return {
      success,
      action,
      details,
      timeTaken: 0, // Will be set by recovery manager
      shouldRetry,
      metadata,
    };
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Network connection recovery strategy
 */
export class NetworkRecoveryStrategy extends BaseRecoveryStrategy {
  constructor() {
    super(
      'network-recovery',
      new Set([
        WalletErrorCode.NetworkUnavailable,
        WalletErrorCode.ConnectionFailed,
        WalletErrorCode.ConnectionTimeout,
        WalletErrorCode.BaseNodeUnavailable,
        WalletErrorCode.PeerNotFound,
      ]),
      200 // High priority for network issues
    );
  }

  async execute(error: WalletError, context?: Record<string, unknown>): Promise<RecoveryResult> {
    const networkType = context?.network || error.context?.network;
    
    try {
      // Wait a bit for network to stabilize
      await this.delay(2000);
      
      // Could implement actual network diagnostics here
      // For now, just indicate that we've attempted recovery
      
      return this.createResult(
        true,
        'network-reconnect',
        `Attempted to recover from ${error.code} on network ${networkType}`,
        true,
        { networkType, waitTime: 2000 }
      );
    } catch (recoveryError) {
      return this.createResult(
        false,
        'network-reconnect',
        `Failed to recover from network error: ${recoveryError}`,
        false
      );
    }
  }
}

/**
 * Database recovery strategy
 */
export class DatabaseRecoveryStrategy extends BaseRecoveryStrategy {
  constructor() {
    super(
      'database-recovery',
      new Set([
        WalletErrorCode.DatabaseLocked,
        WalletErrorCode.DatabaseBusy,
        WalletErrorCode.FileAccessDenied,
        WalletErrorCode.TooManyOpenFiles,
      ]),
      150
    );
  }

  async execute(error: WalletError, context?: Record<string, unknown>): Promise<RecoveryResult> {
    const walletIdValue = context?.walletId || error.context?.walletId;
    const walletId = typeof walletIdValue === 'string' ? walletIdValue : undefined;
    
    try {
      switch (error.code) {
        case WalletErrorCode.DatabaseLocked:
          return await this.handleLockedDatabase(walletId);
        
        case WalletErrorCode.DatabaseBusy:
          return await this.handleBusyDatabase();
        
        case WalletErrorCode.FileAccessDenied:
          return await this.handleAccessDenied(walletId);
        
        case WalletErrorCode.TooManyOpenFiles:
          return await this.handleTooManyFiles();
        
        default:
          return this.createResult(
            false,
            'unknown-database-error',
            `No recovery strategy for database error ${error.code}`,
            false
          );
      }
    } catch (recoveryError) {
      return this.createResult(
        false,
        'database-recovery-failed',
        `Database recovery failed: ${recoveryError}`,
        false
      );
    }
  }

  private async handleLockedDatabase(walletId?: string): Promise<RecoveryResult> {
    // Wait for potential lock release
    await this.delay(5000);
    
    return this.createResult(
      true,
      'wait-for-unlock',
      'Waited for database lock to be released',
      true,
      { walletId, waitTime: 5000 }
    );
  }

  private async handleBusyDatabase(): Promise<RecoveryResult> {
    // Shorter wait for busy database
    await this.delay(1000);
    
    return this.createResult(
      true,
      'wait-for-database',
      'Waited for database to become available',
      true,
      { waitTime: 1000 }
    );
  }

  private async handleAccessDenied(walletId?: string): Promise<RecoveryResult> {
    // Check permissions or file existence
    // This is a placeholder - real implementation would check actual file system
    
    return this.createResult(
      false,
      'check-permissions',
      'File access denied - manual intervention required',
      false,
      { walletId, requiresManualIntervention: true }
    );
  }

  private async handleTooManyFiles(): Promise<RecoveryResult> {
    // Attempt to close unused file handles
    // This is a placeholder - real implementation would clean up resources
    
    await this.delay(500);
    
    return this.createResult(
      true,
      'cleanup-file-handles',
      'Attempted to clean up unused file handles',
      true,
      { action: 'cleanup', waitTime: 500 }
    );
  }
}

/**
 * Resource recovery strategy
 */
export class ResourceRecoveryStrategy extends BaseRecoveryStrategy {
  constructor() {
    super(
      'resource-recovery',
      new Set([
        WalletErrorCode.ResourceExhausted,
        WalletErrorCode.MemoryLimitExceeded,
        WalletErrorCode.ResourceTimeout,
        WalletErrorCode.ResourceUnavailable,
        WalletErrorCode.HandleLimitExceeded,
      ]),
      100
    );
  }

  async execute(error: WalletError, context?: Record<string, unknown>): Promise<RecoveryResult> {
    try {
      switch (error.code) {
        case WalletErrorCode.ResourceExhausted:
        case WalletErrorCode.MemoryLimitExceeded:
          return await this.handleMemoryExhaustion();
        
        case WalletErrorCode.ResourceTimeout:
        case WalletErrorCode.ResourceUnavailable:
          return await this.handleResourceTimeout();
        
        case WalletErrorCode.HandleLimitExceeded:
          return await this.handleHandleLimit();
        
        default:
          return this.createResult(
            false,
            'unknown-resource-error',
            `No recovery strategy for resource error ${error.code}`,
            false
          );
      }
    } catch (recoveryError) {
      return this.createResult(
        false,
        'resource-recovery-failed',
        `Resource recovery failed: ${recoveryError}`,
        false
      );
    }
  }

  private async handleMemoryExhaustion(): Promise<RecoveryResult> {
    // Trigger garbage collection if possible
    if (global.gc) {
      global.gc();
    }
    
    // Wait for memory to be freed
    await this.delay(2000);
    
    return this.createResult(
      true,
      'memory-cleanup',
      'Attempted memory cleanup and garbage collection',
      true,
      { gcTriggered: !!global.gc, waitTime: 2000 }
    );
  }

  private async handleResourceTimeout(): Promise<RecoveryResult> {
    // Wait and hope resource becomes available
    await this.delay(3000);
    
    return this.createResult(
      true,
      'wait-for-resource',
      'Waited for resource to become available',
      true,
      { waitTime: 3000 }
    );
  }

  private async handleHandleLimit(): Promise<RecoveryResult> {
    // Attempt to clean up unused handles
    // This is a placeholder - real implementation would call FFI cleanup
    
    await this.delay(1000);
    
    return this.createResult(
      true,
      'cleanup-handles',
      'Attempted to clean up unused resource handles',
      true,
      { action: 'handle-cleanup', waitTime: 1000 }
    );
  }
}

/**
 * FFI recovery strategy
 */
export class FFIRecoveryStrategy extends BaseRecoveryStrategy {
  constructor() {
    super(
      'ffi-recovery',
      new Set([
        WalletErrorCode.UseAfterFree,
        WalletErrorCode.ResourceDestroyed,
        WalletErrorCode.InvalidHandle,
        WalletErrorCode.HandleNotFound,
        WalletErrorCode.ThreadingError,
      ]),
      300 // Highest priority for FFI issues
    );
  }

  async execute(error: WalletError, context?: Record<string, unknown>): Promise<RecoveryResult> {
    const walletIdValue = context?.walletId || error.context?.walletId;
    const walletId = typeof walletIdValue === 'string' ? walletIdValue : undefined;
    
    try {
      switch (error.code) {
        case WalletErrorCode.UseAfterFree:
        case WalletErrorCode.ResourceDestroyed:
          return await this.handleResourceDestroyed(walletId);
        
        case WalletErrorCode.InvalidHandle:
        case WalletErrorCode.HandleNotFound:
          return await this.handleInvalidHandle(walletId);
        
        case WalletErrorCode.ThreadingError:
          return await this.handleThreadingError();
        
        default:
          return this.createResult(
            false,
            'unknown-ffi-error',
            `No recovery strategy for FFI error ${error.code}`,
            false
          );
      }
    } catch (recoveryError) {
      return this.createResult(
        false,
        'ffi-recovery-failed',
        `FFI recovery failed: ${recoveryError}`,
        false
      );
    }
  }

  private async handleResourceDestroyed(walletId?: string): Promise<RecoveryResult> {
    // Resource is destroyed - cannot recover, need to recreate
    return this.createResult(
      false,
      'resource-destroyed',
      'Resource has been destroyed and cannot be recovered',
      false,
      { walletId, requiresRecreation: true }
    );
  }

  private async handleInvalidHandle(walletId?: string): Promise<RecoveryResult> {
    // Invalid handle - need to get a new one
    return this.createResult(
      false,
      'invalid-handle',
      'Handle is invalid and needs to be reacquired',
      false,
      { walletId, requiresNewHandle: true }
    );
  }

  private async handleThreadingError(): Promise<RecoveryResult> {
    // Wait a bit and hope threading issue resolves
    await this.delay(1000);
    
    return this.createResult(
      true,
      'wait-threading',
      'Waited for threading issue to resolve',
      true,
      { waitTime: 1000 }
    );
  }
}

/**
 * Generic recovery strategy for rate limiting
 */
export class RateLimitRecoveryStrategy extends BaseRecoveryStrategy {
  constructor() {
    super(
      'rate-limit-recovery',
      new Set([
        WalletErrorCode.RateLimited,
        WalletErrorCode.TooManyRequests,
      ]),
      50 // Lower priority
    );
  }

  async execute(error: WalletError, context?: Record<string, unknown>): Promise<RecoveryResult> {
    // Extract retry-after information if available
    const retryAfter = this.extractRetryAfter(error);
    const waitTime = retryAfter || 60000; // Default to 1 minute
    
    await this.delay(waitTime);
    
    return this.createResult(
      true,
      'wait-rate-limit',
      `Waited ${waitTime}ms for rate limit to reset`,
      true,
      { waitTime, retryAfter }
    );
  }

  private extractRetryAfter(error: WalletError): number | undefined {
    // Try to extract retry-after from error context
    const metadata = error.context?.metadata;
    if (metadata?.retryAfter && typeof metadata.retryAfter === 'number') {
      return metadata.retryAfter * 1000; // Convert seconds to milliseconds
    }
    return undefined;
  }
}

/**
 * Recovery manager that coordinates recovery strategies
 */
export class RecoveryManager {
  private strategies: RecoveryStrategy[] = [];

  constructor() {
    // Register default strategies
    this.registerStrategy(new NetworkRecoveryStrategy());
    this.registerStrategy(new DatabaseRecoveryStrategy());
    this.registerStrategy(new ResourceRecoveryStrategy());
    this.registerStrategy(new FFIRecoveryStrategy());
    this.registerStrategy(new RateLimitRecoveryStrategy());
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a recovery strategy
   */
  unregisterStrategy(name: string): boolean {
    const index = this.strategies.findIndex(s => s.name === name);
    if (index >= 0) {
      this.strategies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(
    error: WalletError,
    context?: Record<string, unknown>
  ): Promise<RecoveryResult | null> {
    // Find the best strategy for this error
    const strategy = this.findBestStrategy(error);
    if (!strategy) {
      return null;
    }

    const startTime = Date.now();
    
    try {
      const result = await strategy.execute(error, context);
      result.timeTaken = Date.now() - startTime;
      
      return result;
    } catch (recoveryError) {
      return {
        success: false,
        action: strategy.name,
        details: `Recovery strategy failed: ${recoveryError}`,
        timeTaken: Date.now() - startTime,
        shouldRetry: false,
        metadata: { recoveryError: String(recoveryError) },
      };
    }
  }

  /**
   * Find the best recovery strategy for an error
   */
  private findBestStrategy(error: WalletError): RecoveryStrategy | null {
    return this.strategies.find(strategy => strategy.canHandle(error)) || null;
  }

  /**
   * Get all available strategies
   */
  getStrategies(): RecoveryStrategy[] {
    return [...this.strategies];
  }

  /**
   * Get strategies that can handle a specific error
   */
  getStrategiesForError(error: WalletError): RecoveryStrategy[] {
    return this.strategies.filter(strategy => strategy.canHandle(error));
  }
}

/**
 * Global recovery manager instance
 */
export const recoveryManager = new RecoveryManager();

/**
 * Execute operation with automatic recovery
 */
export async function executeWithRecovery<T>(
  operation: () => Promise<T>,
  context?: Record<string, unknown>,
  maxRecoveryAttempts = 1
): Promise<T> {
  let lastError: WalletError | null = null;
  
  for (let recoveryAttempt = 0; recoveryAttempt <= maxRecoveryAttempts; recoveryAttempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isWalletError(error)) {
        throw error;
      }

      lastError = error;

      // Don't attempt recovery on the last attempt
      if (recoveryAttempt >= maxRecoveryAttempts) {
        break;
      }

      // Attempt recovery
      const recoveryResult = await recoveryManager.attemptRecovery(error, context);
      
      if (!recoveryResult) {
        // No recovery strategy available
        throw error;
      }

      if (!recoveryResult.success || !recoveryResult.shouldRetry) {
        // Recovery failed or indicates not to retry
        throw createWalletError(
          error.code,
          `${error.details} (Recovery attempted: ${recoveryResult.action})`,
          createEnrichedErrorContext({
            operation: 'recovery-failed',
            component: 'recovery',
            ...context,
            metadata: {
              originalError: {
                code: error.code,
                message: error.message,
              },
              recoveryResult,
              ...context,
            },
          })
        );
      }

      // Recovery was successful, continue to retry
    }
  }

  // All recovery attempts failed
  throw lastError!;
}

/**
 * Execute with recovery and retry
 */
export async function executeWithRecoveryAndRetry<T>(
  operation: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  return retry(
    async () => {
      return executeWithRecovery(operation, context, 1);
    },
    RetryConfigs.network(),
    context
  );
}

/**
 * Decorator for automatic recovery
 */
export function withRecovery(maxRecoveryAttempts = 1) {
  return function <This, Args extends any[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This>
  ) {
    const methodName = String(context.name);
    
    return async function (this: This, ...args: Args): Promise<Return> {
      return executeWithRecovery(
        () => target.apply(this, args),
        { operation: methodName, component: (this as any).constructor?.name || 'Unknown' },
        maxRecoveryAttempts
      );
    };
  };
}

/**
 * Decorator for automatic recovery with retry
 */
export function withRecoveryAndRetry() {
  return function <This, Args extends any[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This>
  ) {
    const methodName = String(context.name);
    
    return async function (this: This, ...args: Args): Promise<Return> {
      return executeWithRecoveryAndRetry(
        () => target.apply(this, args),
        { operation: methodName, component: (this as any).constructor?.name || 'Unknown' }
      );
    };
  };
}
