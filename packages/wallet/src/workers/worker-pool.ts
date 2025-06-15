import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
// Import directly from source to avoid import resolution issues
import { DisposableResource } from '../../../core/src/memory/disposable.js';
import { performance } from 'perf_hooks';

/**
 * Worker thread pool for CPU-intensive operations
 * Provides efficient parallel processing with load balancing and task management
 */

/**
 * Task types that can be executed in worker threads
 */
export type TaskType = 
  | 'crypto-hash'
  | 'crypto-sign'
  | 'crypto-verify'
  | 'data-processing'
  | 'compression'
  | 'parsing'
  | 'computation';

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Worker task definition
 */
export interface WorkerTask<T = any, R = any> {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  data: T;
  timeout?: number;
  transferList?: Transferable[];
  retryCount?: number;
  createdAt: number;
}

/**
 * Task result
 */
export interface TaskResult<R = any> {
  taskId: string;
  success: boolean;
  result?: R;
  error?: string;
  executionTime: number;
  workerId?: string;
}

/**
 * Worker pool configuration
 */
export interface WorkerPoolConfig {
  /** Number of worker threads */
  poolSize: number;
  /** Maximum tasks per worker before recycling */
  maxTasksPerWorker: number;
  /** Task timeout in milliseconds */
  defaultTimeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Enable task queue */
  enableQueue: boolean;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Worker recycling interval */
  workerRecycleInterval: number;
}

/**
 * Worker thread wrapper
 */
class WorkerThread extends DisposableResource {
  public readonly id: string;
  public readonly worker: Worker;
  public isAvailable: boolean = true;
  public currentTask?: WorkerTask;
  public tasksExecuted: number = 0;
  public readonly createdAt: number;
  private resolvers = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();

  constructor(workerScript: string, workerId: string) {
    super();
    this.id = workerId;
    this.createdAt = Date.now();
    
    this.worker = new Worker(workerScript, {
      workerData: { workerId }
    });

    this.setupWorkerHandlers();
  }

  /**
   * Execute a task in this worker
   */
  async executeTask<T, R>(task: WorkerTask<T, R>): Promise<TaskResult<R>> {
    if (!this.isAvailable) {
      throw new Error('Worker is not available');
    }

    this.isAvailable = false;
    this.currentTask = task;
    this.tasksExecuted++;

    return new Promise((resolve, reject) => {
      const timeout = task.timeout || 30000;
      const timeoutId = setTimeout(() => {
        this.resolvers.delete(task.id);
        this.isAvailable = true;
        this.currentTask = undefined;
        reject(new Error(`Task ${task.id} timed out after ${timeout}ms`));
      }, timeout);

      this.resolvers.set(task.id, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          this.resolvers.delete(task.id);
          this.isAvailable = true;
          this.currentTask = undefined;
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.resolvers.delete(task.id);
          this.isAvailable = true;
          this.currentTask = undefined;
          reject(error);
        }
      });

      // Send task to worker
      this.worker.postMessage({
        type: 'execute',
        task
      }, task.transferList as any);
    });
  }

  /**
   * Check if worker should be recycled
   */
  shouldRecycle(maxTasks: number, maxAge: number): boolean {
    return this.tasksExecuted >= maxTasks || 
           (Date.now() - this.createdAt) > maxAge;
  }

  /**
   * Setup worker message handlers
   */
  private setupWorkerHandlers(): void {
    this.worker.on('message', (message) => {
      const { type, taskId, result, error, executionTime } = message;
      
      if (type === 'result') {
        const resolver = this.resolvers.get(taskId);
        if (resolver) {
          const taskResult: TaskResult = {
            taskId,
            success: !error,
            result,
            error,
            executionTime,
            workerId: this.id
          };
          
          if (error) {
            resolver.reject(new Error(error));
          } else {
            resolver.resolve(taskResult);
          }
        }
      }
    });

    this.worker.on('error', (error) => {
      console.error(`Worker ${this.id} error:`, error);
      
      // Reject current task if any
      if (this.currentTask) {
        const resolver = this.resolvers.get(this.currentTask.id);
        if (resolver) {
          resolver.reject(error);
        }
      }
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`Worker ${this.id} exited with code ${code}`);
      }
    });
  }

  /**
   * Dispose worker thread
   */
  protected disposeSync(): void {
    // Reject all pending tasks
    for (const resolver of this.resolvers.values()) {
      resolver.reject(new Error('Worker disposed'));
    }
    this.resolvers.clear();

    // Terminate worker
    this.worker.terminate();
  }
}

/**
 * Main worker pool implementation
 */
export class WorkerPool extends DisposableResource {
  private readonly config: WorkerPoolConfig;
  private readonly workers: WorkerThread[] = [];
  private readonly taskQueue: WorkerTask[] = [];
  private readonly activeWorkers = new Set<string>();
  private readonly workerScript: string;
  private recycleTimer?: NodeJS.Timeout;
  private taskCounter = 0;

  constructor(workerScript: string, config: Partial<WorkerPoolConfig> = {}) {
    super();
    
    this.workerScript = workerScript;
    this.config = {
      poolSize: Math.max(1, (require('os').cpus().length || 4) - 1),
      maxTasksPerWorker: 1000,
      defaultTimeout: 30000,
      maxRetries: 3,
      enableQueue: true,
      maxQueueSize: 10000,
      workerRecycleInterval: 300000, // 5 minutes
      ...config
    };

    this.initializeWorkers();
    this.startRecycleTimer();
  }

  /**
   * Submit a task for execution
   */
  async executeTask<T, R>(
    type: TaskType,
    data: T,
    options: {
      priority?: TaskPriority;
      timeout?: number;
      transferList?: Transferable[];
      retryCount?: number;
    } = {}
  ): Promise<TaskResult<R>> {
    this.checkDisposed();

    const task: WorkerTask<T, R> = {
      id: `task_${++this.taskCounter}_${Date.now()}`,
      type,
      priority: options.priority || 'normal',
      data,
      timeout: options.timeout || this.config.defaultTimeout,
      transferList: options.transferList,
      retryCount: options.retryCount || 0,
      createdAt: Date.now()
    };

    // Try to execute immediately if worker is available
    const worker = this.getAvailableWorker();
    if (worker) {
      return await this.executeTaskOnWorker(worker, task);
    }

    // Queue task if enabled
    if (this.config.enableQueue) {
      return await this.queueTask(task);
    }

    throw new Error('No available workers and queuing is disabled');
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const availableWorkers = this.workers.filter(w => w.isAvailable).length;
    const busyWorkers = this.workers.length - availableWorkers;
    
    return {
      totalWorkers: this.workers.length,
      availableWorkers,
      busyWorkers,
      queuedTasks: this.taskQueue.length,
      totalTasksExecuted: this.workers.reduce((sum, w) => sum + w.tasksExecuted, 0),
      averageTasksPerWorker: this.workers.length > 0 
        ? this.workers.reduce((sum, w) => sum + w.tasksExecuted, 0) / this.workers.length 
        : 0
    };
  }

  /**
   * Get detailed worker information
   */
  getWorkerInfo(): WorkerInfo[] {
    return this.workers.map(worker => ({
      id: worker.id,
      isAvailable: worker.isAvailable,
      tasksExecuted: worker.tasksExecuted,
      currentTask: worker.currentTask?.id,
      createdAt: worker.createdAt,
      age: Date.now() - worker.createdAt
    }));
  }

  /**
   * Resize the pool
   */
  async resizePool(newSize: number): Promise<void> {
    if (newSize < 1) {
      throw new Error('Pool size must be at least 1');
    }

    const currentSize = this.workers.length;
    
    if (newSize > currentSize) {
      // Add workers
      for (let i = currentSize; i < newSize; i++) {
        this.addWorker();
      }
    } else if (newSize < currentSize) {
      // Remove workers (only available ones)
      const toRemove = currentSize - newSize;
      let removed = 0;
      
      for (let i = this.workers.length - 1; i >= 0 && removed < toRemove; i--) {
        const worker = this.workers[i];
        if (worker.isAvailable) {
          this.removeWorker(worker);
          removed++;
        }
      }
    }
  }

  /**
   * Force recycling of all workers
   */
  async recycleAllWorkers(): Promise<void> {
    const availableWorkers = this.workers.filter(w => w.isAvailable);
    
    for (const worker of availableWorkers) {
      await this.recycleWorker(worker);
    }
  }

  /**
   * Clear the task queue
   */
  clearQueue(): WorkerTask[] {
    const cleared = [...this.taskQueue];
    this.taskQueue.length = 0;
    return cleared;
  }

  /**
   * Initialize worker threads
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.config.poolSize; i++) {
      this.addWorker();
    }
  }

  /**
   * Add a new worker to the pool
   */
  private addWorker(): void {
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const worker = new WorkerThread(this.workerScript, workerId);
    this.workers.push(worker);
  }

  /**
   * Remove a worker from the pool
   */
  private removeWorker(worker: WorkerThread): void {
    const index = this.workers.indexOf(worker);
    if (index >= 0) {
      this.workers.splice(index, 1);
      worker[Symbol.dispose]();
    }
  }

  /**
   * Get an available worker
   */
  private getAvailableWorker(): WorkerThread | undefined {
    return this.workers.find(worker => worker.isAvailable);
  }

  /**
   * Execute task on specific worker
   */
  private async executeTaskOnWorker<T, R>(
    worker: WorkerThread,
    task: WorkerTask<T, R>
  ): Promise<TaskResult<R>> {
    try {
      return await worker.executeTask(task);
    } catch (error) {
      // Retry logic
      if (task.retryCount! < this.config.maxRetries) {
        task.retryCount = (task.retryCount || 0) + 1;
        
        // Try with a different worker if available
        const retryWorker = this.getAvailableWorker();
        if (retryWorker) {
          return await this.executeTaskOnWorker(retryWorker, task);
        }
      }
      
      throw error;
    }
  }

  /**
   * Queue a task for later execution
   */
  private async queueTask<T, R>(task: WorkerTask<T, R>): Promise<TaskResult<R>> {
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error('Task queue is full');
    }

    return new Promise((resolve, reject) => {
      // Insert task based on priority
      const insertIndex = this.findInsertIndex(task);
      this.taskQueue.splice(insertIndex, 0, task);
      
      // Add resolver to task
      (task as any).resolve = resolve;
      (task as any).reject = reject;
      
      // Try to process queue
      this.processQueue();
    });
  }

  /**
   * Find insert index for task based on priority
   */
  private findInsertIndex(task: WorkerTask): number {
    const priorityValues = { critical: 4, high: 3, normal: 2, low: 1 };
    const taskPriority = priorityValues[task.priority];
    
    for (let i = 0; i < this.taskQueue.length; i++) {
      const queuedTaskPriority = priorityValues[this.taskQueue[i].priority];
      if (taskPriority > queuedTaskPriority) {
        return i;
      }
    }
    
    return this.taskQueue.length;
  }

  /**
   * Process queued tasks
   */
  private async processQueue(): Promise<void> {
    while (this.taskQueue.length > 0) {
      const worker = this.getAvailableWorker();
      if (!worker) break;
      
      const task = this.taskQueue.shift()!;
      const resolve = (task as any).resolve;
      const reject = (task as any).reject;
      
      try {
        const result = await this.executeTaskOnWorker(worker, task);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
  }

  /**
   * Start worker recycling timer
   */
  private startRecycleTimer(): void {
    this.recycleTimer = setInterval(async () => {
      try {
        await this.recycleOldWorkers();
      } catch (error) {
        console.warn('Error during worker recycling:', error);
      }
    }, this.config.workerRecycleInterval);
  }

  /**
   * Recycle old or overused workers
   */
  private async recycleOldWorkers(): Promise<void> {
    const workersToRecycle = this.workers.filter(worker => 
      worker.isAvailable && 
      worker.shouldRecycle(this.config.maxTasksPerWorker, this.config.workerRecycleInterval * 3)
    );

    for (const worker of workersToRecycle) {
      await this.recycleWorker(worker);
    }
  }

  /**
   * Recycle a specific worker
   */
  private async recycleWorker(worker: WorkerThread): Promise<void> {
    this.removeWorker(worker);
    this.addWorker();
  }

  /**
   * Dispose pool and all workers
   */
  protected disposeSync(): void {
    if (this.recycleTimer) {
      clearInterval(this.recycleTimer);
      this.recycleTimer = undefined;
    }

    // Dispose all workers
    for (const worker of this.workers) {
      worker[Symbol.dispose]();
    }
    this.workers.length = 0;

    // Reject all queued tasks
    for (const task of this.taskQueue) {
      const reject = (task as any).reject;
      if (reject) {
        reject(new Error('Worker pool disposed'));
      }
    }
    this.taskQueue.length = 0;
  }
}

/**
 * Pool statistics
 */
export interface PoolStats {
  totalWorkers: number;
  availableWorkers: number;
  busyWorkers: number;
  queuedTasks: number;
  totalTasksExecuted: number;
  averageTasksPerWorker: number;
}

/**
 * Worker information
 */
export interface WorkerInfo {
  id: string;
  isAvailable: boolean;
  tasksExecuted: number;
  currentTask?: string;
  createdAt: number;
  age: number;
}

/**
 * Factory for creating specialized worker pools
 */
export class WorkerPoolFactory {
  /**
   * Create a crypto worker pool for cryptographic operations
   */
  static createCryptoPool(workerScript: string): WorkerPool {
    return new WorkerPool(workerScript, {
      poolSize: Math.min(4, require('os').cpus().length),
      maxTasksPerWorker: 500,
      defaultTimeout: 60000,
      maxRetries: 2
    });
  }

  /**
   * Create a data processing pool for large data operations
   */
  static createDataProcessingPool(workerScript: string): WorkerPool {
    return new WorkerPool(workerScript, {
      poolSize: require('os').cpus().length,
      maxTasksPerWorker: 100,
      defaultTimeout: 120000,
      maxRetries: 1,
      maxQueueSize: 1000
    });
  }

  /**
   * Create a lightweight pool for quick tasks
   */
  static createLightweightPool(workerScript: string): WorkerPool {
    return new WorkerPool(workerScript, {
      poolSize: 2,
      maxTasksPerWorker: 2000,
      defaultTimeout: 5000,
      maxRetries: 3,
      maxQueueSize: 5000
    });
  }

  /**
   * Create a high-priority pool for critical tasks
   */
  static createHighPriorityPool(workerScript: string): WorkerPool {
    return new WorkerPool(workerScript, {
      poolSize: Math.max(2, Math.floor(require('os').cpus().length / 2)),
      maxTasksPerWorker: 200,
      defaultTimeout: 30000,
      maxRetries: 5,
      enableQueue: false // Immediate execution only
    });
  }
}

/**
 * Global worker pool manager
 */
export class GlobalWorkerPools {
  private static pools = new Map<string, WorkerPool>();

  /**
   * Register a worker pool
   */
  static register(name: string, pool: WorkerPool): void {
    if (this.pools.has(name)) {
      this.pools.get(name)![Symbol.dispose]();
    }
    this.pools.set(name, pool);
  }

  /**
   * Get a registered worker pool
   */
  static get(name: string): WorkerPool | undefined {
    return this.pools.get(name);
  }

  /**
   * Execute task on named pool
   */
  static async executeTask<T, R>(
    poolName: string,
    type: TaskType,
    data: T,
    options?: {
      priority?: TaskPriority;
      timeout?: number;
      transferList?: Transferable[];
    }
  ): Promise<TaskResult<R>> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Worker pool '${poolName}' not found`);
    }
    
    return await pool.executeTask<T, R>(type, data, options);
  }

  /**
   * Get statistics for all pools
   */
  static getAllStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {};
    
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats();
    }
    
    return stats;
  }

  /**
   * Dispose all pools
   */
  static disposeAll(): void {
    for (const pool of this.pools.values()) {
      pool[Symbol.dispose]();
    }
    this.pools.clear();
  }
}
