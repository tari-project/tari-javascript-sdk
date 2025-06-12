/**
 * @fileoverview History Service Tests
 * 
 * Comprehensive test suite for transaction history querying functionality
 * including filtering, pagination, search, and export capabilities.
 */

import {
  WalletHandle,
  WalletError,
  WalletErrorCode,
  getFFIBindings
} from '@tari-project/tarijs-core';
import type {
  TransactionFilter,
  TransactionQueryOptions,
  TransactionInfo
} from '@tari-project/tarijs-core';
import { TransactionStatus, TransactionDirection } from '@tari-project/tarijs-core';
import { TransactionRepository } from '../../transaction-repository.js';
import { 
  HistoryService, 
  type HistoryServiceConfig,
  DEFAULT_HISTORY_SERVICE_CONFIG 
} from '../history-service.js';

// Mock dependencies
jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  getFFIBindings: jest.fn()
}));

jest.mock('../../transaction-repository.js');

describe('HistoryService', () => {
  let historyService: HistoryService;
  let mockRepository: jest.Mocked<TransactionRepository>;
  let mockWalletHandle: WalletHandle;
  let config: HistoryServiceConfig;

  const mockTransactions: TransactionInfo[] = [
    {
      id: 'tx1' as any,
      amount: BigInt(1000000) as any,
      fee: BigInt(1000) as any,
      status: TransactionStatus.Completed,
      direction: TransactionDirection.Outbound,
      message: 'Payment for coffee',
      timestamp: Date.now() - 3600000 as any, // 1 hour ago
      address: 'address1'
    },
    {
      id: 'tx2' as any,
      amount: BigInt(500000) as any,
      fee: BigInt(500) as any,
      status: TransactionStatus.Pending,
      direction: TransactionDirection.Inbound,
      message: 'Salary payment',
      timestamp: Date.now() - 7200000 as any, // 2 hours ago
      address: 'address2'
    },
    {
      id: 'tx3' as any,
      amount: BigInt(2000000) as any,
      fee: BigInt(2000) as any,
      status: TransactionStatus.Completed,
      direction: TransactionDirection.Outbound,
      message: 'Purchase from store',
      timestamp: Date.now() - 86400000 as any, // 1 day ago
      address: 'address3'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockWalletHandle = 'test-wallet-handle' as WalletHandle;
    
    config = {
      walletHandle: mockWalletHandle,
      maxPageSize: 100,
      defaultPageSize: 20,
      enableCaching: true,
      cacheTtlMs: 300000, // 5 minutes
      includePending: true,
      ...DEFAULT_HISTORY_SERVICE_CONFIG
    };

    // Mock repository
    mockRepository = {
      queryTransactions: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      dispose: jest.fn()
    } as any;

    (TransactionRepository as jest.Mock).mockImplementation(() => mockRepository);

    // Mock FFI bindings
    (getFFIBindings as jest.Mock).mockReturnValue({
      walletGetBalance: jest.fn(),
      walletGetTransactionHistory: jest.fn()
    });

    historyService = new HistoryService(config, mockRepository);
  });

  afterEach(async () => {
    await historyService.dispose();
  });

  describe('getTransactionHistory', () => {
    beforeEach(() => {
      mockRepository.queryTransactions.mockResolvedValue({
        data: mockTransactions,
        totalCount: mockTransactions.length,
        hasMore: false,
        nextOffset: undefined
      });
    });

    it('should get transaction history without filters', async () => {
      const result = await historyService.getTransactionHistory();

      expect(result.data).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      expect(result.hasMore).toBe(false);
      expect(mockRepository.queryTransactions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          offset: 0,
          limit: 20,
          sortBy: 'timestamp',
          sortOrder: 'desc'
        })
      );
    });

    it('should apply status filter', async () => {
      const filter: TransactionFilter = {
        status: [TransactionStatus.Completed]
      };

      await historyService.getTransactionHistory(filter);

      expect(mockRepository.queryTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          status: [TransactionStatus.Completed]
        }),
        expect.any(Object)
      );
    });

    it('should apply direction filter', async () => {
      const filter: TransactionFilter = {
        direction: [TransactionDirection.Outbound]
      };

      await historyService.getTransactionHistory(filter);

      expect(mockRepository.queryTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: [TransactionDirection.Outbound]
        }),
        expect.any(Object)
      );
    });

    it('should apply pagination options', async () => {
      const options: TransactionQueryOptions = {
        offset: 10,
        limit: 5,
        sortBy: 'amount' as any,
        sortOrder: 'asc'
      };

      await historyService.getTransactionHistory(undefined, options);

      expect(mockRepository.queryTransactions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          offset: 10,
          limit: 5,
          sortBy: 'amount',
          sortOrder: 'asc'
        })
      );
    });

    it('should enforce maximum page size', async () => {
      const options: TransactionQueryOptions = {
        limit: 200 // Exceeds maxPageSize of 100
      };

      await historyService.getTransactionHistory(undefined, options);

      expect(mockRepository.queryTransactions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          limit: 100 // Should be clamped to maxPageSize
        })
      );
    });

    it('should enrich transactions with metadata', async () => {
      const result = await historyService.getTransactionHistory();

      const enrichedTx = result.data[0];
      expect(enrichedTx).toHaveProperty('age');
      expect(enrichedTx).toHaveProperty('isSearchable');
      expect(enrichedTx).toHaveProperty('displayAmount');
      expect(enrichedTx).toHaveProperty('statusLabel');
      expect(enrichedTx).toHaveProperty('tags');
      expect(enrichedTx.tags).toContain('sent'); // Outbound transaction
      expect(enrichedTx.tags).toContain('completed');
    });

    it('should cache results when caching is enabled', async () => {
      // First call
      const result1 = await historyService.getTransactionHistory();
      expect(mockRepository.queryTransactions).toHaveBeenCalledTimes(1);

      // Second call with same parameters should use cache
      const result2 = await historyService.getTransactionHistory();
      expect(mockRepository.queryTransactions).toHaveBeenCalledTimes(1); // Still 1
      expect(result2).toEqual(result1);
    });

    it('should emit history:filtered event', async () => {
      const filterEventSpy = jest.fn();
      historyService.on('history:filtered', filterEventSpy);

      const filter: TransactionFilter = { status: [TransactionStatus.Completed] };
      await historyService.getTransactionHistory(filter);

      expect(filterEventSpy).toHaveBeenCalledWith(filter, 3);
    });
  });

  describe('searchTransactionHistory', () => {
    beforeEach(() => {
      mockRepository.queryTransactions.mockResolvedValue({
        data: mockTransactions,
        totalCount: mockTransactions.length,
        hasMore: false
      });
    });

    it('should search by message content', async () => {
      const result = await historyService.searchTransactionHistory('coffee');

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].message).toContain('coffee');
      expect(result.query).toBe('coffee');
      expect(result.totalMatches).toBe(1);
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle empty search query', async () => {
      await expect(
        historyService.searchTransactionHistory('')
      ).rejects.toThrow(WalletError);
    });

    it('should generate search suggestions', async () => {
      const result = await historyService.searchTransactionHistory('100');

      expect(result.suggestions).toContain('amount:100');
      expect(result.suggestions).toContain('>amount:100');
      expect(result.suggestions).toContain('<amount:100');
    });

    it('should combine search with additional filters', async () => {
      const filter: TransactionFilter = {
        direction: [TransactionDirection.Outbound]
      };

      const result = await historyService.searchTransactionHistory('coffee', filter);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].direction).toBe(TransactionDirection.Outbound);
    });
  });

  describe('getTransactionStatistics', () => {
    beforeEach(() => {
      // Mock the getAllMatchingTransactions method to return test data
      jest.spyOn(historyService as any, 'getAllMatchingTransactions')
        .mockResolvedValue(mockTransactions.map(tx => ({
          ...tx,
          age: Date.now() - Number(tx.timestamp),
          isSearchable: true,
          displayAmount: '1.000000 T',
          statusLabel: 'Completed',
          tags: ['sent', 'completed']
        })));
    });

    it('should calculate transaction statistics', async () => {
      const stats = await historyService.getTransactionStatistics();

      expect(stats.total).toBe(3);
      expect(stats.totalSent).toBeGreaterThan(BigInt(0));
      expect(stats.totalReceived).toBeGreaterThan(BigInt(0));
      expect(stats.dateRange).toHaveProperty('earliest');
      expect(stats.dateRange).toHaveProperty('latest');
    });

    it('should apply time range filter to statistics', async () => {
      const timeRange = {
        startDate: new Date(Date.now() - 3600000), // 1 hour ago
        endDate: new Date()
      };

      await historyService.getTransactionStatistics(undefined, timeRange);

      expect(historyService['getAllMatchingTransactions']).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Number),
          endDate: expect.any(Number)
        })
      );
    });
  });

  describe('getRecentActivity', () => {
    beforeEach(() => {
      mockRepository.queryTransactions.mockResolvedValue({
        data: mockTransactions.slice(0, 2), // Return first 2 transactions
        totalCount: 2,
        hasMore: false
      });
    });

    it('should get recent activity with default time window', async () => {
      const result = await historyService.getRecentActivity();

      expect(result).toHaveLength(2);
      expect(mockRepository.queryTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Number)
        }),
        expect.objectContaining({
          sortBy: 'timestamp',
          sortOrder: 'desc',
          limit: 50
        })
      );
    });

    it('should get recent activity with custom time window', async () => {
      const customTimeWindow = 2 * 60 * 60 * 1000; // 2 hours
      const customLimit = 10;

      await historyService.getRecentActivity(customTimeWindow, customLimit);

      expect(mockRepository.queryTransactions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          limit: 10
        })
      );
    });
  });

  describe('exportTransactionHistory', () => {
    beforeEach(() => {
      // Mock getAllMatchingTransactions for export
      jest.spyOn(historyService as any, 'getAllMatchingTransactions')
        .mockResolvedValue(mockTransactions.map(tx => ({
          ...tx,
          age: Date.now() - Number(tx.timestamp),
          isSearchable: true,
          displayAmount: '1.000000 T',
          statusLabel: 'Completed',
          tags: ['sent', 'completed']
        })));
    });

    it('should export to CSV format', async () => {
      const result = await historyService.exportTransactionHistory(undefined, 'csv');

      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toMatch(/transaction-history-.*\.csv/);
      expect(result.data).toContain('Timestamp');
      expect(result.data).toContain('coffee'); // Should contain transaction data
    });

    it('should export to JSON format', async () => {
      const result = await historyService.exportTransactionHistory(undefined, 'json');

      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toMatch(/transaction-history-.*\.json/);
      
      const jsonData = JSON.parse(result.data as string);
      expect(jsonData).toHaveProperty('exportedAt');
      expect(jsonData).toHaveProperty('transactionCount', 3);
      expect(jsonData.transactions).toHaveLength(3);
    });

    it('should export to XLSX format', async () => {
      const result = await historyService.exportTransactionHistory(undefined, 'xlsx');

      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.filename).toMatch(/transaction-history-.*\.xlsx/);
      expect(result.data).toBeInstanceOf(Buffer);
    });

    it('should reject unsupported export format', async () => {
      await expect(
        historyService.exportTransactionHistory(undefined, 'pdf' as any)
      ).rejects.toThrow(WalletError);
    });

    it('should apply filter before export', async () => {
      const filter: TransactionFilter = {
        status: [TransactionStatus.Completed]
      };

      await historyService.exportTransactionHistory(filter, 'csv');

      expect(historyService['getAllMatchingTransactions']).toHaveBeenCalledWith(filter);
    });
  });

  describe('caching behavior', () => {
    beforeEach(() => {
      mockRepository.queryTransactions.mockResolvedValue({
        data: mockTransactions,
        totalCount: mockTransactions.length,
        hasMore: false
      });
    });

    it('should invalidate cache when repository emits events', async () => {
      // First call to populate cache
      await historyService.getTransactionHistory();
      expect(mockRepository.queryTransactions).toHaveBeenCalledTimes(1);

      // Simulate repository event
      const addedCallback = mockRepository.on.mock.calls
        .find(call => call[0] === 'transaction:added')?.[1];
      addedCallback?.();

      // Second call should not use cache (cache was invalidated)
      await historyService.getTransactionHistory();
      expect(mockRepository.queryTransactions).toHaveBeenCalledTimes(2);
    });

    it('should respect cache TTL', async () => {
      // Create service with short cache TTL
      const shortCacheConfig = { ...config, cacheTtlMs: 10 }; // 10ms
      const shortCacheService = new HistoryService(shortCacheConfig, mockRepository);

      // First call
      await shortCacheService.getTransactionHistory();
      expect(mockRepository.queryTransactions).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 15));

      // Second call should not use expired cache
      await shortCacheService.getTransactionHistory();
      expect(mockRepository.queryTransactions).toHaveBeenCalledTimes(2);

      await shortCacheService.dispose();
    });

    it('should emit cache hit and miss events', async () => {
      const cacheHitSpy = jest.fn();
      const cacheMissSpy = jest.fn();
      
      historyService.on('cache:hit', cacheHitSpy);
      historyService.on('cache:miss', cacheMissSpy);

      // First call should be cache miss
      await historyService.getTransactionHistory();
      expect(cacheMissSpy).toHaveBeenCalledTimes(1);
      expect(cacheHitSpy).toHaveBeenCalledTimes(0);

      // Second call should be cache hit
      await historyService.getTransactionHistory();
      expect(cacheMissSpy).toHaveBeenCalledTimes(1);
      expect(cacheHitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      const repositoryError = new Error('Repository error');
      mockRepository.queryTransactions.mockRejectedValue(repositoryError);

      await expect(
        historyService.getTransactionHistory()
      ).rejects.toThrow('Repository error');
    });

    it('should throw error when disposed', async () => {
      await historyService.dispose();

      await expect(
        historyService.getTransactionHistory()
      ).rejects.toThrow(WalletError);
    });
  });

  describe('disposal and cleanup', () => {
    it('should dispose cleanly', async () => {
      await historyService.dispose();

      expect(historyService.disposed).toBe(true);
      expect(mockRepository.removeAllListeners).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls', async () => {
      await historyService.dispose();
      await historyService.dispose(); // Should not throw

      expect(historyService.disposed).toBe(true);
    });
  });
});
