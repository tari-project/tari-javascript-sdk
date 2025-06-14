/**
 * Unit test setup specifically for DisposableResource inheritance and FFI mocking
 * Addresses import resolution issues in Jest environment
 */

// Mock global FFI bindings at module level
const mockFFI = {
  walletCreate: jest.fn().mockResolvedValue(1),
  walletDestroy: jest.fn().mockResolvedValue(undefined),
  walletGetBalance: jest.fn().mockResolvedValue({
    available: '1000000000',
    pending_incoming: '0',
    pending_outgoing: '0',
    timelocked: '0',
  }),
  walletGetAddress: jest.fn().mockResolvedValue('tari://testnet/mock_address'),
  init_logging: jest.fn().mockResolvedValue(undefined),
  walletGetSeedWords: jest.fn().mockResolvedValue(['abandon', 'ability', 'able']),
  walletSetBaseNode: jest.fn().mockResolvedValue(undefined),
  walletSendTransaction: jest.fn().mockResolvedValue('mock_tx_123'),
  reset: jest.fn(),
  setFailureMode: jest.fn(),
  setFailureRate: jest.fn(),
  setLatency: jest.fn(),
};

// Make getMockNativeBindings available globally
(global as any).getMockNativeBindings = () => mockFFI;

// Mock the native module at the module level to prevent real FFI loading
jest.mock('../../packages/core/src/ffi/native', () => mockFFI);
jest.mock('@tari-project/tarijs-core/native', () => mockFFI);

export { mockFFI };
