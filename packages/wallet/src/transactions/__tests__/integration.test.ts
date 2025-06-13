/**
 * @fileoverview Integration tests for complete transaction lifecycle
 */

import { EventEmitter } from 'node:events';
import { 
  TransactionAPI,
  type TransactionAPIConfig,
  DEFAULT_TRANSACTION_API_CONFIG
} from '../api/transaction-api';
import { 
  WalletError, 
  WalletErrorCode,
  type TransactionId,
  type WalletHandle,
  type MicroTari
} from '@tari-project/tarijs-core';
import { jest } from '@jest/globals';

// Mock the FFI bindings
const mockFFIBindings = {
  wallet_send_transaction: jest.fn(),
  wallet_send_one_sided_transaction: jest.fn(),
  wallet_get_transaction: jest.fn(),
  wallet_get_pending_inbound_transactions: jest.fn(),
  wallet_get_pending_outbound_transactions: jest.fn(),
  wallet_cancel_pending_transaction: jest.fn(),
  wallet_get_balance: jest.fn(),
  wallet_get_transaction_confirmations: jest.fn(),
  wallet_get_blockchain_height: jest.fn(),
  wallet_set_transaction_memo: jest.fn(),
  wallet_get_transaction_memo: jest.fn()
};

jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  getFFIBindings: () => mockFFIBindings
}));

describe('Transaction Integration Tests', () => {
  let transactionAPI: TransactionAPI;
  let mockWalletHandle: WalletHandle;
  let config: TransactionAPIConfig;
  let emittedEvents: Array<{ event: string; args: any[] }>;

  const mockTransaction = {
    txId: 'tx_integration_001' as TransactionId,
    sourcePublicKey: 'source_pub_key',
    destinationPublicKey: 'dest_pub_key',
    amount: BigInt(1000000),
    fee: BigInt(1000),
    message: 'Integration test transaction',
    timestamp: Date.now(),
    status: 'Pending',
    direction: 'Outbound',
    blockHeight: null
  };

  const mockPendingOutbound = [
    {
      txId: 'tx_integration_001' as TransactionId,
      destinationPublicKey: 'dest_pub_key',
      amount: BigInt(1000000),
      fee: BigInt(1000),
      message: 'Integration test transaction',
      timestamp: Date.now(),
      status: 'Pending'
    }
  ];

  const mockBalance = {
    available: BigInt(5000000),
    pendingIncoming: BigInt(0),
    pendingOutgoing: BigInt(1001000),
    timelocked: BigInt(0)
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    emittedEvents = [];
    
    mockWalletHandle = {
      handle: 'mock_wallet_handle'
    } as WalletHandle;

    config = {
      ...DEFAULT_TRANSACTION_API_CONFIG,
      enableEventForwarding: true
    };

    transactionAPI = new TransactionAPI(mockWalletHandle, config);

    // Capture emitted events
    const originalEmit = transactionAPI.emit.bind(transactionAPI);
    transactionAPI.emit = jest.fn((event: string, ...args: any[]) => {
      emittedEvents.push({ event, args });
      return originalEmit(event, ...args);
    });

    // Setup FFI mocks
    mockFFIBindings.wallet_send_transaction.mockResolvedValue('tx_integration_001');
    mockFFIBindings.wallet_get_transaction.mockResolvedValue(JSON.stringify(mockTransaction));
    mockFFIBindings.wallet_get_pending_outbound_transactions.mockResolvedValue(
      JSON.stringify(mockPendingOutbound)
    );
    mockFFIBindings.wallet_get_pending_inbound_transactions.mockResolvedValue(
      JSON.stringify([])
    );
    mockFFIBindings.wallet_get_balance.mockResolvedValue(JSON.stringify(mockBalance));
    mockFFIBindings.wallet_cancel_pending_transaction.mockResolvedValue(true);

    // Initialize the transaction API
    await transactionAPI.initialize();
  });

  afterEach(async () => {
    await transactionAPI.dispose();
  });

  describe('Complete transaction lifecycle', () => {
    it('should handle full send-to-confirm lifecycle', async () => {
      // Step 1: Send transaction
      const txId = await transactionAPI.sendTransaction(
        'dest_address',
        BigInt(1000000) as MicroTari,
        { message: 'Integration test transaction' }
      );

      expect(txId).toBe('tx_integration_001');
      expect(mockFFIBindings.wallet_send_transaction).toHaveBeenCalledWith(
        mockWalletHandle.handle,
        'dest_address',
        expect.anything(),
        expect.objectContaining({
          message: 'Integration test transaction'
        })
      );

      // Step 2: Check transaction appears in pending
      const pending = await transactionAPI.getPendingTransactions();
      expect(pending.outbound).toHaveLength(1);
      expect(pending.outbound[0].id).toBe('tx_integration_001');

      // Step 3: Get transaction details
      const details = await transactionAPI.getTransactionDetails(txId);
      expect(details.transaction.id).toBe(txId);
      expect(details.confirmations).toBeDefined();
      expect(details.feeBreakdown).toBeDefined();

      // Step 4: Update transaction memo
      await transactionAPI.updateTransactionMemo(txId, 'Updated memo for integration test');
      const memo = await transactionAPI.getTransactionMemo(txId);
      expect(memo).toBe('Updated memo for integration test');

      // Step 5: Start confirmation tracking
      await transactionAPI.startConfirmationTracking(txId);

      // Step 6: Get transaction history
      const history = await transactionAPI.getTransactionHistory();
      expect(history.length).toBeGreaterThan(0);

      // Step 7: Export transaction history
      const csvExport = await transactionAPI.exportTransactionHistory('csv');
      expect(csvExport).toContain('tx_integration_001');

      // Step 8: Get comprehensive statistics
      const stats = await transactionAPI.getStatistics();
      expect(stats.totalSent).toBeGreaterThan(0);
      expect(stats.serviceStatistics).toBeDefined();
    });

    it('should handle transaction cancellation lifecycle', async () => {
      // Step 1: Send transaction
      const txId = await transactionAPI.sendTransaction(
        'dest_address',
        BigInt(1000000) as MicroTari
      );

      // Step 2: Verify can be cancelled
      const canCancel = await transactionAPI.canCancelTransaction(txId);
      expect(canCancel.canCancel).toBe(true);

      // Step 3: Get cancellable transactions
      const cancellable = await transactionAPI.getCancellableTransactions();
      expect(cancellable).toHaveLength(1);
      expect(cancellable[0].id).toBe(txId);

      // Step 4: Cancel the transaction
      const cancellationResult = await transactionAPI.cancelTransaction(txId);
      expect(cancellationResult.success).toBe(true);
      expect(cancellationResult.refundAmount).toBe(BigInt(1000000));
      expect(cancellationResult.refundedFee).toBe(BigInt(1000));

      // Verify cancellation was called in FFI
      expect(mockFFIBindings.wallet_cancel_pending_transaction).toHaveBeenCalledWith(
        mockWalletHandle.handle,
        txId
      );
    });

    it('should handle one-sided transaction flow', async () => {
      mockFFIBindings.wallet_send_one_sided_transaction = jest.fn().mockResolvedValue('tx_onesided_001');

      // Send one-sided transaction
      const txId = await transactionAPI.sendOneSidedTransaction(
        'dest_address',
        BigInt(500000) as MicroTari,
        { message: 'One-sided test' }
      );

      expect(txId).toBe('tx_onesided_001');
      
      // Verify one-sided specific FFI call was made
      expect(mockFFIBindings.wallet_send_one_sided_transaction).toHaveBeenCalledWith(
        mockWalletHandle.handle,
        'dest_address',
        expect.anything(),
        expect.objectContaining({
          message: 'One-sided test'
        })
      );
    });

    it('should handle search and filtering', async () => {
      // Setup mock history data
      const mockHistoryEntries = [
        {
          transaction: { ...mockTransaction, message: 'Payment to Alice' },
          enrichedAt: Date.now(),
          cached: false
        },
        {
          transaction: { ...mockTransaction, txId: 'tx_002', message: 'Payment to Bob' },
          enrichedAt: Date.now(),
          cached: false
        }
      ];

      // Mock history service to return test data
      jest.spyOn(transactionAPI as any, 'getTransactionHistory')
        .mockResolvedValue(mockHistoryEntries);

      // Search transaction history
      const searchResults = await transactionAPI.searchTransactionHistory('Alice');
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].transaction.message).toContain('Alice');

      // Filter by amount
      const filteredResults = await transactionAPI.getTransactionHistory({
        filter: {
          minAmount: BigInt(500000),
          maxAmount: BigInt(2000000)
        }
      });
      expect(filteredResults).toBeDefined();
    });
  });

  describe('Error handling and recovery', () => {
    it('should handle FFI errors gracefully', async () => {
      mockFFIBindings.wallet_send_transaction.mockRejectedValue(new Error('Network error'));

      await expect(transactionAPI.sendTransaction(
        'dest_address',
        BigInt(1000000) as MicroTari
      )).rejects.toThrow('Failed to send transaction');
    });

    it('should handle transaction not found errors', async () => {
      mockFFIBindings.wallet_get_transaction.mockResolvedValue(null);

      await expect(transactionAPI.getTransactionDetails('non_existent' as TransactionId))
        .rejects.toThrow(WalletError);
    });

    it('should handle cancellation failures', async () => {
      mockFFIBindings.wallet_cancel_pending_transaction.mockResolvedValue(false);

      await expect(transactionAPI.cancelTransaction('tx_integration_001' as TransactionId))
        .rejects.toThrow(WalletError);
    });
  });

  describe('Event emission', () => {
    it('should emit appropriate events during transaction lifecycle', async () => {
      // Send transaction should trigger events
      await transactionAPI.sendTransaction(
        'dest_address',
        BigInt(1000000) as MicroTari
      );

      // Check for initialization event
      const initEvent = emittedEvents.find(e => e.event === 'api:initialized');
      expect(initEvent).toBeDefined();

      // Get transaction details should trigger enrichment event
      await transactionAPI.getTransactionDetails('tx_integration_001' as TransactionId);

      const enrichedEvent = emittedEvents.find(e => e.event === 'details:enriched');
      expect(enrichedEvent).toBeDefined();
    });

    it('should forward service events correctly', async () => {
      // Cancel transaction should trigger cancellation events
      await transactionAPI.cancelTransaction('tx_integration_001' as TransactionId);

      const cancellationEvent = emittedEvents.find(e => e.event === 'cancellation:completed');
      expect(cancellationEvent).toBeDefined();
      expect(cancellationEvent?.args[0]).toBe('tx_integration_001');
    });
  });

  describe('Resource management', () => {
    it('should properly dispose of all services', async () => {
      // Initialize services first
      await transactionAPI.refreshAllData();

      // Dispose should not throw
      await transactionAPI.dispose();

      // Further operations should throw
      await expect(transactionAPI.sendTransaction(
        'dest_address',
        BigInt(1000000) as MicroTari
      )).rejects.toThrow(WalletError);
    });

    it('should handle multiple dispose calls', async () => {
      await transactionAPI.dispose();
      await transactionAPI.dispose(); // Should not throw
    });
  });

  describe('Statistics and monitoring', () => {
    it('should provide comprehensive statistics', async () => {
      // Perform various operations to generate statistics
      await transactionAPI.sendTransaction('dest_address', BigInt(1000000) as MicroTari);
      await transactionAPI.getTransactionHistory();
      await transactionAPI.cancelTransaction('tx_integration_001' as TransactionId);

      const stats = await transactionAPI.getStatistics();

      expect(stats.totalSent).toBeGreaterThan(0);
      expect(stats.totalCancelled).toBeGreaterThan(0);
      expect(stats.serviceStatistics).toBeDefined();
      expect(stats.serviceStatistics.transactionService).toBeDefined();
      expect(stats.serviceStatistics.pendingManager).toBeDefined();
      expect(stats.serviceStatistics.cancellationService).toBeDefined();
      expect(stats.serviceStatistics.detailService).toBeDefined();
      expect(stats.serviceStatistics.historyService).toBeDefined();
    });

    it('should track service performance metrics', async () => {
      // Perform operations that should be tracked
      const startTime = Date.now();
      
      await transactionAPI.getTransactionDetails('tx_integration_001' as TransactionId);
      await transactionAPI.getTransactionHistory();
      
      const endTime = Date.now();
      
      const stats = await transactionAPI.getStatistics();
      
      // Verify timing statistics are reasonable
      expect(stats.serviceStatistics.detailService.averageEnrichmentTime).toBeGreaterThan(0);
      expect(stats.serviceStatistics.detailService.totalEnriched).toBeGreaterThan(0);
    });
  });

  describe('Configuration and customization', () => {
    it('should respect custom configuration', async () => {
      await transactionAPI.dispose();

      const customConfig = {
        ...DEFAULT_TRANSACTION_API_CONFIG,
        enableEventForwarding: false,
        detailService: {
          enableDetailCaching: false,
          enableRichMetadata: false
        }
      };

      const customAPI = new TransactionAPI(mockWalletHandle, customConfig);
      await customAPI.initialize();

      // Operations should still work with custom config
      const txId = await customAPI.sendTransaction(
        'dest_address',
        BigInt(1000000) as MicroTari
      );
      expect(txId).toBeDefined();

      await customAPI.dispose();
    });
  });
});
