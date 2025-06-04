import { TariWallet, WalletConfig } from '@tari/wallet';
import { Network, ffi, initialize } from '@tari/core';
import { MiningManager } from './mining';
import { P2PManager } from './p2p';
import { AdvancedFeatures } from './advanced';
import { RecoveryManager } from './recovery';

export interface TariClientConfig extends WalletConfig {
  enableMining?: boolean;
  enableP2P?: boolean;
  enableAdvanced?: boolean;
}

/**
 * Full Tari client with access to all protocol features
 */
export class TariClient {
  private _wallet: TariWallet;
  private _mining?: MiningManager;
  private _p2p?: P2PManager;
  private _advanced?: AdvancedFeatures;
  private _recovery?: RecoveryManager;

  constructor(config: TariClientConfig) {
    // Ensure core is initialized
    initialize();
    
    // Create wallet
    this._wallet = new TariWallet(config);
    
    // Initialize optional components
    if (config.enableMining) {
      this._mining = new MiningManager(this._wallet);
    }
    
    if (config.enableP2P) {
      this._p2p = new P2PManager(this._wallet);
    }
    
    if (config.enableAdvanced) {
      this._advanced = new AdvancedFeatures();
    }
    
    this._recovery = new RecoveryManager(this._wallet);
  }

  /**
   * Connect to network
   */
  async connect(): Promise<void> {
    await this._wallet.connect();
    
    // Initialize components that need connection
    if (this._p2p) {
      await this._p2p.initialize();
    }
  }

  /**
   * Access wallet functionality
   */
  get wallet(): TariWallet {
    return this._wallet;
  }

  /**
   * Access mining functionality
   */
  get mining(): MiningManager {
    if (!this._mining) {
      throw new Error('Mining not enabled. Set enableMining: true in config');
    }
    return this._mining;
  }

  /**
   * Access P2P functionality
   */
  get p2p(): P2PManager {
    if (!this._p2p) {
      throw new Error('P2P not enabled. Set enableP2P: true in config');
    }
    return this._p2p;
  }

  /**
   * Access advanced features
   */
  get advanced(): AdvancedFeatures {
    if (!this._advanced) {
      throw new Error('Advanced features not enabled. Set enableAdvanced: true in config');
    }
    return this._advanced;
  }

  /**
   * Access recovery functionality
   */
  get recovery(): RecoveryManager {
    return this._recovery!;
  }

  /**
   * Close client and cleanup
   */
  async close(): Promise<void> {
    if (this._mining) {
      await this._mining.shutdown();
    }
    
    if (this._p2p) {
      await this._p2p.shutdown();
    }
    
    await this._wallet.close();
  }

  /**
   * Create client with builder pattern
   */
  static builder() {
    return new ClientBuilder();
  }
}

export class ClientBuilder {
  private config: Partial<TariClientConfig> = {};

  network(network: Network): this {
    this.config.network = network;
    return this;
  }

  seedWords(words: string): this {
    this.config.seedWords = words;
    return this;
  }

  enableMining(): this {
    this.config.enableMining = true;
    return this;
  }

  enableP2P(): this {
    this.config.enableP2P = true;
    return this;
  }

  enableAdvanced(): this {
    this.config.enableAdvanced = true;
    return this;
  }

  enableAll(): this {
    this.config.enableMining = true;
    this.config.enableP2P = true;
    this.config.enableAdvanced = true;
    return this;
  }

  build(): TariClient {
    if (!this.config.network) {
      throw new Error('Network is required');
    }
    
    return new TariClient(this.config as TariClientConfig);
  }
}
