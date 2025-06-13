/**
 * @fileoverview Batch operations for storage to reduce FFI call overhead
 * 
 * Provides efficient batch processing for multiple storage operations,
 * reducing the overhead of individual FFI calls and improving performance.
 */

import type { SecureStorage, StorageResult } from './secure-storage.js';

export interface BatchOperation {
  type: 'store' | 'retrieve' | 'remove' | 'exists';
  key: string;
  value?: Buffer;
  options?: any;
  id: string;
}

export interface BatchResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface BatchConfig {
  /** Maximum number of operations per batch */
  maxBatchSize?: number;
  /** Maximum time to wait before executing batch (ms) */
  maxWaitTime?: number;
  /** Enable automatic batching */
  enableAutoBatch?: boolean;
  /** Enable operation reordering for optimization */
  enableReordering?: boolean;
  /** Maximum memory usage for pending operations */
  maxMemoryUsage?: number;
}

export interface BatchMetrics {
  totalBatches: number;
  totalOperations: number;
  averageBatchSize: number;
  averageExecutionTime: number;
  memoryUsage: number;
  pendingOperations: number;
}

/**
 * Storage operation with metadata for batching
 */
interface PendingOperation extends BatchOperation {
  timestamp: number;
  resolve: (result: BatchResult) => void;
  reject: (error: Error) => void;
  estimatedSize: number;
}

/**
 * Batch storage operations manager
 */
export class BatchStorageOperations implements SecureStorage {
  private storage: SecureStorage;
  private config: Required<BatchConfig>;
  private pendingOperations: PendingOperation[] = [];
  private batchTimer?: NodeJS.Timeout;
  private metrics: BatchMetrics;
  private operationCounter = 0;

  constructor(storage: SecureStorage, config: BatchConfig = {}) {
    this.storage = storage;
    this.config = {
      maxBatchSize: 50,
      maxWaitTime: 100, // 100ms
      enableAutoBatch: true,
      enableReordering: true,
      maxMemoryUsage: 10 * 1024 * 1024, // 10MB
      ...config,
    };

    this.metrics = {
      totalBatches: 0,
      totalOperations: 0,
      averageBatchSize: 0,
      averageExecutionTime: 0,
      memoryUsage: 0,
      pendingOperations: 0,
    };
  }

  async store(key: string, value: Buffer, options?: any): Promise<StorageResult> {
    if (!this.config.enableAutoBatch) {
      return this.storage.store(key, value, options);
    }

    return this.addToBatch({
      type: 'store',
      key,
      value,
      options,
      id: this.generateOperationId(),
    });
  }

  async retrieve(key: string, options?: any): Promise<StorageResult<Buffer>> {
    if (!this.config.enableAutoBatch) {
      return this.storage.retrieve(key, options);
    }

    return this.addToBatch({
      type: 'retrieve',
      key,
      options,
      id: this.generateOperationId(),
    });
  }

  async remove(key: string): Promise<StorageResult> {
    if (!this.config.enableAutoBatch) {
      return this.storage.remove(key);
    }

    return this.addToBatch({
      type: 'remove',
      key,
      id: this.generateOperationId(),
    });
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    if (!this.config.enableAutoBatch) {
      return this.storage.exists(key);
    }

    return this.addToBatch({
      type: 'exists',
      key,
      id: this.generateOperationId(),
    });
  }

  async list(): Promise<StorageResult<string[]>> {
    // List operations are not batched as they're typically infrequent
    return this.storage.list();
  }

  async getMetadata(key: string): Promise<StorageResult<any>> {
    // Metadata operations are not batched
    return this.storage.getMetadata(key);
  }

  async clear(): Promise<StorageResult> {
    // Clear operations are not batched and flush pending operations
    await this.flushPendingOperations();
    return this.storage.clear();
  }

  async getInfo(): Promise<StorageResult<any>> {
    const storageInfo = await this.storage.getInfo();
    
    if (!storageInfo.success) {
      return storageInfo;
    }

    return {
      success: true,
      data: {
        ...storageInfo.data,
        batch: {
          enabled: this.config.enableAutoBatch,
          config: this.config,
          metrics: this.getMetrics(),
        },
      },
    };
  }

  async test(): Promise<StorageResult> {
    // Test operations are not batched
    return this.storage.test();
  }

  /**
   * Execute a batch of operations manually
   */
  async executeBatch(operations: BatchOperation[]): Promise<BatchResult[]> {
    const startTime = Date.now();
    
    try {
      const results: BatchResult[] = [];
      
      // Group operations by type for potential optimization
      const grouped = this.groupOperationsByType(operations);
      
      // Execute each group
      for (const [type, ops] of grouped) {
        const groupResults = await this.executeOperationGroup(type, ops);
        results.push(...groupResults);
      }
      
      // Update metrics
      this.updateBatchMetrics(operations.length, Date.now() - startTime);
      
      return results;

    } catch (error) {
      // Return error results for all operations
      return operations.map(op => ({
        id: op.id,
        success: false,
        error: error instanceof Error ? error.message : 'Batch execution failed',
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
      const batchOps: BatchOperation[] = operations.map(op => ({
        type: op.type,
        key: op.key,
        value: op.value,
        options: op.options,
        id: op.id,
      }));

      const results = await this.executeBatch(batchOps);
      
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
   * Get current batch metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Add operation to batch queue
   */
  private async addToBatch(operation: BatchOperation): Promise<any> {
    return new Promise((resolve, reject) => {
      const estimatedSize = this.estimateOperationSize(operation);
      
      const pendingOp: PendingOperation = {
        ...operation,
        timestamp: Date.now(),
        resolve: (result: BatchResult) => {
          if (result.success) {
            resolve({ success: true, data: result.data });
          } else {
            resolve({ success: false, error: result.error });
          }
        },
        reject,
        estimatedSize,
      };

      this.pendingOperations.push(pendingOp);
      this.metrics.memoryUsage += estimatedSize;
      this.metrics.pendingOperations = this.pendingOperations.length;

      // Check if we should execute batch immediately
      if (this.shouldExecuteBatch()) {
        this.flushPendingOperations().catch(error => {
          console.error('Error flushing batch operations:', error);
        });
      } else {
        this.scheduleBatchExecution();
      }
    });
  }

  /**
   * Check if batch should be executed immediately
   */
  private shouldExecuteBatch(): boolean {
    return (
      this.pendingOperations.length >= this.config.maxBatchSize ||
      this.metrics.memoryUsage >= this.config.maxMemoryUsage
    );
  }

  /**
   * Schedule batch execution after max wait time
   */
  private scheduleBatchExecution(): void {
    if (this.batchTimer) {
      return; // Timer already scheduled
    }

    this.batchTimer = setTimeout(() => {
      this.batchTimer = undefined;
      this.flushPendingOperations().catch(error => {
        console.error('Error executing scheduled batch:', error);
      });
    }, this.config.maxWaitTime);
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `batch-op-${Date.now()}-${++this.operationCounter}`;
  }

  /**
   * Estimate memory usage of an operation
   */
  private estimateOperationSize(operation: BatchOperation): number {
    let size = operation.key.length * 2; // String overhead
    size += 64; // Object overhead
    
    if (operation.value) {
      size += operation.value.length;
    }
    
    if (operation.options) {
      size += JSON.stringify(operation.options).length * 2;
    }
    
    return size;
  }

  /**
   * Group operations by type for potential optimization
   */
  private groupOperationsByType(operations: BatchOperation[]): Map<string, BatchOperation[]> {
    const groups = new Map<string, BatchOperation[]>();
    
    for (const op of operations) {
      const existing = groups.get(op.type) || [];
      existing.push(op);
      groups.set(op.type, existing);
    }
    
    return groups;
  }

  /**
   * Execute a group of operations of the same type
   */
  private async executeOperationGroup(type: string, operations: BatchOperation[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    if (this.config.enableReordering) {
      // Reorder operations for better performance
      operations = this.reorderOperations(operations);
    }
    
    // Execute operations sequentially for now
    // Future optimization: implement true batch operations if storage supports it
    for (const op of operations) {
      try {
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
        
        results.push({
          id: op.id,
          success: result.success,
          data: result.data,
          error: result.error,
        });
        
      } catch (error) {
        results.push({
          id: op.id,
          success: false,
          error: error instanceof Error ? error.message : 'Operation failed',
        });
      }
    }
    
    return results;
  }

  /**
   * Reorder operations for better performance
   */
  private reorderOperations(operations: BatchOperation[]): BatchOperation[] {
    if (!this.config.enableReordering) {
      return operations;
    }

    // Sort by operation type and key for potential locality benefits
    return operations.sort((a, b) => {
      // First sort by type
      if (a.type !== b.type) {
        const typeOrder = { exists: 0, retrieve: 1, store: 2, remove: 3 };
        return (typeOrder[a.type as keyof typeof typeOrder] || 4) - 
               (typeOrder[b.type as keyof typeof typeOrder] || 4);
      }
      
      // Then sort by key for potential locality
      return a.key.localeCompare(b.key);
    });
  }

  /**
   * Update batch execution metrics
   */
  private updateBatchMetrics(batchSize: number, executionTime: number): void {
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
   * Cleanup resources
   */
  destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    
    // Reject all pending operations
    for (const operation of this.pendingOperations) {
      operation.reject(new Error('Batch operations destroyed'));
    }
    
    this.pendingOperations = [];
    this.metrics.memoryUsage = 0;
    this.metrics.pendingOperations = 0;
  }
}
