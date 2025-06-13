/**
 * Retry strategies with exponential backoff and circuit breaker patterns
 * Provides configurable retry policies for different FFI operation types
 */

import type { CallOptions } from './call-manager';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Policy name for identification */
  name: string;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay: number;
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  /** Jitter factor for randomization (0-1) */
  jitter: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Timeout for individual attempts (ms) */
  attemptTimeout: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;
  /** Circuit breaker cooldown period (ms) */
  circuitBreakerCooldown: number;
}

/**
 * Predefined retry policies for different operation types
 */
export const RetryPolicies = {
  /**
   * Fast operations with quick retries (e.g., validation, simple queries)
   */
  Fast: {
    name: 'fast',
    maxRetries: 2,
    baseDelay: 100,
    maxDelay: 1000,
    jitter: 0.1,
    backoffMultiplier: 2,
    attemptTimeout: 5000,
    circuitBreakerThreshold: 10,
    circuitBreakerCooldown: 10000,
  } as RetryPolicy,

  /**
   * Standard operations with moderate retries (e.g., wallet queries, transactions)
   */
  Standard: {
    name: 'standard',
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    jitter: 0.2,
    backoffMultiplier: 2,
    attemptTimeout: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerCooldown: 30000,
  } as RetryPolicy,

  /**
   * Long operations with patient retries (e.g., wallet sync, heavy computations)
   */
  Patient: {
    name: 'patient',
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    jitter: 0.3,
    backoffMultiplier: 1.5,
    attemptTimeout: 120000,
    circuitBreakerThreshold: 3,
    circuitBreakerCooldown: 60000,
  } as RetryPolicy,

  /**
   * Critical operations with aggressive retries (e.g., wallet creation, key operations)
   */
  Critical: {
    name: 'critical',
    maxRetries: 7,
    baseDelay: 500,
    maxDelay: 30000,
    jitter: 0.15,
    backoffMultiplier: 2,
    attemptTimeout: 90000,
    circuitBreakerThreshold: 8,
    circuitBreakerCooldown: 45000,
  } as RetryPolicy,

  /**
   * Network operations with network-aware retries
   */
  Network: {
    name: 'network',
    maxRetries: 4,
    baseDelay: 1500,
    maxDelay: 20000,
    jitter: 0.25,
    backoffMultiplier: 2,
    attemptTimeout: 45000,
    circuitBreakerThreshold: 6,
    circuitBreakerCooldown: 60000,
  } as RetryPolicy,

  /**
   * No retries for operations that should fail fast
   */
  NoRetry: {
    name: 'no-retry',
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    jitter: 0,
    backoffMultiplier: 1,
    attemptTimeout: 30000,
    circuitBreakerThreshold: 1,
    circuitBreakerCooldown: 5000,
  } as RetryPolicy,
} as const;

/**
 * Retry context for tracking retry state
 */
export interface RetryContext {
  /** Current attempt number (0-based) */
  attempt: number;
  /** Total attempts allowed */
  maxAttempts: number;
  /** Start time of the operation */
  startTime: number;
  /** Time of last attempt */
  lastAttemptTime: number;
  /** Cumulative delay so far */
  totalDelay: number;
  /** Errors from previous attempts */
  previousErrors: Error[];
  /** Policy being used */
  policy: RetryPolicy;
  /** Operation identifier */
  operationId: string;
}

/**
 * Retry decision result
 */
export interface RetryDecision {
  /** Whether to retry */
  shouldRetry: boolean;
  /** Delay before next attempt (ms) */
  delay: number;
  /** Reason for the decision */
  reason: string;
  /** Recommended next policy (if different) */
  suggestedPolicy?: RetryPolicy;
}

/**
 * Adaptive retry strategy that adjusts based on error patterns
 */
export class AdaptiveRetryStrategy {
  private errorHistory: Map<string, { errors: Error[]; timestamps: number[] }> = new Map();
  private policyUsage: Map<string, { successes: number; failures: number }> = new Map();

  /**
   * Analyze error and suggest retry decision
   */
  analyzeRetry(error: Error, context: RetryContext): RetryDecision {
    this.recordError(context.operationId, error);
    
    // Check if we've exceeded max attempts
    if (context.attempt >= context.maxAttempts) {
      return {
        shouldRetry: false,
        delay: 0,
        reason: 'Maximum retry attempts exceeded',
      };
    }

    // Analyze error patterns
    const errorPattern = this.analyzeErrorPattern(context.operationId, error);
    
    // Calculate delay with adaptive adjustments
    const baseDelay = this.calculateAdaptiveDelay(context, errorPattern);
    
    // Apply jitter
    const jitter = context.policy.jitter * baseDelay * Math.random();
    const delay = Math.min(baseDelay + jitter, context.policy.maxDelay);

    // Suggest policy changes based on patterns
    const suggestedPolicy = this.suggestPolicyAdjustment(context.policy, errorPattern);

    return {
      shouldRetry: this.isRetryable(error),
      delay: Math.floor(delay),
      reason: this.getRetryReason(error, context),
      suggestedPolicy,
    };
  }

  /**
   * Calculate adaptive delay based on error patterns
   */
  private calculateAdaptiveDelay(context: RetryContext, errorPattern: ErrorPattern): number {
    const baseDelay = context.policy.baseDelay * 
      Math.pow(context.policy.backoffMultiplier, context.attempt);

    // Adjust based on error pattern
    let multiplier = 1;
    
    if (errorPattern.isRecurring) {
      multiplier *= 1.5; // Slower for recurring errors
    }
    
    if (errorPattern.recentFrequency > 0.5) {
      multiplier *= 2; // Much slower for frequent errors
    }
    
    if (errorPattern.type === 'timeout') {
      multiplier *= 1.2; // Slightly slower for timeouts
    }

    return baseDelay * multiplier;
  }

  /**
   * Analyze error patterns for this operation
   */
  private analyzeErrorPattern(operationId: string, error: Error): ErrorPattern {
    const history = this.errorHistory.get(operationId) || { errors: [], timestamps: [] };
    const now = Date.now();
    
    // Count recent errors (last 5 minutes)
    const recentErrors = history.timestamps.filter(t => now - t < 300000);
    const recentFrequency = recentErrors.length / Math.max(1, history.timestamps.length);
    
    // Check if this error type is recurring
    const sameTypeErrors = history.errors.filter(e => e.constructor === error.constructor);
    const isRecurring = sameTypeErrors.length > 2;
    
    // Classify error type
    const type = this.classifyErrorType(error);

    return {
      type,
      isRecurring,
      recentFrequency,
      totalOccurrences: history.errors.length,
    };
  }

  /**
   * Classify error type for pattern analysis
   */
  private classifyErrorType(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('network') || message.includes('connection')) return 'network';
    if (message.includes('permission') || message.includes('auth')) return 'permission';
    if (message.includes('resource') || message.includes('memory')) return 'resource';
    if (message.includes('validation') || message.includes('invalid')) return 'validation';
    
    return 'unknown';
  }

  /**
   * Suggest policy adjustments based on error patterns
   */
  private suggestPolicyAdjustment(
    currentPolicy: RetryPolicy,
    errorPattern: ErrorPattern
  ): RetryPolicy | undefined {
    // If we're seeing lots of timeouts, suggest more patient policy
    if (errorPattern.type === 'timeout' && errorPattern.recentFrequency > 0.3) {
      if (currentPolicy.name !== 'patient') {
        return RetryPolicies.Patient;
      }
    }

    // If we're seeing validation errors, suggest no retry
    if (errorPattern.type === 'validation' && errorPattern.isRecurring) {
      return RetryPolicies.NoRetry;
    }

    // If network errors are frequent, suggest network policy
    if (errorPattern.type === 'network' && currentPolicy.name !== 'network') {
      return RetryPolicies.Network;
    }

    return undefined;
  }

  /**
   * Record error for pattern analysis
   */
  private recordError(operationId: string, error: Error): void {
    if (!this.errorHistory.has(operationId)) {
      this.errorHistory.set(operationId, { errors: [], timestamps: [] });
    }

    const history = this.errorHistory.get(operationId)!;
    history.errors.push(error);
    history.timestamps.push(Date.now());

    // Keep only recent history (last 100 errors)
    if (history.errors.length > 100) {
      history.errors.splice(0, history.errors.length - 100);
      history.timestamps.splice(0, history.timestamps.length - 100);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Non-retryable errors
    if (
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('bad request') ||
      message.includes('malformed')
    ) {
      return false;
    }

    // Retryable errors
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('temporary') ||
      message.includes('unavailable') ||
      message.includes('overloaded') ||
      message.includes('rate limit')
    );
  }

  /**
   * Get human-readable retry reason
   */
  private getRetryReason(error: Error, context: RetryContext): string {
    const errorType = this.classifyErrorType(error);
    return `Retrying due to ${errorType} error (attempt ${context.attempt + 1}/${context.maxAttempts})`;
  }

  /**
   * Get statistics about retry patterns
   */
  getRetryStats(): {
    totalOperations: number;
    errorPatterns: Array<{
      operationId: string;
      errorCount: number;
      errorTypes: Record<string, number>;
      successRate: number;
    }>;
    policyEffectiveness: Array<{
      policy: string;
      usage: number;
      successRate: number;
    }>;
  } {
    const errorPatterns = Array.from(this.errorHistory.entries()).map(([operationId, history]) => {
      const errorTypes: Record<string, number> = {};
      history.errors.forEach(error => {
        const type = this.classifyErrorType(error);
        errorTypes[type] = (errorTypes[type] || 0) + 1;
      });

      return {
        operationId,
        errorCount: history.errors.length,
        errorTypes,
        successRate: 0, // Would need success tracking to calculate
      };
    });

    const policyEffectiveness = Array.from(this.policyUsage.entries()).map(([policy, stats]) => ({
      policy,
      usage: stats.successes + stats.failures,
      successRate: stats.successes / (stats.successes + stats.failures),
    }));

    return {
      totalOperations: this.errorHistory.size,
      errorPatterns,
      policyEffectiveness,
    };
  }

  /**
   * Clear retry statistics (for testing)
   */
  clearStats(): void {
    this.errorHistory.clear();
    this.policyUsage.clear();
  }
}

/**
 * Error pattern analysis result
 */
interface ErrorPattern {
  type: string;
  isRecurring: boolean;
  recentFrequency: number;
  totalOccurrences: number;
}

/**
 * Convert retry policy to call options
 */
export function policyToCallOptions(policy: RetryPolicy): Partial<CallOptions> {
  return {
    maxRetries: policy.maxRetries,
    backoffBase: policy.baseDelay,
    maxBackoffDelay: policy.maxDelay,
    jitter: policy.jitter,
    circuitBreakerThreshold: policy.circuitBreakerThreshold,
    circuitBreakerCooldown: policy.circuitBreakerCooldown,
    timeout: policy.attemptTimeout,
  };
}

/**
 * Create custom retry policy
 */
export function createRetryPolicy(
  name: string,
  basePolicy: RetryPolicy,
  overrides: Partial<RetryPolicy>
): RetryPolicy {
  return {
    ...basePolicy,
    ...overrides,
    name,
  };
}

/**
 * Get retry policy by operation type
 */
export function getRetryPolicyForOperation(operationType: string): RetryPolicy {
  switch (operationType.toLowerCase()) {
    case 'wallet_create':
    case 'wallet_restore':
    case 'wallet_destroy':
      return RetryPolicies.Critical;
    
    case 'wallet_sync':
    case 'wallet_recovery':
      return RetryPolicies.Patient;
    
    case 'send_transaction':
    case 'wallet_get_balance':
    case 'wallet_get_address':
      return RetryPolicies.Standard;
    
    case 'validate_address':
    case 'get_version':
      return RetryPolicies.Fast;
    
    case 'network_ping':
    case 'base_node_connect':
      return RetryPolicies.Network;
    
    default:
      return RetryPolicies.Standard;
  }
}

/**
 * Global adaptive retry strategy instance
 */
export const globalRetryStrategy = new AdaptiveRetryStrategy();
