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
import { SeedManager, type SeedValidationResult } from './seed/index.js';
import { 
  WalletRestorationService,
  type RestorationOptions,
  type RestorationResult,
  type RestorationEventHandlers
} from './restore/index.js';

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
    } catch (error: unknown) {
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
   * Restore a wallet from seed words with BIP39 validation
   * 
   * @param seedWords - Array of 12, 15, 18, 21, or 24 seed words
   * @param userConfig - Partial wallet configuration
   * @param options - Factory options
   * @returns Promise resolving to restored TariWallet instance
   */
  static async restore(
    seedWords: string[], 
    userConfig: Partial<WalletConfig>,
    options: WalletFactoryOptions = {}
  ): Promise<TariWallet> {
    await this.ensureInitialized();

    // Validate seed words using BIP39 standards
    const validationResult = await SeedManager.validateSeedPhrase(seedWords);
    if (!validationResult.isValid) {
      throw new WalletError(
        WalletErrorCode.CryptoError,
        `Invalid seed words: ${validationResult.errors.join(', ')}`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Use normalized seed words
    const normalizedSeedWords = validationResult.normalizedWords!;

    const opts = { ...DEFAULT_FACTORY_OPTIONS, ...options };
    
    // Merge config with normalized seed words
    const configWithSeed = createWalletConfig({
      ...userConfig,
      seedWords: [...normalizedSeedWords] // Use validated and normalized words
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
   * Restore a wallet with advanced progress tracking and monitoring
   * 
   * This method provides comprehensive restoration with real-time progress updates,
   * enhanced error recovery, and detailed validation. Use this for production
   * applications that need user feedback during restoration.
   * 
   * @param seedWords - Array of 12, 15, 18, 21, or 24 seed words
   * @param userConfig - Partial wallet configuration
   * @param restorationOptions - Advanced restoration options
   * @param factoryOptions - Factory options
   * @returns Promise resolving to restoration result
   */
  static async restoreWithProgress(
    seedWords: string[],
    userConfig: Partial<WalletConfig>,
    restorationOptions: RestorationOptions = {},
    factoryOptions: WalletFactoryOptions = {}
  ): Promise<{ wallet: TariWallet; result: RestorationResult }> {
    await this.ensureInitialized();

    const opts = { ...DEFAULT_FACTORY_OPTIONS, ...factoryOptions };
    
    // Merge config but don't include seed words yet (restoration service handles them)
    const config = createWalletConfig(userConfig);

    // Validate configuration (without seed words)
    if (opts.validateConfig) {
      const validation = await validateWalletConfig(config, {
        checkPaths: opts.checkResources,
        checkDiskSpace: opts.checkResources,
        validateSeedWords: false, // Let restoration service handle this
      });

      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new WalletError(
          WalletErrorCode.InvalidConfig,
          `Wallet restoration configuration validation failed: ${errorMessages}`,
          { severity: ErrorSeverity.Error }
        );
      }
    } else {
      validateRequiredFields(config);
    }

    // Create restoration service
    const restorationService = new WalletRestorationService();

    try {
      // Perform restoration with progress tracking
      const restorationResult = await restorationService.restoreWallet(
        seedWords,
        config,
        restorationOptions
      );

      if (!restorationResult.success || !restorationResult.walletHandle) {
        throw restorationResult.error || new WalletError(
          WalletErrorCode.InitializationFailed,
          'Wallet restoration failed'
        );
      }

      // Create wallet instance from restored handle
      const wallet = new TariWallet(
        restorationResult.walletHandle,
        { ...config, seedWords: [...seedWords] } // Include validated seed words
      );

      // Register for cleanup tracking
      if (opts.trackResources) {
        WalletResourceTracker.register(wallet, () => wallet.destroy());
      }

      return { wallet, result: restorationResult };

    } catch (error: unknown) {
      // Cleanup restoration service
      restorationService.destroy();
      throw error;
    } finally {
      // Always cleanup restoration service
      restorationService.destroy();
    }
  }

  /**
   * Create a restoration service for custom restoration workflows
   * 
   * This method allows applications to manage the restoration process directly
   * with full control over progress monitoring and error handling.
   * 
   * @returns New WalletRestorationService instance
   */
  static createRestorationService(): WalletRestorationService {
    return new WalletRestorationService();
  }

  /**
   * Generate a new seed phrase using BIP39 standards
   * 
   * @param wordCount - Number of words (12, 15, 18, 21, or 24)
   * @param language - BIP39 language (default: 'english')
   * @returns Promise resolving to new seed phrase
   */
  static async generateSeedPhrase(
    wordCount: 12 | 15 | 18 | 21 | 24 = 24,
    language: 'english' = 'english'
  ): Promise<string[]> {
    const seedPhrase = await SeedManager.generateSeedPhrase({ 
      wordCount,
      language
    });
    return Array.from(seedPhrase);
  }

  /**
   * Validate seed words against BIP39 standards
   * 
   * @param seedWords - Array of seed words to validate
   * @returns Promise resolving to validation result
   */
  static async validateSeedWords(seedWords: string[]): Promise<SeedValidationResult> {
    return SeedManager.validateSeedPhrase(seedWords);
  }

  /**
   * Create a new wallet with generated seed phrase
   * 
   * @param userConfig - Partial wallet configuration
   * @param options - Factory options including seed generation preferences
   * @returns Promise resolving to new TariWallet instance and seed phrase
   */
  static async createWithGeneratedSeed(
    userConfig: Partial<WalletConfig> = {},
    options: WalletFactoryOptions & { 
      wordCount?: 12 | 15 | 18 | 21 | 24;
      language?: 'english';
    } = {}
  ): Promise<{ wallet: TariWallet; seedPhrase: string[] }> {
    const { wordCount = 24, language = 'english' as const, ...factoryOptions } = options;
    
    // Generate new seed phrase
    const seedPhrase = await this.generateSeedPhrase(wordCount, language);
    
    // Create wallet using the generated seed phrase
    const wallet = await this.restore(seedPhrase, userConfig, factoryOptions);
    
    return { wallet, seedPhrase };
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
    } catch (error: unknown) {
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
