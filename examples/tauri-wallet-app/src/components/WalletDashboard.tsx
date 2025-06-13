import React, { useEffect, useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { BalanceDisplay } from './BalanceDisplay';
import { AddressDisplay } from './AddressDisplay';
import { TransactionForm } from './TransactionForm';
import { TransactionHistory } from './TransactionHistory';
import { StorageMetrics } from './StorageMetrics';
import { LoadingSpinner } from './LoadingSpinner';
import { NETWORKS } from '../types/wallet';

export function WalletDashboard() {
  const {
    balance,
    address,
    transactions,
    status,
    storageInfo,
    isLoading,
    error,
    isInitialized,
    initialize,
    sendTransaction,
    refreshData,
    validateAddress,
    getPlatformInfo
  } = useWallet(NETWORKS.TESTNET);

  const [platformInfo, setPlatformInfo] = useState<any>(null);

  useEffect(() => {
    initialize();
    
    // Get platform info
    getPlatformInfo().then(setPlatformInfo);
  }, [initialize, getPlatformInfo]);

  const handleSendTransaction = async (
    recipient: string,
    amount: number,
    message?: string
  ) => {
    try {
      await sendTransaction(recipient, amount, message);
    } catch (error) {
      // Error is already handled in the hook
      throw error;
    }
  };

  const handleRefresh = () => {
    refreshData();
  };

  if (error && !isInitialized) {
    return (
      <div className="error-container">
        <div className="error-content">
          <h2>⚠️ Initialization Error</h2>
          <p className="error-message">{error}</p>
          <div className="error-actions">
            <button onClick={initialize} className="btn btn-primary">
              Retry Initialization
            </button>
          </div>
          
          {platformInfo && (
            <div className="platform-debug">
              <h3>Platform Information</h3>
              <ul>
                <li>Platform: {platformInfo.platform}</li>
                <li>Architecture: {platformInfo.arch}</li>
                <li>Version: {platformInfo.version}</li>
                <li>Tauri Version: {platformInfo.tauri_version}</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isLoading && !isInitialized) {
    return (
      <div className="loading-container">
        <LoadingSpinner size="large" />
        <h2>Initializing Tauri Wallet...</h2>
        <p>Setting up secure storage and connecting to network...</p>
        {platformInfo && (
          <p className="platform-info">
            Running on {platformInfo.platform} ({platformInfo.arch})
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-dashboard">
      <header className="wallet-header">
        <div className="header-content">
          <div className="header-title">
            <h1>Tari Wallet</h1>
            <div className="tauri-badge">
              🦀 Powered by Tauri
            </div>
          </div>
          
          <div className="header-actions">
            <button 
              onClick={handleRefresh} 
              disabled={isLoading}
              className="btn btn-secondary"
              title="Refresh wallet data"
            >
              {isLoading ? <LoadingSpinner size="small" /> : '🔄'}
              Refresh
            </button>
          </div>
        </div>

        {status && (
          <div className="status-bar">
            <div className={`status-indicator ${status.is_connected ? 'connected' : 'disconnected'}`}>
              {status.is_connected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            {status.network && (
              <div className="network-indicator">
                📡 {status.network.toUpperCase()}
              </div>
            )}
            {status.node_peers > 0 && (
              <div className="peers-indicator">
                👥 {status.node_peers} peers
              </div>
            )}
          </div>
        )}
      </header>

      <main className="wallet-content">
        <div className="wallet-grid">
          {/* Balance Section */}
          <div className="card balance-card">
            <BalanceDisplay 
              balance={balance} 
              isLoading={isLoading} 
            />
          </div>

          {/* Address Section */}
          <div className="card address-card">
            <AddressDisplay 
              address={address} 
              isLoading={isLoading} 
            />
          </div>

          {/* Storage Metrics */}
          {storageInfo && (
            <div className="card storage-card">
              <StorageMetrics storageInfo={storageInfo} />
            </div>
          )}

          {/* Send Transaction Form */}
          <div className="card send-card">
            <TransactionForm
              onSendTransaction={handleSendTransaction}
              onValidateAddress={validateAddress}
              isLoading={isLoading}
              disabled={!isInitialized}
            />
          </div>

          {/* Transaction History */}
          <div className="card transactions-card">
            <TransactionHistory 
              transactions={transactions}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Error Display */}
        {error && isInitialized && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{error}</span>
            <button 
              onClick={() => window.location.reload()} 
              className="btn btn-small"
            >
              Reload
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="wallet-footer">
        <div className="footer-info">
          {platformInfo && (
            <>
              <span>Platform: {platformInfo.platform} ({platformInfo.arch})</span>
              <span>Tauri: v{platformInfo.tauri_version}</span>
              <span>Version: v{platformInfo.version}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
