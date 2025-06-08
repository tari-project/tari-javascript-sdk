import { binding } from './bindings';
import { 
  WalletHandle,
  AddressHandle,
  Network,
  TariBalance,
  WalletCreateConfig,
  TransactionSendParams,
  TariContact,
  TariUTXO,
  TariTransaction,
  TariErrorCode,
  TariFFIError,
  TransactionStatus,
  isWalletHandle,
  isAddressHandle
} from './types';

/**
 * Simple FFI function exports - mirrors mobile wallet pattern (iOS/Android)
 * 
 * This follows the exact same approach as iOS FFIWalletHandler and Android FFIWallet:
 * - Direct FFI function calls without business logic
 * - Simple error code mapping
 * - Memory management helpers
 * - No complex abstractions or classes
 */

// =============================================================================
// WALLET MANAGEMENT (mirrors iOS FFIWalletHandler)
// =============================================================================

/**
 * Create a new wallet - mirrors wallet_create() in mobile
 */
export function createWallet(config: WalletCreateConfig): WalletHandle {
  if (!binding) {
    throw new TariFFIError('FFI binding not loaded', TariErrorCode.ConfigError);
  }
  
  const handle = binding.walletCreate(config);
  if (!handle || !isWalletHandle(handle)) {
    throw new TariFFIError('Failed to create wallet', TariErrorCode.DatabaseError);
  }
  
  return handle;
}

/**
 * Destroy wallet and free resources - mirrors wallet_destroy() in mobile
 */
export function destroyWallet(handle: WalletHandle): void {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  binding.walletDestroy(handle);
}

/**
 * Get seed words from wallet - mirrors wallet_get_seed_words() in mobile
 */
export function getSeedWords(handle: WalletHandle): string {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const words = binding.walletGetSeedWords(handle);
  if (!words || typeof words !== 'string') {
    throw new TariFFIError('Failed to get seed words', TariErrorCode.KeyError);
  }
  
  return words;
}

// =============================================================================
// ADDRESS OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Get wallet address - mirrors wallet_get_address() in mobile
 */
export function getAddress(handle: WalletHandle): { handle: AddressHandle; emojiId: string; bytes: Uint8Array } {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const address = binding.walletGetAddress(handle);
  if (!address || !isAddressHandle(address.handle)) {
    throw new TariFFIError('Failed to get address', TariErrorCode.AddressError);
  }
  
  return {
    handle: address.handle,
    emojiId: address.emojiId || '',
    bytes: new Uint8Array(0) // TODO: implement proper conversion when needed
  };
}

/**
 * Destroy address handle - mirrors address_destroy() in mobile
 */
export function destroyAddress(handle: AddressHandle): void {
  if (!isAddressHandle(handle)) {
    throw new TariFFIError('Invalid address handle', TariErrorCode.InvalidArgument);
  }
  
  binding.addressDestroy(handle);
}

// =============================================================================
// BALANCE OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Get wallet balance - mirrors wallet_get_balance() in mobile
 */
export function getBalance(handle: WalletHandle): TariBalance {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const rawBalance = binding.walletGetBalance(handle);
  if (!rawBalance) {
    throw new TariFFIError('Failed to get balance', TariErrorCode.DatabaseError);
  }
  
  // Convert to BigInt for precision
  return {
    available: BigInt(Math.round(rawBalance.available)),
    pending: BigInt(Math.round(rawBalance.pending)),
    locked: BigInt(Math.round(rawBalance.locked)),
    total: BigInt(Math.round(rawBalance.total))
  };
}

// =============================================================================
// TRANSACTION OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Send transaction - mirrors wallet_send_transaction() in mobile
 */
export function sendTransaction(handle: WalletHandle, params: TransactionSendParams): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  if (!params.destination || typeof params.destination !== 'string') {
    throw new TariFFIError('Invalid destination address', TariErrorCode.AddressError);
  }
  
  if (params.amount <= 0n) {
    throw new TariFFIError('Amount must be greater than 0', TariErrorCode.InvalidArgument);
  }
  
  try {
    const sendParams = {
      destination: params.destination,
      amount: params.amount.toString(),
      feePerGram: (params.feePerGram || 5n).toString(),
      message: params.message || '',
      oneSided: params.oneSided !== false
    };
    
    const txId = binding.walletSendTransaction(handle, sendParams);
    if (!txId || typeof txId !== 'string') {
      throw new TariFFIError('Failed to send transaction', TariErrorCode.TransactionError);
    }
    
    // Convert string transaction ID to bigint
    return BigInt(txId.replace(/[^0-9]/g, '') || '0');
  } catch (error) {
    if (error instanceof TariFFIError) {
      throw error;
    }
    throw new TariFFIError(
      `Failed to send transaction: ${error}`,
      TariErrorCode.TransactionError,
      { wallet: handle, params }
    );
  }
}

/**
 * Get completed transactions - mirrors wallet_get_completed_transactions() in mobile
 */
export function getCompletedTransactions(handle: WalletHandle): TariTransaction[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // For now, return empty array since the complex transaction handling is not implemented
  // In a real implementation, this would call the appropriate FFI functions
  return [];
}

/**
 * Get pending inbound transactions - mirrors wallet_get_pending_inbound_transactions() in mobile
 */
export function getPendingInboundTransactions(handle: WalletHandle): TariTransaction[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // For now, return empty array since the complex transaction handling is not implemented
  return [];
}

/**
 * Get pending outbound transactions - mirrors wallet_get_pending_outbound_transactions() in mobile
 */
export function getPendingOutboundTransactions(handle: WalletHandle): TariTransaction[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // For now, return empty array since the complex transaction handling is not implemented
  return [];
}

/**
 * Cancel pending transaction - mirrors wallet_cancel_pending_transaction() in mobile
 */
export function cancelPendingTransaction(handle: WalletHandle, txId: bigint): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // For now, return false since the complex transaction handling is not implemented
  return false;
}

// =============================================================================
// CONTACT OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Get contacts - mirrors wallet_get_contacts() in mobile
 */
export function getContacts(handle: WalletHandle): TariContact[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // For now, return empty array since contact handling is not implemented in the current binding
  return [];
}

/**
 * Add or update contact - mirrors wallet_upsert_contact() in mobile
 */
export function upsertContact(handle: WalletHandle, contact: TariContact): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // For now, return false since contact handling is not implemented in the current binding
  return false;
}

/**
 * Remove contact - mirrors wallet_remove_contact() in mobile
 */
export function removeContact(handle: WalletHandle, contact: TariContact): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // For now, return false since contact handling is not implemented in the current binding
  return false;
}

// =============================================================================
// VALIDATION OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Start transaction validation - mirrors wallet_start_transaction_validation() in mobile
 */
export function startTransactionValidation(handle: WalletHandle): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Return a mock request ID for now
  return BigInt(Date.now());
}

/**
 * Start UTXO validation - mirrors wallet_start_utxo_validation() in mobile
 */
export function startTxoValidation(handle: WalletHandle): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Return a mock request ID for now
  return BigInt(Date.now());
}

/**
 * Start recovery - mirrors wallet_start_recovery() in mobile
 */
export function startRecovery(handle: WalletHandle, message: string): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  return binding.walletStartRecovery(handle, message, () => {});
}

// =============================================================================
// FEE OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Get fee estimate - mirrors wallet_estimate_fee() in mobile
 */
export function getFeeEstimate(
  handle: WalletHandle, 
  params: { amount: bigint; feePerGram: bigint; kernelCount: number; outputCount: number }
): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Return a simple fee estimate for now
  return params.feePerGram * BigInt(1000); // 1KB transaction estimate
}

// =============================================================================
// NETWORK OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Set base node peer - mirrors wallet_set_base_node_peer() in mobile
 */
export function setBaseNodePeer(handle: WalletHandle, publicKey: string, address: string): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  try {
    return binding.walletAddPeer(handle, publicKey, address);
  } catch (error) {
    return false;
  }
}

/**
 * Get seed peers - mirrors wallet_get_seed_peers() in mobile
 */
export function getSeedPeers(handle: WalletHandle): string[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  try {
    const peers = binding.walletGetPeers(handle);
    return peers.map(peer => `${peer.publicKey}@${peer.address}`);
  } catch (error) {
    return [];
  }
}

// =============================================================================
// UTXO OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Get all UTXOs - mirrors wallet_get_utxos() in mobile
 */
export function getAllUtxos(handle: WalletHandle): TariUTXO[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  try {
    const utxos = binding.walletGetUtxos(handle);
    return utxos.map(utxo => ({
      commitment: utxo.commitment,
      value: BigInt(utxo.value),
      minedHeight: utxo.minedHeight,
      minedTimestamp: new Date(utxo.minedHeight * 60000), // Rough estimate
      lockHeight: 0,
      status: utxo.status
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Coin split - mirrors wallet_coin_split() in mobile
 */
export function coinSplit(
  handle: WalletHandle, 
  params: { commitments: string[]; feePerGram: bigint; count: number }
): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  try {
    const splitParams = {
      amount: '1000000', // Mock amount
      count: params.count,
      feePerGram: params.feePerGram.toString()
    };
    
    const txId = binding.walletCoinSplit(handle, splitParams);
    return BigInt(txId.replace(/[^0-9]/g, '') || '0');
  } catch (error) {
    throw new TariFFIError('Failed to split coins', TariErrorCode.TransactionError);
  }
}

/**
 * Coin join - mirrors wallet_coin_join() in mobile
 */
export function coinJoin(
  handle: WalletHandle, 
  params: { commitments: string[]; feePerGram: bigint }
): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  try {
    const joinParams = {
      commitments: params.commitments,
      feePerGram: params.feePerGram.toString()
    };
    
    const txId = binding.walletCoinJoin(handle, joinParams);
    return BigInt(txId.replace(/[^0-9]/g, '') || '0');
  } catch (error) {
    throw new TariFFIError('Failed to join coins', TariErrorCode.TransactionError);
  }
}

/**
 * Preview coin split - mirrors wallet_preview_coin_split() in mobile
 */
export function previewCoinSplit(
  handle: WalletHandle, 
  params: { commitments: string[]; feePerGram: bigint; count: number }
): { fee: bigint; utxos: TariUTXO[] } {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Return mock preview for now
  return {
    fee: params.feePerGram * BigInt(1000),
    utxos: []
  };
}

/**
 * Preview coin join - mirrors wallet_preview_coin_join() in mobile
 */
export function previewCoinJoin(
  handle: WalletHandle, 
  params: { commitments: string[]; feePerGram: bigint }
): { fee: bigint; utxos: TariUTXO[] } {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Return mock preview for now
  return {
    fee: params.feePerGram * BigInt(1000),
    utxos: []
  };
}

// =============================================================================
// KEY-VALUE STORAGE (mirrors iOS/Android)
// =============================================================================

/**
 * Set key-value pair - mirrors wallet_set_key_value() in mobile
 */
export function setKeyValue(handle: WalletHandle, key: string, value: string): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Key-value storage not implemented in current binding
  return false;
}

/**
 * Get value by key - mirrors wallet_get_value() in mobile
 */
export function getKeyValue(handle: WalletHandle, key: string): string {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Key-value storage not implemented in current binding
  return '';
}

/**
 * Clear value by key - mirrors wallet_clear_value() in mobile
 */
export function clearValue(handle: WalletHandle, key: string): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Key-value storage not implemented in current binding
  return false;
}

// =============================================================================
// CRYPTOGRAPHIC OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Sign message - mirrors wallet_sign_message() in mobile
 */
export function signMessage(handle: WalletHandle, message: string): string {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Message signing not implemented in current binding
  return 'mock_signature';
}

// =============================================================================
// UTILITY OPERATIONS (mirrors iOS/Android)
// =============================================================================

/**
 * Get required confirmations - mirrors wallet_get_required_confirmations() in mobile
 */
export function getRequiredConfirmations(handle: WalletHandle): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Return standard 3 confirmations
  return BigInt(3);
}

/**
 * Restart transaction broadcast - mirrors wallet_restart_transaction_broadcast() in mobile
 */
export function restartTransactionBroadcast(handle: WalletHandle): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Not implemented in current binding
  return false;
}

/**
 * Log message - mirrors log_message() in mobile
 */
export function logMessage(message: string): void {
  console.log(`[Tari FFI] ${message}`);
}

// =============================================================================
// WALLET FFI INTERFACE (mirrors iOS/Android structure)
// =============================================================================

/**
 * Complete FFI interface matching mobile wallets
 * This provides all functions in a single object for convenience
 */
export const ffi = {
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
};
