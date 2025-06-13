/**
 * @fileoverview Electron IPC handlers for secure wallet operations
 * 
 * Provides type-safe IPC handling with security validation and proper
 * error handling for all wallet operations.
 */

import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { getElectronWalletService } from './wallet-service.js';
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
    ipcMain.handle('wallet:create', this.handleCreateWallet);
    ipcMain.handle('wallet:open', this.handleOpenWallet);
    ipcMain.handle('wallet:close', this.handleCloseWallet);
    ipcMain.handle('wallet:lock', this.handleLockWallet);
    ipcMain.handle('wallet:unlock', this.handleUnlockWallet);
    ipcMain.handle('wallet:status', this.handleGetWalletStatus);
    ipcMain.handle('wallet:list', this.handleListWallets);

    // Wallet information handlers
    ipcMain.handle('wallet:get-balance', this.handleGetBalance);
    ipcMain.handle('wallet:get-info', this.handleGetInfo);
    ipcMain.handle('wallet:get-address', this.handleGetAddress);

    // Transaction handlers
    ipcMain.handle('wallet:send-transaction', this.handleSendTransaction);
    ipcMain.handle('wallet:get-transactions', this.handleGetTransactions);
    ipcMain.handle('wallet:get-transaction', this.handleGetTransaction);

    // Sync handlers
    ipcMain.handle('wallet:sync', this.handleSync);
    ipcMain.handle('wallet:get-sync-status', this.handleGetSyncStatus);

    // Utility handlers
    ipcMain.handle('wallet:validate-address', this.handleValidateAddress);
    ipcMain.handle('wallet:estimate-fee', this.handleEstimateFee);

    // Platform handlers
    ipcMain.handle('platform:get-info', this.handleGetPlatformInfo);
    ipcMain.handle('platform:get-capabilities', this.handleGetCapabilities);
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
      return { success: true, data: walletId };
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
      return { success: true };
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
      return { success: true };
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
      return { success: true };
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
      return { success: true };
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
      return { success: true, data: status };
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
      return { success: true, data: walletIds };
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
      return { success: true, data: balance };
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
      return { success: true, data: info };
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
      return { success: true, data: address };
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

      return { success: true, data: transaction };
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

      return { success: true, data: transactions };
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
      return { success: true, data: transaction };
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
      return { success: true };
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
      return { success: true, data: syncStatus };
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
      return { success: true, data: isValid };
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

      const fee = await wallet.estimateFee(request.amount, request.priority);
      return { success: true, data: fee };
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
      return { success: true, data: platform };
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
      return { success: true, data: capabilities };
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
      return {
        success: false,
        error: error.message,
        requestId: request.requestId,
        timestamp: Date.now(),
      };
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

    handlers.forEach(handler => ipcMain.removeHandler(handler));
    
    this.requestCache.clear();
    this.rateLimiter.clear();
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
