/**
 * Mock native bindings for testing FFI infrastructure without compilation
 * Provides deterministic test behavior for CI environments
 */

import type { NativeBindings } from '../native';

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
  eventCallback?: (payload: string) => void;
  transactionMemos: Map<string, string>;
  transactions: Array<{
    id: string;
    amount: string;
    fee: string;
    status: string;
    message: string;
    timestamp: number;
    is_inbound: boolean;
    address: string;
  }>;
  pendingInbound: Array<{
    id: string;
    amount: string;
    message: string;
    timestamp: number;
    sender_address: string;
  }>;
  pendingOutbound: Array<{
    id: string;
    amount: string;
    fee: string;
    message: string;
    timestamp: number;
    recipient_address: string;
  }>;
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
      address: this.generateMockAddress(handle),
      seedWords: this.generateMockSeedWords(),
      destroyed: false,
      transactionMemos: new Map(),
      transactions: [],
      pendingInbound: [],
      pendingOutbound: [],
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

  // Event callbacks (Phase 8) - Mock implementations
  async walletSetEventCallback(handle: number, callback: (payload: string) => void): Promise<void> {
    await this.simulateLatency();
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock: Failed to set event callback');
    }

    const wallet = this.getWallet(handle);
    wallet.eventCallback = callback;
    
    // Simulate a test event
    setTimeout(() => {
      if (wallet.eventCallback) {
        const testEvent = {
          event_type: 'test:event',
          wallet_handle: handle,
          data: { message: 'Mock test event' },
          timestamp: Date.now()
        };
        wallet.eventCallback(JSON.stringify(testEvent));
      }
    }, 100);
  }

  async walletRemoveEventCallback(handle: number): Promise<void> {
    await this.simulateLatency();
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock: Failed to remove event callback');
    }

    const wallet = this.getWallet(handle);
    wallet.eventCallback = undefined;
  }

  async getCallbackStats(): Promise<{ registeredWallets: number; activeCallbacks: number }> {
    await this.simulateLatency();
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock: Failed to get callback stats');
    }

    const registeredWallets = Array.from(this.wallets.values()).filter(w => w.eventCallback).length;
    return {
      registeredWallets,
      activeCallbacks: registeredWallets
    };
  }

  async cleanupAllCallbacks(): Promise<void> {
    await this.simulateLatency();
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock: Failed to cleanup callbacks');
    }

    for (const wallet of this.wallets.values()) {
      wallet.eventCallback = undefined;
    }
  }

  async emojiIdToPublicKey(emojiId: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock emoji ID to public key conversion failed');
    }
    await this.simulateLatency();

    // Generate mock public key from emoji ID
    const hash = emojiId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `mock_public_key_${hash.toString(16).padStart(8, '0')}`;
  }

  async walletPreviewUtxoSelection(
    handle: number,
    amount: string,
    feePerGram?: string
  ): Promise<{
    total_value: string;
    fee_estimate: string;
    output_count: number;
    inputs: any[];
  }> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock UTXO selection failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    const amountNum = BigInt(amount);
    const feeGram = feePerGram ? BigInt(feePerGram) : 5000n; // Default fee
    const estimatedFee = feeGram * 250n; // Estimate ~250 bytes

    return {
      total_value: (amountNum + estimatedFee).toString(),
      fee_estimate: estimatedFee.toString(),
      output_count: 2, // Change + recipient
      inputs: [
        {
          commitment: '0x' + '00'.repeat(32),
          value: amountNum.toString(),
          script: 'mock_script',
          features: { output_type: 'Standard' }
        }
      ]
    };
  }

  async walletValidateScript(
    handle: number,
    recipientAddress: string
  ): Promise<{
    is_valid: boolean;
    errors: string[];
  }> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock script validation failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    // Mock validation - valid if address starts with 'tari://'
    const isValid = recipientAddress.startsWith('tari://');
    
    return {
      is_valid: isValid,
      errors: isValid ? [] : ['Invalid Tari address format']
    };
  }

  async walletGetNetworkInfo(handle: number): Promise<{
    network: string;
    min_confirmations: number;
    max_fee_per_gram: string;
    tip_height: number;
  }> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock network info retrieval failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    return {
      network: 'testnet',
      min_confirmations: 3,
      max_fee_per_gram: '50000', // 50,000 µT per gram
      tip_height: Math.floor(Math.random() * 100000) + 500000 // Mock height
    };
  }

  async walletGetTransactionStatus(handle: number, transactionId: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock transaction status retrieval failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    // Mock transaction status
    const statuses = ['pending', 'broadcast', 'mined_unconfirmed', 'mined_confirmed', 'cancelled'];
    return statuses[Math.floor(Math.random() * statuses.length)];
  }

  async walletGetPendingInboundTransactions(handle: number): Promise<any[]> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock pending inbound transactions retrieval failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    // Mock pending inbound transactions
    return [
      {
        id: 'mock_pending_in_1',
        amount: '1000000',
        fee: '5000',
        sender_public_key: 'mock_sender_key',
        message: 'Mock inbound transaction',
        timestamp: Date.now() - 60000,
        status: 'pending'
      }
    ];
  }

  async walletGetPendingOutboundTransactions(handle: number): Promise<any[]> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock pending outbound transactions retrieval failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    // Mock pending outbound transactions
    return [
      {
        id: 'mock_pending_out_1',
        amount: '500000',
        fee: '3000',
        recipient_address: 'mock_recipient_address',
        message: 'Mock outbound transaction',
        timestamp: Date.now() - 30000,
        status: 'pending'
      }
    ];
  }

  async walletGetFeePerGramStats(handle: number): Promise<{
    min_fee_per_gram: string;
    avg_fee_per_gram: string;
    max_fee_per_gram: string;
  }> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock fee stats retrieval failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    return {
      min_fee_per_gram: '1000',
      avg_fee_per_gram: '5000',
      max_fee_per_gram: '50000'
    };
  }

  async walletGenerateStealthAddress(handle: number, recipientAddress: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock stealth address generation failed');
    }
    await this.simulateLatency();

    this.getWallet(handle); // Validate handle exists

    // Generate mock stealth address
    const hash = recipientAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `stealth_${hash.toString(16).padStart(8, '0')}_mock`;
  }

  // Transaction memo operations
  async walletSetTransactionMemo(handle: number, transactionId: string, memo: string): Promise<void> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock set transaction memo failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    wallet.transactionMemos.set(transactionId, memo);
  }

  async walletGetTransactionMemo(handle: number, transactionId: string): Promise<string | null> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get transaction memo failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return wallet.transactionMemos.get(transactionId) || null;
  }

  async walletDeleteTransactionMemo(handle: number, transactionId: string): Promise<void> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock delete transaction memo failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    wallet.transactionMemos.delete(transactionId);
  }

  async walletClearTransactionMemos(handle: number): Promise<void> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock clear transaction memos failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    wallet.transactionMemos.clear();
  }

  async walletGetAllTransactionMemos(handle: number): Promise<Record<string, string>> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get all transaction memos failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return Object.fromEntries(wallet.transactionMemos.entries());
  }

  // Additional transaction operations
  async walletGetTransaction(handle: number, transactionId: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get transaction failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    const tx = wallet.transactions.find(t => t.id === transactionId);
    return tx ? JSON.stringify(tx) : '';
  }

  async walletGetPendingOutboundTransaction(handle: number, transactionId: string): Promise<string | null> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get pending outbound transaction failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    const tx = wallet.pendingOutbound.find(t => t.id === transactionId);
    return tx ? JSON.stringify(tx) : null;
  }

  async walletCancelPendingTransaction(handle: number, transactionId: string): Promise<boolean> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock cancel pending transaction failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    const index = wallet.pendingOutbound.findIndex(t => t.id === transactionId);
    if (index !== -1) {
      wallet.pendingOutbound.splice(index, 1);
      return true;
    }
    return false;
  }

  async walletGetTransactionConfirmations(handle: number, transactionId: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get transaction confirmations failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return JSON.stringify({ confirmations: 3, required: 1 });
  }

  async walletGetBlockchainHeight(handle: number): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get blockchain height failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return JSON.stringify({ height: 12345 });
  }

  async walletGetTransactionInputs(handle: number, transactionId: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get transaction inputs failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return JSON.stringify([]);
  }

  async walletGetTransactionOutputs(handle: number, transactionId: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get transaction outputs failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return JSON.stringify([]);
  }

  async walletGetTransactionKernels(handle: number, transactionId: string): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get transaction kernels failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return JSON.stringify([]);
  }

  async walletGetBlockInfo(handle: number, blockHeight: number): Promise<string> {
    if (this.shouldSimulateFailure()) {
      throw new Error('Mock get block info failed');
    }
    await this.simulateLatency();

    const wallet = this.getWallet(handle);
    return JSON.stringify({ height: blockHeight, hash: 'mock_hash' });
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

  private generateMockAddress(handle: number): string {
    // Generate a valid hex address format for testing
    // Use handle number to create predictable but valid hex addresses
    const baseHex = handle.toString(16).padStart(2, '0');
    // Create a 64-character hex string (32 bytes) which is a valid Tari address format
    const fullHex = baseHex.repeat(32).substring(0, 64);
    return fullHex;
  }

  private generateMockSeedWords(): string[] {
    // Generate valid BIP39 test seed words (this is a valid 24-word BIP39 mnemonic for testing)
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual'
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
const mockBindings = getMockNativeBindings();

// Export individual functions for compatibility with CommonJS require()
Object.assign(module.exports, mockBindings);

// Also assign utility functions
module.exports.getMockNativeBindings = getMockNativeBindings;
module.exports.resetMockNativeBindings = resetMockNativeBindings;

// Also export as ES module default for compatibility
export default mockBindings;
