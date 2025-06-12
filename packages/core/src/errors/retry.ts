/**
 * @fileoverview Retry logic and circuit breaker implementation
 * 
 * Provides sophisticated retry mechanisms with exponential backoff, jitter,
 * and circuit breaker patterns for handling transient failures in wallet operations.
 */

import { WalletError, isWalletError, createWalletError } from './wallet-error.js';
import type { ErrorContext } from './wallet-error.js';
import { WalletErrorCode } from './codes.js';
import { createEnrichedErrorContext, ErrorContextInstance } from './context.js';

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay between retries in milliseconds */
  baseDelay: number;
  /** Maximum delay between retries in milliseconds */
  maxDelay: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Whether to add jitter to delay calculations */
  jitter: boolean;
  /** Maximum jitter percentage (0-1) */
  maxJitter: number;
  /** Error codes that should trigger retries */
  retryableErrors: Set<WalletErrorCode>;
  /** Function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Timeout for each individual attempt in milliseconds */
  attemptTimeout?: number;
  /** Whether to escalate delay on consecutive failures */
  escalateDelay: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2.0,
  jitter: true,
  maxJitter: 0.1, // 10%
  escalateDelay: true,
  retryableErrors: new Set([
    // Network errors (often transient)
    WalletErrorCode.NetworkUnavailable,
    WalletErrorCode.ConnectionFailed,
    WalletErrorCode.ConnectionTimeout,
    WalletErrorCode.BaseNodeUnavailable,
    WalletErrorCode.TooManyRequests,
    WalletErrorCode.ServiceUnavailable,
    WalletErrorCode.NetworkPartition,
    
    // Resource errors (may resolve)
    WalletErrorCode.DatabaseLocked,
    WalletErrorCode.DatabaseBusy,
    WalletErrorCode.ResourceTimeout,
    WalletErrorCode.ResourceUnavailable,
    WalletErrorCode.MemoryLimitExceeded,
    WalletErrorCode.TooManyOpenFiles,
    
    // FFI errors (may be transient)
    WalletErrorCode.ThreadingError,
    WalletErrorCode.AsyncOperationFailed,
    
    // General transient errors
    WalletErrorCode.OperationTimeout,
    WalletErrorCode.RateLimited,
    WalletErrorCode.ServiceDegraded,
    WalletErrorCode.InternalError,
  ]),
};

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  /** Attempt number (1-based) */
  attemptNumber: number;
  /** Delay before this attempt in milliseconds */
  delay: number;
  /** Error from previous attempt */
  previousError?: unknown;
  /** Timestamp of attempt */
  timestamp: Date;
  /** Total elapsed time since first attempt */
  elapsedTime: number;
}

/**
 * Retry result information
 */
export interface RetryResult<T> {
  /** Final result if successful */
  result?: T;
  /** Final error if all attempts failed */
  error?: unknown;
  /** Whether the operation ultimately succeeded */
  success: boolean;
  /** Total number of attempts made */
  totalAttempts: number;
  /** Total time elapsed during retry process */
  totalTime: number;
  /** Details of each retry attempt */
  attempts: RetryAttempt[];
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  Closed = 'closed',     // Normal operation
  Open = 'open',         // Failing fast
  HalfOpen = 'half-open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before attempting to close circuit (ms) */
  recoveryTimeout: number;
  /** Number of successful calls needed to close circuit from half-open */
  successThreshold: number;
  /** Time window for failure counting (ms) */
  timeWindow: number;
  /** Whether to reset failure count on success */
  resetOnSuccess: boolean;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  successThreshold: 3,
  timeWindow: 300000, // 5 minutes
  resetOnSuccess: true,
};

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;
  private failures: number[] = []; // Timestamps of failures

  constructor(
    private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG,
    private name = 'unnamed'
  ) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.Open) {
      if (Date.now() < this.nextAttemptTime) {
        throw createWalletError(
          WalletErrorCode.ServiceUnavailable,
          `Circuit breaker '${this.name}' is open`,
          createEnrichedErrorContext({
            operation: 'circuit-breaker',
            component: 'retry',
            metadata: {
              circuitName: this.name,
              state: this.state,
              failureCount: this.failureCount,
              nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
            },
          })
        );
      } else {
        this.state = CircuitState.HalfOpen;
        this.successCount = 0;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
      }
    } else if (this.config.resetOnSuccess) {
      this.reset();
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failures.push(now);
    
    // Remove old failures outside time window
    const cutoff = now - this.config.timeWindow;
    this.failures = this.failures.filter(timestamp => timestamp > cutoff);
    
    this.failureCount = this.failures.length;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.Open;
      this.nextAttemptTime = now + this.config.recoveryTimeout;
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  private reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    nextAttemptTime?: Date;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime > 0 ? new Date(this.nextAttemptTime) : undefined,
    };
  }
}

/**
 * Retry mechanism with exponential backoff and circuit breaker
 */
export class RetryManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(
    private config: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {}

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      context?: Partial<ErrorContext>;
      config?: Partial<RetryConfig>;
      circuitBreakerKey?: string;
    } = {}
  ): Promise<T> {
    const retryConfig = { ...this.config, ...options.config };
    const context = options.context || {};
    
    // Get or create circuit breaker if key provided
    let circuitBreaker: CircuitBreaker | undefined;
    if (options.circuitBreakerKey) {
      if (!this.circuitBreakers.has(options.circuitBreakerKey)) {
        this.circuitBreakers.set(
          options.circuitBreakerKey,
          new CircuitBreaker(DEFAULT_CIRCUIT_CONFIG, options.circuitBreakerKey)
        );
      }
      circuitBreaker = this.circuitBreakers.get(options.circuitBreakerKey);
    }

    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: unknown;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      const attemptStartTime = Date.now();
      
      try {
        // Execute with circuit breaker if available
        const result = circuitBreaker
          ? await circuitBreaker.execute(operation)
          : await this.executeWithTimeout(operation, retryConfig.attemptTimeout);
        
        // Success - return result
        return result;
      } catch (error) {
        lastError = error;
        
        const attemptInfo: RetryAttempt = {
          attemptNumber: attempt,
          delay: 0, // Will be set if we retry
          previousError: error,
          timestamp: new Date(attemptStartTime),
          elapsedTime: Date.now() - startTime,
        };
        attempts.push(attemptInfo);

        // Check if we should retry
        if (attempt === retryConfig.maxAttempts || !this.shouldRetry(error, retryConfig)) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, retryConfig);
        attemptInfo.delay = delay;

        // Add context for retry
        ErrorContextInstance.addContextValues({
          retryAttempt: attempt,
          maxAttempts: retryConfig.maxAttempts,
          nextDelayMs: delay,
          ...context,
        });

        // Wait before next attempt
        await this.delay(delay);
      }
    }

    // All attempts failed - throw enhanced error
    const totalTime = Date.now() - startTime;
    const enhancedError = this.createRetryError(lastError!, {
      totalAttempts: attempts.length,
      totalTime,
      attempts,
      config: retryConfig,
      context,
    });

    throw enhancedError;
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout?: number
  ): Promise<T> {
    if (!timeout) {
      return operation();
    }

    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(createWalletError(
            WalletErrorCode.OperationTimeout,
            `Operation timed out after ${timeout}ms`
          ));
        }, timeout);
      }),
    ]);
  }

  /**
   * Determine if error should trigger a retry
   */
  private shouldRetry(error: unknown, config: RetryConfig): boolean {
    // Use custom retry logic if provided
    if (config.isRetryable) {
      return config.isRetryable(error);
    }

    // Check if it's a WalletError with retryable code
    if (isWalletError(error)) {
      return error.recoverable || config.retryableErrors.has(error.code);
    }

    // Default to not retrying unknown errors
    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff: delay = baseDelay * (multiplier ^ (attempt - 1))
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter if enabled
    if (config.jitter) {
      const jitterAmount = delay * config.maxJitter * Math.random();
      delay += jitterAmount;
    }
    
    return Math.floor(delay);
  }

  /**
   * Create delay promise
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create enhanced error with retry information
   */
  private createRetryError(
    originalError: unknown,
    retryInfo: {
      totalAttempts: number;
      totalTime: number;
      attempts: RetryAttempt[];
      config: RetryConfig;
      context: Partial<ErrorContext>;
    }
  ): WalletError {
    const baseMessage = isWalletError(originalError)
      ? originalError.details
      : String(originalError);

    const context = createEnrichedErrorContext({
      operation: 'retry-failed',
      component: 'retry',
      ...retryInfo.context,
      metadata: {
        totalAttempts: retryInfo.totalAttempts,
        totalTime: retryInfo.totalTime,
        maxAttempts: retryInfo.config.maxAttempts,
        baseDelay: retryInfo.config.baseDelay,
        maxDelay: retryInfo.config.maxDelay,
        attempts: retryInfo.attempts.map(attempt => ({
          attemptNumber: attempt.attemptNumber,
          delay: attempt.delay,
          timestamp: attempt.timestamp.toISOString(),
          elapsedTime: attempt.elapsedTime,
        })),
        lastError: isWalletError(originalError) ? {
          code: originalError.code,
          category: originalError.category,
          message: originalError.message,
        } : String(originalError),
        ...retryInfo.context.metadata,
      },
    });

    return createWalletError(
      WalletErrorCode.OperationTimeout,
      `Operation failed after ${retryInfo.totalAttempts} attempts: ${baseMessage}`,
      context
    );
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(key: string) {
    const circuitBreaker = this.circuitBreakers.get(key);
    return circuitBreaker?.getStatus();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(key: string): void {
    this.circuitBreakers.delete(key);
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.clear();
  }
}

/**
 * Global retry manager instance
 */
export const retryManager = new RetryManager();

/**
 * Convenience function for retrying operations
 */
export async function retry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
  context?: Partial<ErrorContext>
): Promise<T> {
  return retryManager.executeWithRetry(operation, { config, context });
}

/**
 * Convenience function for retrying with circuit breaker
 */
export async function retryWithCircuitBreaker<T>(
  operation: () => Promise<T>,
  circuitBreakerKey: string,
  config?: Partial<RetryConfig>,
  context?: Partial<ErrorContext>
): Promise<T> {
  return retryManager.executeWithRetry(operation, {
    config,
    context,
    circuitBreakerKey,
  });
}

/**
 * Decorator for automatic retry on method calls
 */
export function withRetry(config?: Partial<RetryConfig>) {
  return function <This, Args extends any[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This>
  ) {
    const methodName = String(context.name);
    
    return async function (this: This, ...args: Args): Promise<Return> {
      return retry(
        () => target.apply(this, args),
        config,
        { operation: methodName, component: (this as any).constructor?.name || 'Unknown' }
      );
    };
  };
}

/**
 * Decorator for automatic retry with circuit breaker
 */
export function withCircuitBreaker(
  circuitBreakerKey: string,
  config?: Partial<RetryConfig>
) {
  return function <This, Args extends any[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This>
  ) {
    const methodName = String(context.name);
    
    return async function (this: This, ...args: Args): Promise<Return> {
      return retryWithCircuitBreaker(
        () => target.apply(this, args),
        circuitBreakerKey,
        config,
        { operation: methodName, component: (this as any).constructor?.name || 'Unknown' }
      );
    };
  };
}

/**
 * Utility to create custom retry configuration for specific scenarios
 */
export const RetryConfigs = {
  /**
   * Fast retry for quick operations
   */
  fast: (): Partial<RetryConfig> => ({
    maxAttempts: 3,
    baseDelay: 100,
    maxDelay: 2000,
    backoffMultiplier: 1.5,
  }),

  /**
   * Network operation retry
   */
  network: (): Partial<RetryConfig> => ({
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2.0,
    jitter: true,
  }),

  /**
   * Database operation retry
   */
  database: (): Partial<RetryConfig> => ({
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2.0,
    retryableErrors: new Set([
      WalletErrorCode.DatabaseLocked,
      WalletErrorCode.DatabaseBusy,
      WalletErrorCode.ResourceTimeout,
    ]),
  }),

  /**
   * Transaction operation retry
   */
  transaction: (): Partial<RetryConfig> => ({
    maxAttempts: 2, // Conservative for financial operations
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 3.0,
    retryableErrors: new Set([
      WalletErrorCode.NetworkUnavailable,
      WalletErrorCode.ConnectionTimeout,
      WalletErrorCode.ServiceUnavailable,
    ]),
  }),

  /**
   * No retry configuration
   */
  none: (): Partial<RetryConfig> => ({
    maxAttempts: 1,
  }),
};
