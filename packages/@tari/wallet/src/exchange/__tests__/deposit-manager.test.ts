import { TariWallet } from '../../wallet';
import { DepositManager } from '../deposit-manager';

// Mock wallet
const mockWallet = {
  getReceiveAddress: jest.fn(() => '🎉🎨🎭🎪🎯🎲🎸🎺'),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
} as unknown as TariWallet;

describe('DepositManager', () => {
  let manager: DepositManager;

  beforeEach(() => {
    manager = new DepositManager(mockWallet);
    manager.initialize();
    jest.clearAllMocks();
  });

  afterEach(() => {
    manager.teardown();
  });

  describe('generateAddress', () => {
    it('should generate address for user', async () => {
      const address = await manager.generateAddress('user123');

      expect(address).toBe('🎉🎨🎭🎪🎯🎲🎸🎺');
      expect(mockWallet.getReceiveAddress).toHaveBeenCalled();
    });

    it('should store user mapping', async () => {
      await manager.generateAddress('user123');
      
      const deposit = manager.getAddress('user123');
      
      expect(deposit).toMatchObject({
        userId: 'user123',
        address: '🎉🎨🎭🎪🎯🎲🎸🎺',
        created: expect.any(Date),
        totalReceived: 0n,
      });
    });

    it('should track multiple users', async () => {
      await manager.generateAddress('user1');
      await manager.generateAddress('user2');
      
      const addresses = manager.getAllAddresses();
      
      expect(addresses).toHaveLength(2);
      expect(addresses[0].userId).toBe('user1');
      expect(addresses[1].userId).toBe('user2');
    });

    it('should return same address for same user', async () => {
      const addr1 = await manager.generateAddress('user123');
      const addr2 = await manager.generateAddress('user123');
      
      expect(addr1).toBe(addr2);
      expect(mockWallet.getReceiveAddress).toHaveBeenCalledTimes(1);
    });

    it('should handle user ID validation', async () => {
      await expect(manager.generateAddress('')).rejects.toThrow('User ID is required');
      await expect(manager.generateAddress('   ')).rejects.toThrow('User ID is required');
    });
  });

  describe('deposit handling', () => {
    it('should register wallet event listeners after initialization', () => {
      expect(mockWallet.on).toHaveBeenCalledWith(
        'transaction-received',
        expect.any(Function)
      );
      expect(mockWallet.on).toHaveBeenCalledWith(
        'transaction-confirmed',
        expect.any(Function)
      );
    });

    it('should emit deposit event for incoming transaction', async () => {
      await manager.generateAddress('user123');
      
      const depositHandler = jest.fn();
      manager.on('deposit', depositHandler);

      // Simulate incoming transaction
      const txHandler = (mockWallet.on as jest.Mock).mock.calls[0][1];
      txHandler({
        destination: '🎉🎨🎭🎪🎯🎲🎸🎺',
        amount: 1000000n,
        id: 'tx_123',
        confirmations: 0,
      });

      expect(depositHandler).toHaveBeenCalledWith({
        userId: 'user123',
        address: '🎉🎨🎭🎪🎯🎲🎸🎺',
        amount: 1000000n,
        txId: 'tx_123',
        confirmations: 0,
      });
    });

    it('should update total received', async () => {
      await manager.generateAddress('user123');

      // Simulate multiple deposits
      const txHandler = (mockWallet.on as jest.Mock).mock.calls[0][1];
      txHandler({ 
        destination: '🎉🎨🎭🎪🎯🎲🎸🎺', 
        amount: 1000000n,
        id: 'tx_1',
        confirmations: 1,
      });
      txHandler({ 
        destination: '🎉🎨🎭🎪🎯🎲🎸🎺', 
        amount: 500000n,
        id: 'tx_2',
        confirmations: 1,
      });

      const deposit = manager.getAddress('user123');
      expect(deposit?.totalReceived).toBe(1500000n);
    });

    it('should ignore transactions to unknown addresses', async () => {
      const depositHandler = jest.fn();
      manager.on('deposit', depositHandler);

      const txHandler = (mockWallet.on as jest.Mock).mock.calls[0][1];
      txHandler({
        destination: 'unknown_address',
        amount: 1000000n,
        id: 'tx_123',
        confirmations: 0,
      });

      expect(depositHandler).not.toHaveBeenCalled();
    });

    it('should emit confirmation event', async () => {
      await manager.generateAddress('user123');
      
      const confirmHandler = jest.fn();
      manager.on('confirmed', confirmHandler);

      // Simulate confirmation
      const confirmationHandler = (mockWallet.on as jest.Mock).mock.calls[1][1];
      confirmationHandler({
        destination: '🎉🎨🎭🎪🎯🎲🎸🎺',
        amount: 1000000n,
        id: 'tx_123',
        confirmations: 6,
      });

      expect(confirmHandler).toHaveBeenCalledWith({
        userId: 'user123',
        address: '🎉🎨🎭🎪🎯🎲🎸🎺',
        amount: 1000000n,
        txId: 'tx_123',
        confirmations: 6,
      });
    });
  });

  describe('statistics', () => {
    it('should provide deposit statistics', async () => {
      await manager.generateAddress('user1');
      await manager.generateAddress('user2');

      // Simulate deposits
      const txHandler = (mockWallet.on as jest.Mock).mock.calls[0][1];
      txHandler({ 
        destination: '🎉🎨🎭🎪🎯🎲🎸🎺', 
        amount: 1000000n,
        id: 'tx_1',
      });
      txHandler({ 
        destination: '🎉🎨🎭🎪🎯🎲🎸🎺', 
        amount: 2000000n,
        id: 'tx_2',
      });

      const stats = manager.getStatistics();
      expect(stats).toMatchObject({
        totalUsers: 2,
        totalDeposits: 2,
        totalVolume: 3000000n,
        averageDeposit: 1500000n,
      });
    });

    it('should handle empty statistics', () => {
      const stats = manager.getStatistics();
      expect(stats).toMatchObject({
        totalUsers: 0,
        totalDeposits: 0,
        totalVolume: 0n,
        averageDeposit: 0n,
      });
    });
  });

  describe('lifecycle management', () => {
    it('should clean up event listeners with teardown', () => {
      manager.teardown();
      
      expect(mockWallet.off).toHaveBeenCalledWith(
        'transaction-received',
        expect.any(Function)
      );
      expect(mockWallet.off).toHaveBeenCalledWith(
        'transaction-confirmed',
        expect.any(Function)
      );
    });

    it('should clean up event listeners with legacy destroy method', () => {
      // Reset mocks to track only this call
      jest.clearAllMocks();
      
      manager.destroy();
      
      expect(mockWallet.off).toHaveBeenCalledWith(
        'transaction-received',
        expect.any(Function)
      );
      expect(mockWallet.off).toHaveBeenCalledWith(
        'transaction-confirmed',
        expect.any(Function)
      );
    });

    it('should allow multiple initialize/teardown cycles', () => {
      manager.teardown();
      jest.clearAllMocks();
      
      manager.initialize();
      
      expect(mockWallet.on).toHaveBeenCalledWith(
        'transaction-received',
        expect.any(Function)
      );
      expect(mockWallet.on).toHaveBeenCalledWith(
        'transaction-confirmed',
        expect.any(Function)
      );
    });
  });

  describe('idempotent behavior', () => {
    it('should be safe to call initialize() multiple times', () => {
      // Reset and start fresh
      manager.teardown();
      jest.clearAllMocks();
      
      // Call initialize multiple times
      manager.initialize();
      manager.initialize();
      manager.initialize();
      
      // Should only set up listeners once
      expect(mockWallet.on).toHaveBeenCalledTimes(2); // 2 event types
    });

    it('should be safe to call teardown() before initialize()', () => {
      // Create fresh manager that hasn't been initialized
      const freshManager = new DepositManager(mockWallet);
      
      // Should not throw when called before initialize
      expect(() => freshManager.teardown()).not.toThrow();
    });

    it('should be safe to call teardown() multiple times', () => {
      jest.clearAllMocks();
      
      // Call teardown multiple times
      manager.teardown();
      manager.teardown();
      manager.teardown();
      
      // Should only clean up once
      expect(mockWallet.off).toHaveBeenCalledTimes(2); // 2 event types
    });

    it('should handle initialize() after teardown() correctly', () => {
      // Teardown first
      manager.teardown();
      jest.clearAllMocks();
      
      // Then initialize again
      manager.initialize();
      
      // Should set up listeners again
      expect(mockWallet.on).toHaveBeenCalledWith(
        'transaction-received',
        expect.any(Function)
      );
      expect(mockWallet.on).toHaveBeenCalledWith(
        'transaction-confirmed',
        expect.any(Function)
      );
    });

    it('should not double-register listeners on multiple initialize() calls', () => {
      jest.clearAllMocks();
      
      // Call initialize when already initialized
      manager.initialize();
      
      // Should not add more listeners
      expect(mockWallet.on).not.toHaveBeenCalled();
    });
  });
});
