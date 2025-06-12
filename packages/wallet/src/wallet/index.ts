/**
 * @fileoverview Main wallet implementation and factory methods
 * 
 * This module provides the primary TariWallet class and WalletFactory
 * that applications will use to interact with the Tari network.
 */

// Export the main TariWallet class
export { TariWallet } from '../tari-wallet.js';

// Export the wallet factory
export { WalletFactory, type WalletFactoryOptions } from '../wallet-factory.js';

// Export state management types
export { 
  WalletState, 
  type WalletStateStats,
  type StateTransition 
} from '../wallet-state.js';

// Export lifecycle types
export { 
  LifecycleEvent,
  type LifecycleHooks,
  type LifecycleStats
} from '../lifecycle/index.js';
