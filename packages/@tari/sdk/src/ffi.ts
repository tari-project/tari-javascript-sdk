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
 * Direct FFI function exports - mirrors mobile wallet pattern (iOS/Android)
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
  
  const handle = binding.wallet_create(config);
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
  
  binding.wallet_destroy(handle);
}

/**
 * Get seed words from wallet - mirrors wallet_get_seed_words() in mobile
 */
export function getSeedWords(handle: WalletHandle): string {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const words = binding.wallet_get_seed_words(handle);
  if (!words) {
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
  
  const addressHandle = binding.wallet_get_tari_address(handle);
  if (!addressHandle || !isAddressHandle(addressHandle)) {
    throw new TariFFIError('Failed to get address', TariErrorCode.AddressError);
  }
  
  const emojiId = binding.tari_address_to_emoji_id(addressHandle);
  const bytesHandle = binding.tari_address_get_bytes(addressHandle);
  
  if (!emojiId) {
    throw new TariFFIError('Failed to get emoji ID', TariErrorCode.AddressError);
  }
  
  // Convert bytes handle to Uint8Array
  const bytes = bytesHandle ? new Uint8Array(0) : new Uint8Array(0); // TODO: implement proper conversion
  
  return {
    handle: addressHandle,
    emojiId,
    bytes
  };
}

/**
 * Destroy address handle - mirrors address_destroy() in mobile
 */
export function destroyAddress(handle: AddressHandle): void {
  if (!isAddressHandle(handle)) {
    throw new TariFFIError('Invalid address handle', TariErrorCode.InvalidArgument);
  }
  
  binding.tari_address_destroy(handle);
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
  
  const balanceHandle = binding.wallet_get_balance(handle);
  if (!balanceHandle) {
    throw new TariFFIError('Failed to get balance', TariErrorCode.DatabaseError);
  }
  
  try {
    const available = binding.balance_get_available(balanceHandle);
    const pending = binding.balance_get_pending(balanceHandle);
    const locked = binding.balance_get_locked(balanceHandle);
    
    return {
      available,
      pending,
      locked,
      total: available + pending + locked
    };
  } finally {
    binding.balance_destroy(balanceHandle);
  }
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
  
  // Convert destination string to address handle
  const destinationHandle = binding.tari_address_from_emoji_id(params.destination);
  if (!destinationHandle) {
    throw new TariFFIError('Invalid destination address', TariErrorCode.AddressError);
  }
  
  try {
    const txId = binding.wallet_send_transaction(
      handle,
      destinationHandle,
      params.amount,
      params.feePerGram || BigInt(5),
      params.message || '',
      params.oneSided !== false
    );
    
    if (!txId) {
      throw new TariFFIError('Failed to send transaction', TariErrorCode.TransactionError);
    }
    
    return txId;
  } finally {
    binding.tari_address_destroy(destinationHandle);
  }
}

/**
 * Get completed transactions - mirrors wallet_get_completed_transactions() in mobile
 */
export function getCompletedTransactions(handle: WalletHandle): TariTransaction[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const transactionsHandle = binding.wallet_get_completed_transactions(handle);
  if (!transactionsHandle) {
    return [];
  }
  
  try {
    const length = binding.transactions_get_length(transactionsHandle);
    const transactions: TariTransaction[] = [];
    
    for (let i = 0; i < length; i++) {
      const txHandle = binding.transactions_get_at(transactionsHandle, i);
      if (txHandle) {
        try {
          transactions.push({
            id: binding.completed_transaction_get_id(txHandle).toString(),
            amount: binding.completed_transaction_get_amount(txHandle),
            fee: binding.completed_transaction_get_fee(txHandle),
            status: binding.completed_transaction_get_status(txHandle),
            timestamp: new Date(Number(binding.completed_transaction_get_timestamp(txHandle)) * 1000),
            message: binding.completed_transaction_get_message(txHandle) || '',
            isOutbound: binding.completed_transaction_is_outbound(txHandle)
          });
        } finally {
          binding.completed_transaction_destroy(txHandle);
        }
      }
    }
    
    return transactions;
  } finally {
    binding.transactions_destroy(transactionsHandle);
  }
}

/**
 * Get pending inbound transactions - mirrors wallet_get_pending_inbound_transactions() in mobile
 */
export function getPendingInboundTransactions(handle: WalletHandle): TariTransaction[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const transactionsHandle = binding.wallet_get_pending_transactions(handle);
  if (!transactionsHandle) {
    return [];
  }
  
  try {
    const length = binding.transactions_get_length(transactionsHandle);
    const transactions: TariTransaction[] = [];
    
    for (let i = 0; i < length; i++) {
      const txHandle = binding.transactions_get_at(transactionsHandle, i);
      if (txHandle) {
        try {
          // Only include inbound transactions
          if (!binding.completed_transaction_is_outbound || !binding.completed_transaction_is_outbound(txHandle)) {
            transactions.push({
              id: binding.pending_transaction_get_id(txHandle).toString(),
              amount: binding.pending_transaction_get_amount(txHandle),
              fee: binding.pending_transaction_get_fee(txHandle),
              status: TransactionStatus.Pending,
              timestamp: new Date(Number(binding.pending_transaction_get_timestamp(txHandle)) * 1000),
              message: binding.pending_transaction_get_message(txHandle) || '',
              isOutbound: false
            });
          }
        } finally {
          binding.completed_transaction_destroy(txHandle);
        }
      }
    }
    
    return transactions;
  } finally {
    binding.transactions_destroy(transactionsHandle);
  }
}

/**
 * Get pending outbound transactions - mirrors wallet_get_pending_outbound_transactions() in mobile
 */
export function getPendingOutboundTransactions(handle: WalletHandle): TariTransaction[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const transactionsHandle = binding.wallet_get_pending_transactions(handle);
  if (!transactionsHandle) {
    return [];
  }
  
  try {
    const length = binding.transactions_get_length(transactionsHandle);
    const transactions: TariTransaction[] = [];
    
    for (let i = 0; i < length; i++) {
      const txHandle = binding.transactions_get_at(transactionsHandle, i);
      if (txHandle) {
        try {
          // Only include outbound transactions
          if (binding.completed_transaction_is_outbound && binding.completed_transaction_is_outbound(txHandle)) {
            transactions.push({
              id: binding.pending_transaction_get_id(txHandle).toString(),
              amount: binding.pending_transaction_get_amount(txHandle),
              fee: binding.pending_transaction_get_fee(txHandle),
              status: TransactionStatus.Pending,
              timestamp: new Date(Number(binding.pending_transaction_get_timestamp(txHandle)) * 1000),
              message: binding.pending_transaction_get_message(txHandle) || '',
              isOutbound: true
            });
          }
        } finally {
          binding.completed_transaction_destroy(txHandle);
        }
      }
    }
    
    return transactions;
  } finally {
    binding.transactions_destroy(transactionsHandle);
  }
}

/**
 * Cancel pending transaction - mirrors wallet_cancel_pending_transaction() in mobile
 */
export function cancelPendingTransaction(handle: WalletHandle, txId: bigint): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  return binding.wallet_cancel_pending_transaction(handle, txId);
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
  
  const contactsHandle = binding.wallet_get_contacts(handle);
  if (!contactsHandle) {
    return [];
  }
  
  try {
    const length = binding.contacts_get_length(contactsHandle);
    const contacts: TariContact[] = [];
    
    for (let i = 0; i < length; i++) {
      const contactHandle = binding.contacts_get_at(contactsHandle, i);
      if (contactHandle) {
        try {
          const alias = binding.contact_get_alias(contactHandle);
          const addressHandle = binding.contact_get_tari_address(contactHandle);
          
          if (alias && addressHandle) {
            const address = binding.tari_address_to_emoji_id(addressHandle);
            if (address) {
              contacts.push({
                alias,
                address,
                isFavorite: binding.contact_is_favorite(contactHandle)
              });
            }
            binding.tari_address_destroy(addressHandle);
          }
        } finally {
          binding.contact_destroy(contactHandle);
        }
      }
    }
    
    return contacts;
  } finally {
    binding.contacts_destroy(contactsHandle);
  }
}

/**
 * Add or update contact - mirrors wallet_upsert_contact() in mobile
 */
export function upsertContact(handle: WalletHandle, contact: TariContact): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  return binding.wallet_upsert_contact(handle, contact.alias, contact.address);
}

/**
 * Remove contact - mirrors wallet_remove_contact() in mobile
 */
export function removeContact(handle: WalletHandle, contact: TariContact): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  return binding.wallet_remove_contact(handle, contact.address);
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
  
  // Note: This is a mock implementation - actual FFI function needed
  return BigInt(Date.now());
}

/**
 * Start UTXO validation - mirrors wallet_start_utxo_validation() in mobile
 */
export function startTxoValidation(handle: WalletHandle): bigint {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Note: This is a mock implementation - actual FFI function needed
  return BigInt(Date.now());
}

/**
 * Start recovery - mirrors wallet_start_recovery() in mobile
 */
export function startRecovery(handle: WalletHandle, message: string): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  return binding.wallet_start_recovery(handle, message);
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
  
  return binding.wallet_estimate_fee(
    handle,
    params.amount,
    params.feePerGram,
    params.kernelCount,
    params.outputCount
  );
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
  
  return binding.wallet_set_base_node_peer(handle, publicKey, address);
}

/**
 * Get seed peers - mirrors wallet_get_seed_peers() in mobile
 */
export function getSeedPeers(handle: WalletHandle): string[] {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Note: This is a mock implementation - actual FFI function needed
  return [];
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
  
  const utxosHandle = binding.wallet_get_utxos(handle);
  if (!utxosHandle) {
    return [];
  }
  
  try {
    const length = binding.utxos_get_length(utxosHandle);
    const utxos: TariUTXO[] = [];
    
    for (let i = 0; i < length; i++) {
      const utxoHandle = binding.utxos_get_at(utxosHandle, i);
      if (utxoHandle) {
        try {
          utxos.push({
            commitment: binding.utxo_get_commitment(utxoHandle) || '',
            value: binding.utxo_get_value(utxoHandle),
            minedHeight: binding.utxo_get_mined_height(utxoHandle),
            minedTimestamp: new Date(Number(binding.utxo_get_mined_timestamp(utxoHandle)) * 1000),
            lockHeight: binding.utxo_get_lock_height(utxoHandle),
            status: binding.utxo_get_status(utxoHandle)
          });
        } finally {
          binding.utxo_destroy(utxoHandle);
        }
      }
    }
    
    return utxos;
  } finally {
    binding.vector_destroy(utxosHandle);
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
  
  const txId = binding.wallet_coin_split(handle, params.commitments, params.feePerGram, params.count);
  if (!txId) {
    throw new TariFFIError('Failed to split coins', TariErrorCode.TransactionError);
  }
  
  return txId;
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
  
  const txId = binding.wallet_coin_join(handle, params.commitments, params.feePerGram);
  if (!txId) {
    throw new TariFFIError('Failed to join coins', TariErrorCode.TransactionError);
  }
  
  return txId;
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
  
  // Note: This is a mock implementation - actual FFI function needed
  const estimatedFee = getFeeEstimate(handle, { 
    amount: BigInt(0), 
    feePerGram: params.feePerGram, 
    kernelCount: 1, 
    outputCount: params.count 
  });
  
  return {
    fee: estimatedFee,
    utxos: [] // Mock empty for now
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
  
  // Note: This is a mock implementation - actual FFI function needed
  const estimatedFee = getFeeEstimate(handle, { 
    amount: BigInt(0), 
    feePerGram: params.feePerGram, 
    kernelCount: 1, 
    outputCount: 1 
  });
  
  return {
    fee: estimatedFee,
    utxos: [] // Mock empty for now
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
  
  return binding.wallet_set_key_value(handle, key, value);
}

/**
 * Get value by key - mirrors wallet_get_value() in mobile
 */
export function getKeyValue(handle: WalletHandle, key: string): string {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  const value = binding.wallet_get_value(handle, key);
  return value || '';
}

/**
 * Clear value by key - mirrors wallet_clear_value() in mobile
 */
export function clearValue(handle: WalletHandle, key: string): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Note: This assumes setting empty string clears the value
  return binding.wallet_set_key_value(handle, key, '');
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
  
  const signature = binding.wallet_sign_message(handle, message);
  if (!signature) {
    throw new TariFFIError('Failed to sign message', TariErrorCode.KeyError);
  }
  
  return signature;
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
  
  // Note: This is a mock implementation - actual FFI function needed or config value
  return BigInt(3); // Standard 3 confirmations
}

/**
 * Restart transaction broadcast - mirrors wallet_restart_transaction_broadcast() in mobile
 */
export function restartTransactionBroadcast(handle: WalletHandle): boolean {
  if (!isWalletHandle(handle)) {
    throw new TariFFIError('Invalid wallet handle', TariErrorCode.InvalidArgument);
  }
  
  // Note: This is a mock implementation - actual FFI function needed
  return true;
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

// Export individual functions for tree-shaking
export {
  // Re-export all functions for named imports
  createWallet,
  destroyWallet,
  getSeedWords,
  getAddress,
  destroyAddress,
  getBalance,
  sendTransaction,
  getCompletedTransactions,
  getPendingInboundTransactions,
  getPendingOutboundTransactions,
  cancelPendingTransaction,
  getContacts,
  upsertContact,
  removeContact,
  startTxoValidation,
  startTransactionValidation,
  startRecovery,
  getFeeEstimate,
  setBaseNodePeer,
  getSeedPeers,
  getAllUtxos,
  coinSplit,
  coinJoin,
  previewCoinSplit,
  previewCoinJoin,
  setKeyValue,
  getKeyValue,
  clearValue,
  signMessage,
  getRequiredConfirmations,
  restartTransactionBroadcast,
  logMessage
};
