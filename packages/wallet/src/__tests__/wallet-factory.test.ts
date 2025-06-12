/**
 * @fileoverview Unit tests for WalletFactory
 */

import { WalletFactory } from '../wallet-factory';
import { NetworkType } from '@tari-project/tarijs-core';

// Mock the FFI bindings
jest.mock('@tari-project/tarijs-core', () => ({
  NetworkType: {
    Mainnet: 'mainnet',
    Testnet: 'testnet',
    Nextnet: 'nextnet'
  },
  getFFIBindings: jest.fn(() => ({
    createWallet: jest.fn().mockResolvedValue(12345),
    destroyWallet: jest.fn().mockResolvedValue(undefined)
  })),
  WalletError: class WalletError extends Error {
    constructor(public code: number, message: string, public context?: any) {
      super(message);
    }
  },
  WalletErrorCode: {
    InvalidConfig: 1000
  },
  ErrorSeverity: {
    Error: 'error'
  }
}));

describe('WalletFactory', () => {
  beforeEach(async () => {
    await WalletFactory.initialize();
  });

  test('should initialize successfully', async () => {
    expect(WalletFactory.isInitialized()).toBe(true);
  });

  test('should generate seed phrase', async () => {
    const seedPhrase = await WalletFactory.generateSeedPhrase(12);
    
    expect(Array.isArray(seedPhrase)).toBe(true);
    expect(seedPhrase).toHaveLength(12);
    expect(seedPhrase.every(word => typeof word === 'string')).toBe(true);
  });

  test('should generate different seed phrases', async () => {
    const phrase1 = await WalletFactory.generateSeedPhrase(24);
    const phrase2 = await WalletFactory.generateSeedPhrase(24);
    
    expect(phrase1).not.toEqual(phrase2);
  });

  test('should support different word counts', async () => {
    const wordCounts = [12, 15, 18, 21, 24] as const;
    
    for (const count of wordCounts) {
      const phrase = await WalletFactory.generateSeedPhrase(count);
      expect(phrase).toHaveLength(count);
    }
  });
});
