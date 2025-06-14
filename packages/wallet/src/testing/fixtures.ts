/**
 * Test fixtures for complex testing scenarios
 * Provides pre-defined test data for consistent testing
 */

import {
  WalletConfig,
  Balance,
  Transaction,
  PendingTransaction,
  TransactionStatus,
  NetworkType,
  SeedWordsFactory,
  PublicKeyFactory,
} from './factories';

/**
 * Known test seed word sets for deterministic testing
 */
export const TEST_SEED_WORDS = {
  ALICE: [
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'art'
  ],
  BOB: [
    'legal', 'winner', 'thank', 'year', 'wave', 'sausage',
    'worth', 'useful', 'legal', 'winner', 'thank', 'year',
    'wave', 'sausage', 'worth', 'useful', 'legal', 'will',
    'legal', 'will', 'legal', 'will', 'legal', 'will'
  ],
  CHARLIE: [
    'letter', 'advice', 'cage', 'absurd', 'amount', 'doctor',
    'acoustic', 'avoid', 'letter', 'advice', 'cage', 'absurd',
    'amount', 'doctor', 'acoustic', 'avoid', 'letter', 'advice',
    'cage', 'absurd', 'amount', 'doctor', 'acoustic', 'bless'
  ],
};

/**
 * Known test addresses for deterministic testing
 */
export const TEST_ADDRESSES = {
  ALICE_TESTNET: 'tari://testnet/alice_test_address_deterministic_123456789abcdef',
  BOB_TESTNET: 'tari://testnet/bob_test_address_deterministic_987654321fedcba',
  CHARLIE_TESTNET: 'tari://testnet/charlie_test_address_deterministic_abcdef123456789',
  
  ALICE_MAINNET: 'tari://mainnet/alice_main_address_deterministic_123456789abcdef',
  BOB_MAINNET: 'tari://mainnet/bob_main_address_deterministic_987654321fedcba',
  
  INVALID: 'invalid_address_format',
  EMPTY: '',
};

/**
 * Known test public keys for deterministic testing
 */
export const TEST_PUBLIC_KEYS = {
  ALICE: 'alice123456789abcdef123456789abcdef123456789abcdef123456789abcdef12',
  BOB: 'bob987654321fedcba987654321fedcba987654321fedcba987654321fedcba98',
  CHARLIE: 'charlieabcdef123456789abcdef123456789abcdef123456789abcdef123456789ab',
};

/**
 * Test wallet configurations for different scenarios
 */
export const TEST_WALLET_CONFIGS: Record<string, WalletConfig> = {
  ALICE_TESTNET: {
    network: NetworkType.Testnet,
    storagePath: '/tmp/test-wallet-alice-testnet',
    logPath: '/tmp/test-wallet-alice-testnet.log',
    logLevel: 3, // debug
    seedWords: TEST_SEED_WORDS.ALICE,
  },
  
  BOB_TESTNET: {
    network: NetworkType.Testnet,
    storagePath: '/tmp/test-wallet-bob-testnet',
    logPath: '/tmp/test-wallet-bob-testnet.log',
    logLevel: 2, // info
    seedWords: TEST_SEED_WORDS.BOB,
  },
  
  NEW_WALLET_TESTNET: {
    network: NetworkType.Testnet,
    storagePath: '/tmp/test-wallet-new-testnet',
    logPath: '/tmp/test-wallet-new-testnet.log',
    logLevel: 2, // info
  },
  
  RECOVERY_WALLET: {
    network: NetworkType.Testnet,
    storagePath: '/tmp/test-wallet-recovery',
    logPath: '/tmp/test-wallet-recovery.log',
    logLevel: 3, // debug
    seedWords: TEST_SEED_WORDS.CHARLIE,
    passphrase: 'test_passphrase_123',
  },
  
  MAINNET_WALLET: {
    network: NetworkType.Mainnet,
    storagePath: '/tmp/test-wallet-mainnet',
    logPath: '/tmp/test-wallet-mainnet.log',
    logLevel: 0, // error
  },
};

/**
 * Test balance scenarios
 */
export const TEST_BALANCES: Record<string, Balance> = {
  EMPTY: {
    available: 0n,
    pendingIncoming: 0n,
    pendingOutgoing: 0n,
    timelocked: 0n,
  },
  
  SMALL: {
    available: 1000000n, // 0.001 Tari
    pendingIncoming: 0n,
    pendingOutgoing: 0n,
    timelocked: 0n,
  },
  
  MEDIUM: {
    available: 1000000000n, // 1 Tari
    pendingIncoming: 500000000n, // 0.5 Tari
    pendingOutgoing: 100000000n, // 0.1 Tari
    timelocked: 0n,
  },
  
  LARGE: {
    available: 100000000000n, // 100 Tari
    pendingIncoming: 10000000000n, // 10 Tari
    pendingOutgoing: 5000000000n, // 5 Tari
    timelocked: 2000000000n, // 2 Tari
  },
  
  JUST_ENOUGH_FOR_SMALL_TX: {
    available: 1005000n, // 0.001005 Tari (amount + fee)
    pendingIncoming: 0n,
    pendingOutgoing: 0n,
    timelocked: 0n,
  },
  
  INSUFFICIENT_FOR_SMALL_TX: {
    available: 1004999n, // 0.001004999 Tari (less than amount + fee)
    pendingIncoming: 0n,
    pendingOutgoing: 0n,
    timelocked: 0n,
  },
};

/**
 * Test transaction scenarios
 */
export const TEST_TRANSACTIONS: Record<string, Transaction> = {
  SMALL_CONFIRMED_OUTBOUND: {
    id: 'tx_small_confirmed_outbound_001',
    amount: 1000000n, // 0.001 Tari
    fee: 5000n,
    status: TransactionStatus.MinedConfirmed,
    message: 'Small confirmed outbound payment',
    timestamp: new Date('2024-01-15T10:30:00Z'),
    isInbound: false,
    address: TEST_ADDRESSES.BOB_TESTNET,
    confirmations: 5,
  },
  
  LARGE_CONFIRMED_INBOUND: {
    id: 'tx_large_confirmed_inbound_002',
    amount: 10000000000n, // 10 Tari
    fee: 0n, // Receiver doesn't pay fee
    status: TransactionStatus.MinedConfirmed,
    message: 'Large confirmed inbound payment',
    timestamp: new Date('2024-01-14T15:45:00Z'),
    isInbound: true,
    address: TEST_ADDRESSES.ALICE_TESTNET,
    confirmations: 10,
  },
  
  PENDING_OUTBOUND: {
    id: 'tx_pending_outbound_003',
    amount: 500000000n, // 0.5 Tari
    fee: 7500n,
    status: TransactionStatus.Pending,
    message: 'Pending outbound payment',
    timestamp: new Date('2024-01-16T09:15:00Z'),
    isInbound: false,
    address: TEST_ADDRESSES.CHARLIE_TESTNET,
    confirmations: 0,
  },
  
  CANCELLED_OUTBOUND: {
    id: 'tx_cancelled_outbound_004',
    amount: 2000000000n, // 2 Tari
    fee: 10000n,
    status: TransactionStatus.Cancelled,
    message: 'Cancelled outbound payment',
    timestamp: new Date('2024-01-13T14:20:00Z'),
    isInbound: false,
    address: TEST_ADDRESSES.BOB_TESTNET,
    confirmations: 0,
  },
  
  BROADCAST_OUTBOUND: {
    id: 'tx_broadcast_outbound_005',
    amount: 750000000n, // 0.75 Tari
    fee: 6000n,
    status: TransactionStatus.Broadcast,
    message: 'Broadcast outbound payment',
    timestamp: new Date('2024-01-16T11:00:00Z'),
    isInbound: false,
    address: TEST_ADDRESSES.ALICE_TESTNET,
    confirmations: 0,
  },
  
  OLD_CONFIRMED_INBOUND: {
    id: 'tx_old_confirmed_inbound_006',
    amount: 5000000000n, // 5 Tari
    fee: 0n,
    status: TransactionStatus.MinedConfirmed,
    message: 'Old confirmed inbound payment',
    timestamp: new Date('2023-12-01T08:30:00Z'),
    isInbound: true,
    address: TEST_ADDRESSES.CHARLIE_TESTNET,
    confirmations: 1000,
  },
};

/**
 * Test pending transaction scenarios
 */
export const TEST_PENDING_TRANSACTIONS: Record<string, PendingTransaction> = {
  STANDARD_PENDING: {
    id: 'pending_tx_standard_001',
    amount: 1000000000n, // 1 Tari
    fee: 5000n,
    message: 'Standard pending payment',
    timestamp: new Date('2024-01-16T12:00:00Z'),
    recipientAddress: TEST_ADDRESSES.BOB_TESTNET,
    status: TransactionStatus.Pending,
  },
  
  LARGE_PENDING: {
    id: 'pending_tx_large_002',
    amount: 50000000000n, // 50 Tari
    fee: 25000n,
    message: 'Large pending payment',
    timestamp: new Date('2024-01-16T10:30:00Z'),
    recipientAddress: TEST_ADDRESSES.CHARLIE_TESTNET,
    status: TransactionStatus.Pending,
  },
  
  BROADCAST_PENDING: {
    id: 'pending_tx_broadcast_003',
    amount: 2500000000n, // 2.5 Tari
    fee: 8000n,
    message: 'Broadcast pending payment',
    timestamp: new Date('2024-01-16T09:45:00Z'),
    recipientAddress: TEST_ADDRESSES.ALICE_TESTNET,
    status: TransactionStatus.Broadcast,
  },
};

/**
 * Test error scenarios
 */
export const TEST_ERROR_SCENARIOS = {
  INSUFFICIENT_FUNDS: {
    balance: TEST_BALANCES.INSUFFICIENT_FOR_SMALL_TX,
    attemptedTransaction: {
      amount: 1000000n,
      fee: 5000n,
      recipient: TEST_ADDRESSES.BOB_TESTNET,
    },
    expectedError: 'Insufficient funds',
  },
  
  INVALID_ADDRESS: {
    balance: TEST_BALANCES.MEDIUM,
    attemptedTransaction: {
      amount: 1000000n,
      fee: 5000n,
      recipient: TEST_ADDRESSES.INVALID,
    },
    expectedError: 'Invalid address',
  },
  
  NETWORK_ERROR: {
    balance: TEST_BALANCES.MEDIUM,
    networkCondition: 'offline',
    expectedError: 'Network error',
  },
  
  WALLET_LOCKED: {
    balance: TEST_BALANCES.MEDIUM,
    walletState: 'locked',
    expectedError: 'Wallet locked',
  },
};

/**
 * Test network configuration
 */
export const TEST_NETWORK_CONFIG = {
  TESTNET_BASE_NODES: [
    {
      name: 'testnet-node-1',
      publicKey: TEST_PUBLIC_KEYS.ALICE,
      address: '/ip4/127.0.0.1/tcp/18189',
    },
    {
      name: 'testnet-node-2',
      publicKey: TEST_PUBLIC_KEYS.BOB,
      address: '/ip4/127.0.0.1/tcp/18190',
    },
  ],
  
  MAINNET_BASE_NODES: [
    {
      name: 'mainnet-node-1',
      publicKey: TEST_PUBLIC_KEYS.CHARLIE,
      address: '/ip4/127.0.0.1/tcp/18089',
    },
  ],
};

/**
 * Test timing configurations
 */
export const TEST_TIMEOUTS = {
  UNIT_TEST: 5000, // 5 seconds
  INTEGRATION_TEST: 30000, // 30 seconds
  E2E_TEST: 300000, // 5 minutes
  NETWORK_OPERATION: 60000, // 1 minute
  SYNC_OPERATION: 180000, // 3 minutes
};

/**
 * Test data sets for property-based testing
 */
export const PROPERTY_TEST_DATA = {
  VALID_AMOUNTS: [
    1n, 1000n, 1000000n, 1000000000n, // Various scales
    999999999999n, // Near max
  ],
  
  INVALID_AMOUNTS: [
    0n, -1n, -1000000n, // Zero and negative
  ],
  
  VALID_FEES: [
    1000n, 5000n, 10000n, 25000n, 50000n,
  ],
  
  INVALID_FEES: [
    0n, -1n, 999n, // Too low
  ],
  
  EDGE_CASE_MESSAGES: [
    '', // Empty
    'x'.repeat(500), // Very long
    '🎯🚀💎', // Unicode/emoji
    '\n\t\r', // Whitespace
    'Special chars: !@#$%^&*()',
  ],
};

/**
 * Mock response templates for FFI testing
 */
export const MOCK_FFI_RESPONSES = {
  WALLET_CREATE_SUCCESS: {
    handle: 1,
    address: TEST_ADDRESSES.ALICE_TESTNET,
    network: 'testnet',
  },
  
  BALANCE_RESPONSE: {
    available: '1000000000',
    pending_incoming: '500000000',
    pending_outgoing: '100000000',
    timelocked: '0',
  },
  
  TRANSACTION_SUCCESS: {
    transaction_id: 'mock_tx_success_001',
    amount: '1000000',
    fee: '5000',
    status: 'pending',
  },
  
  NETWORK_ERROR: {
    error_code: 'NETWORK_ERROR',
    message: 'Failed to connect to base node',
  },
  
  INSUFFICIENT_FUNDS_ERROR: {
    error_code: 'INSUFFICIENT_FUNDS',
    message: 'Not enough funds available',
  },
};

/**
 * Helper function to get test fixtures by category
 */
export function getTestFixtures(category: string) {
  const fixtures = {
    seedWords: TEST_SEED_WORDS,
    addresses: TEST_ADDRESSES,
    publicKeys: TEST_PUBLIC_KEYS,
    walletConfigs: TEST_WALLET_CONFIGS,
    balances: TEST_BALANCES,
    transactions: TEST_TRANSACTIONS,
    pendingTransactions: TEST_PENDING_TRANSACTIONS,
    errorScenarios: TEST_ERROR_SCENARIOS,
    networkConfig: TEST_NETWORK_CONFIG,
    timeouts: TEST_TIMEOUTS,
    propertyTestData: PROPERTY_TEST_DATA,
    mockFFIResponses: MOCK_FFI_RESPONSES,
  };
  
  return fixtures[category as keyof typeof fixtures];
}

/**
 * Helper function to create a complete test scenario
 */
export function createTestScenario(scenarioName: string) {
  const scenarios = {
    newWallet: {
      config: TEST_WALLET_CONFIGS.NEW_WALLET_TESTNET,
      balance: TEST_BALANCES.EMPTY,
      transactions: [],
      pendingTransactions: [],
    },
    
    activeWallet: {
      config: TEST_WALLET_CONFIGS.ALICE_TESTNET,
      balance: TEST_BALANCES.MEDIUM,
      transactions: [
        TEST_TRANSACTIONS.SMALL_CONFIRMED_OUTBOUND,
        TEST_TRANSACTIONS.LARGE_CONFIRMED_INBOUND,
        TEST_TRANSACTIONS.OLD_CONFIRMED_INBOUND,
      ],
      pendingTransactions: [
        TEST_PENDING_TRANSACTIONS.STANDARD_PENDING,
        TEST_PENDING_TRANSACTIONS.BROADCAST_PENDING,
      ],
    },
    
    recoveryWallet: {
      config: TEST_WALLET_CONFIGS.RECOVERY_WALLET,
      balance: TEST_BALANCES.LARGE,
      transactions: [
        TEST_TRANSACTIONS.OLD_CONFIRMED_INBOUND,
      ],
      pendingTransactions: [],
    },
    
    problematicWallet: {
      config: TEST_WALLET_CONFIGS.BOB_TESTNET,
      balance: TEST_BALANCES.INSUFFICIENT_FOR_SMALL_TX,
      transactions: [
        TEST_TRANSACTIONS.CANCELLED_OUTBOUND,
      ],
      pendingTransactions: [
        TEST_PENDING_TRANSACTIONS.LARGE_PENDING,
      ],
    },
  };
  
  return scenarios[scenarioName as keyof typeof scenarios];
}
