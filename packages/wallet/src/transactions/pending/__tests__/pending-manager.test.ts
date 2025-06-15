/**
 * @fileoverview Tests for Pending Transaction Manager
 */

import { EventEmitter } from 'node:events';
import { 
  PendingManager, 
  PendingManagerFactory,
  type PendingManagerConfig,
  type PendingManagerEvents 
} from '../pending-manager';
import { 
  WalletError, 
  WalletErrorCode,
  type TransactionId,
  type PendingInboundTransaction,
  type PendingOutboundTransaction,
  type WalletHandle
} from '@tari-project/tarijs-core';
import { jest } from '@jest/globals';
import { createMockTransactionRepository } from '../../__mocks__/transaction-repository';

// Mock the FFI bindings
const mockFFIBindings = {
  walletGetPendingInboundTransactions: jest.fn(),
  walletGetPendingOutboundTransactions: jest.fn(),
  walletGetTransactionStatus: jest.fn()
};

jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  getFFIBindings: () => mockFFIBindings
}));

// Mock the TransactionRepository
jest.mock('../../transaction-repository', () => ({
  TransactionRepository: jest.fn().mockImplementation((config) => 
    createMockTransactionRepository(config)
  )
}));

describe('PendingManager', () => {
  let manager: PendingManager;
  let mockWalletHandle: WalletHandle;
  let config: PendingManagerConfig;
  let emittedEvents: Array<{ event: string; args: any[] }>;

  const mockPendingInbound: PendingInboundTransaction[] = [
    {
      id: 'tx_inbound_1' as TransactionId,
      amount: BigInt(1000000),
      message: 'Incoming payment 1',
      timestamp: Date.now(),
      status: 'Pending' as any,
      direction: 'Inbound' as any,
      senderId: 'sender_1'
    } as any,
    {
      id: 'tx_inbound_2' as TransactionId,
      amount: BigInt(2000000),
      message: 'Incoming payment 2',
      timestamp: Date.now(),
      status: 'Pending' as any,
      direction: 'Inbound' as any,
      senderId: 'sender_2'
    } as any
  ];

  const mockPendingOutbound: PendingOutboundTransaction[] = [
    {
      id: 'tx_outbound_1' as TransactionId,
      amount: BigInt(500000),
      fee: BigInt(1000),
      message: 'Outgoing payment 1',
      timestamp: Date.now(),
      status: 'Pending' as any,
      direction: 'Outbound' as any,
      cancellable: true
    } as any,
    {
      id: 'tx_outbound_2' as TransactionId,
      amount: BigInt(750000),
      fee: BigInt(1500),
      message: 'Outgoing payment 2',
      timestamp: Date.now(),
      status: 'Pending' as any,
      direction: 'Outbound' as any,
      cancellable: true
    } as any
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    emittedEvents = [];
    
    mockWalletHandle = 'mock_wallet_handle' as WalletHandle;

    config = {
      walletHandle: mockWalletHandle,
      refreshIntervalMs: 5000,
      transactionTimeoutSeconds: 300,
      maxConcurrentRefresh: 3,
      autoRefresh: false, // Disable auto-refresh for tests
      autoCancelTimeout: false,
      retryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 2
      }
    };

    manager = PendingManagerFactory.createWithRepository(
      config, 
      createMockTransactionRepository({ 
        walletHandle: mockWalletHandle,
        maxHistorySize: 1000
      })
    );

    // Capture emitted events
    const originalEmit = manager.emit.bind(manager);
    manager.emit = jest.fn((event: string, ...args: any[]) => {
      emittedEvents.push({ event, args });
      return originalEmit(event, ...args);
    });

    // Setup FFI mocks
    mockFFIBindings.walletGetPendingInboundTransactions.mockResolvedValue(
      mockPendingInbound
    );
    mockFFIBindings.walletGetPendingOutboundTransactions.mockResolvedValue(
      mockPendingOutbound
    );
  });

  afterEach(async () => {
    await manager.dispose();
  });

  describe('factory creation', () => {
    it('should create manager with factory method', () => {
      const factoryManager = PendingManagerFactory.create(mockWalletHandle, {
        refreshIntervalMs: 10000,
        transactionTimeoutSeconds: 600
      });
      expect(factoryManager).toBeInstanceOf(PendingManager);
    });

    it('should create manager with custom repository', () => {
      const mockRepo = createMockTransactionRepository({
        walletHandle: mockWalletHandle,
        maxHistorySize: 500
      });
      const customManager = PendingManagerFactory.createWithRepository(config, mockRepo);
      expect(customManager).toBeInstanceOf(PendingManager);
    });
  });

  describe('pending transaction management', () => {
    it('should get pending summary', async () => {
      const summary = await manager.getPendingSummary();
      expect(summary).toBeDefined();
      expect(summary.total).toBeGreaterThanOrEqual(0);
      expect(summary.inbound).toBeGreaterThanOrEqual(0);
      expect(summary.outbound).toBeGreaterThanOrEqual(0);
    });

    it('should get pending transactions', async () => {
      const pending = await manager.getPendingTransactions();
      expect(pending).toBeDefined();
      expect(pending.inbound).toBeInstanceOf(Array);
      expect(pending.outbound).toBeInstanceOf(Array);
    });

    it('should refresh pending transactions', async () => {
      const result = await manager.refreshPendingTransactions();
      expect(result).toBeDefined();
      expect(result.updatedCount).toBeGreaterThanOrEqual(0);
      expect(result.newCount).toBeGreaterThanOrEqual(0);
      expect(result.statusChangedCount).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeInstanceOf(Array);
      expect(typeof result.executionTimeMs).toBe('number');
    });

    it('should get refresh statistics', () => {
      const stats = manager.getRefreshStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.totalRefreshCount).toBe('number');
      expect(typeof stats.lastRefreshTime).toBe('number');
      expect(typeof stats.isCurrentlyRefreshing).toBe('boolean');
      expect(typeof stats.averageRefreshInterval).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should handle FFI errors gracefully', async () => {
      mockFFIBindings.walletGetPendingInboundTransactions.mockRejectedValue(
        new Error('FFI connection failed')
      );

      const result = await manager.refreshPendingTransactions();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(WalletError);
    });

    it('should prevent concurrent refreshes', async () => {
      // Start a refresh
      const refreshPromise = manager.refreshPendingTransactions();
      
      // Try to start another
      await expect(manager.refreshPendingTransactions()).rejects.toThrow(
        WalletError
      );
      
      // Wait for first to complete
      await refreshPromise;
    });
  });

  describe('disposal', () => {
    it('should dispose cleanly', async () => {
      await manager.dispose();
      
      // Should throw error when trying to use disposed manager
      await expect(manager.getPendingSummary()).rejects.toThrow(WalletError);
    });

    it('should be safe to dispose multiple times', async () => {
      await manager.dispose();
      await expect(manager.dispose()).resolves.toBeUndefined();
    });
  });
});
