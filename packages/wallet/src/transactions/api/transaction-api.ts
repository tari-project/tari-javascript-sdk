/**
 * Transaction API abstraction layer
 * Provides validation, estimation, and sending capabilities for transactions
 */

import { 
  MicroTari, 
  TransactionId, 
  TariAddressString,
  WalletErrorCode,
  WalletError,
  TypedEventEmitter,
  getFFIBindings,
  type WalletHandle
} from '@tari-project/tarijs-core';

export interface TransactionRequest {
  readonly recipient: TariAddressString;
  readonly amount: MicroTari;
  readonly fee?: MicroTari;
  readonly message?: string;
  readonly oneTimeUse?: boolean;
}

export interface TransactionEstimate {
  readonly estimatedFee: MicroTari;
  readonly totalAmount: MicroTari;
  readonly estimatedConfirmationTime: number;
  readonly networkCongestion: 'low' | 'medium' | 'high';
}

export interface TransactionResult {
  readonly transactionId: TransactionId;
  readonly status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  readonly timestamp: number;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface TransactionAPIEvents {
  'transaction:validated': (request: TransactionRequest, result: ValidationResult) => void;
  'transaction:estimated': (request: TransactionRequest, estimate: TransactionEstimate) => void;
  'transaction:sent': (result: TransactionResult) => void;
  'transaction:status': (transactionId: TransactionId, status: string) => void;
  'transaction:cancelled': (transactionId: TransactionId, success: boolean) => void;
  [key: string]: (...args: unknown[]) => void; // Index signature for TypedEventEmitter
}

/**
 * Transaction API implementation with real FFI integration
 * Provides validation, estimation, and sending capabilities with event emission
 */
export class TransactionAPI extends TypedEventEmitter<TransactionAPIEvents> {
  private readonly walletHandle?: WalletHandle;
  private readonly ffi = getFFIBindings();

  constructor(walletHandle?: WalletHandle) {
    super();
    this.walletHandle = walletHandle;
  }

  /**
   * Validate a transaction request
   */
  async validate(request: TransactionRequest): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!request.recipient) {
      errors.push('Recipient address is required');
    }

    if (!request.amount || request.amount <= 0n) {
      errors.push('Amount must be positive');
    }

    if (request.fee && request.fee < 0n) {
      errors.push('Fee cannot be negative');
    }

    // Address format validation using FFI
    if (request.recipient) {
      try {
        await this.ffi.validateAddress(request.recipient, 'mainnet');
      } catch (error) {
        errors.push(`Invalid recipient address: ${error}`);
      }
    }

    // Balance checks using FFI
    if (this.walletHandle && request.amount > 0n) {
      try {
        const balance = await this.ffi.walletGetBalance(this.walletHandle);
        const available = BigInt(balance.available);
        const totalRequired = request.amount + (request.fee || 25n);
        
        if (available < totalRequired) {
          errors.push(`Insufficient balance: ${available} < ${totalRequired}`);
        } else if (available < totalRequired * 2n) {
          warnings.push('Balance is low after this transaction');
        }
      } catch (error) {
        warnings.push(`Could not verify balance: ${error}`);
      }
    }

    const result = {
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    // Emit validation event
    this.emit('transaction:validated', request, result);

    return result;
  }

  /**
   * Estimate transaction fee and confirmation time
   */
  async estimate(request: TransactionRequest): Promise<TransactionEstimate> {
    let estimatedFee = request.fee ?? 25n as MicroTari;
    let networkCongestion: 'low' | 'medium' | 'high' = 'low';
    let estimatedConfirmationTime = 60;

    // Get network fee estimates using FFI
    if (this.walletHandle) {
      try {
        const feeStats = await this.ffi.walletGetFeePerGramStats(this.walletHandle);
        
        // Use average fee per gram for estimation (typical transaction is ~1000 bytes)
        const avgFeePerGram = BigInt(feeStats.avg);
        estimatedFee = (avgFeePerGram * 1000n) as MicroTari;
        
        // Determine network congestion based on fee stats
        const maxFeePerGram = BigInt(feeStats.max);
        const minFeePerGram = BigInt(feeStats.min);
        
        if (avgFeePerGram > (minFeePerGram + maxFeePerGram) / 2n) {
          networkCongestion = 'high';
          estimatedConfirmationTime = 300; // 5 minutes
        } else if (avgFeePerGram > minFeePerGram + (maxFeePerGram - minFeePerGram) / 3n) {
          networkCongestion = 'medium';
          estimatedConfirmationTime = 120; // 2 minutes
        }
      } catch (error) {
        // Fall back to default fee if estimation fails
        // Note: Error is already logged by FFI layer
      }
    }

    const totalAmount = (request.amount + estimatedFee) as MicroTari;
    
    const estimate = {
      estimatedFee,
      totalAmount,
      estimatedConfirmationTime,
      networkCongestion,
    };

    // Emit estimation event
    this.emit('transaction:estimated', request, estimate);

    return estimate;
  }

  /**
   * Send a transaction
   */
  async send(request: TransactionRequest): Promise<TransactionResult> {
    // Validate first
    const validation = await this.validate(request);
    if (!validation.isValid) {
      throw new WalletError(
        WalletErrorCode.InvalidAmount,
        `Transaction validation failed: ${validation.errors.join(', ')}`
      );
    }

    if (!this.walletHandle) {
      throw new WalletError(
        WalletErrorCode.WalletNotFound,
        'Wallet handle is required for sending transactions'
      );
    }

    // Get fee estimate if not provided
    const estimate = await this.estimate(request);
    const feeToUse = request.fee ?? estimate.estimatedFee;

    try {
      // Send transaction using FFI
      const txIdString = await this.ffi.walletSendTransaction(
        this.walletHandle,
        request.recipient,
        request.amount.toString(),
        feeToUse.toString(),
        request.message || ''
      );

      const transactionId = BigInt(txIdString) as TransactionId;
      
      const result = {
        transactionId,
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      // Emit transaction sent event
      this.emit('transaction:sent', result);

      return result;
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.TransactionSendFailed,
        `Failed to send transaction: ${error}`,
        { cause: error as Error }
      );
    }
  }

  /**
   * Get transaction status
   */
  async getStatus(transactionId: TransactionId): Promise<string> {
    if (!this.walletHandle) {
      throw new WalletError(
        WalletErrorCode.WalletNotFound,
        'Wallet handle is required for checking transaction status'
      );
    }

    try {
      const transaction = await this.ffi.walletGetTransaction(
        this.walletHandle,
        transactionId.toString()
      );

      const status = JSON.parse(transaction).status || 'unknown';
      
      // Emit status event
      this.emit('transaction:status', transactionId, status);
      
      return status;
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.TransactionNotFound,
        `Failed to get transaction status: ${error}`,
        { cause: error as Error }
      );
    }
  }

  /**
   * Cancel a pending transaction
   */
  async cancel(transactionId: TransactionId): Promise<boolean> {
    if (!this.walletHandle) {
      throw new WalletError(
        WalletErrorCode.WalletNotFound,
        'Wallet handle is required for cancelling transactions'
      );
    }

    try {
      const success = await this.ffi.walletCancelPendingTransaction(
        this.walletHandle,
        transactionId.toString()
      );

      // Emit cancellation event
      this.emit('transaction:cancelled', transactionId, success);

      return success;
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.TransactionNotCancellable,
        `Failed to cancel transaction: ${error}`,
        { cause: error as Error }
      );
    }
  }
}
