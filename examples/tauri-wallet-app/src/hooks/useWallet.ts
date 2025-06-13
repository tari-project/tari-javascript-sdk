import { useState, useEffect, useCallback } from 'react';
import { walletService } from '../services/TauriWalletService';
import type {
  WalletState,
  NetworkType,
  NETWORKS
} from '../types/wallet';

/**
 * React hook for wallet operations and state management
 */
export function useWallet(network: NetworkType = NETWORKS.TESTNET) {
  const [state, setState] = useState<WalletState>({
    transactions: [],
    isLoading: false,
    isInitialized: false
  });

  const updateState = useCallback((updates: Partial<WalletState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Initialize wallet
   */
  const initialize = useCallback(async () => {
    updateState({ isLoading: true, error: undefined });
    
    try {
      await walletService.initialize(network);
      
      // Get initial data
      const [balance, address, transactions, status, storageInfo] = await Promise.all([
        walletService.getBalance(),
        walletService.getAddress(),
        walletService.getTransactions(),
        walletService.getStatus(),
        walletService.getStorageInfo()
      ]);
      
      updateState({
        balance,
        address,
        transactions,
        status,
        storageInfo,
        isLoading: false,
        isInitialized: true
      });
      
      console.log('Wallet initialized successfully');
      console.log('Storage backend:', storageInfo?.backend);
      
    } catch (error) {
      console.error('Wallet initialization failed:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to initialize wallet',
        isLoading: false,
        isInitialized: false
      });
    }
  }, [network, updateState]);

  /**
   * Send transaction
   */
  const sendTransaction = useCallback(async (
    recipientAddress: string,
    amount: number,
    message?: string
  ) => {
    if (!state.isInitialized) {
      throw new Error('Wallet not initialized');
    }
    
    updateState({ isLoading: true, error: undefined });
    
    try {
      const txId = await walletService.sendTransaction(recipientAddress, amount, message);
      
      // Refresh wallet data after transaction
      const [balance, transactions] = await Promise.all([
        walletService.getBalance(),
        walletService.getTransactions()
      ]);
      
      updateState({
        balance,
        transactions,
        isLoading: false
      });
      
      // Show success notification
      if (window.__TAURI__?.notification) {
        window.__TAURI__.notification.sendNotification({
          title: 'Transaction Sent',
          body: `Transaction ${txId} sent successfully`
        });
      }
      
      return txId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send transaction';
      updateState({
        error: errorMessage,
        isLoading: false
      });
      throw new Error(errorMessage);
    }
  }, [state.isInitialized, updateState]);

  /**
   * Refresh wallet data
   */
  const refreshData = useCallback(async () => {
    if (!state.isInitialized) return;
    
    updateState({ isLoading: true, error: undefined });
    
    try {
      const [balance, transactions, status, storageInfo] = await Promise.all([
        walletService.getBalance(),
        walletService.getTransactions(),
        walletService.getStatus(),
        walletService.getStorageInfo()
      ]);
      
      updateState({
        balance,
        transactions,
        status,
        storageInfo,
        isLoading: false
      });
    } catch (error) {
      updateState({
        error: error instanceof Error ? error.message : 'Failed to refresh data',
        isLoading: false
      });
    }
  }, [state.isInitialized, updateState]);

  /**
   * Validate address
   */
  const validateAddress = useCallback(async (address: string): Promise<boolean> => {
    try {
      return await walletService.validateAddress(address);
    } catch (error) {
      console.error('Address validation failed:', error);
      return false;
    }
  }, []);

  /**
   * Destroy wallet
   */
  const destroy = useCallback(async () => {
    try {
      await walletService.destroy();
      updateState({
        balance: undefined,
        address: undefined,
        transactions: [],
        status: undefined,
        storageInfo: undefined,
        isInitialized: false,
        error: undefined
      });
    } catch (error) {
      console.error('Failed to destroy wallet:', error);
    }
  }, [updateState]);

  /**
   * Get platform information
   */
  const getPlatformInfo = useCallback(async () => {
    try {
      return await walletService.getPlatformInfo();
    } catch (error) {
      console.error('Failed to get platform info:', error);
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      walletService.destroy().catch(console.error);
    };
  }, []);

  // Auto-refresh data periodically when initialized
  useEffect(() => {
    if (!state.isInitialized) return;

    const interval = setInterval(() => {
      refreshData().catch(console.error);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [state.isInitialized, refreshData]);

  return {
    ...state,
    initialize,
    sendTransaction,
    refreshData,
    validateAddress,
    destroy,
    getPlatformInfo
  };
}
