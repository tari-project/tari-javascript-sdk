/**
 * Mock native bindings for testing FFI infrastructure without compilation
 * Provides deterministic test behavior for CI environments
 */

import type { NativeBindings } from '../native.js';

/**
 * Mock wallet state for testing
 */
interface MockWalletState {
  handle: number;
  config: any;
  balance: {
    available: string;
    pending_incoming: string;
    pending_outgoing: string;
    timelocked: string;
  };
  address: string;
  seedWords: string[];
  destroyed: boolean;
}

/**
 * Mock native module implementation
 */
class MockNativeBindings implements NativeBindings {
  private wallets = new Map<number, MockWalletState>();
  private nextHandle = 1;
  private shouldFail = false;
  private failureRate = 0;
  private latency = 0;

  // Logging functions
  async init_logging(level: number): Promise<void> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock logging initialization failed');
    }
    await this.simulateLatency();
  }

  // Wallet lifecycle
  async walletCreate(config: any): Promise<number> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock wallet creation failed');
    }
    await this.simulateLatency();

    const handle = this.nextHandle++;
    this.wallets.set(handle, {
      handle,
      config,
      balance: {
        available: '1000000000', // 1 Tari in µT
        pending_incoming: '0',
        pending_outgoing: '0',
        timelocked: '0',
      },
      address: `tari://testnet/mock_address_${handle}`,
      seedWords: this.generateMockSeedWords(),
      destroyed: false,
    });

    return handle;
  }

  async walletDestroy(handle: number): Promise<void> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock wallet destruction failed');
    }
    await this.simulateLatency();

    const wallet = this.wallets.get(handle);
    if (!wallet) {
      throw new Error(`Mock wallet handle ${handle} not found`);
    }

    wallet.destroyed = true;
    this.wallets.delete(handle);
  }

  // Wallet operations
  async walletGetBalance(handle: number): Promise<{
    available: string;
    pending_incoming: string;
    pending_outgoing: string;
    timelocked: string;
  }> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock balance query failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return wallet.balance;
  }

  async walletGetAddress(handle: number): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock address query failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return wallet.address;
  }

  async walletSendTransaction(
    handle: number,
    recipient: string,
    amount: string,
    options?: any
  ): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock transaction failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    
    // Validate amount
    const amountNum = parseInt(amount, 10);
    const availableNum = parseInt(wallet.balance.available, 10);
    
    if (amountNum > availableNum) {
      throw new Error('Insufficient funds');
    }

    // Update balance
    wallet.balance.available = (availableNum - amountNum).toString();
    wallet.balance.pending_outgoing = (parseInt(wallet.balance.pending_outgoing, 10) + amountNum).toString();

    return `mock_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async walletGetSeedWords(handle: number): Promise<string[]> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock seed words query failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return wallet.seedWords;
  }

  async walletSetBaseNode(handle: number, baseNode: any): Promise<void> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock base node configuration failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists
  }

  // Utility functions
  async walletGetActiveHandleCount(): Promise<number> {
    await this.simulateLatency();
    return this.wallets.size;
  }

  async walletValidateHandle(handle: number): Promise<boolean> {
    await this.simulateLatency();
    const wallet = this.wallets.get(handle);
    return wallet ? !wallet.destroyed : false;
  }

  async walletCleanupAll(): Promise<number> {
    await this.simulateLatency();
    const count = this.wallets.size;
    this.wallets.clear();
    return count;
  }

  // Address utilities
  async validateAddress(address: string, network: string): Promise<boolean> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock address validation failed');
    }
    await this.simulateLatency();

    return address.startsWith(`tari://${network}/`);
  }

  async emojiIdToAddress(emojiId: string, network: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock emoji ID conversion failed');
    }
    await this.simulateLatency();

    return `tari://${network}/converted_${emojiId.replace(/[^\w]/g, '_')}`;
  }

  async addressToEmojiId(address: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock address to emoji conversion failed');
    }
    await this.simulateLatency();

    const hash = address.split('/').pop() || 'unknown';
    return this.generateMockEmojiId(hash);
  }

  // Mock control methods (not part of NativeBindings interface)
  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setFailureRate(rate: number): void {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }

  setLatency(ms: number): void {
    this.latency = Math.max(0, ms);
  }

  getWalletCount(): number {
    return this.wallets.size;
  }

  getWalletState(handle: number): MockWalletState | undefined {
    return this.wallets.get(handle);
  }

  reset(): void {
    this.wallets.clear();
    this.nextHandle = 1;
    this.shouldFail = false;
    this.failureRate = 0;
    this.latency = 0;
  }

  // Private helper methods
  private getWallet(handle: number): MockWalletState {
    const wallet = this.wallets.get(handle);
    if (!wallet) {
      throw new Error(`Mock wallet handle ${handle} not found`);
    }
    if (wallet.destroyed) {
      throw new Error(`Mock wallet handle ${handle} has been destroyed`);
    }
    return wallet;
  }

  private shouldSimulateFailure(): boolean {
    if (this.shouldFail) {
      return true;
    }
    return Math.random() < this.failureRate;
  }

  private async simulateLatency(): Promise<void> {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }
  }

  private generateMockSeedWords(): string[] {
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    ];
    return words;
  }

  private generateMockEmojiId(seed: string): string {
    const emojis = ['🌟', '🎯', '🚀', '💎', '🔥', '⚡', '🎨', '🌈'];
    const chars = seed.split('');
    return chars.slice(0, 8).map((_, i) => emojis[i % emojis.length]).join('');
  }
}

// Global mock instance
let mockInstance: MockNativeBindings | null = null;

/**
 * Get or create mock native bindings instance
 */
export function getMockNativeBindings(): MockNativeBindings {
  if (!mockInstance) {
    mockInstance = new MockNativeBindings();
  }
  return mockInstance;
}

/**
 * Reset mock state (for testing)
 */
export function resetMockNativeBindings(): void {
  if (mockInstance) {
    mockInstance.reset();
  }
  mockInstance = null;
}

/**
 * Mock native module export (Jest will replace the actual module with this)
 */
export default getMockNativeBindings();
