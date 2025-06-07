import { TariWallet } from '../wallet';
import { EventEmitter } from 'eventemitter3';

// Simple concurrent limit implementation to avoid ESM issues
function createLimit(concurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];
  
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          running--;
          if (queue.length > 0 && running < concurrency) {
            const next = queue.shift();
            if (next) next();
          }
        }
      };
      
      if (running < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  address: string;
  amount: bigint;
  priority: 'normal' | 'high' | 'low';
  created: Date;
}

export interface WithdrawalResult {
  requestId: string;
  txId: string;
  fee: bigint;
  status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  error?: string;
  estimatedProcessingTime?: number;
}

export interface WithdrawalStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: bigint;
  created: Date;
  retries: number;
  error?: string;
  txId?: string;
}

export interface QueueStatus {
  pending: WithdrawalRequest[];
  processing: WithdrawalRequest[];
  completed: WithdrawalStatus[];
  failed: WithdrawalStatus[];
  totalPending: number;
  totalProcessing: number;
  totalCompleted: number;
  totalFailed: number;
}

export class WithdrawalProcessor extends EventEmitter {
  private pendingQueue: WithdrawalRequest[] = [];
  private processingQueue: WithdrawalRequest[] = [];
  private completedList: WithdrawalStatus[] = [];
  private failedList: WithdrawalStatus[] = [];
  private statusMap = new Map<string, WithdrawalStatus>();
  private isProcessing = false;
  private running = false;
  private intervalId?: NodeJS.Timeout;
  private limit = createLimit(5); // Max 5 concurrent transactions

  constructor(
    private wallet: TariWallet,
    private options = {
      batchSize: 10,
      batchDelayMs: 5000,
      maxRetries: 3,
    }
  ) {
    super();
  }

  /**
   * Add withdrawal to queue
   */
  async addWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    // Validate required fields
    if (!request.userId || request.userId.trim() === '') {
      throw new Error('User ID is required');
    }
    
    if (!request.address || request.address.trim() === '') {
      throw new Error('Destination address is required');
    }
    
    if (request.amount <= 0n) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Check minimum amount
    if (request.amount < 100000n) {
      throw new Error('Amount below minimum withdrawal');
    }
    
    // Note: Balance check happens during processing, not here
    
    // Create status entry
    const status: WithdrawalStatus = {
      id: request.id,
      status: 'pending',
      amount: request.amount,
      created: request.created,
      retries: 0,
    };
    this.statusMap.set(request.id, status);
    
    // Add to queue with priority
    this.insertWithPriority(request);
    
    // Process queue if running
    if (this.running) {
      this.processQueue();
    }
    
    // Return pending result
    return {
      requestId: request.id,
      txId: '',
      fee: 0n,
      status: 'pending',
      estimatedProcessingTime: this.estimateProcessingTime(),
    };
  }

  private insertWithPriority(request: WithdrawalRequest): void {
    if (request.priority === 'high') {
      this.pendingQueue.unshift(request);
    } else {
      this.pendingQueue.push(request);
    }
  }

  private estimateProcessingTime(): number {
    return this.pendingQueue.length * 1000;
  }

  /**
   * Process withdrawal queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.pendingQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Take batch from pending queue
      const batch = this.pendingQueue.splice(0, this.options.batchSize);
      
      // Move to processing
      this.processingQueue.push(...batch);
      
      // Process batch
      await this.processBatch(batch);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch of withdrawals
   */
  private async processBatch(batch: WithdrawalRequest[]): Promise<void> {
    const results = await Promise.allSettled(
      batch.map(request => 
        this.limit(() => this.processWithdrawal(request))
      )
    );
    
    // Remove from processing queue and update status
    batch.forEach((request, index) => {
      const result = results[index];
      const status = this.statusMap.get(request.id);
      
      if (status) {
        if (result.status === 'fulfilled' && result.value.status !== 'failed') {
          status.status = 'completed';
          status.txId = result.value.txId;
          this.completedList.push(status);
          this.emit('withdrawal-processed', {
            id: request.id,
            txId: result.value.txId,
            amount: request.amount,
            userId: request.userId,
          });
        } else {
          status.status = 'failed';
          status.error = result.status === 'rejected' ? result.reason.message : result.value.error;
          this.failedList.push(status);
          this.emit('withdrawal-failed', {
            id: request.id,
            error: status.error,
            userId: request.userId,
          });
        }
      }
    });
    
    // Remove from processing queue
    this.processingQueue = this.processingQueue.filter(r => 
      !batch.some(b => b.id === r.id)
    );
  }

  /**
   * Process single withdrawal
   */
  private async processWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    try {
      // Check balance before processing
      const balance = await this.wallet.getBalance();
      if (balance.available < request.amount + 10000n) {
        throw new Error('Insufficient balance for withdrawal');
      }
      
      // Calculate dynamic fee
      const feePerGram = request.priority === 'high' ? 10n : 5n;
      
      // Send transaction
      const tx = await this.wallet.sendTransaction({
        destination: request.address,
        amount: request.amount,
        feePerGram,
        message: `Withdrawal ${request.id}`,
      });
      
      return {
        requestId: request.id,
        txId: tx.id,
        fee: tx.fee || 0n,
        status: 'broadcast',
      };
    } catch (error) {
      return {
        requestId: request.id,
        txId: '',
        fee: 0n,
        status: 'failed',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Start processing withdrawals
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => {
      this.processQueue();
    }, this.options.batchDelayMs);
  }

  /**
   * Stop processing withdrawals
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Check if processor is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get withdrawal status
   */
  getWithdrawalStatus(id: string): WithdrawalStatus | null {
    return this.statusMap.get(id) || null;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): QueueStatus {
    return {
      pending: [...this.pendingQueue],
      processing: [...this.processingQueue],
      completed: [...this.completedList],
      failed: [...this.failedList],
      totalPending: this.pendingQueue.length,
      totalProcessing: this.processingQueue.length,
      totalCompleted: this.completedList.length,
      totalFailed: this.failedList.length,
    };
  }

  /**
   * Validate withdrawal request
   */
  private async validateWithdrawal(request: WithdrawalRequest): Promise<void> {
    // Check required fields
    if (!request.userId || request.userId.trim() === '') {
      throw new Error('User ID is required');
    }
    
    if (!request.address || request.address.trim() === '') {
      throw new Error('Destination address is required');
    }
    
    if (request.amount <= 0n) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Check minimum amount
    if (request.amount < 100000n) {
      throw new Error('Amount below minimum withdrawal');
    }
    
    // Check balance
    const balance = await this.wallet.getBalance();
    if (balance.available < request.amount + 10000n) {
      throw new Error('Insufficient balance for withdrawal');
    }
  }
}
