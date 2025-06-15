// Import directly from source to avoid import resolution issues
import { DisposableResource } from '../../../core/src/memory/disposable.js';
import { WorkerPool, TaskType, TaskPriority, TaskResult, PoolStats } from './worker-pool';
import { GlobalWorkerPools } from './worker-pool';
import path from 'path';

// Define Transferable type for cross-platform compatibility
type Transferable = ArrayBuffer | MessagePort;

/**
 * High-level worker manager for coordinating multiple worker pools
 * Provides intelligent task routing and load balancing across pools
 */

/**
 * Worker manager configuration
 */
export interface WorkerManagerConfig {
  /** Enable automatic pool scaling */
  enableAutoScaling: boolean;
  /** Load balancing strategy */
  loadBalancingStrategy: LoadBalancingStrategy;
  /** Performance monitoring */
  enablePerformanceMonitoring: boolean;
  /** Monitoring interval in milliseconds */
  monitoringInterval: number;
  /** Auto-scaling thresholds */
  scalingThresholds: ScalingThresholds;
}

/**
 * Load balancing strategies
 */
export type LoadBalancingStrategy = 
  | 'round-robin'    // Rotate between pools
  | 'least-busy'     // Use pool with fewest active tasks
  | 'task-type'      // Route by task type
  | 'priority'       // Use dedicated pools for different priorities
  | 'adaptive';      // Dynamically choose best strategy

/**
 * Scaling thresholds for auto-scaling
 */
export interface ScalingThresholds {
  /** CPU usage threshold to scale up */
  cpuThreshold: number;
  /** Queue size threshold to scale up */
  queueThreshold: number;
  /** Average wait time threshold (ms) */
  waitTimeThreshold: number;
  /** Scale down threshold (idle time in ms) */
  idleThreshold: number;
}

/**
 * Pool configuration template
 */
export interface PoolTemplate {
  name: string;
  minSize: number;
  maxSize: number;
  taskTypes: TaskType[];
  priority: TaskPriority;
  config: any;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  totalTasks: number;
  averageExecutionTime: number;
  averageWaitTime: number;
  throughput: number; // tasks per second
  errorRate: number;
  poolUtilization: Record<string, number>;
}

/**
 * Task routing result
 */
export interface TaskRouting {
  poolName: string;
  reason: string;
  loadFactor: number;
}

/**
 * Main worker manager implementation
 */
export class WorkerManager extends DisposableResource {
  private readonly config: WorkerManagerConfig;
  private readonly poolTemplates = new Map<string, PoolTemplate>();
  private readonly taskCounter = new Map<string, number>();
  private readonly performanceHistory: PerformanceMetrics[] = [];
  private monitoringTimer?: NodeJS.Timeout;
  private currentStrategy: LoadBalancingStrategy;
  private strategyPerformance = new Map<LoadBalancingStrategy, number>();

  constructor(config: Partial<WorkerManagerConfig> = {}) {
    super();
    
    this.config = {
      enableAutoScaling: true,
      loadBalancingStrategy: 'adaptive',
      enablePerformanceMonitoring: true,
      monitoringInterval: 30000, // 30 seconds
      scalingThresholds: {
        cpuThreshold: 0.8,
        queueThreshold: 100,
        waitTimeThreshold: 5000,
        idleThreshold: 300000 // 5 minutes
      },
      ...config
    };

    this.currentStrategy = this.config.loadBalancingStrategy;
    this.initializeDefaultPools();
    
    if (this.config.enablePerformanceMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * Execute a task with intelligent routing
   */
  async executeTask<T, R>(
    type: TaskType,
    data: T,
    options: {
      priority?: TaskPriority;
      timeout?: number;
      transferList?: Transferable[];
      preferredPool?: string;
    } = {}
  ): Promise<TaskResult<R>> {
    this.checkDisposed();

    const routing = this.routeTask(type, options.priority || 'normal', options.preferredPool);
    
    try {
      const result = await GlobalWorkerPools.executeTask<T, R>(
        routing.poolName,
        type,
        data,
        {
          priority: options.priority,
          timeout: options.timeout,
          transferList: options.transferList
        }
      );

      this.recordTaskCompletion(routing.poolName, true, result.executionTime);
      return result;
    } catch (error) {
      this.recordTaskCompletion(routing.poolName, false, 0);
      throw error;
    }
  }

  /**
   * Register a new pool template
   */
  registerPoolTemplate(template: PoolTemplate): void {
    this.poolTemplates.set(template.name, template);
    
    // Create the pool if it doesn't exist
    if (!GlobalWorkerPools.get(template.name)) {
      const workerScript = this.getWorkerScript();
      const pool = new WorkerPool(workerScript, {
        poolSize: template.minSize,
        ...template.config
      });
      GlobalWorkerPools.register(template.name, pool);
    }
  }

  /**
   * Scale a pool up or down
   */
  async scalePool(poolName: string, newSize: number): Promise<void> {
    const pool = GlobalWorkerPools.get(poolName);
    if (!pool) {
      throw new Error(`Pool '${poolName}' not found`);
    }

    const template = this.poolTemplates.get(poolName);
    if (template) {
      const clampedSize = Math.max(template.minSize, Math.min(template.maxSize, newSize));
      await pool.resizePool(clampedSize);
    } else {
      await pool.resizePool(newSize);
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): {
    pools: Record<string, PoolStats>;
    performance: PerformanceMetrics;
    routing: Record<string, number>;
    strategy: LoadBalancingStrategy;
  } {
    const pools = GlobalWorkerPools.getAllStats();
    const performance = this.calculatePerformanceMetrics();
    const routing = Object.fromEntries(this.taskCounter);

    return {
      pools,
      performance,
      routing,
      strategy: this.currentStrategy
    };
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(): PerformanceMetrics[] {
    return [...this.performanceHistory];
  }

  /**
   * Force strategy change
   */
  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.currentStrategy = strategy;
  }

  /**
   * Get recommended pool for a task type
   */
  getRecommendedPool(taskType: TaskType, priority: TaskPriority): string {
    // Find pools that handle this task type
    const candidatePools: string[] = [];
    
    for (const [name, template] of this.poolTemplates) {
      if (template.taskTypes.includes(taskType) || template.taskTypes.includes('*' as TaskType)) {
        candidatePools.push(name);
      }
    }

    if (candidatePools.length === 0) {
      return 'default';
    }

    // Apply load balancing strategy
    return this.applyLoadBalancing(candidatePools, taskType, priority);
  }

  /**
   * Route a task to the best pool
   */
  private routeTask(
    taskType: TaskType,
    priority: TaskPriority,
    preferredPool?: string
  ): TaskRouting {
    // Use preferred pool if specified and available
    if (preferredPool && GlobalWorkerPools.get(preferredPool)) {
      return {
        poolName: preferredPool,
        reason: 'user preference',
        loadFactor: this.calculateLoadFactor(preferredPool)
      };
    }

    const poolName = this.getRecommendedPool(taskType, priority);
    const loadFactor = this.calculateLoadFactor(poolName);

    return {
      poolName,
      reason: `strategy: ${this.currentStrategy}`,
      loadFactor
    };
  }

  /**
   * Apply load balancing strategy
   */
  private applyLoadBalancing(
    candidatePools: string[],
    taskType: TaskType,
    priority: TaskPriority
  ): string {
    switch (this.currentStrategy) {
      case 'round-robin':
        return this.roundRobinSelection(candidatePools);
      
      case 'least-busy':
        return this.leastBusySelection(candidatePools);
      
      case 'task-type':
        return this.taskTypeSelection(candidatePools, taskType);
      
      case 'priority':
        return this.prioritySelection(candidatePools, priority);
      
      case 'adaptive':
        return this.adaptiveSelection(candidatePools, taskType, priority);
      
      default:
        return candidatePools[0];
    }
  }

  /**
   * Round-robin pool selection
   */
  private roundRobinSelection(pools: string[]): string {
    const totalTasks = Array.from(this.taskCounter.values()).reduce((sum, count) => sum + count, 0);
    return pools[totalTasks % pools.length];
  }

  /**
   * Least busy pool selection
   */
  private leastBusySelection(pools: string[]): string {
    let leastBusyPool = pools[0];
    let lowestLoad = Infinity;

    for (const poolName of pools) {
      const load = this.calculateLoadFactor(poolName);
      if (load < lowestLoad) {
        lowestLoad = load;
        leastBusyPool = poolName;
      }
    }

    return leastBusyPool;
  }

  /**
   * Task type based selection
   */
  private taskTypeSelection(pools: string[], taskType: TaskType): string {
    // Find pool most specialized for this task type
    for (const poolName of pools) {
      const template = this.poolTemplates.get(poolName);
      if (template && template.taskTypes.length === 1 && template.taskTypes[0] === taskType) {
        return poolName;
      }
    }

    // Fall back to general pools
    return pools[0];
  }

  /**
   * Priority based selection
   */
  private prioritySelection(pools: string[], priority: TaskPriority): string {
    // Find pool with matching priority
    for (const poolName of pools) {
      const template = this.poolTemplates.get(poolName);
      if (template && template.priority === priority) {
        return poolName;
      }
    }

    // Fall back to any available pool
    return pools[0];
  }

  /**
   * Adaptive selection (combines multiple strategies)
   */
  private adaptiveSelection(
    pools: string[],
    taskType: TaskType,
    priority: TaskPriority
  ): string {
    // Calculate scores for each strategy
    const scores = new Map<string, number>();
    
    for (const poolName of pools) {
      let score = 0;
      
      // Load factor score (lower is better)
      const loadFactor = this.calculateLoadFactor(poolName);
      score += (1 - loadFactor) * 0.4;
      
      // Task type specialization score
      const template = this.poolTemplates.get(poolName);
      if (template) {
        if (template.taskTypes.includes(taskType)) {
          score += 0.3;
        }
        if (template.priority === priority) {
          score += 0.2;
        }
      }
      
      // Historical performance score
      const historicalPerformance = this.getPoolHistoricalPerformance(poolName);
      score += historicalPerformance * 0.1;
      
      scores.set(poolName, score);
    }
    
    // Return pool with highest score
    return Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)[0][0];
  }

  /**
   * Calculate load factor for a pool
   */
  private calculateLoadFactor(poolName: string): number {
    const pool = GlobalWorkerPools.get(poolName);
    if (!pool) return 1.0;

    const stats = pool.getStats();
    if (stats.totalWorkers === 0) return 1.0;

    return (stats.busyWorkers + stats.queuedTasks * 0.1) / stats.totalWorkers;
  }

  /**
   * Get historical performance for a pool
   */
  private getPoolHistoricalPerformance(poolName: string): number {
    // Calculate based on recent performance metrics
    // Higher values indicate better performance
    return 0.5; // Placeholder
  }

  /**
   * Record task completion for monitoring
   */
  private recordTaskCompletion(
    poolName: string,
    success: boolean,
    executionTime: number
  ): void {
    const currentCount = this.taskCounter.get(poolName) || 0;
    this.taskCounter.set(poolName, currentCount + 1);
    
    // Update strategy performance
    const currentPerformance = this.strategyPerformance.get(this.currentStrategy) || 0;
    const performanceIncrease = success ? (executionTime > 0 ? 1000 / executionTime : 1) : 0;
    this.strategyPerformance.set(this.currentStrategy, currentPerformance + performanceIncrease);
  }

  /**
   * Calculate current performance metrics
   */
  private calculatePerformanceMetrics(): PerformanceMetrics {
    const allStats = GlobalWorkerPools.getAllStats();
    
    let totalTasks = 0;
    let totalExecutions = 0;
    let totalWorkers = 0;
    let busyWorkers = 0;
    const poolUtilization: Record<string, number> = {};

    for (const [poolName, stats] of Object.entries(allStats)) {
      totalTasks += stats.queuedTasks;
      totalExecutions += stats.totalTasksExecuted;
      totalWorkers += stats.totalWorkers;
      busyWorkers += stats.busyWorkers;
      
      poolUtilization[poolName] = stats.totalWorkers > 0 
        ? stats.busyWorkers / stats.totalWorkers 
        : 0;
    }

    return {
      totalTasks: totalExecutions,
      averageExecutionTime: 0, // Would need more detailed tracking
      averageWaitTime: 0, // Would need more detailed tracking
      throughput: 0, // Would need time-based calculation
      errorRate: 0, // Would need error tracking
      poolUtilization
    };
  }

  /**
   * Initialize default worker pools
   */
  private initializeDefaultPools(): void {
    const workerScript = this.getWorkerScript();
    
    // Default general-purpose pool
    this.registerPoolTemplate({
      name: 'default',
      minSize: 2,
      maxSize: 8,
      taskTypes: ['*' as TaskType],
      priority: 'normal',
      config: {
        maxTasksPerWorker: 1000,
        defaultTimeout: 30000
      }
    });

    // Crypto operations pool
    this.registerPoolTemplate({
      name: 'crypto',
      minSize: 1,
      maxSize: 4,
      taskTypes: ['crypto-hash', 'crypto-sign', 'crypto-verify'],
      priority: 'high',
      config: {
        maxTasksPerWorker: 500,
        defaultTimeout: 60000
      }
    });

    // Data processing pool
    this.registerPoolTemplate({
      name: 'data',
      minSize: 2,
      maxSize: 6,
      taskTypes: ['data-processing', 'parsing', 'compression'],
      priority: 'normal',
      config: {
        maxTasksPerWorker: 200,
        defaultTimeout: 120000
      }
    });

    // High-priority pool
    this.registerPoolTemplate({
      name: 'priority',
      minSize: 1,
      maxSize: 3,
      taskTypes: ['*' as TaskType],
      priority: 'critical',
      config: {
        maxTasksPerWorker: 100,
        defaultTimeout: 15000,
        enableQueue: false
      }
    });
  }

  /**
   * Get worker script path
   */
  private getWorkerScript(): string {
    return path.join(__dirname, 'worker-task.js');
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      try {
        const metrics = this.calculatePerformanceMetrics();
        this.performanceHistory.push(metrics);
        
        // Keep only last 100 metrics
        if (this.performanceHistory.length > 100) {
          this.performanceHistory.shift();
        }
        
        // Auto-scaling logic
        if (this.config.enableAutoScaling) {
          this.performAutoScaling();
        }
        
        // Adaptive strategy selection
        if (this.currentStrategy === 'adaptive') {
          this.updateAdaptiveStrategy();
        }
      } catch (error) {
        console.warn('Error during worker monitoring:', error);
      }
    }, this.config.monitoringInterval);
  }

  /**
   * Perform automatic pool scaling
   */
  private performAutoScaling(): void {
    const allStats = GlobalWorkerPools.getAllStats();
    
    for (const [poolName, stats] of Object.entries(allStats)) {
      const template = this.poolTemplates.get(poolName);
      if (!template) continue;
      
      const utilization = stats.totalWorkers > 0 ? stats.busyWorkers / stats.totalWorkers : 0;
      const queuePressure = stats.queuedTasks > this.config.scalingThresholds.queueThreshold;
      
      // Scale up conditions
      if ((utilization > this.config.scalingThresholds.cpuThreshold || queuePressure) &&
          stats.totalWorkers < template.maxSize) {
        this.scalePool(poolName, stats.totalWorkers + 1).catch(console.error);
      }
      
      // Scale down conditions
      if (utilization < 0.2 && stats.queuedTasks === 0 && 
          stats.totalWorkers > template.minSize) {
        this.scalePool(poolName, stats.totalWorkers - 1).catch(console.error);
      }
    }
  }

  /**
   * Update adaptive strategy based on performance
   */
  private updateAdaptiveStrategy(): void {
    if (this.strategyPerformance.size < 2) return;
    
    // Find best performing strategy
    let bestStrategy: LoadBalancingStrategy = 'round-robin';
    let bestPerformance = 0;
    
    for (const [strategy, performance] of this.strategyPerformance) {
      if (performance > bestPerformance) {
        bestPerformance = performance;
        bestStrategy = strategy;
      }
    }
    
    // Switch to best strategy if significantly better
    if (bestStrategy !== this.currentStrategy && 
        bestPerformance > (this.strategyPerformance.get(this.currentStrategy) || 0) * 1.2) {
      this.currentStrategy = bestStrategy;
    }
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
  }

  /**
   * Dispose and cleanup
   */
  protected disposeSync(): void {
    this.stopMonitoring();
    GlobalWorkerPools.disposeAll();
    this.poolTemplates.clear();
    this.taskCounter.clear();
    this.performanceHistory.length = 0;
    this.strategyPerformance.clear();
  }
}

/**
 * Global worker manager instance
 */
let globalWorkerManager: WorkerManager | undefined;

/**
 * Get or create global worker manager
 */
export function getGlobalWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager();
  }
  return globalWorkerManager;
}

/**
 * Set custom global worker manager
 */
export function setGlobalWorkerManager(manager: WorkerManager): void {
  if (globalWorkerManager) {
    globalWorkerManager[Symbol.dispose]();
  }
  globalWorkerManager = manager;
}

/**
 * Convenience function for executing tasks
 */
export async function executeWorkerTask<T, R>(
  type: TaskType,
  data: T,
  options?: {
    priority?: TaskPriority;
    timeout?: number;
    transferList?: Transferable[];
    preferredPool?: string;
  }
): Promise<TaskResult<R>> {
  return getGlobalWorkerManager().executeTask<T, R>(type, data, options);
}
