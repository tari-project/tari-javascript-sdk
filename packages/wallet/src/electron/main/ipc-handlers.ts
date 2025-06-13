/**
 * @fileoverview Electron IPC handlers for secure wallet operations
 * 
 * Provides type-safe IPC handling with security validation and proper
 * error handling for all wallet operations.
 */

import { ipcMain } from 'electron';

// Fallback type definitions for Electron if not available
interface IpcMainInvokeEvent {
  frameId: number;
  processId: number;
  sender: WebContents;
}

interface WebContents {
  id: number;
  session: any;
  getURL(): string;
}

// Type assertion for ipcMain to include handle method
const ipcMainTyped = ipcMain as any;
import { getElectronWalletService } from './wallet-service.js';
import { IPCErrorBoundary, IPCTypeConverter } from '../utils/type-converters.js';
import type { WalletConfig } from '../../types/index.js';
import { PlatformDetector } from '../../platform/detector.js';

/**
 * IPC request validation
 */
interface IpcRequest {
  requestId?: string;
  timestamp?: number;
}

/**
 * Wallet operation requests
 */
export interface WalletCreateRequest extends IpcRequest {
  walletId: string;
  config: WalletConfig;
}

export interface WalletOperationRequest extends IpcRequest {
  walletId: string;
}

export interface TransactionRequest extends IpcRequest {
  walletId: string;
  recipient: string;
  amount: number;
  message?: string;
}

export interface AuthRequest extends IpcRequest {
  walletId: string;
  passphrase?: string;
}

/**
 * IPC response wrapper
 */
export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
  timestamp: number;
}

/**
 * Security context for IPC validation
 */
interface SecurityContext {
  webContents: WebContents;
  frame: any;
  allowedOrigins: string[];
  maxRequestAge: number;
}

/**
 * IPC handlers manager
 */
export class IpcHandlersManager {
  private readonly securityContext: SecurityContext;
  private readonly requestCache = new Map<string, number>();
  private readonly rateLimiter = new Map<string, number[]>();

  constructor(config: Partial<SecurityContext> = {}) {
    this.securityContext = {
      allowedOrigins: ['file://'],
      maxRequestAge: 60000, // 1 minute
      ...config,
    } as SecurityContext;

    this.setupHandlers();
    this.setupCleanupTimer();
  }

  /**
   * Set up all IPC handlers
   */
  private setupHandlers(): void {
    // Wallet lifecycle handlers
    ipcMainTyped.handle('wallet:create', this.handleCreateWallet);
    ipcMainTyped.handle('wallet:open', this.handleOpenWallet);
    ipcMainTyped.handle('wallet:close', this.handleCloseWallet);
    ipcMainTyped.handle('wallet:lock', this.handleLockWallet);
    ipcMainTyped.handle('wallet:unlock', this.handleUnlockWallet);
    ipcMainTyped.handle('wallet:status', this.handleGetWalletStatus);
    ipcMainTyped.handle('wallet:list', this.handleListWallets);

    // Wallet information handlers
    ipcMainTyped.handle('wallet:get-balance', this.handleGetBalance);
    ipcMainTyped.handle('wallet:get-info', this.handleGetInfo);
    ipcMainTyped.handle('wallet:get-address', this.handleGetAddress);

    // Transaction handlers
    ipcMainTyped.handle('wallet:send-transaction', this.handleSendTransaction);
    ipcMainTyped.handle('wallet:get-transactions', this.handleGetTransactions);
    ipcMainTyped.handle('wallet:get-transaction', this.handleGetTransaction);

    // Sync handlers
    ipcMainTyped.handle('wallet:sync', this.handleSync);
    ipcMainTyped.handle('wallet:get-sync-status', this.handleGetSyncStatus);

    // Utility handlers
    ipcMainTyped.handle('wallet:validate-address', this.handleValidateAddress);
    ipcMainTyped.handle('wallet:estimate-fee', this.handleEstimateFee);

    // Platform handlers
    ipcMainTyped.handle('platform:get-info', this.handleGetPlatformInfo);
    ipcMainTyped.handle('platform:get-capabilities', this.handleGetCapabilities);
  }

  /**
   * Create wallet handler
   */
  private handleCreateWallet = async (
    event: IpcMainInvokeEvent,
    request: WalletCreateRequest
  ): Promise<IpcResponse<string>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const walletId = await service.createWallet(request.walletId, request.config);
      return this.createResponse(walletId, request.requestId);
    });
  };

  /**
   * Open wallet handler
   */
  private handleOpenWallet = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      await service.openWallet(request.walletId);
      return this.createResponse(undefined, request.requestId);
    });
  };

  /**
   * Close wallet handler
   */
  private handleCloseWallet = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      await service.closeWallet(request.walletId);
      return this.createResponse(undefined, request.requestId);
    });
  };

  /**
   * Lock wallet handler
   */
  private handleLockWallet = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      await service.lockWallet(request.walletId);
      return this.createResponse(undefined, request.requestId);
    });
  };

  /**
   * Unlock wallet handler
   */
  private handleUnlockWallet = async (
    event: IpcMainInvokeEvent,
    request: AuthRequest
  ): Promise<IpcResponse> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      await service.unlockWallet(request.walletId, request.passphrase);
      return this.createResponse(undefined, request.requestId);
    });
  };

  /**
   * Get wallet status handler
   */
  private handleGetWalletStatus = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const status = service.getWalletStatus(request.walletId);
      return this.createResponse(status, request.requestId);
    });
  };

  /**
   * List wallets handler
   */
  private handleListWallets = async (
    event: IpcMainInvokeEvent,
    request: IpcRequest
  ): Promise<IpcResponse<string[]>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const walletIds = service.getWalletIds();
      return this.createResponse(walletIds, request.requestId);
    });
  };

  /**
   * Get balance handler
   */
  private handleGetBalance = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      const balance = await wallet.getBalance();
      return this.createResponse(balance, request.requestId);
    });
  };

  /**
   * Get wallet info handler
   */
  private handleGetInfo = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      const info = await wallet.getInfo();
      return this.createResponse(info, request.requestId);
    });
  };

  /**
   * Get address handler
   */
  private handleGetAddress = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse<string>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      const address = await wallet.getAddress();
      const addressString = IPCTypeConverter.addressToString(address);
      return this.createResponse(addressString, request.requestId);
    });
  };

  /**
   * Send transaction handler
   */
  private handleSendTransaction = async (
    event: IpcMainInvokeEvent,
    request: TransactionRequest
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      // Additional validation for transaction requests
      this.validateTransactionRequest(request);

      const transaction = await wallet.sendTransaction({
        recipient: request.recipient,
        amount: request.amount,
        message: request.message,
      });

      return this.createResponse(transaction, request.requestId);
    });
  };

  /**
   * Get transactions handler
   */
  private handleGetTransactions = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest & { limit?: number; offset?: number }
  ): Promise<IpcResponse<any[]>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      const transactions = await wallet.getTransactions({
        limit: request.limit || 50,
        offset: request.offset || 0,
      });

      return this.createResponse(transactions, request.requestId);
    });
  };

  /**
   * Get transaction handler
   */
  private handleGetTransaction = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest & { transactionId: string }
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      const transaction = await wallet.getTransaction(request.transactionId);
      return this.createResponse(transaction, request.requestId);
    });
  };

  /**
   * Sync handler
   */
  private handleSync = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      await wallet.sync();
      return this.createResponse(undefined, request.requestId);
    });
  };

  /**
   * Get sync status handler
   */
  private handleGetSyncStatus = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      const syncStatus = await wallet.getSyncStatus();
      return this.createResponse(syncStatus, request.requestId);
    });
  };

  /**
   * Validate address handler
   */
  private handleValidateAddress = async (
    event: IpcMainInvokeEvent,
    request: IpcRequest & { address: string }
  ): Promise<IpcResponse<boolean>> => {
    return this.withSecurityValidation(event, request, async () => {
      // Implement address validation logic
      const isValid = /^[a-zA-Z0-9]+$/.test(request.address); // Placeholder
      return this.createResponse(isValid, request.requestId);
    });
  };

  /**
   * Estimate fee handler
   */
  private handleEstimateFee = async (
    event: IpcMainInvokeEvent,
    request: WalletOperationRequest & { amount: number; priority?: string }
  ): Promise<IpcResponse<number>> => {
    return this.withSecurityValidation(event, request, async () => {
      const service = getElectronWalletService();
      const wallet = service.getWallet(request.walletId);
      
      if (!wallet) {
        throw new Error('Wallet not available');
      }

      const amountBigint = IPCTypeConverter.numberToBigint(request.amount);
      const fee = await wallet.estimateFee(amountBigint, request.priority);
      const feeNumber = IPCTypeConverter.bigintToNumber(fee);
      return this.createResponse(feeNumber, request.requestId);
    });
  };

  /**
   * Get platform info handler
   */
  private handleGetPlatformInfo = async (
    event: IpcMainInvokeEvent,
    request: IpcRequest
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const platform = PlatformDetector.detect();
      return this.createResponse(platform, request.requestId);
    });
  };

  /**
   * Get capabilities handler
   */
  private handleGetCapabilities = async (
    event: IpcMainInvokeEvent,
    request: IpcRequest
  ): Promise<IpcResponse<any>> => {
    return this.withSecurityValidation(event, request, async () => {
      const capabilities = PlatformDetector.getCapabilities();
      return this.createResponse(capabilities, request.requestId);
    });
  };

  /**
   * Security validation wrapper
   */
  private async withSecurityValidation<T>(
    event: IpcMainInvokeEvent,
    request: IpcRequest,
    handler: () => Promise<IpcResponse<T>>
  ): Promise<IpcResponse<T>> {
    try {
      // Validate sender
      this.validateSender(event);

      // Validate request
      this.validateRequest(request);

      // Rate limiting
      this.checkRateLimit(event.sender);

      // Execute handler
      const response = await handler();
      
      // Add response metadata
      response.requestId = request.requestId;
      response.timestamp = Date.now();
      
      return response;
    } catch (error) {
      const ipcError = IPCTypeConverter.handleUnknownError(error, 'withSecurityValidation');
      return IPCTypeConverter.createErrorResponse(ipcError, request.requestId);
    }
  }

  /**
   * Validate sender security
   */
  private validateSender(event: IpcMainInvokeEvent): void {
    const { sender } = event;
    
    // Check if sender is from allowed origin
    const url = sender.getURL();
    const isAllowed = this.securityContext.allowedOrigins.some(origin => 
      url.startsWith(origin)
    );
    
    if (!isAllowed) {
      throw new Error('Unauthorized sender');
    }

    // Additional security checks can be added here
    // - Check frame origin
    // - Validate sender process
    // - Check permissions
  }

  /**
   * Validate request format and timing
   */
  private validateRequest(request: IpcRequest): void {
    // Check request age
    if (request.timestamp) {
      const age = Date.now() - request.timestamp;
      if (age > this.securityContext.maxRequestAge) {
        throw new Error('Request too old');
      }
    }

    // Check for replay attacks
    if (request.requestId) {
      if (this.requestCache.has(request.requestId)) {
        throw new Error('Duplicate request');
      }
      
      this.requestCache.set(request.requestId, Date.now());
    }
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(sender: WebContents): void {
    const senderId = sender.id.toString();
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 100; // Max requests per window

    if (!this.rateLimiter.has(senderId)) {
      this.rateLimiter.set(senderId, []);
    }

    const requests = this.rateLimiter.get(senderId)!;
    
    // Remove old requests
    const cutoff = now - windowMs;
    while (requests.length > 0 && requests[0] < cutoff) {
      requests.shift();
    }

    // Check limit
    if (requests.length >= maxRequests) {
      throw new Error('Rate limit exceeded');
    }

    // Add current request
    requests.push(now);
  }

  /**
   * Validate transaction request
   */
  private validateTransactionRequest(request: TransactionRequest): void {
    if (!request.recipient || typeof request.recipient !== 'string') {
      throw new Error('Invalid recipient address');
    }

    if (!request.amount || typeof request.amount !== 'number' || request.amount <= 0) {
      throw new Error('Invalid amount');
    }

    if (request.amount > 1000000) { // 1M limit for safety
      throw new Error('Amount too large');
    }

    // Additional validation can be added here
  }

  /**
   * Set up cleanup timer for security caches
   */
  private setupCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      const maxAge = this.securityContext.maxRequestAge;

      // Clean request cache
      for (const [requestId, timestamp] of this.requestCache) {
        if (now - timestamp > maxAge) {
          this.requestCache.delete(requestId);
        }
      }

      // Clean rate limiter cache
      for (const [senderId, requests] of this.rateLimiter) {
        const cutoff = now - 60000; // 1 minute
        while (requests.length > 0 && requests[0] < cutoff) {
          requests.shift();
        }
        
        if (requests.length === 0) {
          this.rateLimiter.delete(senderId);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Remove all handlers
   */
  dispose(): void {
    const handlers = [
      'wallet:create', 'wallet:open', 'wallet:close', 'wallet:lock', 'wallet:unlock',
      'wallet:status', 'wallet:list', 'wallet:get-balance', 'wallet:get-info',
      'wallet:get-address', 'wallet:send-transaction', 'wallet:get-transactions',
      'wallet:get-transaction', 'wallet:sync', 'wallet:get-sync-status',
      'wallet:validate-address', 'wallet:estimate-fee', 'platform:get-info',
      'platform:get-capabilities'
    ];

    handlers.forEach(handler => {
      try {
        if (ipcMainTyped.removeHandler) {
          ipcMainTyped.removeHandler(handler);
        }
      } catch (error) {
        console.warn(`Failed to remove IPC handler ${handler}:`, error);
      }
    });
    
    this.requestCache.clear();
    this.rateLimiter.clear();
  }

  /**
   * Create a properly formatted IPC response
   */
  private createResponse<T>(data?: T, requestId?: string): IpcResponse<T> {
    return {
      success: true,
      data,
      requestId,
      timestamp: Date.now()
    };
  }
}

/**
 * Global IPC handlers manager
 */
let globalIpcHandlers: IpcHandlersManager | undefined;

/**
 * Initialize IPC handlers
 */
export function initializeIpcHandlers(config?: Partial<SecurityContext>): void {
  if (globalIpcHandlers) {
    globalIpcHandlers.dispose();
  }
  globalIpcHandlers = new IpcHandlersManager(config);
}

/**
 * Dispose IPC handlers
 */
export function disposeIpcHandlers(): void {
  if (globalIpcHandlers) {
    globalIpcHandlers.dispose();
    globalIpcHandlers = undefined;
  }
}
