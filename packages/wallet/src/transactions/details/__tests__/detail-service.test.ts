/**
 * @fileoverview Tests for Transaction Detail Service
 */

import { EventEmitter } from 'node:events';
import { 
  DetailService,
  type DetailServiceConfig,
  type TransactionDetails,
  DEFAULT_DETAIL_SERVICE_CONFIG
} from '../detail-service.js';
import { ConfirmationTracker } from '../confirmation-tracker.js';
import { MemoService } from '../memo-service.js';
import { 
  WalletError, 
  WalletErrorCode,
  type TransactionId,
  type TransactionInfo,
  type WalletHandle
} from '@tari-project/tarijs-core';
import { jest } from '@jest/globals';
// BigInt serialization helper  
const safeStringify = (obj: any): string => JSON.stringify(obj, (key, value) => typeof value === 'bigint' ? value.toString() : value);

// Mock the FFI bindings
const mockFFIBindings = {
  wallet_get_transaction: jest.fn(),
  wallet_get_transaction_inputs: jest.fn(),
  wallet_get_transaction_outputs: jest.fn(),
  wallet_get_transaction_kernels: jest.fn(),
  wallet_get_block_info: jest.fn(),
  wallet_get_transaction_confirmations: jest.fn(),
  wallet_get_blockchain_height: jest.fn(),
  wallet_set_transaction_memo: jest.fn(),
  wallet_get_transaction_memo: jest.fn()
};

jest.mock('@tari-project/tarijs-core', () => ({
  ...jest.requireActual('@tari-project/tarijs-core'),
  getFFIBindings: () => mockFFIBindings
}));

describe('DetailService', () => {
  let service: DetailService;
  let mockWalletHandle: WalletHandle;
  let config: DetailServiceConfig;
  let emittedEvents: Array<{ event: string; args: any[] }>;

  const mockTransaction: TransactionInfo = {
    txId: 'test_tx_123' as TransactionId,
    sourcePublicKey: 'source_pub_key',
    destinationPublicKey: 'dest_pub_key',
    amount: BigInt(1000000),
    fee: BigInt(1000),
    message: 'Test transaction',
    timestamp: Date.now(),
    status: 'Confirmed',
    direction: 'Outbound',
    blockHeight: BigInt(100)
  };

  const mockInputs = [
    {
      commitment: 'input_commitment_1',
      amount: BigInt(1500000),
      features: {
        flags: 0,
        maturity: BigInt(0),
        metadata: 'input_metadata'
      }
    }
  ];

  const mockOutputs = [
    {
      commitment: 'output_commitment_1',
      amount: BigInt(1000000),
      rangeProof: 'range_proof_data',
      script: 'output_script',
      features: {
        flags: 0,
        maturity: BigInt(0),
        metadata: 'output_metadata'
      }
    },
    {
      commitment: 'output_commitment_2',
      amount: BigInt(499000),
      rangeProof: 'range_proof_data_2',
      script: 'output_script_2',
      features: {
        flags: 0,
        maturity: BigInt(0)
      }
    }
  ];

  const mockKernels = [
    {
      excess: 'kernel_excess',
      excessSignature: 'kernel_signature',
      fee: BigInt(1000),
      lockHeight: BigInt(0),
      features: {
        kernelType: 'Normal'
      },
      hash: 'kernel_hash'
    }
  ];

  const mockBlockInfo = {
    height: BigInt(100),
    hash: 'block_hash',
    timestamp: Date.now(),
    previousBlockHash: 'prev_block_hash',
    merkleRoot: 'merkle_root',
    totalAccumulatedDifficulty: '12345',
    reward: BigInt(800000000),
    kernelCount: 5,
    outputCount: 10
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    emittedEvents = [];
    
    mockWalletHandle = {
      handle: 'mock_wallet_handle'
    } as WalletHandle;

    config = {
      ...DEFAULT_DETAIL_SERVICE_CONFIG,
      enableEventEmission: true,
      enableDetailCaching: true,
      enableRichMetadata: true
    };

    service = new DetailService(mockWalletHandle, config);

    // Capture emitted events
    const originalEmit = service.emit.bind(service);
    service.emit = jest.fn((event: string, ...args: any[]) => {
      emittedEvents.push({ event, args });
      return originalEmit(event, ...args);
    });

    // Setup FFI mocks
    mockFFIBindings.wallet_get_transaction.mockResolvedValue(safeStringify(mockTransaction));
    mockFFIBindings.wallet_get_transaction_inputs.mockResolvedValue(safeStringify(mockInputs));
    mockFFIBindings.wallet_get_transaction_outputs.mockResolvedValue(safeStringify(mockOutputs));
    mockFFIBindings.wallet_get_transaction_kernels.mockResolvedValue(safeStringify(mockKernels));
    mockFFIBindings.wallet_get_block_info.mockResolvedValue(safeStringify(mockBlockInfo));
    mockFFIBindings.wallet_get_transaction_confirmations.mockResolvedValue(
      JSON.stringify({ confirmations: 5 })
    );
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultService = new DetailService(mockWalletHandle);
      expect(defaultService.getStatistics().totalEnriched).toBe(0);
    });

    it('should merge provided config with defaults', () => {
      const customConfig = { enableRichMetadata: false };
      const customService = new DetailService(mockWalletHandle, customConfig);
      expect(customService).toBeDefined();
    });

    it('should throw error for invalid config', () => {
      expect(() => {
        new DetailService(mockWalletHandle, { confirmationRefreshIntervalSeconds: -1 });
      }).toThrow(WalletError);
    });
  });

  describe('getTransactionDetails', () => {
    it('should return enriched transaction details', async () => {
      const details = await service.getTransactionDetails('test_tx_123' as TransactionId);

      expect(details.transaction).toEqual(mockTransaction);
      expect(details.inputs).toHaveLength(1);
      expect(details.outputs).toHaveLength(2);
      expect(details.kernels).toHaveLength(1);
      expect(details.blockInfo).toEqual(mockBlockInfo);
      expect(details.confirmations).toBe(5);
      expect(details.feeBreakdown).toBeDefined();
      expect(details.metadata).toBeDefined();

      // Check FFI calls
      expect(mockFFIBindings.wallet_get_transaction).toHaveBeenCalledWith(
        mockWalletHandle.handle,
        'test_tx_123'
      );
      expect(mockFFIBindings.wallet_get_transaction_inputs).toHaveBeenCalledWith(
        mockWalletHandle.handle,
        'test_tx_123'
      );

      // Check events
      const enrichedEvent = emittedEvents.find(e => e.event === 'details:enriched');
      expect(enrichedEvent).toBeDefined();
      expect(enrichedEvent?.args[0]).toBe('test_tx_123');
    });

    it('should use cached details when available', async () => {
      // First call should fetch from FFI
      await service.getTransactionDetails('test_tx_123' as TransactionId);
      jest.clearAllMocks();

      // Second call should use cache
      const details = await service.getTransactionDetails('test_tx_123' as TransactionId);

      expect(details).toBeDefined();
      expect(mockFFIBindings.wallet_get_transaction).not.toHaveBeenCalled();
    });

    it('should force refresh when requested', async () => {
      // First call
      await service.getTransactionDetails('test_tx_123' as TransactionId);
      jest.clearAllMocks();

      // Second call with force refresh
      await service.getTransactionDetails('test_tx_123' as TransactionId, true);

      expect(mockFFIBindings.wallet_get_transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle transaction not found', async () => {
      mockFFIBindings.wallet_get_transaction.mockResolvedValue(null);

      await expect(service.getTransactionDetails('non_existent' as TransactionId))
        .rejects.toThrow(WalletError);
    });

    it('should handle FFI errors gracefully', async () => {
      mockFFIBindings.wallet_get_transaction.mockRejectedValue(new Error('FFI error'));

      await expect(service.getTransactionDetails('test_tx_123' as TransactionId))
        .rejects.toThrow(WalletError);
    });

    it('should handle missing rich metadata gracefully', async () => {
      mockFFIBindings.wallet_get_transaction_inputs.mockResolvedValue(null);
      mockFFIBindings.wallet_get_transaction_outputs.mockRejectedValue(new Error('Not available'));

      const details = await service.getTransactionDetails('test_tx_123' as TransactionId);

      expect(details.inputs).toHaveLength(0);
      expect(details.outputs).toHaveLength(0);
      expect(details.transaction).toEqual(mockTransaction);
    });

    it('should calculate fee breakdown correctly', async () => {
      const details = await service.getTransactionDetails('test_tx_123' as TransactionId);

      expect(details.feeBreakdown.totalFee).toBe(BigInt(1000));
      expect(details.feeBreakdown.baseFee).toBeGreaterThan(BigInt(0));
      expect(details.feeBreakdown.inputFee).toBeGreaterThan(BigInt(0));
      expect(details.feeBreakdown.outputFee).toBeGreaterThan(BigInt(0));
      expect(details.feeBreakdown.transactionSize).toBeGreaterThan(0);
    });
  });

  describe('memo management', () => {
    it('should update transaction memo', async () => {
      const memo = 'Test memo for transaction';
      
      await service.updateTransactionMemo('test_tx_123' as TransactionId, memo);

      const retrievedMemo = await service.getTransactionMemo('test_tx_123' as TransactionId);
      expect(retrievedMemo).toBe(memo);

      // Check events
      const memoEvent = emittedEvents.find(e => e.event === 'memo:updated');
      expect(memoEvent).toBeDefined();
      expect(memoEvent?.args[1]).toBe(memo);
    });

    it('should return null for non-existent memo', async () => {
      const memo = await service.getTransactionMemo('non_existent' as TransactionId);
      expect(memo).toBeNull();
    });

    it('should throw error when memo management disabled', async () => {
      await service.dispose();
      
      const serviceWithoutMemos = new DetailService(mockWalletHandle, {
        ...config,
        enableMemoManagement: false
      });

      await expect(serviceWithoutMemos.updateTransactionMemo(
        'test_tx_123' as TransactionId,
        'test memo'
      )).rejects.toThrow(WalletError);

      await serviceWithoutMemos.dispose();
    });
  });

  describe('confirmation tracking', () => {
    it('should get confirmation count', async () => {
      const count = await service.getConfirmationCount('test_tx_123' as TransactionId);
      expect(count).toBe(5);
    });

    it('should start confirmation tracking', async () => {
      await service.startConfirmationTracking('test_tx_123' as TransactionId);
      
      // Check that tracking was started (implementation details)
      expect(service).toBeDefined();
    });

    it('should stop confirmation tracking', () => {
      const stopped = service.stopConfirmationTracking('test_tx_123' as TransactionId);
      expect(typeof stopped).toBe('boolean');
    });

    it('should throw error when confirmation tracking disabled', async () => {
      await service.dispose();
      
      const serviceWithoutTracking = new DetailService(mockWalletHandle, {
        ...config,
        enableConfirmationTracking: false
      });

      await expect(serviceWithoutTracking.getConfirmationCount('test_tx_123' as TransactionId))
        .rejects.toThrow(WalletError);

      await serviceWithoutTracking.dispose();
    });
  });

  describe('caching', () => {
    it('should cache transaction details', async () => {
      // First call should cache the details
      await service.getTransactionDetails('test_tx_123' as TransactionId);
      
      const stats = service.getStatistics();
      expect(stats.totalEnriched).toBe(1);
    });

    it('should clear cache', async () => {
      await service.getTransactionDetails('test_tx_123' as TransactionId);
      
      const clearedCount = service.clearCache();
      expect(clearedCount).toBe(1);
      
      // Next call should fetch from FFI again
      jest.clearAllMocks();
      await service.getTransactionDetails('test_tx_123' as TransactionId);
      expect(mockFFIBindings.wallet_get_transaction).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL', async () => {
      await service.dispose();
      
      // Create service with very short cache TTL
      const shortCacheService = new DetailService(mockWalletHandle, {
        ...config,
        detailCacheTtlSeconds: 0.001 // 1ms
      });

      await shortCacheService.getTransactionDetails('test_tx_123' as TransactionId);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      jest.clearAllMocks();
      await shortCacheService.getTransactionDetails('test_tx_123' as TransactionId);
      
      // Should have fetched from FFI again
      expect(mockFFIBindings.wallet_get_transaction).toHaveBeenCalledTimes(1);
      
      await shortCacheService.dispose();
    });
  });

  describe('statistics', () => {
    it('should track enrichment statistics', async () => {
      const initialStats = service.getStatistics();
      expect(initialStats.totalEnriched).toBe(0);

      await service.getTransactionDetails('test_tx_123' as TransactionId);

      const finalStats = service.getStatistics();
      expect(finalStats.totalEnriched).toBe(1);
      expect(finalStats.averageEnrichmentTime).toBeGreaterThan(0);
      expect(finalStats.lastEnrichmentTime).toBeDefined();
    });

    it('should track cache hit rate', async () => {
      // First call (cache miss)
      await service.getTransactionDetails('test_tx_123' as TransactionId);
      
      // Second call (cache hit)
      await service.getTransactionDetails('test_tx_123' as TransactionId);
      
      const stats = service.getStatistics();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle partial FFI failures gracefully', async () => {
      mockFFIBindings.wallet_get_transaction_inputs.mockRejectedValue(new Error('Input fetch failed'));
      mockFFIBindings.wallet_get_block_info.mockRejectedValue(new Error('Block info failed'));

      const details = await service.getTransactionDetails('test_tx_123' as TransactionId);

      // Should still return details with available data
      expect(details.transaction).toEqual(mockTransaction);
      expect(details.inputs).toHaveLength(0); // Failed to fetch
      expect(details.outputs).toHaveLength(2); // Successfully fetched
      expect(details.blockInfo).toBeUndefined(); // Failed to fetch
    });

    it('should propagate critical errors', async () => {
      mockFFIBindings.wallet_get_transaction.mockRejectedValue(new Error('Critical FFI error'));

      await expect(service.getTransactionDetails('test_tx_123' as TransactionId))
        .rejects.toThrow(WalletError);
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
      
      await expect(service.getTransactionDetails('test_tx_123' as TransactionId))
        .rejects.toThrow(WalletError);
    });
  });
});
