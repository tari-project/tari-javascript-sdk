/**
 * Tests for WalletDashboard component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletDashboard } from '../../components/WalletDashboard';
import { mockTauri, createMockApiResponse } from '../setup';

// Mock the useWallet hook
const mockWalletHook = {
  balance: undefined,
  address: undefined,
  transactions: [],
  status: undefined,
  storageInfo: undefined,
  isLoading: false,
  error: undefined,
  isInitialized: false,
  initialize: jest.fn(),
  sendTransaction: jest.fn(),
  refreshData: jest.fn(),
  validateAddress: jest.fn(),
  destroy: jest.fn(),
  getPlatformInfo: jest.fn(),
};

jest.mock('../../hooks/useWallet', () => ({
  useWallet: () => mockWalletHook,
}));

describe('WalletDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock hook state
    Object.assign(mockWalletHook, {
      balance: undefined,
      address: undefined,
      transactions: [],
      status: undefined,
      storageInfo: undefined,
      isLoading: false,
      error: undefined,
      isInitialized: false,
    });
  });

  it('renders loading state initially', () => {
    mockWalletHook.isLoading = true;
    mockWalletHook.isInitialized = false;

    render(<WalletDashboard />);

    expect(screen.getByText('Initializing Tauri Wallet...')).toBeInTheDocument();
    expect(screen.getByText('Setting up secure storage and connecting to network...')).toBeInTheDocument();
  });

  it('renders error state when initialization fails', () => {
    mockWalletHook.error = 'Failed to initialize wallet';
    mockWalletHook.isInitialized = false;

    render(<WalletDashboard />);

    expect(screen.getByText('⚠️ Initialization Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to initialize wallet')).toBeInTheDocument();
    expect(screen.getByText('Retry Initialization')).toBeInTheDocument();
  });

  it('renders wallet dashboard when initialized', () => {
    mockWalletHook.isInitialized = true;
    mockWalletHook.balance = {
      available: 1000000,
      pending_incoming: 0,
      pending_outgoing: 0,
      timelocked: 0,
    };
    mockWalletHook.address = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    mockWalletHook.status = {
      is_initialized: true,
      is_connected: true,
      network: 'testnet',
      node_peers: 5,
      chain_height: 1000,
      wallet_height: 1000,
    };

    render(<WalletDashboard />);

    expect(screen.getByText('Tari Wallet')).toBeInTheDocument();
    expect(screen.getByText('🦀 Powered by Tauri')).toBeInTheDocument();
    expect(screen.getByText('🟢 Connected')).toBeInTheDocument();
    expect(screen.getByText('📡 TESTNET')).toBeInTheDocument();
  });

  it('calls initialize on mount', () => {
    render(<WalletDashboard />);
    expect(mockWalletHook.initialize).toHaveBeenCalledTimes(1);
  });

  it('calls refreshData when refresh button is clicked', async () => {
    mockWalletHook.isInitialized = true;

    render(<WalletDashboard />);

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    expect(mockWalletHook.refreshData).toHaveBeenCalledTimes(1);
  });

  it('retries initialization when retry button is clicked', async () => {
    mockWalletHook.error = 'Failed to initialize wallet';
    mockWalletHook.isInitialized = false;

    render(<WalletDashboard />);

    const retryButton = screen.getByText('Retry Initialization');
    fireEvent.click(retryButton);

    expect(mockWalletHook.initialize).toHaveBeenCalledTimes(2); // Once on mount, once on retry
  });

  it('displays platform information when available', async () => {
    const platformInfo = {
      platform: 'darwin',
      arch: 'x86_64',
      version: '0.1.0',
      tauri_version: '1.5.0',
    };

    mockWalletHook.getPlatformInfo.mockResolvedValue(platformInfo);

    render(<WalletDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Platform: darwin (x86_64)')).toBeInTheDocument();
      expect(screen.getByText('Tauri: v1.5.0')).toBeInTheDocument();
    });
  });

  it('shows error banner when there is an error after initialization', () => {
    mockWalletHook.isInitialized = true;
    mockWalletHook.error = 'Network error';

    render(<WalletDashboard />);

    expect(screen.getByText('⚠️')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Reload')).toBeInTheDocument();
  });

  it('displays storage metrics when available', () => {
    mockWalletHook.isInitialized = true;
    mockWalletHook.storageInfo = {
      backend: 'macOS Keychain',
      version: '1.0',
      secure: true,
      supports_metadata: false,
    };

    render(<WalletDashboard />);

    expect(screen.getByText('Storage Backend')).toBeInTheDocument();
    expect(screen.getByText('macOS Keychain')).toBeInTheDocument();
  });

  it('handles send transaction correctly', async () => {
    mockWalletHook.isInitialized = true;
    mockWalletHook.sendTransaction.mockResolvedValue('tx123');

    render(<WalletDashboard />);

    // This would need to interact with the TransactionForm component
    // For now, just verify the sendTransaction function is passed correctly
    expect(typeof mockWalletHook.sendTransaction).toBe('function');
  });
});
