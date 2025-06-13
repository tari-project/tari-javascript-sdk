/**
 * @fileoverview Electron main process wallet service
 * 
 * Provides secure wallet operations in the main process with proper isolation
 * from renderer processes and comprehensive IPC handling.
 */

import { TariWallet } from '../../tari-wallet.js';
import type { WalletConfig } from '../../types/index.js';
import { createSecureStorage } from '../../platform/storage/storage-factory.js';
import { PlatformDetector } from '../../platform/detector.js';
import { getRuntimeManager } from '../../platform/runtime.js';
import type { SecureStorage } from '../../platform/storage/secure-storage.js';
import { StorageResults } from '../../platform/storage/types/storage-result';

/**
 * Electron wallet service configuration
 */
export interface ElectronWalletConfig extends WalletConfig {
  /** Allow multiple wallet instances */
  allowMultipleInstances?: boolean;
  /** Auto-save wallet state interval (ms) */
  autoSaveInterval?: number;
  /** Enable background sync */
  enableBackgroundSync?: boolean;
  /** IPC timeout for operations */
  ipcTimeout?: number;
}

/**
 * Wallet service events
 */
export interface WalletServiceEvents {
  'wallet-created': { id: string; config: WalletConfig };
  'wallet-opened': { id: string };
  'wallet-closed': { id: string };
  'wallet-error': { id: string; error: string };
  'background-sync': { id: string; progress: number };
  'transaction-received': { id: string; transaction: any };
  'balance-updated': { id: string; balance: any };
}

/**
 * Wallet instance tracking
 */
interface WalletInstance {
  id: string;
  wallet: TariWallet;
  config: ElectronWalletConfig;
  created: number;
  lastAccessed: number;
  isLocked: boolean;
}

/**
 * Main process wallet service
 */
export class ElectronWalletService {
  private readonly wallets = new Map<string, WalletInstance>();
  private readonly config: Required<ElectronWalletConfig>;
  private secureStorage?: SecureStorage;
  private autoSaveTimer?: NodeJS.Timeout;
  private backgroundSyncTimer?: NodeJS.Timeout;
  private eventListeners = new Map<keyof WalletServiceEvents, Function[]>();

  constructor(config: Partial<ElectronWalletConfig> = {}) {
    this.config = {
      ...this.getDefaultConfig(),
      ...config,
    };

    this.initializeService();
  }

  /**
   * Create a new wallet instance
   */
  async createWallet(id: string, config: WalletConfig): Promise<string> {
    try {
      // Validate platform support
      const platform = PlatformDetector.detect();
      if (!platform.capabilities.nativeModules) {
        throw new Error('Wallet requires native module support');
      }

      // Check if wallet already exists
      if (this.wallets.has(id)) {
        if (!this.config.allowMultipleInstances) {
          throw new Error(`Wallet ${id} already exists`);
        }
      }

      // Ensure secure storage is available
      if (!this.secureStorage) {
        this.secureStorage = await createSecureStorage({
          testBackends: true,
          allowFallbacks: true,
        });
      }

      // Create wallet instance
      const wallet = await TariWallet.create(config);
      
      const instance: WalletInstance = {
        id,
        wallet,
        config: { ...this.config, ...config },
        created: Date.now(),
        lastAccessed: Date.now(),
        isLocked: false,
      };

      this.wallets.set(id, instance);

      // Set up wallet event forwarding
      this.setupWalletEventForwarding(id, wallet);

      // Save wallet state if configured
      if (this.config.autoSaveInterval > 0) {
        await this.saveWalletState(id);
      }

      this.emit('wallet-created', { id, config });
      
      return id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('wallet-error', { id, error: errorMessage });
      throw error;
    }
  }

  /**
   * Open an existing wallet
   */
  async openWallet(id: string, config?: Partial<WalletConfig>): Promise<void> {
    try {
      if (this.wallets.has(id)) {
        const instance = this.wallets.get(id)!;
        instance.lastAccessed = Date.now();
        instance.isLocked = false;
        this.emit('wallet-opened', { id });
        return;
      }

      // Try to load saved state
      const savedState = await this.loadWalletState(id);
      if (!savedState) {
        throw new Error(`Wallet ${id} not found`);
      }

      const walletConfig = { ...savedState.config, ...config };
      await this.createWallet(id, walletConfig);
      
      this.emit('wallet-opened', { id });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('wallet-error', { id, error: errorMessage });
      throw error;
    }
  }

  /**
   * Close a wallet instance
   */
  async closeWallet(id: string): Promise<void> {
    try {
      const instance = this.wallets.get(id);
      if (!instance) {
        return;
      }

      // Save state before closing
      await this.saveWalletState(id);

      // Dispose wallet resources
      if (typeof (instance.wallet as any)[Symbol.dispose] === 'function') {
        await (instance.wallet as any)[Symbol.dispose]();
      }

      this.wallets.delete(id);
      this.emit('wallet-closed', { id });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('wallet-error', { id, error: errorMessage });
      throw error;
    }
  }

  /**
   * Lock a wallet
   */
  async lockWallet(id: string): Promise<void> {
    const instance = this.wallets.get(id);
    if (instance) {
      instance.isLocked = true;
      await this.saveWalletState(id);
    }
  }

  /**
   * Unlock a wallet
   */
  async unlockWallet(id: string, passphrase?: string): Promise<void> {
    const instance = this.wallets.get(id);
    if (instance) {
      // Verify passphrase if required
      if (instance.config.passphrase && passphrase !== instance.config.passphrase) {
        throw new Error('Invalid passphrase');
      }
      
      instance.isLocked = false;
      instance.lastAccessed = Date.now();
    }
  }

  /**
   * Get wallet instance (for internal operations)
   */
  getWallet(id: string): TariWallet | null {
    const instance = this.wallets.get(id);
    if (!instance || instance.isLocked) {
      return null;
    }
    
    instance.lastAccessed = Date.now();
    return instance.wallet;
  }

  /**
   * Check if wallet is available
   */
  isWalletAvailable(id: string): boolean {
    const instance = this.wallets.get(id);
    return instance ? !instance.isLocked : false;
  }

  /**
   * List all wallet IDs
   */
  getWalletIds(): string[] {
    return Array.from(this.wallets.keys());
  }

  /**
   * Get wallet status
   */
  getWalletStatus(id: string): any {
    const instance = this.wallets.get(id);
    if (!instance) {
      return { exists: false };
    }

    return {
      exists: true,
      id: instance.id,
      created: instance.created,
      lastAccessed: instance.lastAccessed,
      isLocked: instance.isLocked,
      network: instance.config.network,
    };
  }

  /**
   * Add event listener
   */
  on<K extends keyof WalletServiceEvents>(
    event: K,
    listener: (data: WalletServiceEvents[K]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof WalletServiceEvents>(
    event: K,
    listener: (data: WalletServiceEvents[K]) => void
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
   * Clean up resources
   */
  async dispose(): Promise<void> {
    // Stop timers
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    if (this.backgroundSyncTimer) {
      clearInterval(this.backgroundSyncTimer);
    }

    // Close all wallets
    const walletIds = Array.from(this.wallets.keys());
    for (const id of walletIds) {
      await this.closeWallet(id);
    }

    // Clear event listeners
    this.eventListeners.clear();
  }

  /**
   * Initialize the service
   */
  private async initializeService(): Promise<void> {
    // Set up auto-save timer
    if (this.config.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(() => {
        this.saveAllWalletStates().catch(console.error);
      }, this.config.autoSaveInterval);
    }

    // Set up background sync timer
    if (this.config.enableBackgroundSync) {
      this.backgroundSyncTimer = setInterval(() => {
        this.performBackgroundSync().catch(console.error);
      }, 60000); // Every minute
    }

    // Monitor system resources
    const runtimeManager = getRuntimeManager();
    if (runtimeManager.isUnderStress()) {
      console.warn('System under stress - wallet operations may be slower');
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): Required<ElectronWalletConfig> {
    return {
      // Base wallet config
      network: 'testnet' as any,
      storagePath: PlatformDetector.getDefaultStorageDir() + '/wallet',
      
      // Electron-specific config
      allowMultipleInstances: false,
      autoSaveInterval: 30000, // 30 seconds
      enableBackgroundSync: true,
      ipcTimeout: 30000, // 30 seconds
      
      // Additional defaults
      logLevel: 2,
      numRollingLogFiles: 10,
      rollingLogFileSize: 10_485_760,
      connectionTimeoutMs: 30_000,
      transactionTimeoutMs: 60_000,
      syncTimeoutMs: 300_000,
    };
  }

  /**
   * Set up event forwarding for a wallet
   */
  private setupWalletEventForwarding(id: string, wallet: TariWallet): void {
    // Forward wallet events to service events
    wallet.on('transaction-received', (transaction) => {
      this.emit('transaction-received', { id, transaction });
    });

    wallet.on('balance-updated', (balance) => {
      this.emit('balance-updated', { id, balance });
    });

    // Add more event forwarding as needed
  }

  /**
   * Save wallet state to secure storage
   */
  private async saveWalletState(id: string): Promise<void> {
    if (!this.secureStorage) return;

    const instance = this.wallets.get(id);
    if (!instance) return;

    try {
      const state = {
        id: instance.id,
        config: instance.config,
        created: instance.created,
        lastAccessed: instance.lastAccessed,
        isLocked: instance.isLocked,
      };

      const stateData = Buffer.from(JSON.stringify(state), 'utf8');
      await this.secureStorage.store(`wallet-state-${id}`, stateData);
    } catch (error) {
      console.warn(`Failed to save wallet state for ${id}:`, error);
    }
  }

  /**
   * Load wallet state from secure storage
   */
  private async loadWalletState(id: string): Promise<any> {
    if (!this.secureStorage) return null;

    try {
      const result = await this.secureStorage.retrieve(`wallet-state-${id}`);
      return StorageResults.match(result, {
        ok: (data) => JSON.parse(data.toString('utf8')),
        error: () => null
      });
    } catch (error) {
      console.warn(`Failed to load wallet state for ${id}:`, error);
    }

    return null;
  }

  /**
   * Save all wallet states
   */
  private async saveAllWalletStates(): Promise<void> {
    const savePromises = Array.from(this.wallets.keys()).map(id => 
      this.saveWalletState(id)
    );
    
    await Promise.allSettled(savePromises);
  }

  /**
   * Perform background sync for all wallets
   */
  private async performBackgroundSync(): Promise<void> {
    for (const [id, instance] of this.wallets) {
      if (instance.isLocked) continue;

      try {
        // Emit sync progress
        this.emit('background-sync', { id, progress: 0 });
        
        // Perform actual sync (placeholder)
        // await instance.wallet.sync();
        
        this.emit('background-sync', { id, progress: 100 });
      } catch (error) {
        console.warn(`Background sync failed for wallet ${id}:`, error);
      }
    }
  }

  /**
   * Emit an event
   */
  private emit<K extends keyof WalletServiceEvents>(
    event: K,
    data: WalletServiceEvents[K]
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
}

/**
 * Global wallet service instance
 */
let globalWalletService: ElectronWalletService | undefined;

/**
 * Get global wallet service
 */
export function getElectronWalletService(): ElectronWalletService {
  if (!globalWalletService) {
    globalWalletService = new ElectronWalletService();
  }
  return globalWalletService;
}

/**
 * Set custom wallet service
 */
export function setElectronWalletService(service: ElectronWalletService): void {
  if (globalWalletService) {
    globalWalletService.dispose();
  }
  globalWalletService = service;
}
