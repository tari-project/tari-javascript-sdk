import { DisposableResource } from '../memory/disposable';

/**
 * FFI call batching system for performance optimization
 * Reduces overhead by batching multiple related FFI calls together
 */

/**
 * Configuration for call batching
 */
export interface BatchConfig {
  /** Maximum number of calls per batch */
  maxSize: number;
  /** Maximum time to wait before flushing batch (ms) */
  maxWait: number;
  /** Function to check if two calls can be coalesced */
  coalesceFn?: (a: PendingCall, b: PendingCall) => boolean;
  /** Whether to enable call deduplication */
  enableDeduplication: boolean;
  /** Priority threshold for immediate execution */
  priorityThreshold?: number;
}

/**
 * Default batch configuration
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxSize: 100,
  maxWait: 10, // 10ms
  enableDeduplication: true,
  priorityThreshold: 10
};

/**
 * Represents a pending FFI call
 */
export interface PendingCall {
  id: string;
  functionName: string;
  args: any[];
  priority: number;
  timestamp: number;
  resolve: (result: any) => void;
  reject: (error: any) => void;
  transferList?: Transferable[];
}

/**
 * Result of a batched call
 */
export interface BatchResult {
  id: string;
  result?: any;
  error?: any;
}

/**
 * Main call batcher class
 */
export class CallBatcher extends DisposableResource {
  private readonly pendingCalls = new Map<string, PendingCall>();
  private flushTimer?: NodeJS.Timeout;
  private batchCounter = 0;
  private readonly config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    super();
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  /**
   * Add a call to the batch queue
   */
  async batchCall<T>(
    functionName: string,
    args: any[],
    priority: number = 5,
    transferList?: Transferable[]
  ): Promise<T> {
    this.checkDisposed();

    const id = this.generateCallId();
    
    return new Promise<T>((resolve, reject) => {
      const call: PendingCall = {
        id,
        functionName,
        args,
        priority,
        timestamp: Date.now(),
        resolve,
        reject,
        transferList
      };

      // Check for deduplication
      if (this.config.enableDeduplication) {
        const existing = this.findDuplicateCall(call);
        if (existing) {
          // Return the same promise as the existing call
          existing.resolve = (result) => {
            resolve(result);
            call.resolve(result);
          };
          existing.reject = (error) => {
            reject(error);
            call.reject(error);
          };
          return;
        }
      }

      // Check for coalescing
      if (this.config.coalesceFn) {
        const coalescable = this.findCoalescableCall(call);
        if (coalescable) {
          this.coalesceCall(coalescable, call);
          return;
        }
      }

      this.pendingCalls.set(id, call);

      // Immediate execution for high-priority calls
      if (this.config.priorityThreshold && priority >= this.config.priorityThreshold) {
        this.flushImmediately();
        return;
      }

      // Check if batch should be flushed
      if (this.pendingCalls.size >= this.config.maxSize) {
        this.flushImmediately();
      } else if (!this.flushTimer) {
        this.scheduleFlush();
      }
    });
  }

  /**
   * Force immediate flush of pending calls
   */
  async flush(): Promise<void> {
    this.checkDisposed();
    await this.flushImmediately();
  }

  /**
   * Get current queue statistics
   */
  getStats(): BatchStats {
    return {
      pendingCalls: this.pendingCalls.size,
      maxBatchSize: this.config.maxSize,
      maxWaitTime: this.config.maxWait,
      batchesProcessed: this.batchCounter,
      isFlushScheduled: this.flushTimer !== undefined
    };
  }

  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Find duplicate call for deduplication
   */
  private findDuplicateCall(call: PendingCall): PendingCall | undefined {
    for (const existing of this.pendingCalls.values()) {
      if (existing.functionName === call.functionName &&
          this.areArgsEqual(existing.args, call.args)) {
        return existing;
      }
    }
    return undefined;
  }

  /**
   * Find coalescable call
   */
  private findCoalescableCall(call: PendingCall): PendingCall | undefined {
    if (!this.config.coalesceFn) return undefined;
    
    for (const existing of this.pendingCalls.values()) {
      if (this.config.coalesceFn(existing, call)) {
        return existing;
      }
    }
    return undefined;
  }

  /**
   * Coalesce two calls together
   */
  private coalesceCall(existing: PendingCall, newCall: PendingCall): void {
    // Combine the calls - implementation depends on specific use case
    // For now, we'll just add the new call's resolve/reject to the existing one
    const originalResolve = existing.resolve;
    const originalReject = existing.reject;
    
    existing.resolve = (result) => {
      originalResolve(result);
      newCall.resolve(result);
    };
    
    existing.reject = (error) => {
      originalReject(error);
      newCall.reject(error);
    };
  }

  /**
   * Check if two argument arrays are equal
   */
  private areArgsEqual(args1: any[], args2: any[]): boolean {
    if (args1.length !== args2.length) return false;
    
    for (let i = 0; i < args1.length; i++) {
      if (!this.deepEqual(args1[i], args2[i])) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Deep equality check for arguments
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      
      if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        return a.every((item, index) => this.deepEqual(item, b[index]));
      }
      
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => this.deepEqual(a[key], b[key]));
    }
    
    return false;
  }

  /**
   * Schedule a batch flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    
    this.flushTimer = setTimeout(() => {
      this.flushImmediately();
    }, this.config.maxWait);
  }

  /**
   * Immediately flush all pending calls
   */
  private async flushImmediately(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.pendingCalls.size === 0) return;

    const batch = Array.from(this.pendingCalls.values());
    this.pendingCalls.clear();
    this.batchCounter++;

    try {
      await this.executeBatch(batch);
    } catch (error) {
      // Reject all calls in the batch
      for (const call of batch) {
        call.reject(error);
      }
    }
  }

  /**
   * Execute a batch of calls
   */
  private async executeBatch(batch: PendingCall[]): Promise<void> {
    // Sort by priority (higher priority first)
    batch.sort((a, b) => b.priority - a.priority);

    // Group calls by function name for potential optimization
    const groupedCalls = this.groupCallsByFunction(batch);

    // Execute each group
    for (const [functionName, calls] of groupedCalls) {
      try {
        await this.executeCallGroup(functionName, calls);
      } catch (error) {
        // If a group fails, reject all calls in that group
        for (const call of calls) {
          call.reject(error);
        }
      }
    }
  }

  /**
   * Group calls by function name
   */
  private groupCallsByFunction(batch: PendingCall[]): Map<string, PendingCall[]> {
    const groups = new Map<string, PendingCall[]>();
    
    for (const call of batch) {
      const existing = groups.get(call.functionName) || [];
      existing.push(call);
      groups.set(call.functionName, existing);
    }
    
    return groups;
  }

  /**
   * Execute a group of calls for the same function
   */
  private async executeCallGroup(functionName: string, calls: PendingCall[]): Promise<void> {
    // For now, execute calls individually
    // In a real implementation, this could be optimized for specific FFI functions
    for (const call of calls) {
      try {
        const result = await this.executeFFICall(call);
        call.resolve(result);
      } catch (error) {
        call.reject(error);
      }
    }
  }

  /**
   * Execute a single FFI call
   * This is where the actual FFI integration would happen
   */
  private async executeFFICall(call: PendingCall): Promise<any> {
    // Placeholder implementation - replace with actual FFI call
    // In a real implementation, this would use the minotari_wallet_ffi functions
    
    if (process.env.NODE_ENV === 'development') {
      console.debug(`Executing FFI call: ${call.functionName}`, call.args);
    }
    
    // Simulate FFI call execution
    return new Promise((resolve, reject) => {
      // Simulate async execution
      setImmediate(() => {
        try {
          // This would be replaced with actual FFI calls like:
          // const result = await ffi[call.functionName](...call.args);
          const result = { success: true, functionName: call.functionName };
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Reject all pending calls
    for (const call of this.pendingCalls.values()) {
      call.reject(new Error('CallBatcher disposed before call could be executed'));
    }
    
    this.pendingCalls.clear();
  }
}

/**
 * Statistics about the call batcher
 */
export interface BatchStats {
  pendingCalls: number;
  maxBatchSize: number;
  maxWaitTime: number;
  batchesProcessed: number;
  isFlushScheduled: boolean;
}

/**
 * Factory for creating specialized call batchers
 */
export class CallBatcherFactory {
  /**
   * Create a default call batcher
   */
  static createDefault(): CallBatcher {
    return new CallBatcher();
  }

  /**
   * Create a high-performance batcher for frequent calls
   */
  static createHighPerformance(): CallBatcher {
    return new CallBatcher({
      maxSize: 200,
      maxWait: 5,
      enableDeduplication: true,
      priorityThreshold: 8
    });
  }

  /**
   * Create a low-latency batcher for interactive operations
   */
  static createLowLatency(): CallBatcher {
    return new CallBatcher({
      maxSize: 50,
      maxWait: 2,
      enableDeduplication: false,
      priorityThreshold: 5
    });
  }

  /**
   * Create a memory-efficient batcher for resource-constrained environments
   */
  static createMemoryEfficient(): CallBatcher {
    return new CallBatcher({
      maxSize: 25,
      maxWait: 20,
      enableDeduplication: true,
      priorityThreshold: 9
    });
  }

  /**
   * Create a custom batcher with specific configuration
   */
  static create(config: Partial<BatchConfig>): CallBatcher {
    return new CallBatcher(config);
  }
}

/**
 * Global call batcher instance
 */
let globalBatcher: CallBatcher | undefined;

/**
 * Get or create the global call batcher
 */
export function getGlobalBatcher(): CallBatcher {
  if (!globalBatcher) {
    globalBatcher = CallBatcherFactory.createDefault();
  }
  return globalBatcher;
}

/**
 * Set a custom global batcher
 */
export function setGlobalBatcher(batcher: CallBatcher): void {
  if (globalBatcher) {
    globalBatcher[Symbol.dispose]();
  }
  globalBatcher = batcher;
}

/**
 * Utility function for batching FFI calls
 */
export async function batchFFICall<T>(
  functionName: string,
  args: any[],
  priority?: number,
  transferList?: Transferable[]
): Promise<T> {
  return getGlobalBatcher().batchCall<T>(functionName, args, priority, transferList);
}
