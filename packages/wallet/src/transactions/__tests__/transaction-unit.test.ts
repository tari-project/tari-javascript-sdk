/**
 * Unit tests for transaction operations using mocked FFI
 */

import { TransactionService } from '../transaction-service';
import { 
  TransactionFactory,
  PendingTransactionFactory,
  AddressFactory,
  ErrorFactory 
} from '../../testing/factories';
import { 
  TransactionBuilder,
  PendingTransactionBuilder 
} from '../../testing/builders';
import { getMockNativeBindings } from '../../../../core/src/ffi/__mocks__/native';

// Mock the FFI module
jest.mock('../../../../core/src/ffi/native', () => {
  return getMockNativeBindings();
});

describe('TransactionService Unit Tests', () => {
  let mockFFI: any;
  let transactionService: TransactionService;
  const mockWalletHandle = 1;

  beforeEach(() => {
    mockFFI = getMockNativeBindings();
    mockFFI.reset();
    
    transactionService = new TransactionService(mockWalletHandle);
    
    // Set up default mocks
    mockFFI.walletSendTransaction = jest.fn().mockResolvedValue('mock_tx_001');
    mockFFI.walletGetPendingOutboundTransactions = jest.fn().mockResolvedValue([]);
    mockFFI.walletGetPendingInboundTransactions = jest.fn().mockResolvedValue([]);
    mockFFI.walletCancelPendingTransaction = jest.fn().mockResolvedValue(true);
    mockFFI.walletGetTransaction = jest.fn().mockResolvedValue('{}');
  });

  afterEach(() => {
    mockFFI.reset();
    jest.clearAllMocks();
  });

  describe('Send Transaction', () => {
    test('should send standard transaction', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n; // 1 Tari
      const mockTxId = 'tx_standard_001';
      
      mockFFI.walletSendTransaction.mockResolvedValue(mockTxId);
      
      const result = await transactionService.sendTransaction(recipient, amount);
      
      expect(result.transactionId).toBe(mockTxId);
      expect(mockFFI.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        recipient,
        amount.toString(),
        undefined
      );
    });

    test('should send transaction with custom fee', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 500000000n; // 0.5 Tari
      const fee = 10000n;
      const mockTxId = 'tx_custom_fee_002';
      
      mockFFI.walletSendTransaction.mockResolvedValue(mockTxId);
      
      const result = await transactionService.sendTransaction(recipient, amount, {
        feePerGram: fee,
      });
      
      expect(result.transactionId).toBe(mockTxId);
      expect(mockFFI.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        recipient,
        amount.toString(),
        expect.objectContaining({
          feePerGram: fee.toString(),
        })
      );
    });

    test('should send transaction with message', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 2000000000n; // 2 Tari
      const message = 'Payment for services';
      const mockTxId = 'tx_with_message_003';
      
      mockFFI.walletSendTransaction.mockResolvedValue(mockTxId);
      
      const result = await transactionService.sendTransaction(recipient, amount, {
        message,
      });
      
      expect(result.transactionId).toBe(mockTxId);
      expect(mockFFI.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        recipient,
        amount.toString(),
        expect.objectContaining({
          message,
        })
      );
    });

    test('should handle insufficient funds error', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 100000000000n; // 100 Tari
      
      mockFFI.walletSendTransaction.mockRejectedValue(
        ErrorFactory.insufficientFunds()
      );
      
      await expect(
        transactionService.sendTransaction(recipient, amount)
      ).rejects.toThrow('Insufficient funds');
    });

    test('should handle invalid recipient address', async () => {
      const invalidRecipient = AddressFactory.invalid();
      const amount = 1000000000n;
      
      mockFFI.walletSendTransaction.mockRejectedValue(
        ErrorFactory.invalidAddress()
      );
      
      await expect(
        transactionService.sendTransaction(invalidRecipient, amount)
      ).rejects.toThrow('Invalid recipient address');
    });

    test('should handle network errors during send', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n;
      
      mockFFI.walletSendTransaction.mockRejectedValue(
        ErrorFactory.networkError()
      );
      
      await expect(
        transactionService.sendTransaction(recipient, amount)
      ).rejects.toThrow('Network connection failed');
    });

    test('should validate amount before sending', async () => {
      const recipient = AddressFactory.testnet();
      
      // Test zero amount
      await expect(
        transactionService.sendTransaction(recipient, 0n)
      ).rejects.toThrow('Amount must be greater than zero');
      
      // Test negative amount
      await expect(
        transactionService.sendTransaction(recipient, -1000000n)
      ).rejects.toThrow('Amount must be greater than zero');
    });

    test('should validate recipient address format', async () => {
      const amount = 1000000000n;
      
      // Test empty address
      await expect(
        transactionService.sendTransaction('', amount)
      ).rejects.toThrow('Recipient address is required');
      
      // Test invalid format
      await expect(
        transactionService.sendTransaction('invalid_format', amount)
      ).rejects.toThrow('Invalid address format');
    });
  });

  describe('Pending Transactions', () => {
    test('should get pending outbound transactions', async () => {
      const mockPendingTx = PendingTransactionFactory.outbound();
      mockFFI.walletGetPendingOutboundTransactions.mockResolvedValue([
        {
          id: mockPendingTx.id,
          amount: mockPendingTx.amount.toString(),
          fee: mockPendingTx.fee.toString(),
          recipient_address: mockPendingTx.recipientAddress,
          message: mockPendingTx.message,
          timestamp: mockPendingTx.timestamp.getTime(),
          status: mockPendingTx.status,
        },
      ]);
      
      const result = await transactionService.getPendingOutboundTransactions();
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockPendingTx.id);
      expect(result[0].amount).toBe(mockPendingTx.amount);
      expect(result[0].recipientAddress).toBe(mockPendingTx.recipientAddress);
      expect(mockFFI.walletGetPendingOutboundTransactions).toHaveBeenCalledWith(mockWalletHandle);
    });

    test('should get pending inbound transactions', async () => {
      const mockInboundTx = {
        id: 'inbound_tx_001',
        amount: '1000000000',
        fee: '0',
        sender_address: AddressFactory.testnet(),
        message: 'Incoming payment',
        timestamp: Date.now(),
        status: 'pending',
      };
      
      mockFFI.walletGetPendingInboundTransactions.mockResolvedValue([mockInboundTx]);
      
      const result = await transactionService.getPendingInboundTransactions();
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockInboundTx.id);
      expect(result[0].amount).toBe(BigInt(mockInboundTx.amount));
      expect(mockFFI.walletGetPendingInboundTransactions).toHaveBeenCalledWith(mockWalletHandle);
    });

    test('should handle empty pending transactions list', async () => {
      mockFFI.walletGetPendingOutboundTransactions.mockResolvedValue([]);
      mockFFI.walletGetPendingInboundTransactions.mockResolvedValue([]);
      
      const outbound = await transactionService.getPendingOutboundTransactions();
      const inbound = await transactionService.getPendingInboundTransactions();
      
      expect(outbound).toEqual([]);
      expect(inbound).toEqual([]);
    });

    test('should handle pending transactions query failure', async () => {
      mockFFI.walletGetPendingOutboundTransactions.mockRejectedValue(
        new Error('Query failed')
      );
      
      await expect(
        transactionService.getPendingOutboundTransactions()
      ).rejects.toThrow('Query failed');
    });
  });

  describe('Cancel Transaction', () => {
    test('should cancel pending transaction successfully', async () => {
      const txId = 'pending_tx_to_cancel';
      mockFFI.walletCancelPendingTransaction.mockResolvedValue(true);
      
      const result = await transactionService.cancelPendingTransaction(txId);
      
      expect(result).toBe(true);
      expect(mockFFI.walletCancelPendingTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        txId
      );
    });

    test('should handle transaction not found for cancellation', async () => {
      const txId = 'non_existent_tx';
      mockFFI.walletCancelPendingTransaction.mockResolvedValue(false);
      
      const result = await transactionService.cancelPendingTransaction(txId);
      
      expect(result).toBe(false);
    });

    test('should handle cancellation failure', async () => {
      const txId = 'failing_cancel_tx';
      mockFFI.walletCancelPendingTransaction.mockRejectedValue(
        new Error('Cancellation failed')
      );
      
      await expect(
        transactionService.cancelPendingTransaction(txId)
      ).rejects.toThrow('Cancellation failed');
    });

    test('should validate transaction ID for cancellation', async () => {
      // Test empty transaction ID
      await expect(
        transactionService.cancelPendingTransaction('')
      ).rejects.toThrow('Transaction ID is required');
      
      // Test invalid format
      await expect(
        transactionService.cancelPendingTransaction('   ')
      ).rejects.toThrow('Transaction ID is required');
    });
  });

  describe('Transaction Details', () => {
    test('should get transaction details', async () => {
      const mockTx = TransactionFactory.confirmed();
      const mockTxData = {
        id: mockTx.id,
        amount: mockTx.amount.toString(),
        fee: mockTx.fee.toString(),
        status: mockTx.status,
        message: mockTx.message,
        timestamp: mockTx.timestamp.getTime(),
        is_inbound: mockTx.isInbound,
        address: mockTx.address,
        confirmations: mockTx.confirmations,
      };
      
      mockFFI.walletGetTransaction.mockResolvedValue(JSON.stringify(mockTxData));
      
      const result = await transactionService.getTransaction(mockTx.id);
      
      expect(result?.id).toBe(mockTx.id);
      expect(result?.amount).toBe(mockTx.amount);
      expect(result?.status).toBe(mockTx.status);
      expect(mockFFI.walletGetTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        mockTx.id
      );
    });

    test('should handle transaction not found', async () => {
      const txId = 'non_existent_tx';
      mockFFI.walletGetTransaction.mockResolvedValue('');
      
      const result = await transactionService.getTransaction(txId);
      
      expect(result).toBeNull();
    });

    test('should handle malformed transaction data', async () => {
      const txId = 'malformed_tx';
      mockFFI.walletGetTransaction.mockResolvedValue('invalid_json');
      
      await expect(
        transactionService.getTransaction(txId)
      ).rejects.toThrow();
    });

    test('should get transaction status', async () => {
      const txId = 'status_check_tx';
      const expectedStatus = 'mined_confirmed';
      
      mockFFI.walletGetTransactionStatus = jest.fn().mockResolvedValue(expectedStatus);
      
      const status = await transactionService.getTransactionStatus(txId);
      
      expect(status).toBe(expectedStatus);
      expect(mockFFI.walletGetTransactionStatus).toHaveBeenCalledWith(
        mockWalletHandle,
        txId
      );
    });

    test('should get transaction confirmations', async () => {
      const txId = 'confirmations_check_tx';
      const mockConfirmations = { confirmations: 5, required: 3 };
      
      mockFFI.walletGetTransactionConfirmations = jest.fn().mockResolvedValue(
        JSON.stringify(mockConfirmations)
      );
      
      const result = await transactionService.getTransactionConfirmations(txId);
      
      expect(result.confirmations).toBe(5);
      expect(result.required).toBe(3);
    });
  });

  describe('Transaction History', () => {
    test('should get transaction history with pagination', async () => {
      const mockTransactions = [
        TransactionFactory.confirmed(),
        TransactionFactory.pending(),
        TransactionFactory.cancelled(),
      ];
      
      const mockTxData = mockTransactions.map(tx => ({
        id: tx.id,
        amount: tx.amount.toString(),
        fee: tx.fee.toString(),
        status: tx.status,
        message: tx.message,
        timestamp: tx.timestamp.getTime(),
        is_inbound: tx.isInbound,
        address: tx.address,
        confirmations: tx.confirmations,
      }));
      
      mockFFI.walletGetTransactionHistory = jest.fn().mockResolvedValue(
        JSON.stringify(mockTxData)
      );
      
      const result = await transactionService.getTransactionHistory({
        limit: 10,
        offset: 0,
      });
      
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(mockTransactions[0].id);
      expect(result[1].status).toBe(mockTransactions[1].status);
      expect(result[2].amount).toBe(mockTransactions[2].amount);
    });

    test('should filter transaction history by status', async () => {
      const confirmedTx = TransactionFactory.confirmed();
      const mockTxData = [{
        id: confirmedTx.id,
        amount: confirmedTx.amount.toString(),
        fee: confirmedTx.fee.toString(),
        status: confirmedTx.status,
        message: confirmedTx.message,
        timestamp: confirmedTx.timestamp.getTime(),
        is_inbound: confirmedTx.isInbound,
        address: confirmedTx.address,
        confirmations: confirmedTx.confirmations,
      }];
      
      mockFFI.walletGetTransactionHistory = jest.fn().mockResolvedValue(
        JSON.stringify(mockTxData)
      );
      
      const result = await transactionService.getTransactionHistory({
        status: 'mined_confirmed',
        limit: 10,
        offset: 0,
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('mined_confirmed');
    });

    test('should handle empty transaction history', async () => {
      mockFFI.walletGetTransactionHistory = jest.fn().mockResolvedValue('[]');
      
      const result = await transactionService.getTransactionHistory({
        limit: 10,
        offset: 0,
      });
      
      expect(result).toEqual([]);
    });
  });

  describe('Fee Estimation', () => {
    test('should estimate transaction fee', async () => {
      const amount = 1000000000n; // 1 Tari
      const mockFeeEstimate = {
        total_value: '1005000',
        fee_estimate: '5000',
        output_count: 2,
        inputs: [],
      };
      
      mockFFI.walletPreviewUtxoSelection = jest.fn().mockResolvedValue(mockFeeEstimate);
      
      const result = await transactionService.estimateFee(amount);
      
      expect(result.feeEstimate).toBe(5000n);
      expect(result.totalValue).toBe(1005000n);
      expect(mockFFI.walletPreviewUtxoSelection).toHaveBeenCalledWith(
        mockWalletHandle,
        amount.toString(),
        undefined
      );
    });

    test('should estimate fee with custom fee per gram', async () => {
      const amount = 1000000000n;
      const feePerGram = 10000n;
      const mockFeeEstimate = {
        total_value: '1010000',
        fee_estimate: '10000',
        output_count: 2,
        inputs: [],
      };
      
      mockFFI.walletPreviewUtxoSelection = jest.fn().mockResolvedValue(mockFeeEstimate);
      
      const result = await transactionService.estimateFee(amount, feePerGram);
      
      expect(result.feeEstimate).toBe(10000n);
      expect(mockFFI.walletPreviewUtxoSelection).toHaveBeenCalledWith(
        mockWalletHandle,
        amount.toString(),
        feePerGram.toString()
      );
    });

    test('should handle fee estimation failure', async () => {
      const amount = 1000000000n;
      
      mockFFI.walletPreviewUtxoSelection = jest.fn().mockRejectedValue(
        new Error('Fee estimation failed')
      );
      
      await expect(
        transactionService.estimateFee(amount)
      ).rejects.toThrow('Fee estimation failed');
    });

    test('should get fee per gram statistics', async () => {
      const mockFeeStats = {
        min_fee_per_gram: '1000',
        avg_fee_per_gram: '5000',
        max_fee_per_gram: '50000',
      };
      
      mockFFI.walletGetFeePerGramStats = jest.fn().mockResolvedValue(mockFeeStats);
      
      const result = await transactionService.getFeePerGramStats();
      
      expect(result.minFeePerGram).toBe(1000n);
      expect(result.avgFeePerGram).toBe(5000n);
      expect(result.maxFeePerGram).toBe(50000n);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle concurrent transaction operations', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n;
      
      mockFFI.walletSendTransaction.mockImplementation((handle, addr, amt) => 
        Promise.resolve(`tx_${Date.now()}_${Math.random()}`)
      );
      
      // Send multiple transactions concurrently
      const promises = Array.from({ length: 3 }, (_, i) => 
        transactionService.sendTransaction(recipient, amount + BigInt(i * 1000000))
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(new Set(results.map(r => r.transactionId)).size).toBe(3); // All unique
    });

    test('should handle large amounts correctly', async () => {
      const recipient = AddressFactory.testnet();
      const largeAmount = 999999999999999999n; // Very large amount
      const mockTxId = 'large_amount_tx';
      
      mockFFI.walletSendTransaction.mockResolvedValue(mockTxId);
      
      const result = await transactionService.sendTransaction(recipient, largeAmount);
      
      expect(result.transactionId).toBe(mockTxId);
      expect(mockFFI.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        recipient,
        largeAmount.toString(),
        undefined
      );
    });

    test('should handle special characters in messages', async () => {
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n;
      const specialMessage = 'Test with émojis 🎯 and ünicöde châractërs!@#$%^&*()';
      const mockTxId = 'special_message_tx';
      
      mockFFI.walletSendTransaction.mockResolvedValue(mockTxId);
      
      const result = await transactionService.sendTransaction(recipient, amount, {
        message: specialMessage,
      });
      
      expect(result.transactionId).toBe(mockTxId);
      expect(mockFFI.walletSendTransaction).toHaveBeenCalledWith(
        mockWalletHandle,
        recipient,
        amount.toString(),
        expect.objectContaining({
          message: specialMessage,
        })
      );
    });

    test('should handle transaction service with invalid wallet handle', async () => {
      const invalidHandle = -1;
      const invalidService = new TransactionService(invalidHandle);
      const recipient = AddressFactory.testnet();
      const amount = 1000000000n;
      
      mockFFI.walletSendTransaction.mockRejectedValue(
        new Error('Invalid wallet handle')
      );
      
      await expect(
        invalidService.sendTransaction(recipient, amount)
      ).rejects.toThrow('Invalid wallet handle');
    });
  });
});
