import { NativeBinding, WalletHandle, AddressHandle } from '../bindings';

let nextHandle = 1;
const wallets = new Map<number, any>();
const addresses = new Map<number, any>();

export const mockBinding: NativeBinding = {
  initialize: jest.fn(),
  
  walletCreate: jest.fn((config) => {
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
  
  walletDestroy: jest.fn((handle) => {
    wallets.delete(handle);
  }),
  
  walletGetSeedWords: jest.fn((handle) => {
    const wallet = wallets.get(handle);
    return wallet?.seedWords || '';
  }),
  
  walletGetBalance: jest.fn((handle) => {
    const wallet = wallets.get(handle);
    return wallet?.balance || {
      available: '0',
      pending: '0',
      locked: '0',
      total: '0',
    };
  }),
  
  walletGetAddress: jest.fn((handle) => {
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
  
  walletSendTransaction: jest.fn((handle, params) => {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }),
  
  addressDestroy: jest.fn((handle) => {
    addresses.delete(handle);
  }),
  
  // Additional mocked functions
  privateKeyGenerate: jest.fn(() => nextHandle++),
  privateKeyFromHex: jest.fn(() => nextHandle++),
  privateKeyDestroy: jest.fn(),
  walletGetUtxos: jest.fn(() => [
    {
      value: '1000000',
      commitment: 'commitment_1',
      minedHeight: 100,
      status: 0,
    },
  ]),
  walletStartRecovery: jest.fn((handle, key, callback) => {
    // Simulate recovery progress
    setTimeout(() => callback(50, 100), 100);
    setTimeout(() => callback(100, 100), 200);
    return true;
  }),
};

export const binding = mockBinding;
export const setBinding = jest.fn();
