/**
 * Centralized FFI mocks to avoid circular dependencies
 * Used by Jest unit tests via moduleNameMapper
 */

export interface MockWalletState {
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
}

/**
 * Simple mock FFI bindings that Jest can substitute
 * No imports from actual modules to avoid circular dependencies
 */
class MockFFIBindings {
  private wallets = new Map<number, MockWalletState>();
  private nextHandle = 1;
  private shouldFail = false;
  private latency = 0;

  // Mock lifecycle
  async init_logging(level?: number): Promise<void> {
    if (this.shouldFail) throw new Error('Mock logging failed');
    await this.delay();
  }

  async walletCreate(config: any): Promise<number> {
    if (this.shouldFail) throw new Error('Mock wallet creation failed');
    await this.delay();

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
      seedWords: ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual'],
      destroyed: false,
      transactionMemos: new Map(),
    });

    return handle;
  }

  async walletDestroy(handle: number): Promise<void> {
    if (this.shouldFail) throw new Error('Mock wallet destruction failed');
    await this.delay();

    const wallet = this.wallets.get(handle);
    if (!wallet) throw new Error(`Mock wallet handle ${handle} not found`);
    wallet.destroyed = true;
    this.wallets.delete(handle);
  }

  async walletGetBalance(handle: number): Promise<{
    available: string;
    pending_incoming: string;
    pending_outgoing: string;
    timelocked: string;
  }> {
    if (this.shouldFail) throw new Error('Mock balance query failed');
    await this.delay();

    const wallet = this.getWallet(handle);
    return wallet.balance;
  }

  async walletGetAddress(handle: number): Promise<string> {
    if (this.shouldFail) throw new Error('Mock address query failed');
    await this.delay();

    const wallet = this.getWallet(handle);
    return wallet.address;
  }

  async walletSendTransaction(
    handle: number,
    recipient: string,
    amount: string,
    options?: any
  ): Promise<string> {
    if (this.shouldFail) throw new Error('Mock transaction failed');
    await this.delay();

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
    if (this.shouldFail) throw new Error('Mock seed words query failed');
    await this.delay();

    const wallet = this.getWallet(handle);
    return wallet.seedWords;
  }

  async walletSetBaseNode(handle: number, baseNode: any): Promise<void> {
    if (this.shouldFail) throw new Error('Mock base node configuration failed');
    await this.delay();
    this.getWallet(handle); // Validate handle exists
  }

  // Address utilities
  async validateAddress(address: string, network: string): Promise<boolean> {
    if (this.shouldFail) throw new Error('Mock address validation failed');
    await this.delay();
    return address.startsWith(`tari://${network}/`);
  }

  async emojiIdToAddress(emojiId: string, network: string): Promise<string> {
    if (this.shouldFail) throw new Error('Mock emoji ID conversion failed');
    await this.delay();
    return `tari://${network}/converted_${emojiId.replace(/[^\w]/g, '_')}`;
  }

  async addressToEmojiId(address: string): Promise<string> {
    if (this.shouldFail) throw new Error('Mock address to emoji conversion failed');
    await this.delay();
    return '🌟🎯🚀💎🔥⚡🎨🌈';
  }

  // Additional FFI methods that might be called
  async walletGetActiveHandleCount(): Promise<number> {
    await this.delay();
    return this.wallets.size;
  }

  async walletValidateHandle(handle: number): Promise<boolean> {
    await this.delay();
    const wallet = this.wallets.get(handle);
    return wallet ? !wallet.destroyed : false;
  }

  async walletCleanupAll(): Promise<number> {
    await this.delay();
    const count = this.wallets.size;
    this.wallets.clear();
    return count;
  }

  async emojiIdToPublicKey(emojiId: string): Promise<string> {
    if (this.shouldFail) throw new Error('Mock emoji ID to public key conversion failed');
    await this.delay();
    const hash = emojiId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `mock_public_key_${hash.toString(16).padStart(8, '0')}`;
  }

  // FFI call methods that are referenced in tests
  async wallet_get_transaction(handle: number, transactionId: string): Promise<string> {
    await this.delay();
    this.getWallet(handle);
    return JSON.stringify({
      id: transactionId,
      amount: 1000000n,
      fee: 5000n,
      status: 'pending',
      message: 'Mock transaction',
      timestamp: Date.now(),
      is_inbound: false,
      address: 'mock_address'
    }, this.bigintReplacer);
  }

  async wallet_get_transaction_inputs(handle: number, transactionId: string): Promise<string> {
    await this.delay();
    this.getWallet(handle);
    return JSON.stringify([]);
  }

  async wallet_get_transaction_outputs(handle: number, transactionId: string): Promise<string> {
    await this.delay();
    this.getWallet(handle);
    return JSON.stringify([]);
  }

  async wallet_get_transaction_kernels(handle: number, transactionId: string): Promise<string> {
    await this.delay();
    this.getWallet(handle);
    return JSON.stringify([]);
  }

  async walletGenerateStealthAddress(handle: number, recipientAddress: string): Promise<string> {
    if (this.shouldFail) throw new Error('Mock stealth address generation failed');
    await this.delay();
    this.getWallet(handle);
    const hash = recipientAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `stealth_${hash.toString(16).padStart(8, '0')}_mock`;
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
    if (this.shouldFail) throw new Error('Mock UTXO selection failed');
    await this.delay();
    this.getWallet(handle);

    const amountNum = BigInt(amount);
    const feeGram = feePerGram ? BigInt(feePerGram) : 5000n;
    const estimatedFee = feeGram * 250n;

    return {
      total_value: (amountNum + estimatedFee).toString(),
      fee_estimate: estimatedFee.toString(),
      output_count: 2,
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
    if (this.shouldFail) throw new Error('Mock script validation failed');
    await this.delay();
    this.getWallet(handle);

    const isValid = recipientAddress.startsWith('tari://');
    return {
      is_valid: isValid,
      errors: isValid ? [] : ['Invalid Tari address format']
    };
  }

  // Mock control methods (not part of actual FFI interface)
  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setLatency(ms: number): void {
    this.latency = Math.max(0, ms);
  }

  reset(): void {
    this.wallets.clear();
    this.nextHandle = 1;
    this.shouldFail = false;
    this.latency = 0;
  }

  // Helper methods
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

  private async delay(): Promise<void> {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }
  }

  // BigInt JSON serialization helper
  private bigintReplacer(key: string, value: any): any {
    return typeof value === 'bigint' ? value.toString() : value;
  }
}

// Create global mock instance
const mockInstance = new MockFFIBindings();

// Export individual mocked functions for Jest
export const init_logging = jest.fn().mockImplementation((...args) => mockInstance.init_logging(...args));
export const walletCreate = jest.fn().mockImplementation((...args) => mockInstance.walletCreate(...args));
export const walletDestroy = jest.fn().mockImplementation((...args) => mockInstance.walletDestroy(...args));
export const walletGetBalance = jest.fn().mockImplementation((...args) => mockInstance.walletGetBalance(...args));
export const walletGetAddress = jest.fn().mockImplementation((...args) => mockInstance.walletGetAddress(...args));
export const walletSendTransaction = jest.fn().mockImplementation((...args) => mockInstance.walletSendTransaction(...args));
export const walletGetSeedWords = jest.fn().mockImplementation((...args) => mockInstance.walletGetSeedWords(...args));
export const walletSetBaseNode = jest.fn().mockImplementation((...args) => mockInstance.walletSetBaseNode(...args));
export const validateAddress = jest.fn().mockImplementation((...args) => mockInstance.validateAddress(...args));
export const emojiIdToAddress = jest.fn().mockImplementation((...args) => mockInstance.emojiIdToAddress(...args));
export const addressToEmojiId = jest.fn().mockImplementation((...args) => mockInstance.addressToEmojiId(...args));
export const emojiIdToPublicKey = jest.fn().mockImplementation((...args) => mockInstance.emojiIdToPublicKey(...args));
export const walletGetActiveHandleCount = jest.fn().mockImplementation((...args) => mockInstance.walletGetActiveHandleCount(...args));
export const walletValidateHandle = jest.fn().mockImplementation((...args) => mockInstance.walletValidateHandle(...args));
export const walletCleanupAll = jest.fn().mockImplementation((...args) => mockInstance.walletCleanupAll(...args));
export const wallet_get_transaction = jest.fn().mockImplementation((...args) => mockInstance.wallet_get_transaction(...args));
export const wallet_get_transaction_inputs = jest.fn().mockImplementation((...args) => mockInstance.wallet_get_transaction_inputs(...args));
export const wallet_get_transaction_outputs = jest.fn().mockImplementation((...args) => mockInstance.wallet_get_transaction_outputs(...args));
export const wallet_get_transaction_kernels = jest.fn().mockImplementation((...args) => mockInstance.wallet_get_transaction_kernels(...args));
export const walletGenerateStealthAddress = jest.fn().mockImplementation((...args) => mockInstance.walletGenerateStealthAddress(...args));
export const walletPreviewUtxoSelection = jest.fn().mockImplementation((...args) => mockInstance.walletPreviewUtxoSelection(...args));
export const walletValidateScript = jest.fn().mockImplementation((...args) => mockInstance.walletValidateScript(...args));

// Control functions for tests
export const setFailureMode = jest.fn().mockImplementation((shouldFail: boolean) => mockInstance.setFailureMode(shouldFail));
export const setLatency = jest.fn().mockImplementation((ms: number) => mockInstance.setLatency(ms));
export const reset = jest.fn().mockImplementation(() => mockInstance.reset());

// Default export for module replacement
export default {
  init_logging,
  walletCreate,
  walletDestroy,
  walletGetBalance,
  walletGetAddress,
  walletSendTransaction,
  walletGetSeedWords,
  walletSetBaseNode,
  validateAddress,
  emojiIdToAddress,
  addressToEmojiId,
  emojiIdToPublicKey,
  walletGetActiveHandleCount,
  walletValidateHandle,
  walletCleanupAll,
  wallet_get_transaction,
  wallet_get_transaction_inputs,
  wallet_get_transaction_outputs,
  wallet_get_transaction_kernels,
  walletGenerateStealthAddress,
  walletPreviewUtxoSelection,
  walletValidateScript,
  setFailureMode,
  setLatency,
  reset,
};
