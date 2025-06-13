import { DisposableResource } from '../memory/disposable';
import { PendingCall, BatchResult } from './call-batcher';

/**
 * Advanced queue implementation for batched FFI calls
 * Supports priority queuing, fairness policies, and backpressure management
 */

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Maximum queue size */
  maxSize: number;
  /** Queue ordering strategy */
  strategy: QueueStrategy;
  /** Fairness policy for preventing starvation */
  fairnessPolicy: FairnessPolicy;
  /** Backpressure handling strategy */
  backpressureStrategy: BackpressureStrategy;
  /** Enable metrics collection */
  enableMetrics: boolean;
}

/**
 * Queue ordering strategies
 */
export type QueueStrategy = 'fifo' | 'lifo' | 'priority' | 'deadline' | 'round-robin';

/**
 * Fairness policies
 */
export type FairnessPolicy = 'none' | 'weighted' | 'strict' | 'aging';

/**
 * Backpressure handling strategies
 */
export type BackpressureStrategy = 'drop-oldest' | 'drop-newest' | 'reject' | 'block';

/**
 * Queue metrics
 */
export interface QueueMetrics {
  totalEnqueued: number;
  totalDequeued: number;
  totalDropped: number;
  currentSize: number;
  avgWaitTime: number;
  maxWaitTime: number;
  minWaitTime: number;
}

/**
 * Extended call with queue metadata
 */
export interface QueuedCall extends PendingCall {
  queuedAt: number;
  functionGroup?: string;
  deadline?: number;
  weight?: number;
}

/**
 * Advanced batch queue implementation
 */
export class BatchQueue extends DisposableResource {
  private readonly queue: QueuedCall[] = [];
  private readonly config: QueueConfig;
  private readonly metrics: QueueMetrics;
  private readonly functionGroups = new Map<string, number>(); // Track round-robin state

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    
    this.config = {
      maxSize: 1000,
      strategy: 'priority',
      fairnessPolicy: 'weighted',
      backpressureStrategy: 'drop-oldest',
      enableMetrics: true,
      ...config
    };

    this.metrics = {
      totalEnqueued: 0,
      totalDequeued: 0,
      totalDropped: 0,
      currentSize: 0,
      avgWaitTime: 0,
      maxWaitTime: 0,
      minWaitTime: Number.MAX_SAFE_INTEGER
    };
  }

  /**
   * Enqueue a call
   */
  enqueue(call: PendingCall, options: EnqueueOptions = {}): boolean {
    this.checkDisposed();

    const queuedCall: QueuedCall = {
      ...call,
      queuedAt: Date.now(),
      functionGroup: options.functionGroup,
      deadline: options.deadline,
      weight: options.weight || 1
    };

    // Check queue capacity
    if (this.queue.length >= this.config.maxSize) {
      return this.handleBackpressure(queuedCall);
    }

    // Apply fairness policy
    if (this.config.fairnessPolicy !== 'none') {
      this.applyFairnessPolicy(queuedCall);
    }

    // Insert according to strategy
    this.insertCall(queuedCall);

    this.metrics.totalEnqueued++;
    this.metrics.currentSize = this.queue.length;

    return true;
  }

  /**
   * Dequeue calls for batch processing
   */
  dequeue(maxCount?: number): QueuedCall[] {
    this.checkDisposed();

    const count = Math.min(maxCount || this.queue.length, this.queue.length);
    if (count === 0) return [];

    const dequeued: QueuedCall[] = [];
    
    for (let i = 0; i < count; i++) {
      const call = this.extractNextCall();
      if (call) {
        dequeued.push(call);
        
        // Update metrics
        if (this.config.enableMetrics) {
          this.updateWaitTimeMetrics(call);
        }
      }
    }

    this.metrics.totalDequeued += dequeued.length;
    this.metrics.currentSize = this.queue.length;

    return dequeued;
  }

  /**
   * Peek at the next call without removing it
   */
  peek(): QueuedCall | undefined {
    this.checkDisposed();
    
    if (this.queue.length === 0) return undefined;
    
    switch (this.config.strategy) {
      case 'fifo':
      case 'priority':
      case 'deadline':
        return this.queue[0];
      case 'lifo':
        return this.queue[this.queue.length - 1];
      case 'round-robin':
        return this.findNextRoundRobinCall();
      default:
        return this.queue[0];
    }
  }

  /**
   * Get current queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Check if queue is full
   */
  get isFull(): boolean {
    return this.queue.length >= this.config.maxSize;
  }

  /**
   * Get queue metrics
   */
  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear the queue
   */
  clear(): QueuedCall[] {
    const cleared = [...this.queue];
    this.queue.length = 0;
    this.metrics.currentSize = 0;
    this.metrics.totalDropped += cleared.length;
    return cleared;
  }

  /**
   * Insert call according to queue strategy
   */
  private insertCall(call: QueuedCall): void {
    switch (this.config.strategy) {
      case 'fifo':
        this.queue.push(call);
        break;
      
      case 'lifo':
        this.queue.unshift(call);
        break;
      
      case 'priority':
        this.insertByPriority(call);
        break;
      
      case 'deadline':
        this.insertByDeadline(call);
        break;
      
      case 'round-robin':
        this.queue.push(call);
        break;
      
      default:
        this.queue.push(call);
    }
  }

  /**
   * Insert call by priority order
   */
  private insertByPriority(call: QueuedCall): void {
    let insertIndex = this.queue.length;
    
    for (let i = 0; i < this.queue.length; i++) {
      if (call.priority > this.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, call);
  }

  /**
   * Insert call by deadline order
   */
  private insertByDeadline(call: QueuedCall): void {
    if (!call.deadline) {
      this.queue.push(call);
      return;
    }
    
    let insertIndex = this.queue.length;
    
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.queue[i];
      if (!existing.deadline || call.deadline < existing.deadline) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, call);
  }

  /**
   * Extract next call according to strategy
   */
  private extractNextCall(): QueuedCall | undefined {
    if (this.queue.length === 0) return undefined;
    
    switch (this.config.strategy) {
      case 'fifo':
      case 'priority':
      case 'deadline':
        return this.queue.shift();
      
      case 'lifo':
        return this.queue.pop();
      
      case 'round-robin':
        return this.extractRoundRobinCall();
      
      default:
        return this.queue.shift();
    }
  }

  /**
   * Find next call for round-robin strategy
   */
  private findNextRoundRobinCall(): QueuedCall | undefined {
    if (this.queue.length === 0) return undefined;
    
    // Find the function group with the lowest served count
    const groupCounts = new Map<string, number>();
    for (const call of this.queue) {
      const group = call.functionGroup || call.functionName;
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    }
    
    let targetGroup: string | undefined;
    let minServed = Number.MAX_SAFE_INTEGER;
    
    for (const [group, count] of groupCounts) {
      const served = this.functionGroups.get(group) || 0;
      if (served < minServed) {
        minServed = served;
        targetGroup = group;
      }
    }
    
    if (!targetGroup) return this.queue[0];
    
    return this.queue.find(call => 
      (call.functionGroup || call.functionName) === targetGroup
    );
  }

  /**
   * Extract call for round-robin strategy
   */
  private extractRoundRobinCall(): QueuedCall | undefined {
    const call = this.findNextRoundRobinCall();
    if (!call) return undefined;
    
    const index = this.queue.indexOf(call);
    if (index >= 0) {
      this.queue.splice(index, 1);
      
      // Update served count
      const group = call.functionGroup || call.functionName;
      this.functionGroups.set(group, (this.functionGroups.get(group) || 0) + 1);
    }
    
    return call;
  }

  /**
   * Apply fairness policy to prevent starvation
   */
  private applyFairnessPolicy(call: QueuedCall): void {
    switch (this.config.fairnessPolicy) {
      case 'aging':
        this.applyAgingPolicy();
        break;
      
      case 'weighted':
        this.applyWeightedPolicy(call);
        break;
      
      case 'strict':
        this.applyStrictPolicy(call);
        break;
    }
  }

  /**
   * Apply aging fairness policy (boost priority of old calls)
   */
  private applyAgingPolicy(): void {
    const now = Date.now();
    const agingThreshold = 1000; // 1 second
    
    for (const call of this.queue) {
      const age = now - call.queuedAt;
      if (age > agingThreshold) {
        // Boost priority based on age
        const boost = Math.floor(age / agingThreshold);
        call.priority = Math.min(call.priority + boost, 10);
      }
    }
  }

  /**
   * Apply weighted fairness policy
   */
  private applyWeightedPolicy(call: QueuedCall): void {
    // Adjust priority based on weight
    if (call.weight && call.weight !== 1) {
      call.priority = Math.round(call.priority * call.weight);
    }
  }

  /**
   * Apply strict fairness policy
   */
  private applyStrictPolicy(call: QueuedCall): void {
    // Ensure no function group dominates the queue
    const group = call.functionGroup || call.functionName;
    const groupCount = this.queue.filter(c => 
      (c.functionGroup || c.functionName) === group
    ).length;
    
    const maxGroupSize = Math.floor(this.config.maxSize * 0.3); // 30% max
    if (groupCount >= maxGroupSize) {
      // Reduce priority for over-represented groups
      call.priority = Math.max(call.priority - 2, 1);
    }
  }

  /**
   * Handle backpressure when queue is full
   */
  private handleBackpressure(call: QueuedCall): boolean {
    switch (this.config.backpressureStrategy) {
      case 'drop-oldest':
        if (this.queue.length > 0) {
          const dropped = this.queue.shift();
          if (dropped) {
            dropped.reject(new Error('Call dropped due to queue backpressure'));
            this.metrics.totalDropped++;
          }
        }
        this.queue.push(call);
        return true;
      
      case 'drop-newest':
        call.reject(new Error('Call dropped due to queue backpressure'));
        this.metrics.totalDropped++;
        return false;
      
      case 'reject':
        call.reject(new Error('Queue is full'));
        return false;
      
      case 'block':
        // In a real implementation, this would block until space is available
        // For now, we'll just reject
        call.reject(new Error('Queue is full (blocking not implemented)'));
        return false;
      
      default:
        return false;
    }
  }

  /**
   * Update wait time metrics
   */
  private updateWaitTimeMetrics(call: QueuedCall): void {
    const waitTime = Date.now() - call.queuedAt;
    
    this.metrics.maxWaitTime = Math.max(this.metrics.maxWaitTime, waitTime);
    this.metrics.minWaitTime = Math.min(this.metrics.minWaitTime, waitTime);
    
    // Update average (simple moving average)
    const totalProcessed = this.metrics.totalDequeued;
    this.metrics.avgWaitTime = 
      (this.metrics.avgWaitTime * (totalProcessed - 1) + waitTime) / totalProcessed;
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    // Reject all pending calls
    for (const call of this.queue) {
      call.reject(new Error('Queue disposed before call could be processed'));
    }
    
    this.queue.length = 0;
    this.functionGroups.clear();
  }
}

/**
 * Options for enqueueing calls
 */
export interface EnqueueOptions {
  functionGroup?: string;
  deadline?: number;
  weight?: number;
}

/**
 * Factory for creating specialized queues
 */
export class BatchQueueFactory {
  /**
   * Create a high-performance priority queue
   */
  static createPriorityQueue(maxSize?: number): BatchQueue {
    return new BatchQueue({
      maxSize: maxSize || 1000,
      strategy: 'priority',
      fairnessPolicy: 'aging',
      backpressureStrategy: 'drop-oldest',
      enableMetrics: true
    });
  }

  /**
   * Create a fair round-robin queue
   */
  static createRoundRobinQueue(maxSize?: number): BatchQueue {
    return new BatchQueue({
      maxSize: maxSize || 500,
      strategy: 'round-robin',
      fairnessPolicy: 'strict',
      backpressureStrategy: 'reject',
      enableMetrics: true
    });
  }

  /**
   * Create a deadline-based queue for time-sensitive operations
   */
  static createDeadlineQueue(maxSize?: number): BatchQueue {
    return new BatchQueue({
      maxSize: maxSize || 200,
      strategy: 'deadline',
      fairnessPolicy: 'weighted',
      backpressureStrategy: 'drop-oldest',
      enableMetrics: true
    });
  }

  /**
   * Create a simple FIFO queue
   */
  static createFIFOQueue(maxSize?: number): BatchQueue {
    return new BatchQueue({
      maxSize: maxSize || 1000,
      strategy: 'fifo',
      fairnessPolicy: 'none',
      backpressureStrategy: 'block',
      enableMetrics: false
    });
  }
}
