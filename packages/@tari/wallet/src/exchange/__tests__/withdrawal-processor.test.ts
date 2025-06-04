import { WithdrawalProcessor } from '../withdrawal-processor';
import { TariWallet } from '../../wallet';
import { Network } from '@tari-project/core';

// Mock wallet
const mockWallet = {
  getBalance: jest.fn(() => Promise.resolve({
    available: 10000000n,
    pending: 0n,
    locked: 0n,
    total: 10000000n,
  })),
  sendTransaction: jest.fn(() => Promise.resolve({
    id: 'tx_123',
    amount: 1000000n,
    destination: 'test_address',
    status: 1,
    message: 'Withdrawal',
    timestamp: new Date(),
    isOutbound: true,
  })),
  on: jest.fn(),
  off: jest.fn(),
} as unknown as TariWallet;

describe('WithdrawalProcessor', () => {
  let processor: WithdrawalProcessor;

  beforeEach(() => {
    processor = new WithdrawalProcessor(mockWallet, {
      batchSize: 5,
      batchDelayMs: 1000,
      maxRetries: 3,
    });
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    processor.stop();
    jest.useRealTimers();
  });

  describe('addWithdrawal', () => {
    it('should add withdrawal to queue', async () => {
      const result = await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'recipient_address',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      expect(result).toMatchObject({
        requestId: 'withdrawal_1',
        status: 'pending',
        estimatedProcessingTime: expect.any(Number),
      });
    });

    it('should validate withdrawal request', async () => {
      await expect(processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: '',
        address: 'recipient_address',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      })).rejects.toThrow('User ID is required');

      await expect(processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: '',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      })).rejects.toThrow('Destination address is required');

      await expect(processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'recipient_address',
        amount: 0n,
        priority: 'normal',
        created: new Date(),
      })).rejects.toThrow('Amount must be greater than 0');
    });

    it('should prioritize high priority withdrawals', async () => {
      await processor.addWithdrawal({
        id: 'low_1',
        userId: 'user1',
        address: 'addr1',
        amount: 100000n,
        priority: 'low',
        created: new Date(),
      });

      await processor.addWithdrawal({
        id: 'high_1',
        userId: 'user2',
        address: 'addr2',
        amount: 100000n,
        priority: 'high',
        created: new Date(),
      });

      const queue = processor.getQueueStatus();
      expect(queue.pending[0].id).toBe('high_1');
      expect(queue.pending[1].id).toBe('low_1');
    });
  });

  describe('processing', () => {
    it('should process withdrawals in batches', async () => {
      // Add multiple withdrawals
      for (let i = 1; i <= 7; i++) {
        await processor.addWithdrawal({
          id: `withdrawal_${i}`,
          userId: `user${i}`,
          address: `address${i}`,
          amount: 100000n,
          priority: 'normal',
          created: new Date(),
        });
      }

      processor.start();

      // Process first batch
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockWallet.sendTransaction).toHaveBeenCalledTimes(5);

      // Process second batch
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockWallet.sendTransaction).toHaveBeenCalledTimes(7);
    });

    it('should handle processing errors', async () => {
      mockWallet.sendTransaction = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'recipient_address',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      processor.start();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const status = processor.getWithdrawalStatus('withdrawal_1');
      expect(status?.status).toBe('failed');
      expect(status?.error).toBe('Network error');
    });

    it('should retry failed withdrawals', async () => {
      mockWallet.sendTransaction = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          id: 'tx_123',
          amount: 100000n,
          destination: 'test_address',
          status: 1,
          message: 'Withdrawal',
          timestamp: new Date(),
          isOutbound: true,
        });

      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'recipient_address',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      processor.start();

      // First attempt
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Retry attempts
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(mockWallet.sendTransaction).toHaveBeenCalledTimes(3);
      
      const status = processor.getWithdrawalStatus('withdrawal_1');
      expect(status?.status).toBe('completed');
    });

    it('should emit events for withdrawal lifecycle', async () => {
      const processedHandler = jest.fn();
      const failedHandler = jest.fn();

      processor.on('withdrawal-processed', processedHandler);
      processor.on('withdrawal-failed', failedHandler);

      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'recipient_address',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      processor.start();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(processedHandler).toHaveBeenCalledWith({
        id: 'withdrawal_1',
        txId: 'tx_123',
        amount: 100000n,
        userId: 'user1',
      });
    });
  });

  describe('queue management', () => {
    it('should provide queue status', async () => {
      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'addr1',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      const status = processor.getQueueStatus();
      expect(status).toMatchObject({
        pending: expect.arrayContaining([
          expect.objectContaining({ id: 'withdrawal_1' })
        ]),
        processing: [],
        completed: [],
        failed: [],
        totalPending: 1,
        totalProcessing: 0,
        totalCompleted: 0,
        totalFailed: 0,
      });
    });

    it('should get individual withdrawal status', async () => {
      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'recipient_address',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      const status = processor.getWithdrawalStatus('withdrawal_1');
      expect(status).toMatchObject({
        id: 'withdrawal_1',
        status: 'pending',
        amount: 100000n,
        created: expect.any(Date),
        retries: 0,
      });
    });

    it('should handle non-existent withdrawal status', () => {
      const status = processor.getWithdrawalStatus('nonexistent');
      expect(status).toBeNull();
    });
  });

  describe('balance management', () => {
    it('should check sufficient balance before processing', async () => {
      mockWallet.getBalance = jest.fn(() => Promise.resolve({
        available: 50000n, // Less than withdrawal amount
        pending: 0n,
        locked: 0n,
        total: 50000n,
      }));

      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'recipient_address',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      processor.start();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const status = processor.getWithdrawalStatus('withdrawal_1');
      expect(status?.status).toBe('failed');
      expect(status?.error).toContain('Insufficient balance');
    });

    it('should reserve balance for pending withdrawals', async () => {
      // Add withdrawals totaling more than available balance
      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'addr1',
        amount: 6000000n,
        priority: 'normal',
        created: new Date(),
      });

      await processor.addWithdrawal({
        id: 'withdrawal_2',
        userId: 'user2',
        address: 'addr2',
        amount: 6000000n,
        priority: 'normal',
        created: new Date(),
      });

      processor.start();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Only one should be processed due to balance constraints
      expect(mockWallet.sendTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle', () => {
    it('should start and stop processing', () => {
      expect(processor.isRunning()).toBe(false);
      
      processor.start();
      expect(processor.isRunning()).toBe(true);
      
      processor.stop();
      expect(processor.isRunning()).toBe(false);
    });

    it('should clean up on stop', async () => {
      processor.start();
      await processor.addWithdrawal({
        id: 'withdrawal_1',
        userId: 'user1',
        address: 'addr1',
        amount: 100000n,
        priority: 'normal',
        created: new Date(),
      });

      processor.stop();

      // Should not process after stop
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockWallet.sendTransaction).not.toHaveBeenCalled();
    });
  });
});
