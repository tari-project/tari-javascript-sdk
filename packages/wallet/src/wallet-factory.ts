/**
 * @fileoverview Wallet factory for creating and restoring Tari wallet instances
 * 
 * Provides static factory methods with configuration validation, resource tracking,
 * and proper initialization patterns. Ensures only properly configured wallets
 * are created and manages the complete wallet lifecycle.
 */

import { 
  getFFIBindings,
  WalletError, 
  WalletErrorCode,
  ErrorSeverity,
  type FFIWalletConfig
} from '@tari-project/tarijs-core';
import type { WalletConfig } from './types/index.js';
import { TariWallet } from './tari-wallet.js';
import { validateWalletConfig, validateRequiredFields } from './config/validator.js';
import { createWalletConfig, mergeConfig } from './config/defaults.js';

/**
 * Factory options for wallet creation
 */
export interface WalletFactoryOptions {
  /** Whether to validate configuration thoroughly */
  validateConfig?: boolean;
  /** Whether to check disk space and paths */
  checkResources?: boolean;
  /** Custom initialization timeout in milliseconds */
  initTimeoutMs?: number;
  /** Whether to enable automatic cleanup tracking */
  trackResources?: boolean;
}

/**
 * Default factory options
 */
const DEFAULT_FACTORY_OPTIONS: Required<WalletFactoryOptions> = {
  validateConfig: true,
  checkResources: true,
  initTimeoutMs: 30_000,
  trackResources: true,
};

/**
 * Resource tracking for cleanup
 */
class WalletResourceTracker {
  private static instances = new Set<TariWallet>();
  private static cleanupHandlers = new Map<TariWallet, () => Promise<void>>();

  static register(wallet: TariWallet, cleanupHandler: () => Promise<void>): void {
    this.instances.add(wallet);
    this.cleanupHandlers.set(wallet, cleanupHandler);
  }

  static unregister(wallet: TariWallet): void {
    this.instances.delete(wallet);
    this.cleanupHandlers.delete(wallet);
  }

  static async cleanupAll(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];
    
    for (const [wallet, cleanup] of this.cleanupHandlers) {
      if (!wallet.isDestroyed) {
        cleanupPromises.push(cleanup().catch(error => {
          console.warn(`Failed to cleanup wallet ${wallet.id}:`, error);
        }));
      }
    }

    await Promise.allSettled(cleanupPromises);
    this.instances.clear();
    this.cleanupHandlers.clear();
  }

  static getActiveCount(): number {
    return this.instances.size;
  }
}

/**
 * Static factory for creating and restoring Tari wallet instances
 */
export class WalletFactory {
  private static initialized = false;

  /**
   * Initialize the wallet factory (must be called before creating wallets)
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize FFI bindings
      const bindings = getFFIBindings();
      await bindings.initialize();
      
      this.initialized = true;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InitializationFailed,
        'Failed to initialize wallet factory',
        {
          severity: ErrorSeverity.Critical,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Create a new Tari wallet instance
   */
  static async create(
    userConfig: Partial<WalletConfig>, 
    options: WalletFactoryOptions = {}
  ): Promise<TariWallet> {
    await this.ensureInitialized();
    
    const opts = { ...DEFAULT_FACTORY_OPTIONS, ...options };
    
    // Merge user config with defaults
    const config = createWalletConfig(userConfig);
    
    // Validate configuration if requested
    if (opts.validateConfig) {
      const validation = await validateWalletConfig(config, {
        checkPaths: opts.checkResources,
        checkDiskSpace: opts.checkResources,
        validateSeedWords: false, // Not needed for creation
      });

      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new WalletError(
          WalletErrorCode.InvalidConfig,
          `Wallet configuration validation failed: ${errorMessages}`,
          {
            severity: ErrorSeverity.Error
          }
        );
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn('Wallet configuration warnings:', 
          validation.warnings.map(w => w.message).join('; '));
      }
    } else {
      // Always validate required fields
      validateRequiredFields(config);
    }

    // Convert to FFI config
    const ffiConfig = this.configToFFI(config);
    
    // Create wallet with timeout
    const wallet = await Promise.race([
      this.createWalletInstance(ffiConfig, config, opts),
      this.createTimeoutPromise(opts.initTimeoutMs)
    ]);

    return wallet;
  }

  /**
   * Restore a wallet from seed words
   */
  static async restore(
    seedWords: string[], 
    userConfig: Partial<WalletConfig>,
    options: WalletFactoryOptions = {}
  ): Promise<TariWallet> {
    await this.ensureInitialized();

    if (!seedWords || !Array.isArray(seedWords) || seedWords.length !== 24) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Seed words must be an array of exactly 24 words',
        {
          severity: ErrorSeverity.Error
        }
      );
    }

    const opts = { ...DEFAULT_FACTORY_OPTIONS, ...options };
    
    // Merge config with seed words
    const configWithSeed = createWalletConfig({
      ...userConfig,
      seedWords: [...seedWords] // Create copy to avoid mutation
    });

    // Validate configuration including seed words
    if (opts.validateConfig) {
      const validation = await validateWalletConfig(configWithSeed, {
        checkPaths: opts.checkResources,
        checkDiskSpace: opts.checkResources,
        validateSeedWords: true,
      });

      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new WalletError(
          WalletErrorCode.InvalidConfig,
          `Wallet restoration configuration validation failed: ${errorMessages}`,
          {
            severity: ErrorSeverity.Error
          }
        );
      }
    } else {
      validateRequiredFields(configWithSeed);
    }

    // Convert to FFI config
    const ffiConfig = this.configToFFI(configWithSeed);
    
    // Create wallet with timeout
    const wallet = await Promise.race([
      this.createWalletInstance(ffiConfig, configWithSeed, opts),
      this.createTimeoutPromise(opts.initTimeoutMs)
    ]);

    return wallet;
  }

  /**
   * Create a wallet with minimal configuration for testing
   */
  static async createForTesting(overrides: Partial<WalletConfig> = {}): Promise<TariWallet> {
    const testConfig: Partial<WalletConfig> = {
      network: 'testnet' as any,
      storagePath: `./test-wallet-${Date.now()}`,
      logLevel: 1, // Minimal logging
      ...overrides
    };

    return this.create(testConfig, {
      validateConfig: false,
      checkResources: false,
      trackResources: false
    });
  }

  /**
   * Get the number of active wallet instances
   */
  static getActiveWalletCount(): number {
    return WalletResourceTracker.getActiveCount();
  }

  /**
   * Clean up all active wallet instances (for testing/shutdown)
   */
  static async cleanupAll(): Promise<void> {
    await WalletResourceTracker.cleanupAll();
  }

  /**
   * Check if the factory is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset the factory state (for testing)
   */
  static reset(): void {
    this.initialized = false;
  }

  // Private implementation methods

  private static async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private static async createWalletInstance(
    ffiConfig: FFIWalletConfig,
    config: WalletConfig,
    options: Required<WalletFactoryOptions>
  ): Promise<TariWallet> {
    try {
      // Create FFI wallet handle
      const bindings = getFFIBindings();
      const handle = await bindings.createWallet(ffiConfig);

      // Create wallet wrapper instance with lifecycle hooks
      const hooks = options.trackResources ? {
        afterInit: async () => {
          console.log(`Wallet ${handle} initialized successfully`);
        },
        beforeDestroy: async () => {
          console.log(`Wallet ${handle} starting cleanup`);
        }
      } : {};

      const wallet = new TariWallet(handle, config, hooks);

      // Register for cleanup tracking if enabled
      if (options.trackResources) {
        WalletResourceTracker.register(wallet, async () => {
          await wallet.destroy();
        });
      }

      return wallet;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InitializationFailed,
        'Failed to create wallet instance',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  private static configToFFI(config: WalletConfig): FFIWalletConfig {
    return {
      network: config.network,
      storagePath: config.storagePath,
      logPath: config.logPath,
      logLevel: config.logLevel,
      passphrase: config.passphrase,
      seedWords: config.seedWords,
      numRollingLogFiles: config.numRollingLogFiles,
      rollingLogFileSize: config.rollingLogFileSize,
    };
  }

  private static async createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new WalletError(
          WalletErrorCode.OperationTimeout,
          `Wallet creation timed out after ${timeoutMs}ms`,
          {
            severity: ErrorSeverity.Error
          }
        ));
      }, timeoutMs);
    });
  }

  private static sanitizeConfig(config: WalletConfig): Partial<WalletConfig> {
    const { passphrase, seedWords, ...safe } = config;
    return {
      ...safe,
      passphrase: passphrase ? '[REDACTED]' : undefined,
      seedWords: seedWords ? ['[REDACTED]'] : undefined,
    };
  }
}

// Export resource tracker for testing
export { WalletResourceTracker };
