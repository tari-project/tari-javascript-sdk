/**
 * Centralized FFI call wrapper with hybrid retry strategy and circuit breaker
 * Provides robust error handling, call logging, and performance tracking
 */

import { TariError, ErrorCode } from '../errors/index.js';
import { generateResourceDiagnostics } from './diagnostics.js';
import { getPlatformOptimizations, getPlatformManager } from './platform-utils.js';
import { getMemoryMonitor, checkMemoryPressure } from './memory.js';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  Closed = 'closed',      // Normal operation
  Open = 'open',          // Failing, requests blocked
  HalfOpen = 'half-open', // Testing if service recovered
}

/**
 * FFI call context for tracking and debugging
 */
export interface CallContext {
  /** Unique identifier for this call */
  requestId: string;
  /** Method name being called */
  method: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Start timestamp */
  startTime: number;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Configuration for FFI call execution
 */
export interface CallOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  backoffBase?: number;
  /** Maximum delay between retries (ms) */
  maxBackoffDelay?: number;
  /** Jitter factor for backoff randomization (0-1) */
  jitter?: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number;
  /** Circuit breaker cooldown period (ms) */
  circuitBreakerCooldown?: number;
  /** Request timeout (ms) */
  timeout?: number;
  /** Additional context for logging */
  context?: Record<string, unknown>;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Performance metrics for a call
 */
export interface CallMetrics {
  /** Request ID */
  requestId: string;
  /** Method name */
  method: string;
  /** Total duration including retries (ms) */
  totalDuration: number;
  /** Number of attempts made */
  attempts: number;
  /** Whether the call succeeded */
  success: boolean;
  /** Final error (if any) */
  error?: Error;
  /** Context metadata */
  context?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Error classification for retry logic
 */
export enum ErrorClassification {
  /** Error should not be retried */
  Fatal = 'fatal',
  /** Error can be retried */
  Retryable = 'retryable',
  /** Circuit breaker should trip */
  CircuitBreaker = 'circuit-breaker',
}

/**
 * FFI-specific errors with retry classification
 */
export class FFICallError extends TariError {
  public readonly classification: ErrorClassification;
  public readonly isRetryable: boolean;
  public readonly context?: CallContext;

  constructor(
    message: string,
    classification: ErrorClassification,
    cause?: Error,
    context?: CallContext
  ) {
    super(
      ErrorCode.FFICallFailed,
      message,
      classification === ErrorClassification.Retryable,
      cause,
      { classification, context }
    );
    
    this.classification = classification;
    this.isRetryable = classification === ErrorClassification.Retryable;
    this.context = context;
  }
}

/**
 * Circuit breaker implementation
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 5, cooldownMs = 30000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  /**
   * Check if calls are allowed through the circuit
   */
  canExecute(): boolean {
    if (this.state === CircuitState.Closed) {
      return true;
    }

    if (this.state === CircuitState.Open) {
      if (Date.now() - this.lastFailureTime > this.cooldownMs) {
        this.state = CircuitState.HalfOpen;
        return true;
      }
      return false;
    }

    // Half-open state - allow one request to test
    return true;
  }

  /**
   * Record a successful call
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.Closed;
  }

  /**
   * Record a failed call
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.Open;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure statistics
   */
  getStats(): { state: CircuitState; failures: number; lastFailure: number } {
    return {
      state: this.state,
      failures: this.failureCount,
      lastFailure: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker (for testing)
   */
  reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Retry strategy implementation with exponential backoff
 */
class RetryStrategy {
  /**
   * Calculate delay for retry attempt with exponential backoff and jitter
   */
  static calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    jitter: number
  ): number {
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitterAmount = exponentialDelay * jitter * Math.random();
    return Math.floor(exponentialDelay + jitterAmount);
  }

  /**
   * Sleep for specified duration
   */
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * FFI call manager with robust error handling and retry logic
 */
export class FFICallManager {
  private static instance: FFICallManager | null = null;
  
  private readonly circuitBreaker: CircuitBreaker;
  private readonly defaultOptions: Required<CallOptions>;
  private readonly metrics: CallMetrics[] = [];
  private callCounter = 0;

  private constructor(options: Partial<CallOptions> = {}) {
    // Get platform-specific optimizations
    const platformOpts = getPlatformOptimizations();
    
    this.defaultOptions = {
      maxRetries: 3,
      backoffBase: 1000,
      maxBackoffDelay: 30000,
      jitter: 0.1,
      circuitBreakerThreshold: 5,
      circuitBreakerCooldown: 30000,
      timeout: 60000,
      context: {},
      tags: [],
      // Apply platform-specific defaults
      ...{
        maxRetries: Math.min(5, Math.max(2, Math.floor(platformOpts.concurrencyLimit / 2))),
        circuitBreakerThreshold: Math.max(3, Math.floor(platformOpts.concurrencyLimit * 0.8)),
        timeout: Math.min(120000, platformOpts.memoryPressureThreshold * 100), // Scale with memory
      },
      ...options,
    };

    this.circuitBreaker = new CircuitBreaker(
      this.defaultOptions.circuitBreakerThreshold,
      this.defaultOptions.circuitBreakerCooldown
    );
  }

  /**
   * Get singleton instance
   */
  static getInstance(options?: Partial<CallOptions>): FFICallManager {
    if (!this.instance) {
      this.instance = new FFICallManager(options);
    }
    return this.instance;
  }

  /**
   * Execute an FFI call with retry logic and circuit breaker protection
   */
  async execute<T extends unknown[], R>(
    method: string,
    fn: (...args: T) => Promise<R> | R,
    args: T,
    options: Partial<CallOptions> = {}
  ): Promise<R> {
    const callOptions = { ...this.defaultOptions, ...options };
    const context = this.createCallContext(method, callOptions);
    
    // Check memory pressure before executing
    const memoryInfo = await checkMemoryPressure();
    if (memoryInfo.level === 'critical') {
      throw new FFICallError(
        'Memory pressure too high - operation aborted',
        ErrorClassification.CircuitBreaker,
        undefined,
        context
      );
    }
    
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= callOptions.maxRetries) {
      try {
        // Check circuit breaker
        if (!this.circuitBreaker.canExecute()) {
          throw new FFICallError(
            'Circuit breaker is open - service unavailable',
            ErrorClassification.CircuitBreaker,
            undefined,
            context
          );
        }

        // Execute the call with timeout
        const result = await this.executeWithTimeout(fn, args, callOptions.timeout, context);
        
        // Record success
        this.circuitBreaker.recordSuccess();
        this.recordMetrics(context, attempt + 1, true);
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const classification = this.classifyError(lastError);
        
        // Record failure
        this.circuitBreaker.recordFailure();
        
        // Check if error is retryable
        if (classification !== ErrorClassification.Retryable || attempt >= callOptions.maxRetries) {
          this.recordMetrics(context, attempt + 1, false, lastError);
          
          throw new FFICallError(
            `FFI call failed: ${lastError.message}`,
            classification,
            lastError,
            context
          );
        }

        // Calculate delay and wait before retry
        const delay = RetryStrategy.calculateDelay(
          attempt,
          callOptions.backoffBase,
          callOptions.maxBackoffDelay,
          callOptions.jitter
        );

        this.logRetry(context, attempt + 1, delay, lastError);
        await RetryStrategy.sleep(delay);
        attempt++;
      }
    }

    // Should not reach here, but just in case
    this.recordMetrics(context, attempt, false, lastError);
    throw new FFICallError(
      'Maximum retry attempts exceeded',
      ErrorClassification.Fatal,
      lastError,
      context
    );
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T extends unknown[], R>(
    fn: (...args: T) => Promise<R> | R,
    args: T,
    timeoutMs: number,
    context: CallContext
  ): Promise<R> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`FFI call timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        Promise.resolve(fn(...args)),
        timeoutPromise,
      ]);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Classify error for retry logic
   */
  private classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase();
    
    // Network and temporary errors are retryable
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('temporary') ||
      message.includes('unavailable') ||
      message.includes('service overloaded')
    ) {
      return ErrorClassification.Retryable;
    }

    // Resource errors that should trip circuit breaker
    if (
      message.includes('service down') ||
      message.includes('server error') ||
      message.includes('internal error')
    ) {
      return ErrorClassification.CircuitBreaker;
    }

    // Everything else is fatal
    return ErrorClassification.Fatal;
  }

  /**
   * Create call context for tracking
   */
  private createCallContext(method: string, options: Required<CallOptions>): CallContext {
    return {
      requestId: `ffi_${Date.now()}_${++this.callCounter}`,
      method,
      metadata: options.context,
      startTime: Date.now(),
      tags: options.tags,
    };
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(
    context: CallContext,
    attempts: number,
    success: boolean,
    error?: Error
  ): void {
    const metrics: CallMetrics = {
      requestId: context.requestId,
      method: context.method,
      totalDuration: Date.now() - context.startTime,
      attempts,
      success,
      error,
      context: context.metadata,
      timestamp: new Date(),
    };

    this.metrics.push(metrics);
    
    // Keep only recent metrics (last 1000 calls)
    if (this.metrics.length > 1000) {
      this.metrics.splice(0, this.metrics.length - 1000);
    }

    this.logMetrics(metrics);
  }

  /**
   * Log retry attempt
   */
  private logRetry(context: CallContext, attempt: number, delay: number, error: Error): void {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `FFI retry [${context.requestId}] ${context.method} attempt ${attempt} failed, retrying in ${delay}ms:`,
        error.message
      );
    }
  }

  /**
   * Log performance metrics
   */
  private logMetrics(metrics: CallMetrics): void {
    if (process.env.NODE_ENV === 'development') {
      const status = metrics.success ? '✅' : '❌';
      console.debug(
        `FFI call ${status} [${metrics.requestId}] ${metrics.method} took ${metrics.totalDuration}ms (${metrics.attempts} attempts)`
      );
    }
  }

  /**
   * Get call statistics
   */
  getStats(): {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageDuration: number;
    circuitBreakerStats: ReturnType<CircuitBreaker['getStats']>;
    recentMetrics: CallMetrics[];
  } {
    const successful = this.metrics.filter(m => m.success);
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.totalDuration, 0);

    return {
      totalCalls: this.metrics.length,
      successfulCalls: successful.length,
      failedCalls: this.metrics.length - successful.length,
      averageDuration: this.metrics.length > 0 ? totalDuration / this.metrics.length : 0,
      circuitBreakerStats: this.circuitBreaker.getStats(),
      recentMetrics: this.metrics.slice(-10),
    };
  }

  /**
   * Get metrics for a specific method
   */
  getMethodStats(method: string): CallMetrics[] {
    return this.metrics.filter(m => m.method === method);
  }

  /**
   * Reset circuit breaker (for testing)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Clear metrics (for testing)
   */
  clearMetrics(): void {
    this.metrics.length = 0;
    this.callCounter = 0;
  }

  /**
   * Generate diagnostic report including resource health
   */
  generateDiagnosticReport(): {
    callStats: ReturnType<FFICallManager['getStats']>;
    resourceHealth: ReturnType<typeof generateResourceDiagnostics>;
    recommendations: string[];
  } {
    const callStats = this.getStats();
    const resourceHealth = generateResourceDiagnostics();
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (callStats.failedCalls / callStats.totalCalls > 0.1) {
      recommendations.push('High failure rate detected - review error handling');
    }

    if (callStats.averageDuration > 5000) {
      recommendations.push('High average call duration - consider optimization');
    }

    if (callStats.circuitBreakerStats.state === CircuitState.Open) {
      recommendations.push('Circuit breaker is open - service may be down');
    }

    return {
      callStats,
      resourceHealth,
      recommendations,
    };
  }
}

/**
 * Convenience functions for global call management
 */

/**
 * Get the global call manager instance
 */
export function getCallManager(): FFICallManager {
  return FFICallManager.getInstance();
}

/**
 * Execute an FFI call with default options
 */
export async function executeFFICall<T extends unknown[], R>(
  method: string,
  fn: (...args: T) => Promise<R> | R,
  args: T,
  options?: Partial<CallOptions>
): Promise<R> {
  return getCallManager().execute(method, fn, args, options);
}

/**
 * Get global call statistics
 */
export function getCallStats() {
  return getCallManager().getStats();
}
