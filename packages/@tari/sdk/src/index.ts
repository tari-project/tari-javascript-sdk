// =============================================================================
// MAIN EXPORTS - Simple FFI-based SDK (mirrors mobile wallet pattern)
// No complex classes, just direct FFI access and utilities
// =============================================================================

// Core FFI functions (main interface)
export { ffi } from './ffi';

// Individual FFI functions for tree-shaking
export {
  // Wallet Management
  createWallet,
  destroyWallet,
  getSeedWords,
  
  // Address Operations
  getAddress,
  destroyAddress,
  
  // Balance Operations  
  getBalance,
  
  // Transaction Operations
  sendTransaction,
  getCompletedTransactions,
  getPendingInboundTransactions,
  getPendingOutboundTransactions,
  cancelPendingTransaction,
  
  // Contact Operations
  getContacts,
  upsertContact,
  removeContact,
  
  // Validation Operations
  startTxoValidation,
  startTransactionValidation,
  startRecovery,
  
  // Fee Operations
  getFeeEstimate,
  
  // Network Operations
  setBaseNodePeer,
  getSeedPeers,
  
  // UTXO Operations
  getAllUtxos,
  coinSplit,
  coinJoin,
  previewCoinSplit,
  previewCoinJoin,
  
  // Key-Value Storage
  setKeyValue,
  getKeyValue,
  clearValue,
  
  // Cryptographic Operations
  signMessage,
  
  // Utility Operations
  getRequiredConfirmations,
  restartTransactionBroadcast,
  logMessage
} from './ffi';

// Type definitions
export * from './types';

// Error handling
export * from './errors';

// Memory management utilities (iOS RAII pattern)
export {
  withWallet,
  withAddress,
  withWalletAsync,
  withAddressAsync,
  safeDestroyWallet,
  safeDestroyAddress,
  handleFFIError,
  mapErrorCode,
  createDefaultWallet,
  validateSeedWords,
  validateEmojiId,
  formatBalance,
  parseBalance,
  withRetry
} from './utils';

// Native loader (keep for compatibility)
export { loadNativeBinding } from './loader';

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

// Import for convenience functions
import { createWallet } from './ffi';

// Simple wallet creation functions (like mobile wallets)
export function createMainnetWallet(seedWords: string) {
  return createWallet({ seedWords, network: 0 }); // Mainnet = 0
}

export function createTestnetWallet(seedWords: string) {
  return createWallet({ seedWords, network: 1 }); // Testnet = 1
}

// Version info
export const VERSION = '0.1.0';

// =============================================================================
// INITIALIZATION (simplified)
// =============================================================================

import { loadNativeBinding } from './loader';

// Auto-load native binding on import
let initialized = false;
try {
  loadNativeBinding();
  initialized = true;
} catch (error) {
  console.warn('Failed to load native binding:', error);
}

export function isInitialized(): boolean {
  return initialized;
}

// =============================================================================
// DEFAULT EXPORT (for convenience)
// =============================================================================

import { ffi } from './ffi';
export default ffi;
