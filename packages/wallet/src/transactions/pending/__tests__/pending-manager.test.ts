/**
 * @fileoverview Tests for Pending Transaction Manager
 */

import { EventEmitter } from 'node:events';
import { 
  PendingTransactionManager, 
  type PendingManagerConfig,
  type PendingManagerEvents 
} from '../pending-manager.js';
import { TimeoutHandler } from '../timeout-handler.js';
import { PendingTransactionTracker } from '../pending-tracker.js';
import { 
  WalletError, 
  WalletErrorCode,
  type TransactionId,
  type PendingInboundTransaction,
  type PendingOutboundTransaction
} from '@tari-project/tarijs-core';
import { jest } from '@jest/globals';

// Mock the FFI bindings
const mockFFIBindings = {
  wallet_get_pending_inbound_transactions: jest.fn(),
  wallet_get_pending_outbound_transactions: jest.fn(),
  wallet_get_transaction: jest.fn()
};

jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  getFFIBindings: () => mockFFIBindings
}));

describe('PendingTransactionManager', () => {
  let manager: PendingTransactionManager;
  let mockWalletHandle: any;
  let config: PendingManagerConfig;
  let emittedEvents: Array<{ event: string; args: any[] }>;

  const mockPendingInbound: PendingInboundTransaction[] = [
    {
      txId: 'tx_inbound_1' as TransactionId,
      sourcePublicKey: 'source_pub_key_1',
      amount: BigInt(1000000),
      message: 'Incoming payment 1',
      timestamp: Date.now(),
      status: 'Pending'
    },
    {
      txId: 'tx_inbound_2' as TransactionId,
      sourcePublicKey: 'source_pub_key_2',
      amount: BigInt(2000000),
      message: 'Incoming payment 2',
      timestamp: Date.now(),
      status: 'Pending'
    }
  ];

  const mockPendingOutbound: PendingOutboundTransaction[] = [
    {
      txId: 'tx_outbound_1' as TransactionId,
      destinationPublicKey: 'dest_pub_key_1',
      amount: BigInt(500000),
      fee: BigInt(1000),
      message: 'Outgoing payment 1',
      timestamp: Date.now(),
      status: 'Pending'
    },
    {
      txId: 'tx_outbound_2' as TransactionId,
      destinationPublicKey: 'dest_pub_key_2',
      amount: BigInt(750000),
      fee: BigInt(1500),
      message: 'Outgoing payment 2',
      timestamp: Date.now(),
      status: 'Pending'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    emittedEvents = [];
    
    mockWalletHandle = {
      handle: 'mock_wallet_handle'
    };

    config = {
      refreshIntervalMs: 5000,
      transactionTimeoutSeconds: 300,
      enableTimeoutDetection: true,
      enableAutoCancellation: false,
      timeoutWarningThreshold: 0.8,
      maxConcurrentRefreshes: 3,
      retryOnError: true,
      maxRetryAttempts: 3
    };

    manager = new PendingTransactionManager(mockWalletHandle, config);

    // Capture emitted events
    const originalEmit = manager.emit.bind(manager);
    manager.emit = jest.fn((event: string, ...args: any[]) => {
      emittedEvents.push({ event, args });
      return originalEmit(event, ...args);
    });

    // Setup FFI mocks
    mockFFIBindings.wallet_get_pending_inbound_transactions.mockResolvedValue(
      JSON.stringify(mockPendingInbound)
    );
    mockFFIBindings.wallet_get_pending_outbound_transactions.mockResolvedValue(
      JSON.stringify(mockPendingOutbound)
    );
  });

  afterEach(async () => {
    await manager.dispose();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultManager = new PendingTransactionManager(mockWalletHandle, {});
      expect(defaultManager.config.refreshIntervalMs).toBe(10000);
      expect(defaultManager.config.transactionTimeoutSeconds).toBe(600);
    });

    it('should merge provided config with defaults', () => {
      expect(manager.config.refreshIntervalMs).toBe(5000);
      expect(manager.config.transactionTimeoutSeconds).toBe(300);
      expect(manager.config.enableTimeoutDetection).toBe(true);
    });
  });

  describe('start/stop', () => {
    it('should start successfully', async () => {
      await manager.start();
      expect(manager.isRunning).toBe(true);
      
      // Should have performed initial refresh
      expect(mockFFIBindings.wallet_get_pending_inbound_transactions).toHaveBeenCalledWith(
        mockWalletHandle.handle
      );
      expect(mockFFIBindings.wallet_get_pending_outbound_transactions).toHaveBeenCalledWith(
        mockWalletHandle.handle
      );
    });

    it('should not start if already running', async () => {
      await manager.start();
      await expect(manager.start()).rejects.toThrow('already running');
    });

    it('should stop successfully', async () => {
      await manager.start();
      await manager.stop();
      expect(manager.isRunning).toBe(false);
    });

    it('should not stop if not running', async () => {
      await expect(manager.stop()).rejects.toThrow('not running');
    });
  });

  describe('getPendingTransactions', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should return current pending transactions', async () => {
      const result = await manager.getPendingTransactions();

      expect(result.inbound).toHaveLength(2);
      expect(result.outbound).toHaveLength(2);
      expect(result.inbound[0].id).toBe('tx_inbound_1');
      expect(result.outbound[0].id).toBe('tx_outbound_1');
    });

    it('should refresh data when forceRefresh is true', async () => {
      jest.clearAllMocks();
      
      await manager.getPendingTransactions(true);
      
      expect(mockFFIBindings.wallet_get_pending_inbound_transactions).toHaveBeenCalledTimes(1);
      expect(mockFFIBindings.wallet_get_pending_outbound_transactions).toHaveBeenCalledTimes(1);
    });

    it('should use cached data when forceRefresh is false', async () => {
      jest.clearAllMocks();
      
      // First call should fetch from FFI
      await manager.getPendingTransactions(true);
      jest.clearAllMocks();
      
      // Second call should use cache
      await manager.getPendingTransactions(false);
      
      expect(mockFFIBindings.wallet_get_pending_inbound_transactions).not.toHaveBeenCalled();
      expect(mockFFIBindings.wallet_get_pending_outbound_transactions).not.toHaveBeenCalled();
    });
  });

  describe('getPendingTransaction', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should return specific pending transaction', async () => {
      const transaction = await manager.getPendingTransaction('tx_inbound_1' as TransactionId);
      
      expect(transaction).toBeDefined();
      expect(transaction?.id).toBe('tx_inbound_1');
      expect(transaction?.amount).toBe(BigInt(1000000));
    });

    it('should return null for non-existent transaction', async () => {
      const transaction = await manager.getPendingTransaction('non_existent' as TransactionId);
      expect(transaction).toBeNull();
    });
  });

  describe('manual refresh', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should refresh pending transactions manually', async () => {
      jest.clearAllMocks();
      
      const result = await manager.refreshPendingTransactions();
      
      expect(result.inbound).toHaveLength(2);
      expect(result.outbound).toHaveLength(2);
      expect(mockFFIBindings.wallet_get_pending_inbound_transactions).toHaveBeenCalledTimes(1);
      expect(mockFFIBindings.wallet_get_pending_outbound_transactions).toHaveBeenCalledTimes(1);
    });

    it('should emit refresh events', async () => {
      jest.clearAllMocks();
      emittedEvents = [];
      
      await manager.refreshPendingTransactions();
      
      const refreshStartEvent = emittedEvents.find(e => e.event === 'refresh:start');
      const refreshCompleteEvent = emittedEvents.find(e => e.event === 'refresh:complete');
      
      expect(refreshStartEvent).toBeDefined();
      expect(refreshCompleteEvent).toBeDefined();
    });
  });

  describe('transaction tracking', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should track individual transactions', async () => {
      const tracker = manager.trackTransaction('tx_inbound_1' as TransactionId);
      
      expect(tracker).toBeInstanceOf(PendingTransactionTracker);
      expect(tracker.transactionId).toBe('tx_inbound_1');
    });

    it('should stop tracking transaction', () => {
      manager.trackTransaction('tx_inbound_1' as TransactionId);
      const stopped = manager.stopTracking('tx_inbound_1' as TransactionId);
      
      expect(stopped).toBe(true);
    });

    it('should return false when stopping non-tracked transaction', () => {
      const stopped = manager.stopTracking('non_existent' as TransactionId);
      expect(stopped).toBe(false);
    });
  });

  describe('timeout detection', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should start timeout monitoring when enabled', async () => {
      const timeoutHandler = (manager as any).timeoutHandler as TimeoutHandler;
      expect(timeoutHandler).toBeInstanceOf(TimeoutHandler);
    });

    it('should not create timeout handler when disabled', async () => {
      await manager.dispose();
      
      const configWithoutTimeout = { ...config, enableTimeoutDetection: false };
      const managerWithoutTimeout = new PendingTransactionManager(mockWalletHandle, configWithoutTimeout);
      await managerWithoutTimeout.start();
      
      const timeoutHandler = (managerWithoutTimeout as any).timeoutHandler;
      expect(timeoutHandler).toBeUndefined();
      
      await managerWithoutTimeout.dispose();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should handle FFI errors gracefully', async () => {
      mockFFIBindings.wallet_get_pending_inbound_transactions.mockRejectedValue(
        new Error('FFI error')
      );
      
      emittedEvents = [];
      await manager.refreshPendingTransactions();
      
      const errorEvent = emittedEvents.find(e => e.event === 'refresh:error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.args[0]).toBeInstanceOf(Error);
    });

    it('should retry on error when enabled', async () => {
      mockFFIBindings.wallet_get_pending_inbound_transactions
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(JSON.stringify(mockPendingInbound));
      
      const result = await manager.refreshPendingTransactions();
      
      expect(result.inbound).toHaveLength(2);
      expect(mockFFIBindings.wallet_get_pending_inbound_transactions).toHaveBeenCalledTimes(2);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await manager.start();
    });

    it('should return statistics', () => {
      const stats = manager.getStatistics();
      
      expect(stats).toHaveProperty('totalRefreshes');
      expect(stats).toHaveProperty('lastRefreshTime');
      expect(stats).toHaveProperty('trackedTransactions');
      expect(stats).toHaveProperty('timeoutStatistics');
    });

    it('should track refresh count', async () => {
      const initialStats = manager.getStatistics();
      
      await manager.refreshPendingTransactions();
      await manager.refreshPendingTransactions();
      
      const finalStats = manager.getStatistics();
      expect(finalStats.totalRefreshes).toBe(initialStats.totalRefreshes + 2);
    });
  });

  describe('disposal', () => {
    it('should dispose cleanly', async () => {
      await manager.start();
      await manager.dispose();
      
      expect(manager.isRunning).toBe(false);
      expect(() => manager.getStatistics()).toThrow(WalletError);
    });

    it('should handle multiple dispose calls', async () => {
      await manager.start();
      await manager.dispose();
      await manager.dispose(); // Should not throw
    });
  });

  describe('configuration validation', () => {
    it('should validate refresh interval', () => {
      expect(() => {
        new PendingTransactionManager(mockWalletHandle, { refreshIntervalMs: -1 });
      }).toThrow(WalletError);
    });

    it('should validate timeout seconds', () => {
      expect(() => {
        new PendingTransactionManager(mockWalletHandle, { transactionTimeoutSeconds: 0 });
      }).toThrow(WalletError);
    });

    it('should validate max concurrent refreshes', () => {
      expect(() => {
        new PendingTransactionManager(mockWalletHandle, { maxConcurrentRefreshes: 0 });
      }).toThrow(WalletError);
    });
  });
});
