import { TariWallet } from '../wallet';
import pLimit from 'p-limit';

export interface WithdrawalRequest {
  id: string;
  userId: string;
  address: string;
  amount: bigint;
  priority: 'normal' | 'high';
  created: Date;
}

export interface WithdrawalResult {
  requestId: string;
  txId: string;
  fee: bigint;
  status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  error?: string;
}

export class WithdrawalProcessor {
  private queue: WithdrawalRequest[] = [];
  private processing = false;
  private limit = pLimit(5); // Max 5 concurrent transactions

  constructor(
    private wallet: TariWallet,
    private options = {
      batchSize: 10,
      batchDelayMs: 5000,
      maxRetries: 3,
    }
  ) {}

  /**
   * Add withdrawal to queue
   */
  async addWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    // Validate withdrawal
    await this.validateWithdrawal(request);
    
    // Add to queue
    this.queue.push(request);
    
    // Process queue
    this.processQueue();
    
    // Return pending result
    return {
      requestId: request.id,
      txId: '',
      fee: 0n,
      status: 'pending',
    };
  }

  /**
   * Process withdrawal queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    try {
      // Group by priority
      const highPriority = this.queue.filter(w => w.priority === 'high');
      const normalPriority = this.queue.filter(w => w.priority === 'normal');
      
      // Process high priority first
      await this.processBatch(highPriority);
      
      // Wait before processing normal priority
      if (normalPriority.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.options.batchDelayMs));
        await this.processBatch(normalPriority);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a batch of withdrawals
   */
  private async processBatch(batch: WithdrawalRequest[]): Promise<void> {
    await Promise.allSettled(
      batch.map(request => 
        this.limit(() => this.processWithdrawal(request))
      )
    );
    
    // Remove processed items from queue
    const processed = batch.map(r => r.id);
    this.queue = this.queue.filter(r => !processed.includes(r.id));
  }

  /**
   * Process single withdrawal
   */
  private async processWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    try {
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
        fee: tx.fee,
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
   * Validate withdrawal request
   */
  private async validateWithdrawal(request: WithdrawalRequest): Promise<void> {
    // Check minimum amount
    if (request.amount < 100000n) {
      throw new Error('Amount below minimum withdrawal');
    }
    
    // Check address format
    if (!request.address || request.address.length < 10) {
      throw new Error('Invalid destination address');
    }
    
    // Check balance
    const balance = await this.wallet.getBalance();
    if (balance.available < request.amount + 10000n) {
      throw new Error('Insufficient balance for withdrawal');
    }
  }
}
