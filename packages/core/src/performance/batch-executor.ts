import { DisposableResource } from '../memory/disposable';
import { CallBatcher, PendingCall, BatchResult } from './call-batcher';
import { BatchQueue, QueuedCall } from './batch-queue';

/**
 * Batch executor for processing FFI calls efficiently
 * Coordinates between batching, queuing, and actual execution
 */

/**
 * Execution strategy for batches
 */
export type ExecutionStrategy = 'parallel' | 'sequential' | 'mixed' | 'adaptive';

/**
 * Execution configuration
 */
export interface ExecutorConfig {
  /** Execution strategy */
  strategy: ExecutionStrategy;
  /** Maximum parallel executions */
  maxParallel: number;
  /** Timeout for individual calls (ms) */
  callTimeout: number;
  /** Timeout for entire batch (ms) */
  batchTimeout: number;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Enable detailed monitoring */
  enableMonitoring: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  timeout: number;
  monitoringPeriod: number;
}

/**
 * Execution statistics
 */
export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  retriedExecutions: number;
  avgExecutionTime: number;
  maxExecutionTime: number;
  minExecutionTime: number;
  circuitBreakerTrips: number;
  currentLoad: number;
}

/**
 * Batch execution context
 */
export interface ExecutionContext {
  batchId: string;
  startTime: number;
  calls: QueuedCall[];
  results: Map<string, BatchResult>;
  errors: Error[];
}

/**
 * Main batch executor
 */
export class BatchExecutor extends DisposableResource {
  private readonly config: ExecutorConfig;
  private readonly stats: ExecutionStats;
  private readonly activeExecutions = new Map<string, ExecutionContext>();
  private readonly circuitBreaker: CircuitBreaker;
  private executionCounter = 0;

  constructor(config: Partial<ExecutorConfig> = {}) {
    super();
    
    this.config = {
      strategy: 'adaptive',
      maxParallel: 10,
      callTimeout: 30000, // 30 seconds
      batchTimeout: 60000, // 1 minute
      retryConfig: {
        enabled: true,
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE']
      },
      circuitBreakerConfig: {
        enabled: true,
        failureThreshold: 5,
        timeout: 30000,
        monitoringPeriod: 60000
      },
      enableMonitoring: true,
      ...config
    };

    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      retriedExecutions: 0,
      avgExecutionTime: 0,
      maxExecutionTime: 0,
      minExecutionTime: Number.MAX_SAFE_INTEGER,
      circuitBreakerTrips: 0,
      currentLoad: 0
    };

    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreakerConfig);
  }

  /**
   * Execute a batch of calls
   */
  async executeBatch(calls: QueuedCall[]): Promise<BatchResult[]> {
    this.checkDisposed();

    if (calls.length === 0) return [];

    // Check circuit breaker
    if (this.config.circuitBreakerConfig.enabled && this.circuitBreaker.isOpen) {
      throw new Error('Circuit breaker is open - calls rejected');
    }

    const context = this.createExecutionContext(calls);
    this.activeExecutions.set(context.batchId, context);

    try {
      const results = await this.executeWithStrategy(context);
      this.updateSuccessStats(context);
      return results;
    } catch (error) {
      this.updateFailureStats(context, error);
      throw error;
    } finally {
      this.activeExecutions.delete(context.batchId);
    }
  }

  /**
   * Get current execution statistics
   */
  getStats(): ExecutionStats {
    return {
      ...this.stats,
      currentLoad: this.activeExecutions.size
    };
  }

  /**
   * Get active execution contexts
   */
  getActiveExecutions(): ExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Cancel all active executions
   */
  async cancelAll(): Promise<void> {
    const contexts = Array.from(this.activeExecutions.values());
    
    for (const context of contexts) {
      try {
        await this.cancelExecution(context);
      } catch (error) {
        console.warn(`Error canceling execution ${context.batchId}:`, error);
      }
    }
  }

  /**
   * Create execution context for a batch
   */
  private createExecutionContext(calls: QueuedCall[]): ExecutionContext {
    return {
      batchId: `batch_${++this.executionCounter}_${Date.now()}`,
      startTime: Date.now(),
      calls: [...calls],
      results: new Map(),
      errors: []
    };
  }

  /**
   * Execute batch according to configured strategy
   */
  private async executeWithStrategy(context: ExecutionContext): Promise<BatchResult[]> {
    const timeoutPromise = this.createTimeoutPromise(context);
    
    const executionPromise = (async () => {
      switch (this.config.strategy) {
        case 'parallel':
          return await this.executeParallel(context);
        
        case 'sequential':
          return await this.executeSequential(context);
        
        case 'mixed':
          return await this.executeMixed(context);
        
        case 'adaptive':
          return await this.executeAdaptive(context);
        
        default:
          throw new Error(`Unknown execution strategy: ${this.config.strategy}`);
      }
    })();

    return await Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Execute all calls in parallel
   */
  private async executeParallel(context: ExecutionContext): Promise<BatchResult[]> {
    const promises = context.calls.map(call => this.executeCall(call, context));
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      const call = context.calls[index];
      return {
        id: call.id,
        result: result.status === 'fulfilled' ? result.value : undefined,
        error: result.status === 'rejected' ? result.reason : undefined
      };
    });
  }

  /**
   * Execute calls sequentially
   */
  private async executeSequential(context: ExecutionContext): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    for (const call of context.calls) {
      try {
        const result = await this.executeCall(call, context);
        results.push({ id: call.id, result });
      } catch (error) {
        results.push({ id: call.id, error });
      }
    }
    
    return results;
  }

  /**
   * Execute with mixed strategy (high priority parallel, others sequential)
   */
  private async executeMixed(context: ExecutionContext): Promise<BatchResult[]> {
    const highPriority = context.calls.filter(call => call.priority >= 8);
    const lowPriority = context.calls.filter(call => call.priority < 8);
    
    const results: BatchResult[] = [];
    
    // Execute high priority in parallel
    if (highPriority.length > 0) {
      const parallelResults = await this.executeParallel({
        ...context,
        calls: highPriority
      });
      results.push(...parallelResults);
    }
    
    // Execute low priority sequentially
    if (lowPriority.length > 0) {
      const sequentialResults = await this.executeSequential({
        ...context,
        calls: lowPriority
      });
      results.push(...sequentialResults);
    }
    
    return results;
  }

  /**
   * Execute with adaptive strategy based on current load
   */
  private async executeAdaptive(context: ExecutionContext): Promise<BatchResult[]> {
    const currentLoad = this.activeExecutions.size;
    const maxParallel = this.config.maxParallel;
    
    if (currentLoad < maxParallel * 0.5) {
      // Low load - use parallel execution
      return await this.executeParallel(context);
    } else if (currentLoad < maxParallel * 0.8) {
      // Medium load - use mixed execution
      return await this.executeMixed(context);
    } else {
      // High load - use sequential execution
      return await this.executeSequential(context);
    }
  }

  /**
   * Execute a single call with retry logic
   */
  private async executeCall(call: QueuedCall, context: ExecutionContext): Promise<any> {
    let lastError: Error | undefined;
    let attempt = 0;
    
    while (attempt < (this.config.retryConfig.enabled ? this.config.retryConfig.maxAttempts : 1)) {
      try {
        const result = await this.executeFFICall(call);
        
        if (attempt > 0) {
          this.stats.retriedExecutions++;
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError) || 
            attempt >= this.config.retryConfig.maxAttempts - 1) {
          break;
        }
        
        // Wait before retry
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
        attempt++;
      }
    }
    
    // Circuit breaker tracking
    if (this.config.circuitBreakerConfig.enabled && lastError) {
      this.circuitBreaker.recordFailure();
    }
    
    throw lastError || new Error('Call failed after retries');
  }

  /**
   * Execute actual FFI call
   */
  private async executeFFICall(call: QueuedCall): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Create timeout promise for individual call
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Call timeout after ${this.config.callTimeout}ms`));
        }, this.config.callTimeout);
      });
      
      // Execute the actual FFI call
      const executionPromise = this.performFFICall(call);
      
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      // Record success in circuit breaker
      if (this.config.circuitBreakerConfig.enabled) {
        this.circuitBreaker.recordSuccess();
      }
      
      return result;
    } finally {
      // Update execution time stats
      if (this.config.enableMonitoring) {
        this.updateExecutionTimeStats(Date.now() - startTime);
      }
    }
  }

  /**
   * Perform the actual FFI call
   */
  private async performFFICall(call: QueuedCall): Promise<any> {
    // This is where the actual FFI integration would happen
    // Replace with real minotari_wallet_ffi calls
    
    if (process.env.NODE_ENV === 'development') {
      console.debug(`Executing FFI call: ${call.functionName}`, {
        id: call.id,
        priority: call.priority,
        args: call.args
      });
    }
    
    // Simulate FFI execution
    return new Promise((resolve, reject) => {
      // Simulate async execution with variable timing
      const executionTime = Math.random() * 100 + 50; // 50-150ms
      
      setTimeout(() => {
        try {
          // This would be replaced with actual FFI calls like:
          // const result = await ffi[call.functionName](...call.args);
          
          const result = {
            success: true,
            functionName: call.functionName,
            callId: call.id,
            executionTime
          };
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, executionTime);
    });
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    if (!this.config.retryConfig.enabled) return false;
    
    return this.config.retryConfig.retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const { baseDelay, maxDelay, backoffMultiplier } = this.config.retryConfig;
    const delay = baseDelay * Math.pow(backoffMultiplier, attempt);
    return Math.min(delay, maxDelay);
  }

  /**
   * Create timeout promise for batch execution
   */
  private createTimeoutPromise(context: ExecutionContext): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Batch timeout after ${this.config.batchTimeout}ms`));
      }, this.config.batchTimeout);
    });
  }

  /**
   * Cancel a specific execution
   */
  private async cancelExecution(context: ExecutionContext): Promise<void> {
    // In a real implementation, this would cancel ongoing FFI calls
    // For now, we'll just mark as cancelled
    context.errors.push(new Error('Execution cancelled'));
    
    // Reject all pending calls
    for (const call of context.calls) {
      if (!context.results.has(call.id)) {
        call.reject(new Error('Execution cancelled'));
      }
    }
  }

  /**
   * Update statistics for successful execution
   */
  private updateSuccessStats(context: ExecutionContext): void {
    this.stats.totalExecutions++;
    this.stats.successfulExecutions++;
    
    if (this.config.enableMonitoring) {
      const executionTime = Date.now() - context.startTime;
      this.updateExecutionTimeStats(executionTime);
    }
  }

  /**
   * Update statistics for failed execution
   */
  private updateFailureStats(context: ExecutionContext, error: any): void {
    this.stats.totalExecutions++;
    this.stats.failedExecutions++;
    
    if (error.message?.includes('Circuit breaker')) {
      this.stats.circuitBreakerTrips++;
    }
  }

  /**
   * Update execution time statistics
   */
  private updateExecutionTimeStats(executionTime: number): void {
    this.stats.maxExecutionTime = Math.max(this.stats.maxExecutionTime, executionTime);
    this.stats.minExecutionTime = Math.min(this.stats.minExecutionTime, executionTime);
    
    // Update average execution time
    const totalExecutions = this.stats.totalExecutions;
    this.stats.avgExecutionTime = 
      (this.stats.avgExecutionTime * (totalExecutions - 1) + executionTime) / totalExecutions;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    // Cancel all active executions
    for (const context of this.activeExecutions.values()) {
      for (const call of context.calls) {
        call.reject(new Error('Executor disposed'));
      }
    }
    
    this.activeExecutions.clear();
  }
}

/**
 * Circuit breaker implementation
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(private config: CircuitBreakerConfig) {}

  get isOpen(): boolean {
    if (this.state === 'open') {
      // Check if timeout period has passed
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }
}

/**
 * Factory for creating specialized executors
 */
export class BatchExecutorFactory {
  /**
   * Create a high-performance executor
   */
  static createHighPerformance(): BatchExecutor {
    return new BatchExecutor({
      strategy: 'parallel',
      maxParallel: 20,
      callTimeout: 15000,
      batchTimeout: 30000,
      retryConfig: {
        enabled: true,
        maxAttempts: 2,
        baseDelay: 500,
        maxDelay: 2000,
        backoffMultiplier: 2,
        retryableErrors: ['TIMEOUT', 'NETWORK_ERROR']
      }
    });
  }

  /**
   * Create a reliable executor with retries
   */
  static createReliable(): BatchExecutor {
    return new BatchExecutor({
      strategy: 'adaptive',
      maxParallel: 10,
      callTimeout: 30000,
      batchTimeout: 60000,
      retryConfig: {
        enabled: true,
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 15000,
        backoffMultiplier: 2,
        retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE', 'RETRY']
      }
    });
  }

  /**
   * Create a low-resource executor
   */
  static createLowResource(): BatchExecutor {
    return new BatchExecutor({
      strategy: 'sequential',
      maxParallel: 3,
      callTimeout: 45000,
      batchTimeout: 120000,
      retryConfig: {
        enabled: true,
        maxAttempts: 3,
        baseDelay: 2000,
        maxDelay: 10000,
        backoffMultiplier: 1.5,
        retryableErrors: ['TIMEOUT', 'NETWORK_ERROR']
      }
    });
  }
}
