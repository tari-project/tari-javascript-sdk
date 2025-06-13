/**
 * Unit tests for balance operations using mocked FFI
 */

import { BalanceService } from '../balance-service';
import { BalanceFactory } from '../../testing/factories';
import { BalanceBuilder } from '../../testing/builders';
import { getMockNativeBindings } from '../../../../core/src/ffi/__mocks__/native';

// Mock the FFI module
jest.mock('../../../../core/src/ffi/native', () => {
  return getMockNativeBindings();
});

describe('BalanceService Unit Tests', () => {
  let mockFFI: any;
  let balanceService: BalanceService;
  const mockWalletHandle = 1;

  beforeEach(() => {
    mockFFI = getMockNativeBindings();
    mockFFI.reset();
    
    balanceService = new BalanceService(mockWalletHandle);
    
    // Set up default mocks
    mockFFI.walletGetBalance = jest.fn().mockResolvedValue({
      available: '1000000000',
      pending_incoming: '0',
      pending_outgoing: '0',
      timelocked: '0',
    });
  });

  afterEach(() => {
    mockFFI.reset();
    jest.clearAllMocks();
  });

  describe('Get Balance', () => {
    test('should get current balance', async () => {
      const mockBalance = BalanceFactory.create();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: mockBalance.available.toString(),
        pending_incoming: mockBalance.pendingIncoming.toString(),
        pending_outgoing: mockBalance.pendingOutgoing.toString(),
        timelocked: mockBalance.timelocked.toString(),
      });
      
      const result = await balanceService.getBalance();
      
      expect(result.available).toBe(mockBalance.available);
      expect(result.pendingIncoming).toBe(mockBalance.pendingIncoming);
      expect(result.pendingOutgoing).toBe(mockBalance.pendingOutgoing);
      expect(result.timelocked).toBe(mockBalance.timelocked);
      expect(mockFFI.walletGetBalance).toHaveBeenCalledWith(mockWalletHandle);
    });

    test('should handle empty balance', async () => {
      const emptyBalance = BalanceFactory.empty();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: emptyBalance.available.toString(),
        pending_incoming: emptyBalance.pendingIncoming.toString(),
        pending_outgoing: emptyBalance.pendingOutgoing.toString(),
        timelocked: emptyBalance.timelocked.toString(),
      });
      
      const result = await balanceService.getBalance();
      
      expect(result.available).toBe(0n);
      expect(result.pendingIncoming).toBe(0n);
      expect(result.pendingOutgoing).toBe(0n);
      expect(result.timelocked).toBe(0n);
    });

    test('should handle large balance values', async () => {
      const largeBalance = BalanceFactory.rich();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: largeBalance.available.toString(),
        pending_incoming: largeBalance.pendingIncoming.toString(),
        pending_outgoing: largeBalance.pendingOutgoing.toString(),
        timelocked: largeBalance.timelocked.toString(),
      });
      
      const result = await balanceService.getBalance();
      
      expect(result.available).toBe(100000000000n); // 100 Tari
      expect(result.pendingIncoming).toBe(5000000000n); // 5 Tari
      expect(result.pendingOutgoing).toBe(2000000000n); // 2 Tari
      expect(result.timelocked).toBe(1000000000n); // 1 Tari
    });

    test('should handle balance query failure', async () => {
      mockFFI.walletGetBalance.mockRejectedValue(new Error('Balance query failed'));
      
      await expect(balanceService.getBalance()).rejects.toThrow('Balance query failed');
    });

    test('should handle invalid balance format from FFI', async () => {
      mockFFI.walletGetBalance.mockResolvedValue({
        available: 'invalid_number',
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      await expect(balanceService.getBalance()).rejects.toThrow();
    });

    test('should handle missing balance fields from FFI', async () => {
      mockFFI.walletGetBalance.mockResolvedValue({
        available: '1000000000',
        // Missing other fields
      });
      
      const result = await balanceService.getBalance();
      
      // Should handle missing fields gracefully
      expect(result.available).toBe(1000000000n);
      expect(result.pendingIncoming).toBe(0n); // Should default to 0
      expect(result.pendingOutgoing).toBe(0n);
      expect(result.timelocked).toBe(0n);
    });
  });

  describe('Balance Calculations', () => {
    test('should calculate total balance', async () => {
      const balance = BalanceBuilder.create()
        .available(5000000000n) // 5 Tari
        .pendingIncoming(1000000000n) // 1 Tari
        .pendingOutgoing(500000000n) // 0.5 Tari
        .timelocked(2000000000n) // 2 Tari
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: balance.pendingIncoming.toString(),
        pending_outgoing: balance.pendingOutgoing.toString(),
        timelocked: balance.timelocked.toString(),
      });
      
      const result = await balanceService.getTotalBalance();
      
      // Total = available + pending_incoming + timelocked (pending_outgoing is subtracted from available)
      const expectedTotal = 5000000000n + 1000000000n + 2000000000n; // 8 Tari
      expect(result).toBe(expectedTotal);
    });

    test('should calculate spendable balance', async () => {
      const balance = BalanceBuilder.create()
        .available(5000000000n) // 5 Tari
        .pendingIncoming(1000000000n) // 1 Tari (not spendable yet)
        .pendingOutgoing(500000000n) // 0.5 Tari (already committed)
        .timelocked(2000000000n) // 2 Tari (not spendable yet)
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: balance.pendingIncoming.toString(),
        pending_outgoing: balance.pendingOutgoing.toString(),
        timelocked: balance.timelocked.toString(),
      });
      
      const result = await balanceService.getSpendableBalance();
      
      // Spendable = available only
      expect(result).toBe(5000000000n);
    });

    test('should check if amount is spendable', async () => {
      const balance = BalanceBuilder.create()
        .available(1000000000n) // 1 Tari
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      // Test amounts that can be spent
      expect(await balanceService.canSpendAmount(500000000n)).toBe(true); // 0.5 Tari
      expect(await balanceService.canSpendAmount(1000000000n)).toBe(true); // 1 Tari (exact)
      
      // Test amounts that cannot be spent
      expect(await balanceService.canSpendAmount(1500000000n)).toBe(false); // 1.5 Tari
      expect(await balanceService.canSpendAmount(2000000000n)).toBe(false); // 2 Tari
    });

    test('should check if amount is spendable including fee', async () => {
      const balance = BalanceBuilder.create()
        .available(1005000n) // Just enough for 1000000 + 5000 fee
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const amount = 1000000n;
      const fee = 5000n;
      
      expect(await balanceService.canSpendAmountWithFee(amount, fee)).toBe(true);
      
      // Test with insufficient balance for fee
      const higherFee = 6000n;
      expect(await balanceService.canSpendAmountWithFee(amount, higherFee)).toBe(false);
    });

    test('should handle zero amount checks', async () => {
      const balance = BalanceBuilder.create().available(1000000000n).build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      expect(await balanceService.canSpendAmount(0n)).toBe(true);
      expect(await balanceService.canSpendAmountWithFee(0n, 0n)).toBe(true);
    });

    test('should handle negative amount checks', async () => {
      const balance = BalanceBuilder.create().available(1000000000n).build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      await expect(balanceService.canSpendAmount(-1000000n)).rejects.toThrow(
        'Amount cannot be negative'
      );
      
      await expect(balanceService.canSpendAmountWithFee(1000000n, -5000n)).rejects.toThrow(
        'Fee cannot be negative'
      );
    });
  });

  describe('Balance Monitoring', () => {
    test('should get balance breakdown', async () => {
      const balance = BalanceBuilder.create()
        .available(5000000000n)
        .pendingIncoming(1000000000n)
        .pendingOutgoing(500000000n)
        .timelocked(2000000000n)
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: balance.pendingIncoming.toString(),
        pending_outgoing: balance.pendingOutgoing.toString(),
        timelocked: balance.timelocked.toString(),
      });
      
      const result = await balanceService.getBalanceBreakdown();
      
      expect(result.available).toBe(5000000000n);
      expect(result.pendingIncoming).toBe(1000000000n);
      expect(result.pendingOutgoing).toBe(500000000n);
      expect(result.timelocked).toBe(2000000000n);
      expect(result.total).toBe(8000000000n); // available + pending_incoming + timelocked
      expect(result.spendable).toBe(5000000000n); // available only
    });

    test('should detect balance changes', async () => {
      // Initial balance
      const initialBalance = BalanceBuilder.create().available(1000000000n).build();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: initialBalance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const firstBalance = await balanceService.getBalance();
      
      // Updated balance
      const updatedBalance = BalanceBuilder.create().available(2000000000n).build();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: updatedBalance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const secondBalance = await balanceService.getBalance();
      const hasChanged = await balanceService.hasBalanceChanged(firstBalance, secondBalance);
      
      expect(hasChanged).toBe(true);
    });

    test('should detect no balance changes', async () => {
      const balance = BalanceBuilder.create().available(1000000000n).build();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const firstBalance = await balanceService.getBalance();
      const secondBalance = await balanceService.getBalance();
      const hasChanged = await balanceService.hasBalanceChanged(firstBalance, secondBalance);
      
      expect(hasChanged).toBe(false);
    });

    test('should calculate balance difference', async () => {
      const oldBalance = BalanceBuilder.create().available(1000000000n).build();
      const newBalance = BalanceBuilder.create().available(1500000000n).build();
      
      const difference = await balanceService.calculateBalanceDifference(oldBalance, newBalance);
      
      expect(difference.available).toBe(500000000n);
      expect(difference.pendingIncoming).toBe(0n);
      expect(difference.pendingOutgoing).toBe(0n);
      expect(difference.timelocked).toBe(0n);
    });

    test('should handle negative balance difference', async () => {
      const oldBalance = BalanceBuilder.create().available(2000000000n).build();
      const newBalance = BalanceBuilder.create().available(1000000000n).build();
      
      const difference = await balanceService.calculateBalanceDifference(oldBalance, newBalance);
      
      expect(difference.available).toBe(-1000000000n);
    });
  });

  describe('Balance Validation', () => {
    test('should validate sufficient balance for transaction', async () => {
      const balance = BalanceBuilder.create()
        .available(10000000000n) // 10 Tari
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const isValid = await balanceService.validateSufficientBalance(
        5000000000n, // 5 Tari
        25000n // 0.025 Tari fee
      );
      
      expect(isValid).toBe(true);
    });

    test('should detect insufficient balance for transaction', async () => {
      const balance = BalanceBuilder.create()
        .available(1000000n) // 0.001 Tari
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const isValid = await balanceService.validateSufficientBalance(
        5000000000n, // 5 Tari
        25000n // 0.025 Tari fee
      );
      
      expect(isValid).toBe(false);
    });

    test('should validate exact balance match', async () => {
      const amount = 1000000n;
      const fee = 5000n;
      const total = amount + fee; // 1005000n
      
      const balance = BalanceBuilder.create().available(total).build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const isValid = await balanceService.validateSufficientBalance(amount, fee);
      
      expect(isValid).toBe(true);
    });

    test('should handle edge case with 1 µT difference', async () => {
      const amount = 1000000n;
      const fee = 5000n;
      const total = amount + fee - 1n; // One µT less than needed
      
      const balance = BalanceBuilder.create().available(total).build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const isValid = await balanceService.validateSufficientBalance(amount, fee);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle concurrent balance queries', async () => {
      const balance = BalanceFactory.create();
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: balance.pendingIncoming.toString(),
        pending_outgoing: balance.pendingOutgoing.toString(),
        timelocked: balance.timelocked.toString(),
      });
      
      // Multiple concurrent balance queries
      const promises = Array.from({ length: 5 }, () => balanceService.getBalance());
      const results = await Promise.all(promises);
      
      // All should return the same balance
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.available).toBe(balance.available);
      });
    });

    test('should handle balance service with invalid wallet handle', async () => {
      const invalidHandle = -1;
      const invalidService = new BalanceService(invalidHandle);
      
      mockFFI.walletGetBalance.mockRejectedValue(new Error('Invalid wallet handle'));
      
      await expect(invalidService.getBalance()).rejects.toThrow('Invalid wallet handle');
    });

    test('should handle very large balance values', async () => {
      const maxBigInt = BigInt('999999999999999999999999999999'); // Very large number
      const balance = BalanceBuilder.create().available(maxBigInt).build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: balance.available.toString(),
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      const result = await balanceService.getBalance();
      
      expect(result.available).toBe(maxBigInt);
    });

    test('should handle balance overflow scenarios', async () => {
      // Test potential overflow in calculations
      const nearMaxBalance = BalanceBuilder.create()
        .available(BigInt('18446744073709551615')) // Near max uint64
        .pendingIncoming(BigInt('1000000000'))
        .build();
      
      mockFFI.walletGetBalance.mockResolvedValue({
        available: nearMaxBalance.available.toString(),
        pending_incoming: nearMaxBalance.pendingIncoming.toString(),
        pending_outgoing: '0',
        timelocked: '0',
      });
      
      // Should handle large numbers without overflow
      const result = await balanceService.getTotalBalance();
      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThan(nearMaxBalance.available);
    });

    test('should handle network timeouts gracefully', async () => {
      // Mock timeout scenario
      mockFFI.walletGetBalance.mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), 100)
        )
      );
      
      await expect(balanceService.getBalance()).rejects.toThrow('Operation timeout');
    });
  });
});
