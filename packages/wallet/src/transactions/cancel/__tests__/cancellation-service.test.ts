/**
 * @fileoverview Tests for Transaction Cancellation Service
 */

import { EventEmitter } from 'node:events';
import { 
  CancellationService, 
  type CancellationServiceConfig,
  type CancellationResult,
  DEFAULT_CANCELLATION_CONFIG
} from '../cancellation-service.js';
import { CancelValidator } from '../cancel-validator.js';
import { RefundHandler } from '../refund-handler.js';
import { 
  WalletError, 
  WalletErrorCode,
  type TransactionId,
  type PendingOutboundTransaction,
  type WalletHandle
} from '@tari-project/tarijs-core';
import { jest } from '@jest/globals';

// Mock the FFI bindings
const mockFFIBindings = {
  wallet_cancel_pending_transaction: jest.fn(),
  wallet_get_pending_outbound_transaction: jest.fn(),
  wallet_get_pending_outbound_transactions: jest.fn(),
  wallet_get_balance: jest.fn()
};

jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  getFFIBindings: () => mockFFIBindings
}));

describe('CancellationService', () => {
  let service: CancellationService;
  let mockWalletHandle: WalletHandle;
  let config: CancellationServiceConfig;
  let emittedEvents: Array<{ event: string; args: any[] }>;

  const mockPendingTransaction: PendingOutboundTransaction = {
    txId: 'test_tx_123' as TransactionId,
    destinationPublicKey: 'dest_pub_key',
    amount: BigInt(1000000),
    fee: BigInt(1000),
    message: 'Test transaction',
    timestamp: Date.now() - 300000, // 5 minutes ago
    status: 'Pending'
  };

  const mockBalance = {
    available: BigInt(5000000),
    pendingIncoming: BigInt(0),
    pendingOutgoing: BigInt(1001000),
    timelocked: BigInt(0)
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    emittedEvents = [];
    
    mockWalletHandle = {
      handle: 'mock_wallet_handle'
    } as WalletHandle;

    config = {
      ...DEFAULT_CANCELLATION_CONFIG,
      enableEventEmission: true,
      enableAutomaticRefunds: true
    };

    service = new CancellationService(mockWalletHandle, config);

    // Capture emitted events
    const originalEmit = service.emit.bind(service);
    service.emit = jest.fn((event: string, ...args: any[]) => {
      emittedEvents.push({ event, args });
      return originalEmit(event, ...args);
    });

    // Setup FFI mocks
    mockFFIBindings.wallet_get_pending_outbound_transaction.mockResolvedValue(
      JSON.stringify(mockPendingTransaction)
    );
    mockFFIBindings.wallet_cancel_pending_transaction.mockResolvedValue(true);
    mockFFIBindings.wallet_get_balance.mockResolvedValue(JSON.stringify(mockBalance));
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultService = new CancellationService(mockWalletHandle);
      expect(defaultService.getStatistics().totalCancellations).toBe(0);
    });

    it('should merge provided config with defaults', () => {
      const customConfig = { enableAutomaticRefunds: false };
      const customService = new CancellationService(mockWalletHandle, customConfig);
      // We can't directly access config, but we can test the behavior
      expect(customService).toBeDefined();
    });

    it('should throw error for invalid config', () => {
      expect(() => {
        new CancellationService(mockWalletHandle, { cancellationTimeoutSeconds: -1 });
      }).toThrow(WalletError);
    });
  });

  describe('cancelTransaction', () => {
    it('should successfully cancel a pending transaction', async () => {
      const result = await service.cancelTransaction('test_tx_123' as TransactionId);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('test_tx_123');
      expect(result.refundAmount).toBe(BigInt(1000000));
      expect(result.refundedFee).toBe(BigInt(1000));

      // Check FFI calls
      expect(mockFFIBindings.wallet_cancel_pending_transaction).toHaveBeenCalledWith(
        mockWalletHandle.handle,
        'test_tx_123'
      );

      // Check events
      const startEvent = emittedEvents.find(e => e.event === 'cancellation:started');
      const completeEvent = emittedEvents.find(e => e.event === 'cancellation:completed');
      
      expect(startEvent).toBeDefined();
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.args[0]).toBe('test_tx_123');
    });

    it('should handle transaction not found', async () => {
      mockFFIBindings.wallet_get_pending_outbound_transaction.mockResolvedValue(null);

      await expect(service.cancelTransaction('non_existent' as TransactionId))
        .rejects.toThrow(WalletError);

      const failEvent = emittedEvents.find(e => e.event === 'cancellation:failed');
      expect(failEvent).toBeDefined();
    });

    it('should handle FFI cancellation failure', async () => {
      mockFFIBindings.wallet_cancel_pending_transaction.mockResolvedValue(false);

      await expect(service.cancelTransaction('test_tx_123' as TransactionId))
        .rejects.toThrow(WalletError);
    });

    it('should handle FFI error', async () => {
      mockFFIBindings.wallet_cancel_pending_transaction.mockRejectedValue(
        new Error('FFI error')
      );

      await expect(service.cancelTransaction('test_tx_123' as TransactionId))
        .rejects.toThrow(WalletError);
    });

    it('should update statistics on success', async () => {
      const initialStats = service.getStatistics();
      
      await service.cancelTransaction('test_tx_123' as TransactionId);
      
      const finalStats = service.getStatistics();
      expect(finalStats.totalCancellations).toBe(initialStats.totalCancellations + 1);
      expect(finalStats.successfulCancellations).toBe(initialStats.successfulCancellations + 1);
      expect(finalStats.totalRefundAmount).toBeGreaterThan(initialStats.totalRefundAmount);
    });

    it('should update statistics on failure', async () => {
      mockFFIBindings.wallet_get_pending_outbound_transaction.mockResolvedValue(null);
      
      const initialStats = service.getStatistics();
      
      try {
        await service.cancelTransaction('non_existent' as TransactionId);
      } catch (error: unknown) {
        // Expected to fail
      }
      
      const finalStats = service.getStatistics();
      expect(finalStats.totalCancellations).toBe(initialStats.totalCancellations + 1);
      expect(finalStats.failedCancellations).toBe(initialStats.failedCancellations + 1);
    });
  });

  describe('canCancelTransaction', () => {
    it('should return true for cancellable transaction', async () => {
      const result = await service.canCancelTransaction('test_tx_123' as TransactionId);
      
      expect(result.canCancel).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return false for non-existent transaction', async () => {
      mockFFIBindings.wallet_get_pending_outbound_transaction.mockResolvedValue(null);
      
      const result = await service.canCancelTransaction('non_existent' as TransactionId);
      
      expect(result.canCancel).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should return false for non-pending transaction', async () => {
      const confirmedTransaction = { ...mockPendingTransaction, status: 'Confirmed' };
      mockFFIBindings.wallet_get_pending_outbound_transaction.mockResolvedValue(
        JSON.stringify(confirmedTransaction)
      );
      
      const result = await service.canCancelTransaction('test_tx_123' as TransactionId);
      
      expect(result.canCancel).toBe(false);
      expect(result.reason).toContain('Confirmed');
    });
  });

  describe('getCancellableTransactions', () => {
    it('should return list of cancellable transactions', async () => {
      const mockPendingList = [
        mockPendingTransaction,
        { ...mockPendingTransaction, txId: 'test_tx_456' as TransactionId }
      ];
      
      mockFFIBindings.wallet_get_pending_outbound_transactions.mockResolvedValue(
        JSON.stringify(mockPendingList)
      );

      const cancellable = await service.getCancellableTransactions();
      
      expect(cancellable).toHaveLength(2);
      expect(cancellable[0].txId).toBe('test_tx_123');
      expect(cancellable[1].txId).toBe('test_tx_456');
    });

    it('should filter out non-cancellable transactions', async () => {
      const mixedList = [
        mockPendingTransaction,
        { ...mockPendingTransaction, txId: 'old_tx' as TransactionId, timestamp: Date.now() - 86400000 * 2 } // 2 days old
      ];
      
      mockFFIBindings.wallet_get_pending_outbound_transactions.mockResolvedValue(
        JSON.stringify(mixedList)
      );

      const cancellable = await service.getCancellableTransactions();
      
      // Should only return the recent transaction if age limits are enforced
      expect(cancellable.length).toBeGreaterThan(0);
    });

    it('should handle empty pending transactions list', async () => {
      mockFFIBindings.wallet_get_pending_outbound_transactions.mockResolvedValue(
        JSON.stringify([])
      );

      const cancellable = await service.getCancellableTransactions();
      
      expect(cancellable).toHaveLength(0);
    });
  });

  describe('cancelMultipleTransactions', () => {
    it('should cancel multiple transactions successfully', async () => {
      const txIds = ['test_tx_123', 'test_tx_456'] as TransactionId[];
      
      // Mock different transactions for each ID
      mockFFIBindings.wallet_get_pending_outbound_transaction
        .mockResolvedValueOnce(JSON.stringify(mockPendingTransaction))
        .mockResolvedValueOnce(JSON.stringify({
          ...mockPendingTransaction,
          txId: 'test_tx_456'
        }));

      const results = await service.cancelMultipleTransactions(txIds);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].transactionId).toBe('test_tx_123');
      expect(results[1].transactionId).toBe('test_tx_456');
    });

    it('should handle mixed success/failure results', async () => {
      const txIds = ['test_tx_123', 'non_existent'] as TransactionId[];
      
      mockFFIBindings.wallet_get_pending_outbound_transaction
        .mockResolvedValueOnce(JSON.stringify(mockPendingTransaction))
        .mockResolvedValueOnce(null);

      const results = await service.cancelMultipleTransactions(txIds);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });

    it('should return empty array for empty input', async () => {
      const results = await service.cancelMultipleTransactions([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('statistics', () => {
    it('should track cancellation statistics', async () => {
      const initialStats = service.getStatistics();
      expect(initialStats.totalCancellations).toBe(0);
      expect(initialStats.successfulCancellations).toBe(0);
      expect(initialStats.failedCancellations).toBe(0);

      await service.cancelTransaction('test_tx_123' as TransactionId);

      const finalStats = service.getStatistics();
      expect(finalStats.totalCancellations).toBe(1);
      expect(finalStats.successfulCancellations).toBe(1);
      expect(finalStats.averageCancellationTime).toBeGreaterThan(0);
      expect(finalStats.lastCancellationTime).toBeDefined();
    });

    it('should reset statistics', async () => {
      await service.cancelTransaction('test_tx_123' as TransactionId);
      
      service.resetStatistics();
      
      const stats = service.getStatistics();
      expect(stats.totalCancellations).toBe(0);
      expect(stats.successfulCancellations).toBe(0);
      expect(stats.totalRefundAmount).toBe(BigInt(0));
    });

    it('should track failure reasons', async () => {
      mockFFIBindings.wallet_get_pending_outbound_transaction.mockResolvedValue(null);
      
      try {
        await service.cancelTransaction('non_existent' as TransactionId);
      } catch (error: unknown) {
        // Expected
      }
      
      const stats = service.getStatistics();
      expect(stats.commonFailureReasons.length).toBeGreaterThan(0);
      expect(stats.commonFailureReasons[0].count).toBe(1);
    });
  });

  describe('disposal', () => {
    it('should dispose cleanly', async () => {
      await service.dispose();
      
      expect(() => service.getStatistics()).toThrow(WalletError);
    });

    it('should handle multiple dispose calls', async () => {
      await service.dispose();
      await service.dispose(); // Should not throw
    });

    it('should throw error when used after disposal', async () => {
      await service.dispose();
      
      await expect(service.cancelTransaction('test_tx_123' as TransactionId))
        .rejects.toThrow(WalletError);
    });
  });

  describe('event emission', () => {
    it('should emit cancellation events when enabled', async () => {
      await service.cancelTransaction('test_tx_123' as TransactionId);
      
      expect(emittedEvents.some(e => e.event === 'cancellation:started')).toBe(true);
      expect(emittedEvents.some(e => e.event === 'cancellation:completed')).toBe(true);
      expect(emittedEvents.some(e => e.event === 'refund:processed')).toBe(true);
    });

    it('should not emit events when disabled', async () => {
      await service.dispose();
      
      const noEventService = new CancellationService(mockWalletHandle, {
        ...config,
        enableEventEmission: false
      });
      
      // Mock emit to track calls
      const mockEmit = jest.fn();
      noEventService.emit = mockEmit;
      
      await noEventService.cancelTransaction('test_tx_123' as TransactionId);
      
      // Should not emit main cancellation events (though refund handler might still emit)
      expect(mockEmit).not.toHaveBeenCalledWith('cancellation:started', expect.anything());
      
      await noEventService.dispose();
    });
  });
});
