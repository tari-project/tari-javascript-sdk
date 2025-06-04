import { NativeBinding, WalletHandle, AddressHandle } from '../bindings';

// Define mock types
type MockedNativeBinding = {
  [K in keyof NativeBinding]: jest.MockedFunction<NativeBinding[K]>;
};

let nextHandle = 1;
const wallets = new Map<number, any>();
const addresses = new Map<number, any>();

export const mockBinding: MockedNativeBinding = {
  initialize: jest.fn(),
  
  walletCreate: jest.fn().mockImplementation((config) => {
    const handle = nextHandle++ as WalletHandle;
    wallets.set(handle, {
      config,
      balance: {
        available: '1000000000',
        pending: '0',
        locked: '0',
        total: '1000000000',
      },
      seedWords: config.seedWords || 'mock seed words for testing purposes only',
    });
    return handle;
  }),
  
  walletDestroy: jest.fn().mockImplementation((handle) => {
    wallets.delete(handle);
  }),
  
  walletGetSeedWords: jest.fn().mockImplementation((handle) => {
    const wallet = wallets.get(handle);
    return wallet?.seedWords || '';
  }),
  
  walletGetBalance: jest.fn().mockImplementation((handle) => {
    const wallet = wallets.get(handle);
    return wallet?.balance || {
      available: '0',
      pending: '0',
      locked: '0',
      total: '0',
    };
  }),
  
  walletGetAddress: jest.fn().mockImplementation((handle) => {
    const addressHandle = nextHandle++ as AddressHandle;
    addresses.set(addressHandle, {
      walletHandle: handle,
      address: `emoji_address_${addressHandle}`,
    });
    return {
      handle: addressHandle,
      emojiId: `🎉🎨🎭🎪🎯🎲🎸🎺_${addressHandle}`,
    };
  }),
  
  walletSendTransaction: jest.fn().mockImplementation((handle, params) => {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }),
  
  addressDestroy: jest.fn().mockImplementation((handle) => {
    addresses.delete(handle);
  }),
  
  // Additional mocked functions
  privateKeyGenerate: jest.fn().mockReturnValue(nextHandle++),
  privateKeyFromHex: jest.fn().mockReturnValue(nextHandle++),
  privateKeyDestroy: jest.fn(),
  walletGetUtxos: jest.fn().mockReturnValue([
    {
      value: '1000000',
      commitment: 'commitment_1',
      minedHeight: 100,
      status: 0,
    },
  ]),
  walletStartRecovery: jest.fn().mockImplementation((handle, key, callback) => {
    // Simulate recovery progress
    setTimeout(() => callback(50, 100), 100);
    setTimeout(() => callback(100, 100), 200);
    return true;
  }),
  
  // Additional missing methods
  publicKeyFromPrivateKey: jest.fn().mockReturnValue(nextHandle++),
  publicKeyFromHex: jest.fn().mockReturnValue(nextHandle++),
  publicKeyDestroy: jest.fn(),
  walletImportUtxo: jest.fn().mockReturnValue(true),
  walletCoinSplit: jest.fn().mockReturnValue(`split_tx_${Date.now()}`),
  walletCoinJoin: jest.fn().mockReturnValue(`join_tx_${Date.now()}`),
  walletIsRecoveryInProgress: jest.fn().mockReturnValue(false),
  walletGetPeers: jest.fn().mockReturnValue([]),
  walletAddPeer: jest.fn().mockReturnValue(true),
  walletBanPeer: jest.fn().mockReturnValue(true),
  createCovenant: jest.fn().mockReturnValue(nextHandle++),
  covenantDestroy: jest.fn(),
  compileScript: jest.fn().mockReturnValue(nextHandle++),
  scriptDestroy: jest.fn(),
  registerCallback: jest.fn().mockReturnValue(nextHandle++),
  unregisterCallback: jest.fn().mockReturnValue(true),
  clearAllCallbacks: jest.fn(),
  getCallbackCount: jest.fn().mockReturnValue(0),
};

export const binding = mockBinding;
export const setBinding = jest.fn();
