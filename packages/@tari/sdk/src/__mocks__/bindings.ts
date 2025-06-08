// Mock bindings for testing the new FFI structure

let nextHandle = 1;
const wallets = new Map<number, any>();
const addresses = new Map<number, any>();
const balances = new Map<number, any>();
const transactions = new Map<number, any>();
const utxos = new Map<number, any>();

export const mockBinding = {
  // Wallet operations
  wallet_create: jest.fn().mockImplementation((config) => {
    const handle = nextHandle++;
    wallets.set(handle, {
      config,
      seedWords: config.seedWords || 'mock seed words for testing purposes',
    });
    return handle;
  }),
  
  wallet_destroy: jest.fn().mockImplementation((handle) => {
    wallets.delete(handle);
  }),
  
  wallet_get_seed_words: jest.fn().mockImplementation((handle) => {
    const wallet = wallets.get(handle);
    return wallet?.seedWords || 'mock seed words';
  }),
  
  wallet_get_balance: jest.fn().mockImplementation((handle) => {
    const balanceHandle = nextHandle++;
    balances.set(balanceHandle, {
      available: 1000000000n,
      pending: 0n,
      locked: 0n,
      total: 1000000000n,
    });
    return balanceHandle;
  }),
  
  wallet_get_tari_address: jest.fn().mockImplementation((handle) => {
    return nextHandle++;
  }),
  
  wallet_send_transaction: jest.fn().mockImplementation((wallet, destination, amount, fee, message, oneSided) => {
    return BigInt(Date.now());
  }),
  
  wallet_get_completed_transactions: jest.fn().mockReturnValue(null),
  wallet_get_pending_transactions: jest.fn().mockReturnValue(null),
  wallet_cancel_pending_transaction: jest.fn().mockReturnValue(true),
  
  // Address operations
  tari_address_destroy: jest.fn(),
  tari_address_to_emoji_id: jest.fn().mockReturnValue('🎉🎨🎭🎪🎯🎲🎸🎺'),
  tari_address_get_bytes: jest.fn().mockReturnValue(nextHandle++),
  tari_address_from_emoji_id: jest.fn().mockImplementation((emojiId) => {
    return nextHandle++;
  }),
  
  // Balance operations
  balance_get_available: jest.fn().mockImplementation((handle) => {
    const balance = balances.get(handle);
    return balance?.available || 0n;
  }),
  
  balance_get_pending: jest.fn().mockImplementation((handle) => {
    const balance = balances.get(handle);
    return balance?.pending || 0n;
  }),
  
  balance_get_locked: jest.fn().mockImplementation((handle) => {
    const balance = balances.get(handle);
    return balance?.locked || 0n;
  }),
  
  balance_destroy: jest.fn().mockImplementation((handle) => {
    balances.delete(handle);
  }),
  
  // Contact operations
  wallet_get_contacts: jest.fn().mockReturnValue(null),
  wallet_upsert_contact: jest.fn().mockReturnValue(true),
  wallet_remove_contact: jest.fn().mockReturnValue(true),
  
  contacts_get_length: jest.fn().mockReturnValue(0),
  contacts_get_at: jest.fn().mockReturnValue(null),
  contacts_destroy: jest.fn(),
  
  contact_get_alias: jest.fn().mockReturnValue('Test Contact'),
  contact_get_tari_address: jest.fn().mockReturnValue(nextHandle++),
  contact_is_favorite: jest.fn().mockReturnValue(false),
  contact_destroy: jest.fn(),
  
  // Transaction operations
  transactions_get_length: jest.fn().mockReturnValue(0),
  transactions_get_at: jest.fn().mockReturnValue(null),
  transactions_destroy: jest.fn(),
  
  completed_transaction_get_id: jest.fn().mockReturnValue(BigInt(123)),
  completed_transaction_get_amount: jest.fn().mockReturnValue(1000000n),
  completed_transaction_get_fee: jest.fn().mockReturnValue(100n),
  completed_transaction_get_status: jest.fn().mockReturnValue(3), // Confirmed
  completed_transaction_get_timestamp: jest.fn().mockReturnValue(BigInt(Date.now() / 1000)),
  completed_transaction_get_message: jest.fn().mockReturnValue('Test transaction'),
  completed_transaction_is_outbound: jest.fn().mockReturnValue(false),
  completed_transaction_destroy: jest.fn(),
  
  pending_transaction_get_id: jest.fn().mockReturnValue(BigInt(456)),
  pending_transaction_get_amount: jest.fn().mockReturnValue(2000000n),
  pending_transaction_get_fee: jest.fn().mockReturnValue(200n),
  pending_transaction_get_timestamp: jest.fn().mockReturnValue(BigInt(Date.now() / 1000)),
  pending_transaction_get_message: jest.fn().mockReturnValue('Pending transaction'),
  
  // UTXO operations
  wallet_get_utxos: jest.fn().mockImplementation(() => {
    return nextHandle++;
  }),
  
  utxos_get_length: jest.fn().mockReturnValue(1),
  utxos_get_at: jest.fn().mockReturnValue(nextHandle++),
  utxo_get_commitment: jest.fn().mockReturnValue('commitment_1'),
  utxo_get_value: jest.fn().mockReturnValue(1000000n),
  utxo_get_mined_height: jest.fn().mockReturnValue(100),
  utxo_get_mined_timestamp: jest.fn().mockReturnValue(BigInt(1234567890)),
  utxo_get_lock_height: jest.fn().mockReturnValue(0),
  utxo_get_status: jest.fn().mockReturnValue(0),
  utxo_destroy: jest.fn(),
  vector_destroy: jest.fn(),
  
  // Coin operations
  wallet_coin_split: jest.fn().mockReturnValue(BigInt(789)),
  wallet_coin_join: jest.fn().mockReturnValue(BigInt(790)),
  wallet_estimate_fee: jest.fn().mockReturnValue(BigInt(1000)),
  
  // Network operations
  wallet_set_base_node_peer: jest.fn().mockReturnValue(true),
  wallet_start_recovery: jest.fn().mockReturnValue(true),
  
  // Key-value storage
  wallet_set_key_value: jest.fn().mockReturnValue(true),
  wallet_get_value: jest.fn().mockReturnValue('test_value'),
  
  // Cryptographic operations
  wallet_sign_message: jest.fn().mockReturnValue('mock_signature'),
  
  // Utility functions
  string_destroy: jest.fn(),
  byte_vector_destroy: jest.fn(),
};

export const binding = mockBinding;
