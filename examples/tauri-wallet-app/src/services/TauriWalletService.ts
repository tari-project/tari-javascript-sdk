import { invoke } from '@tauri-apps/api/tauri';
import type {
  WalletConfig,
  Balance,
  TransactionInfo,
  WalletStatus,
  SendTransactionRequest,
  StorageInfo,
  PlatformInfo,
  ApiResponse,
  NetworkType,
  NETWORKS
} from '../types/wallet';

/**
 * Tauri-specific wallet service implementing real FFI integration
 */
export class TauriWalletService {
  private isInitialized = false;
  private currentConfig?: WalletConfig;

  /**
   * Initialize wallet with Tauri-optimized configuration
   */
  async initialize(network: NetworkType = NETWORKS.TESTNET): Promise<void> {
    const config: WalletConfig = {
      network,
      storage_path: './wallet-data',
      log_level: 'info'
    };

    const response = await invoke<ApiResponse<void>>('wallet_initialize', { config });
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to initialize wallet');
    }

    this.currentConfig = config;
    this.isInitialized = true;
  }

  /**
   * Get current wallet balance
   */
  async getBalance(): Promise<Balance> {
    this.ensureInitialized();
    
    const response = await invoke<ApiResponse<Balance>>('wallet_get_balance');
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to get balance');
    }

    return response.data!;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    this.ensureInitialized();
    
    const response = await invoke<ApiResponse<string>>('wallet_get_address');
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to get address');
    }

    return response.data!;
  }

  /**
   * Send transaction
   */
  async sendTransaction(
    recipient: string,
    amount: number,
    message?: string
  ): Promise<string> {
    this.ensureInitialized();

    const request: SendTransactionRequest = {
      recipient,
      amount,
      message
    };

    const response = await invoke<ApiResponse<string>>('wallet_send_transaction', { request });
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to send transaction');
    }

    return response.data!;
  }

  /**
   * Get transaction history
   */
  async getTransactions(): Promise<TransactionInfo[]> {
    this.ensureInitialized();
    
    const response = await invoke<ApiResponse<TransactionInfo[]>>('wallet_get_transactions');
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to get transactions');
    }

    return response.data || [];
  }

  /**
   * Get wallet status
   */
  async getStatus(): Promise<WalletStatus> {
    const response = await invoke<ApiResponse<WalletStatus>>('wallet_get_status');
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to get wallet status');
    }

    return response.data!;
  }

  /**
   * Validate address format
   */
  async validateAddress(address: string): Promise<boolean> {
    const response = await invoke<ApiResponse<boolean>>('validate_address', { address });
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to validate address');
    }

    return response.data!;
  }

  /**
   * Get storage information and metrics
   */
  async getStorageInfo(): Promise<StorageInfo> {
    const response = await invoke<ApiResponse<StorageInfo>>('secure_storage_get_info');
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to get storage info');
    }

    return response.data!;
  }

  /**
   * Test storage functionality
   */
  async testStorage(): Promise<void> {
    const response = await invoke<ApiResponse<void>>('secure_storage_test');
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Storage test failed');
    }
  }

  /**
   * Get platform information
   */
  async getPlatformInfo(): Promise<PlatformInfo> {
    const response = await invoke<ApiResponse<PlatformInfo>>('get_platform_info');
    
    if (!response.success) {
      throw new Error(response.error?.error || 'Failed to get platform info');
    }

    return response.data!;
  }

  /**
   * Destroy wallet and cleanup resources
   */
  async destroy(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    const response = await invoke<ApiResponse<void>>('wallet_destroy');
    
    if (!response.success) {
      console.warn('Failed to destroy wallet:', response.error?.error);
    }

    this.isInitialized = false;
    this.currentConfig = undefined;
  }

  /**
   * Check if wallet is initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(): WalletConfig | undefined {
    return this.currentConfig;
  }

  /**
   * Send notification using Tauri API
   */
  private notifyUser(title: string, body: string): void {
    if (window.__TAURI__?.notification) {
      window.__TAURI__.notification.sendNotification({
        title,
        body
      }).catch(console.error);
    }
  }

  /**
   * Ensure wallet is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Wallet not initialized. Call initialize() first.');
    }
  }
}

// Singleton instance
export const walletService = new TauriWalletService();
