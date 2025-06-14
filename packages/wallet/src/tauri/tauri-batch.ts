/**
 * @fileoverview Tauri-optimized batch operations for storage
 * 
 * Provides efficient batch processing specifically designed for Tauri's
 * invoke system with reduced IPC overhead and optimized serialization.
 */

import type { SecureStorage, StorageResult } from '../platform/storage/secure-storage.js';
import { StorageResults } from '../platform/storage/types/storage-result.js';
import type { BatchOperation, BatchResult, BatchConfig } from '../platform/storage/batch-operations.js';
import type { TauriStorageCommand, TauriStorageResponse } from '../types/tauri.js';

/**
 * Tauri-specific batch configuration
 */
export interface TauriBatchConfig extends BatchConfig {
  /** Enable command coalescing */
  enableCoalescing?: boolean;
  /** Use unified command for all operations */
  useUnifiedCommand?: boolean;
  /** Enable operation prioritization */
  enablePrioritization?: boolean;
  /** Maximum serialization size per batch */
  maxSerializationSize?: number;
  /** Enable compression for large batches */
  enableCompression?: boolean;
  /** Concurrent invoke limit */
  maxConcurrentInvokes?: number;
}

/**
 * Operation priority levels
 */
type OperationPriority = 'high' | 'medium' | 'low';

/**
 * Enhanced batch operation with Tauri-specific metadata
 */
interface TauriBatchOperation extends BatchOperation {
  /** Operation priority */
  priority?: OperationPriority;
  /** Expected response size */
  expectedSize?: number;
  /** Retry count */
  retryCount?: number;
  /** Timeout override */
  timeout?: number;
}

/**
 * Tauri batch result with additional metadata
 */
interface TauriBatchResult extends BatchResult {
  /** IPC latency */
  ipcLatency?: number;
  /** Serialization size */
  serializationSize?: number;
  /** Compression ratio */
  compressionRatio?: number;
  /** Operation priority */
  priority?: OperationPriority;
}

/**
 * Tauri batch metrics
 */
interface TauriBatchMetrics {
  totalBatches: number;
  totalOperations: number;
  averageBatchSize: number;
  averageExecutionTime: number;
  averageIpcLatency: number;
  memoryUsage: number;
  pendingOperations: number;
  coalescedsOperations: number;
  compressionSavings: number;
  priorityDistribution: Record<OperationPriority, number>;
}

/**
 * Pending operation with enhanced metadata
 */
interface TauriPendingOperation extends TauriBatchOperation {
  timestamp: number;
  resolve: (result: TauriBatchResult) => void;
  reject: (error: Error) => void;
  estimatedSize: number;
  deadline?: number;
}

/**
 * Operation batch ready for execution
 */
interface ExecutionBatch {
  operations: TauriPendingOperation[];
  totalSize: number;
  priority: OperationPriority;
  coalesced: boolean;
}

/**
 * Tauri-optimized batch storage operations
 */
export class TauriBatchStorageOperations implements SecureStorage {
  private storage: SecureStorage;
  private config: Required<TauriBatchConfig>;
  private pendingOperations: TauriPendingOperation[] = [];
  private batchTimer?: NodeJS.Timeout;
  private metrics: TauriBatchMetrics;
  private operationCounter = 0;
  private activeInvokes = 0;
  private operationQueue: TauriPendingOperation[] = [];

  constructor(storage: SecureStorage, config: TauriBatchConfig = {}) {
    this.storage = storage;
    this.config = {
      maxBatchSize: 50,
      maxWaitTime: 100,
      enableAutoBatch: true,
      enableReordering: true,
      maxMemoryUsage: 10 * 1024 * 1024,
      enableCoalescing: true,
      useUnifiedCommand: true,
      enablePrioritization: true,
      maxSerializationSize: 1024 * 1024, // 1MB
      enableCompression: true,
      maxConcurrentInvokes: 3,
      ...config,
    };

    this.metrics = {
      totalBatches: 0,
      totalOperations: 0,
      averageBatchSize: 0,
      averageExecutionTime: 0,
      averageIpcLatency: 0,
      memoryUsage: 0,
      pendingOperations: 0,
      coalescedsOperations: 0,
      compressionSavings: 0,
      priorityDistribution: {
        high: 0,
        medium: 0,
        low: 0,
      },
    };
  }

  async store(key: string, value: Buffer, options?: any): Promise<StorageResult<void>> {
    if (!this.config.enableAutoBatch) {
      return this.storage.store(key, value, options);
    }

    return this.addToTauriBatch({
      type: 'store',
      key,
      value,
      options,
      id: this.generateOperationId(),
      priority: options?.priority || 'medium',
      expectedSize: value.length,
    });
  }

  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    if (!this.config.enableAutoBatch) {
      return this.storage.retrieve(key, options);
    }

    return this.addToTauriBatch({
      type: 'retrieve',
      key,
      options,
      id: this.generateOperationId(),
      priority: options?.priority || 'high', // Retrieves are usually high priority
    });
  }

  async remove(key: string): Promise<StorageResult<void>> {
    if (!this.config.enableAutoBatch) {
      return this.storage.remove(key);
    }

    return this.addToTauriBatch({
      type: 'remove',
      key,
      id: this.generateOperationId(),
      priority: 'medium',
    });
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    if (!this.config.enableAutoBatch) {
      return this.storage.exists(key);
    }

    return this.addToTauriBatch({
      type: 'exists',
      key,
      id: this.generateOperationId(),
      priority: 'low', // Existence checks are usually low priority
    });
  }

  async list(): Promise<StorageResult<string[]>> {
    // List operations are not batched
    return this.storage.list();
  }

  async getMetadata(key: string): Promise<StorageResult<any>> {
    // Metadata operations are not batched
    return this.storage.getMetadata(key);
  }

  async clear(): Promise<StorageResult<void>> {
    // Clear operations flush pending operations first
    await this.flushPendingOperations();
    return this.storage.clear();
  }

  async getInfo(): Promise<StorageResult<any>> {
    const storageInfo = await this.storage.getInfo();
    
    if (StorageResults.isError(storageInfo)) {
      return storageInfo;
    }

    return StorageResults.ok({
      ...storageInfo.value,
        tauriBatch: {
          enabled: this.config.enableAutoBatch,
          config: this.config,
          metrics: this.getTauriMetrics(),
          activeInvokes: this.activeInvokes,
          queueSize: this.operationQueue.length,
        },
      });
  }

  async test(): Promise<StorageResult<void>> {
    // Test operations are not batched
    return this.storage.test();
  }

  /**
   * Execute optimized batch of operations
   */
  async executeTauriBatch(operations: TauriBatchOperation[]): Promise<TauriBatchResult[]> {
    const startTime = Date.now();
    
    try {
      // Group and optimize operations
      const batches = this.createExecutionBatches(operations);
      const results: TauriBatchResult[] = [];
      
      // Execute batches with concurrency control
      for (const batch of batches) {
        // Wait for available invoke slot
        while (this.activeInvokes >= this.config.maxConcurrentInvokes) {
          await this.delay(10);
        }
        
        const batchResults = await this.executeBatch(batch);
        results.push(...batchResults);
      }
      
      // Update metrics
      this.updateTauriBatchMetrics(operations.length, Date.now() - startTime);
      
      return results;

    } catch (error) {
      // Return error results for all operations
      return operations.map(op => ({
        id: op.id,
        success: false,
        error: error instanceof Error ? error.message : 'Batch execution failed',
        ipcLatency: Date.now() - startTime,
      }));
    }
  }

  /**
   * Flush all pending operations immediately
   */
  async flushPendingOperations(): Promise<void> {
    if (this.pendingOperations.length === 0) {
      return;
    }

    const operations = [...this.pendingOperations];
    this.pendingOperations = [];
    this.metrics.memoryUsage = 0;
    this.metrics.pendingOperations = 0;

    // Clear any pending timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    try {
      const batchOps: TauriBatchOperation[] = operations.map(op => ({
        type: op.type,
        key: op.key,
        value: op.value,
        options: op.options,
        id: op.id,
        priority: op.priority,
        expectedSize: op.expectedSize,
      }));

      const results = await this.executeTauriBatch(batchOps);
      
      // Resolve all pending promises
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        const result = results[i];
        operation.resolve(result);
      }

    } catch (error) {
      // Reject all pending promises
      const errorMsg = error instanceof Error ? error.message : 'Batch flush failed';
      for (const operation of operations) {
        operation.reject(new Error(errorMsg));
      }
    }
  }

  /**
   * Add operation to Tauri batch queue
   */
  private async addToTauriBatch(operation: TauriBatchOperation): Promise<any> {
    return new Promise((resolve, reject) => {
      const estimatedSize = this.estimateOperationSize(operation);
      const deadline = operation.timeout ? Date.now() + operation.timeout : undefined;
      
      const pendingOp: TauriPendingOperation = {
        ...operation,
        timestamp: Date.now(),
        resolve: (result: TauriBatchResult) => {
          if (result.success) {
            resolve({ success: true, data: result.data });
          } else {
            resolve({ success: false, error: result.error });
          }
        },
        reject,
        estimatedSize,
        deadline,
      };

      // Check for coalescing opportunities
      if (this.config.enableCoalescing) {
        const coalesced = this.tryCoalesceOperation(pendingOp);
        if (coalesced) {
          this.metrics.coalescedsOperations++;
          return;
        }
      }

      this.pendingOperations.push(pendingOp);
      this.metrics.memoryUsage += estimatedSize;
      this.metrics.pendingOperations = this.pendingOperations.length;

      // Update priority distribution
      this.metrics.priorityDistribution[operation.priority || 'medium']++;

      // Check if we should execute batch immediately
      if (this.shouldExecuteBatch()) {
        this.flushPendingOperations().catch(error => {
          console.error('Error flushing Tauri batch operations:', error);
        });
      } else {
        this.scheduleBatchExecution();
      }
    });
  }

  /**
   * Try to coalesce operation with existing ones
   */
  private tryCoalesceOperation(operation: TauriPendingOperation): boolean {
    // Look for similar operations that can be coalesced
    for (const pending of this.pendingOperations) {
      if (this.canCoalesceOperations(pending, operation)) {
        // Update existing operation to include new one
        pending.resolve = operation.resolve; // Use latest callback
        return true;
      }
    }
    return false;
  }

  /**
   * Check if two operations can be coalesced
   */
  private canCoalesceOperations(
    op1: TauriPendingOperation,
    op2: TauriPendingOperation
  ): boolean {
    // Only coalesce same type operations on same key
    return op1.type === op2.type && 
           op1.key === op2.key &&
           op1.type !== 'store'; // Don't coalesce store operations
  }

  /**
   * Create optimized execution batches
   */
  private createExecutionBatches(operations: TauriBatchOperation[]): ExecutionBatch[] {
    const batches: ExecutionBatch[] = [];
    
    if (this.config.enablePrioritization) {
      // Group by priority
      const priorityGroups = this.groupOperationsByPriority(operations);
      
      for (const [priority, ops] of priorityGroups) {
        const batch = this.createBatch(ops, priority);
        if (batch.operations.length > 0) {
          batches.push(batch);
        }
      }
    } else {
      // Single batch without prioritization
      const batch = this.createBatch(operations, 'medium');
      if (batch.operations.length > 0) {
        batches.push(batch);
      }
    }
    
    return batches;
  }

  /**
   * Group operations by priority
   */
  private groupOperationsByPriority(
    operations: TauriBatchOperation[]
  ): Map<OperationPriority, TauriBatchOperation[]> {
    const groups = new Map<OperationPriority, TauriBatchOperation[]>();
    
    // Process in priority order
    const priorities: OperationPriority[] = ['high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const priorityOps = operations.filter(op => (op.priority || 'medium') === priority);
      if (priorityOps.length > 0) {
        groups.set(priority, priorityOps);
      }
    }
    
    return groups;
  }

  /**
   * Create execution batch
   */
  private createBatch(
    operations: TauriBatchOperation[],
    priority: OperationPriority
  ): ExecutionBatch {
    const batch: ExecutionBatch = {
      operations: operations as TauriPendingOperation[],
      totalSize: operations.reduce((sum, op) => sum + (op.expectedSize || 0), 0),
      priority,
      coalesced: false,
    };
    
    return batch;
  }

  /**
   * Execute a single batch
   */
  private async executeBatch(batch: ExecutionBatch): Promise<TauriBatchResult[]> {
    this.activeInvokes++;
    const startTime = Date.now();
    
    try {
      if (this.config.useUnifiedCommand) {
        return await this.executeUnifiedBatch(batch);
      } else {
        return await this.executeIndividualOperations(batch);
      }
    } finally {
      this.activeInvokes--;
    }
  }

  /**
   * Execute batch using unified command
   */
  private async executeUnifiedBatch(batch: ExecutionBatch): Promise<TauriBatchResult[]> {
    if (!window.__TAURI__?.invoke) {
      throw new Error('Tauri invoke not available');
    }

    const commands: TauriStorageCommand[] = batch.operations.map(op => ({
      operation: op.type,
      key: op.key,
      value: op.value ? Array.from(op.value) : undefined,
      options: op.options,
    }));

    // Compress if enabled and beneficial
    let payload: any = { commands };
    let compressionRatio = 1;
    
    if (this.config.enableCompression && batch.totalSize > 1024) {
      const compressed = this.compressBatch(payload);
      if (compressed.size < JSON.stringify(payload).length) {
        payload = compressed.data;
        compressionRatio = compressed.size / JSON.stringify(payload).length;
        this.metrics.compressionSavings += (1 - compressionRatio);
      }
    }

    const ipcStart = Date.now();
    const response = await window.__TAURI__.invoke<TauriStorageResponse<any[]>>(
      'secure_storage_batch',
      payload
    );
    const ipcLatency = Date.now() - ipcStart;

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Unified batch command failed');
    }

    // Map results back to operations
    return batch.operations.map((op, index) => ({
      id: op.id,
      success: true,
      data: response.data![index],
      ipcLatency,
      serializationSize: batch.totalSize,
      compressionRatio,
      priority: op.priority,
    }));
  }

  /**
   * Execute batch as individual operations
   */
  private async executeIndividualOperations(batch: ExecutionBatch): Promise<TauriBatchResult[]> {
    const results: TauriBatchResult[] = [];
    
    // Execute operations in parallel with limit
    const concurrencyLimit = Math.min(3, batch.operations.length);
    const chunks = this.chunkArray(batch.operations, concurrencyLimit);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (op) => {
        const ipcStart = Date.now();
        let result: StorageResult<any>;
        
        switch (op.type) {
          case 'store':
            result = await this.storage.store(op.key, op.value!, op.options);
            break;
          case 'retrieve':
            result = await this.storage.retrieve(op.key, op.options);
            break;
          case 'remove':
            result = await this.storage.remove(op.key);
            break;
          case 'exists':
            result = await this.storage.exists(op.key);
            break;
          default:
            throw new Error(`Unknown operation type: ${op.type}`);
        }
        
        const ipcLatency = Date.now() - ipcStart;
        
        return {
          id: op.id,
          success: StorageResults.isOk(result),
          data: StorageResults.isOk(result) ? result.value : undefined,
          error: StorageResults.isError(result) ? result.error.message : undefined,
          ipcLatency,
          priority: op.priority,
        };
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }
    
    return results;
  }

  /**
   * Simple batch compression
   */
  private compressBatch(batch: any): { data: any; size: number } {
    // Simple compression by removing redundant data
    const compressed = {
      ...batch,
      compressed: true,
    };
    
    return {
      data: compressed,
      size: JSON.stringify(compressed).length,
    };
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Check if batch should be executed immediately
   */
  private shouldExecuteBatch(): boolean {
    return (
      this.pendingOperations.length >= this.config.maxBatchSize ||
      this.metrics.memoryUsage >= this.config.maxMemoryUsage ||
      this.hasHighPriorityOperations() ||
      this.hasExpiredDeadlines()
    );
  }

  /**
   * Check if there are high priority operations
   */
  private hasHighPriorityOperations(): boolean {
    return this.pendingOperations.some(op => op.priority === 'high');
  }

  /**
   * Check if any operations have expired deadlines
   */
  private hasExpiredDeadlines(): boolean {
    const now = Date.now();
    return this.pendingOperations.some(op => op.deadline && now > op.deadline);
  }

  /**
   * Schedule batch execution
   */
  private scheduleBatchExecution(): void {
    if (this.batchTimer) {
      return; // Timer already scheduled
    }

    // Use shorter timeout for high priority operations
    const hasHighPriority = this.hasHighPriorityOperations();
    const timeout = hasHighPriority ? 
      Math.min(50, this.config.maxWaitTime) : 
      this.config.maxWaitTime;

    this.batchTimer = setTimeout(() => {
      this.batchTimer = undefined;
      this.flushPendingOperations().catch(error => {
        console.error('Error executing scheduled Tauri batch:', error);
      });
    }, timeout);
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `tauri-batch-${Date.now()}-${++this.operationCounter}`;
  }

  /**
   * Estimate memory usage of an operation
   */
  private estimateOperationSize(operation: TauriBatchOperation): number {
    let size = operation.key.length * 2; // String overhead
    size += 128; // Object overhead
    
    if (operation.value) {
      size += operation.value.length;
    }
    
    if (operation.options) {
      size += JSON.stringify(operation.options).length * 2;
    }
    
    return size;
  }

  /**
   * Update Tauri batch metrics
   */
  private updateTauriBatchMetrics(batchSize: number, executionTime: number): void {
    this.metrics.totalBatches++;
    this.metrics.totalOperations += batchSize;
    
    // Update running averages
    const batches = this.metrics.totalBatches;
    this.metrics.averageBatchSize = 
      (this.metrics.averageBatchSize * (batches - 1) + batchSize) / batches;
    
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (batches - 1) + executionTime) / batches;
  }

  /**
   * Get current Tauri batch metrics
   */
  getTauriMetrics(): TauriBatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    
    // Reject all pending operations
    for (const operation of this.pendingOperations) {
      operation.reject(new Error('Tauri batch operations destroyed'));
    }
    
    this.pendingOperations = [];
    this.operationQueue = [];
    this.metrics.memoryUsage = 0;
    this.metrics.pendingOperations = 0;
  }
}
