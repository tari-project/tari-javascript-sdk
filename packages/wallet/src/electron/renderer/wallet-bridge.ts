/**
 * @fileoverview Electron renderer wallet bridge
 * 
 * Provides type-safe wallet API for Electron renderer processes with
 * automatic IPC communication and event handling.
 */

import { ipcRenderer, IpcRendererEvent } from 'electron';
import type { WalletConfig } from '../../types/index.js';
import type { 
  IpcResponse, 
  WalletCreateRequest, 
  WalletOperationRequest, 
  TransactionRequest, 
  AuthRequest 
} from '../main/ipc-handlers.js';

/**
 * Wallet event types for renderer
 */
export interface RendererWalletEvents {
  'transaction-received': any;
  'balance-updated': any;
  'wallet-error': { walletId: string; error: string };
  'sync-progress': { walletId: string; progress: number };
  'wallet-locked': { walletId: string };
  'wallet-unlocked': { walletId: string };
}

/**
 * Transaction parameters
 */
export interface TransactionParams {
  recipient: string;
  amount: number;
  message?: string;
}

/**
 * Query parameters for transactions
 */
export interface TransactionQuery {
  limit?: number;
  offset?: number;
  status?: string;
}

/**
 * Electron renderer wallet bridge
 */
export class ElectronWalletBridge {
  private readonly eventListeners = new Map<keyof RendererWalletEvents, Function[]>();
  private requestCounter = 0;

  constructor() {
    this.setupEventForwarding();
  }

  /**
   * Create a new wallet
   */
  async createWallet(walletId: string, config: WalletConfig): Promise<string> {
    const request: WalletCreateRequest = {
      walletId,
      config,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<string>('wallet:create', request);
    return response.data!;
  }

  /**
   * Open an existing wallet
   */
  async openWallet(walletId: string): Promise<void> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    await this.invoke('wallet:open', request);
  }

  /**
   * Close a wallet
   */
  async closeWallet(walletId: string): Promise<void> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    await this.invoke('wallet:close', request);
  }

  /**
   * Lock a wallet
   */
  async lockWallet(walletId: string): Promise<void> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    await this.invoke('wallet:lock', request);
    this.emit('wallet-locked', { walletId });
  }

  /**
   * Unlock a wallet
   */
  async unlockWallet(walletId: string, passphrase?: string): Promise<void> {
    const request: AuthRequest = {
      walletId,
      passphrase,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    await this.invoke('wallet:unlock', request);
    this.emit('wallet-unlocked', { walletId });
  }

  /**
   * Get wallet status
   */
  async getWalletStatus(walletId: string): Promise<any> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('wallet:status', request);
    return response.data;
  }

  /**
   * List all wallets
   */
  async listWallets(): Promise<string[]> {
    const request = {
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<string[]>('wallet:list', request);
    return response.data!;
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string): Promise<any> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('wallet:get-balance', request);
    return response.data;
  }

  /**
   * Get wallet information
   */
  async getWalletInfo(walletId: string): Promise<any> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('wallet:get-info', request);
    return response.data;
  }

  /**
   * Get wallet address
   */
  async getAddress(walletId: string): Promise<string> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<string>('wallet:get-address', request);
    return response.data!;
  }

  /**
   * Send a transaction
   */
  async sendTransaction(walletId: string, params: TransactionParams): Promise<any> {
    const request: TransactionRequest = {
      walletId,
      recipient: params.recipient,
      amount: params.amount,
      message: params.message,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('wallet:send-transaction', request);
    return response.data;
  }

  /**
   * Get transactions
   */
  async getTransactions(walletId: string, query: TransactionQuery = {}): Promise<any[]> {
    const request = {
      walletId,
      ...query,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any[]>('wallet:get-transactions', request);
    return response.data!;
  }

  /**
   * Get a specific transaction
   */
  async getTransaction(walletId: string, transactionId: string): Promise<any> {
    const request = {
      walletId,
      transactionId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('wallet:get-transaction', request);
    return response.data;
  }

  /**
   * Sync wallet with network
   */
  async sync(walletId: string): Promise<void> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    await this.invoke('wallet:sync', request);
  }

  /**
   * Get sync status
   */
  async getSyncStatus(walletId: string): Promise<any> {
    const request: WalletOperationRequest = {
      walletId,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('wallet:get-sync-status', request);
    return response.data;
  }

  /**
   * Validate an address
   */
  async validateAddress(address: string): Promise<boolean> {
    const request = {
      address,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<boolean>('wallet:validate-address', request);
    return response.data!;
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(walletId: string, amount: number, priority?: string): Promise<number> {
    const request = {
      walletId,
      amount,
      priority,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<number>('wallet:estimate-fee', request);
    return response.data!;
  }

  /**
   * Get platform information
   */
  async getPlatformInfo(): Promise<any> {
    const request = {
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('platform:get-info', request);
    return response.data;
  }

  /**
   * Get platform capabilities
   */
  async getCapabilities(): Promise<any> {
    const request = {
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
    };

    const response = await this.invoke<any>('platform:get-capabilities', request);
    return response.data;
  }

  /**
   * Add event listener
   */
  on<K extends keyof RendererWalletEvents>(
    event: K,
    listener: (data: RendererWalletEvents[K]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof RendererWalletEvents>(
    event: K,
    listener: (data: RendererWalletEvents[K]) => void
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * Invoke IPC method with error handling
   */
  private async invoke<T>(channel: string, request: any): Promise<IpcResponse<T>> {
    try {
      const response: IpcResponse<T> = await ipcRenderer.invoke(channel, request);
      
      if (!response.success) {
        throw new Error(response.error || 'IPC operation failed');
      }

      return response;
    } catch (error) {
      console.error(`IPC invoke failed for ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${++this.requestCounter}`;
  }

  /**
   * Set up event forwarding from main process
   */
  private setupEventForwarding(): void {
    // Listen for wallet events from main process
    ipcRenderer.on('wallet-event', (event: IpcRendererEvent, eventType: string, data: any) => {
      this.emit(eventType as keyof RendererWalletEvents, data);
    });

    // Listen for transaction events
    ipcRenderer.on('transaction-received', (event: IpcRendererEvent, data: any) => {
      this.emit('transaction-received', data);
    });

    // Listen for balance updates
    ipcRenderer.on('balance-updated', (event: IpcRendererEvent, data: any) => {
      this.emit('balance-updated', data);
    });

    // Listen for sync progress
    ipcRenderer.on('sync-progress', (event: IpcRendererEvent, data: any) => {
      this.emit('sync-progress', data);
    });

    // Listen for errors
    ipcRenderer.on('wallet-error', (event: IpcRendererEvent, data: any) => {
      this.emit('wallet-error', data);
    });
  }

  /**
   * Emit an event
   */
  private emit<K extends keyof RendererWalletEvents>(
    event: K,
    data: RendererWalletEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.removeAllListeners();
    
    // Remove IPC listeners
    ipcRenderer.removeAllListeners('wallet-event');
    ipcRenderer.removeAllListeners('transaction-received');
    ipcRenderer.removeAllListeners('balance-updated');
    ipcRenderer.removeAllListeners('sync-progress');
    ipcRenderer.removeAllListeners('wallet-error');
  }
}

/**
 * Global wallet bridge instance
 */
let globalWalletBridge: ElectronWalletBridge | undefined;

/**
 * Get global wallet bridge
 */
export function getElectronWalletBridge(): ElectronWalletBridge {
  if (!globalWalletBridge) {
    globalWalletBridge = new ElectronWalletBridge();
  }
  return globalWalletBridge;
}

/**
 * Set custom wallet bridge
 */
export function setElectronWalletBridge(bridge: ElectronWalletBridge): void {
  if (globalWalletBridge) {
    globalWalletBridge.dispose();
  }
  globalWalletBridge = bridge;
}
