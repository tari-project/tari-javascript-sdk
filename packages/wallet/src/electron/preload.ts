/**
 * @fileoverview Electron preload script for secure context bridge
 * 
 * Exposes secure wallet API to renderer process through context bridge
 * with proper type safety and security validation.
 */

import { ElectronSafe } from './types/electron-fallbacks.js';
import type { WalletConfig } from '../types/index.js';

/**
 * Secure wallet API exposed to renderer
 */
interface TariWalletAPI {
  // Wallet lifecycle
  createWallet(walletId: string, config: WalletConfig): Promise<string>;
  openWallet(walletId: string): Promise<void>;
  closeWallet(walletId: string): Promise<void>;
  lockWallet(walletId: string): Promise<void>;
  unlockWallet(walletId: string, passphrase?: string): Promise<void>;
  getWalletStatus(walletId: string): Promise<any>;
  listWallets(): Promise<string[]>;

  // Wallet information
  getBalance(walletId: string): Promise<any>;
  getWalletInfo(walletId: string): Promise<any>;
  getAddress(walletId: string): Promise<string>;

  // Transactions
  sendTransaction(walletId: string, params: {
    recipient: string;
    amount: number;
    message?: string;
  }): Promise<any>;
  getTransactions(walletId: string, query?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<any[]>;
  getTransaction(walletId: string, transactionId: string): Promise<any>;

  // Sync
  sync(walletId: string): Promise<void>;
  getSyncStatus(walletId: string): Promise<any>;

  // Utilities
  validateAddress(address: string): Promise<boolean>;
  estimateFee(walletId: string, amount: number, priority?: string): Promise<number>;

  // Platform
  getPlatformInfo(): Promise<any>;
  getCapabilities(): Promise<any>;

  // Events
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  removeAllListeners(): void;
}

/**
 * Platform API exposed to renderer
 */
interface TariPlatformAPI {
  getInfo(): Promise<any>;
  getCapabilities(): Promise<any>;
  isElectron(): boolean;
  isMainProcess(): boolean;
  isRenderer(): boolean;
}

/**
 * Security utilities
 */
interface TariSecurityAPI {
  generateRequestId(): string;
  validateInput(input: any, type: string): boolean;
  sanitizeError(error: Error): string;
}

// Event listener tracking
const eventListeners = new Map<string, Set<Function>>();

/**
 * Add event listener with cleanup tracking
 */
function addEventListener(event: string, handler: Function): void {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
    
    // Set up IPC listener for this event type
    const ipcRenderer = ElectronSafe.getIpcRenderer();
    ipcRenderer.on(`wallet-${event}`, (_, data) => {
      const handlers = eventListeners.get(event);
      if (handlers) {
        handlers.forEach(h => {
          try {
            h(data);
          } catch (error) {
            console.error(`Error in ${event} handler:`, error);
          }
        });
      }
    });
  }
  
  eventListeners.get(event)!.add(handler);
}

/**
 * Remove event listener
 */
function removeEventListener(event: string, handler: Function): void {
  const handlers = eventListeners.get(event);
  if (handlers) {
    handlers.delete(handler);
    
    // Clean up IPC listener if no more handlers
    if (handlers.size === 0) {
      eventListeners.delete(event);
      const ipcRenderer = ElectronSafe.getIpcRenderer();
      ipcRenderer.removeAllListeners(`wallet-${event}`);
    }
  }
}

/**
 * Remove all event listeners
 */
function removeAllEventListeners(): void {
  const ipcRenderer = ElectronSafe.getIpcRenderer();
  for (const event of eventListeners.keys()) {
    ipcRenderer.removeAllListeners(`wallet-${event}`);
  }
  eventListeners.clear();
}

/**
 * Generate unique request ID
 */
let requestCounter = 0;
function generateRequestId(): string {
  return `preload-${Date.now()}-${++requestCounter}`;
}

/**
 * Validate input parameters
 */
function validateInput(input: any, type: string): boolean {
  switch (type) {
    case 'walletId':
      return typeof input === 'string' && input.length > 0 && input.length <= 64;
    case 'address':
      return typeof input === 'string' && /^[a-zA-Z0-9]+$/.test(input);
    case 'amount':
      return typeof input === 'number' && input > 0 && input <= 1000000;
    case 'config':
      return typeof input === 'object' && input !== null;
    default:
      return true;
  }
}

/**
 * Sanitize error messages
 */
function sanitizeError(error: Error): string {
  const message = error.message || 'Unknown error';
  // Remove potentially sensitive information
  return message.replace(/\/[^\/\s]+/g, '[path]').substring(0, 200);
}

/**
 * Secure IPC invoke wrapper
 */
async function secureInvoke(channel: string, ...args: any[]): Promise<any> {
  try {
    const ipcRenderer = ElectronSafe.getIpcRenderer();
    const result = await ipcRenderer.invoke(channel, ...args);
    
    if (result && !result.success) {
      throw new Error(result.error || 'Operation failed');
    }
    
    return result?.data !== undefined ? result.data : result;
  } catch (error) {
    throw new Error(sanitizeError(error));
  }
}

// Expose APIs through context bridge
if (ElectronSafe.hasContextBridge() && typeof process !== 'undefined' && (process as any).contextIsolated) {
  try {
    const contextBridge = ElectronSafe.getContextBridge();
    // Main wallet API
    contextBridge.exposeInMainWorld('tariWallet', {
      // Wallet lifecycle
      createWallet: (walletId: string, config: WalletConfig) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        if (!validateInput(config, 'config')) throw new Error('Invalid config');
        
        return secureInvoke('wallet:create', {
          walletId,
          config,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      openWallet: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:open', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      closeWallet: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:close', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      lockWallet: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:lock', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      unlockWallet: (walletId: string, passphrase?: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:unlock', {
          walletId,
          passphrase,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      getWalletStatus: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:status', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      listWallets: () => {
        return secureInvoke('wallet:list', {
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      // Wallet information
      getBalance: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:get-balance', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      getWalletInfo: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:get-info', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      getAddress: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:get-address', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      // Transactions
      sendTransaction: (walletId: string, params: any) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        if (!validateInput(params.recipient, 'address')) throw new Error('Invalid recipient');
        if (!validateInput(params.amount, 'amount')) throw new Error('Invalid amount');
        
        return secureInvoke('wallet:send-transaction', {
          walletId,
          recipient: params.recipient,
          amount: params.amount,
          message: params.message,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      getTransactions: (walletId: string, query: any = {}) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:get-transactions', {
          walletId,
          ...query,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      getTransaction: (walletId: string, transactionId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        if (!transactionId) throw new Error('Invalid transaction ID');
        
        return secureInvoke('wallet:get-transaction', {
          walletId,
          transactionId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      // Sync
      sync: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:sync', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      getSyncStatus: (walletId: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        
        return secureInvoke('wallet:get-sync-status', {
          walletId,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      // Utilities
      validateAddress: (address: string) => {
        if (!address) throw new Error('Address required');
        
        return secureInvoke('wallet:validate-address', {
          address,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      estimateFee: (walletId: string, amount: number, priority?: string) => {
        if (!validateInput(walletId, 'walletId')) throw new Error('Invalid wallet ID');
        if (!validateInput(amount, 'amount')) throw new Error('Invalid amount');
        
        return secureInvoke('wallet:estimate-fee', {
          walletId,
          amount,
          priority,
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      // Platform
      getPlatformInfo: () => {
        return secureInvoke('platform:get-info', {
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      getCapabilities: () => {
        return secureInvoke('platform:get-capabilities', {
          requestId: generateRequestId(),
          timestamp: Date.now(),
        });
      },

      // Events
      on: addEventListener,
      off: removeEventListener,
      removeAllListeners: removeAllEventListeners,
    } as TariWalletAPI);

    // Platform API
    contextBridge.exposeInMainWorld('tariPlatform', {
      getInfo: () => secureInvoke('platform:get-info', {
        requestId: generateRequestId(),
        timestamp: Date.now(),
      }),
      
      getCapabilities: () => secureInvoke('platform:get-capabilities', {
        requestId: generateRequestId(),
        timestamp: Date.now(),
      }),

      isElectron: () => true,
      isMainProcess: () => false,
      isRenderer: () => true,
    } as TariPlatformAPI);

    // Security utilities
    contextBridge.exposeInMainWorld('tariSecurity', {
      generateRequestId,
      validateInput,
      sanitizeError,
    } as TariSecurityAPI);

    console.log('Tari Wallet preload script loaded successfully');
  } catch (error) {
    console.error('Failed to set up context bridge:', error);
  }
} else {
  console.warn('Context isolation is disabled - this is a security risk');
}

// Clean up on unload
window.addEventListener('beforeunload', () => {
  removeAllEventListeners();
});
