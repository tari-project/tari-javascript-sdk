/**
 * @fileoverview Seed phrase management with BIP39 support and secure memory handling
 * 
 * This module provides secure seed phrase generation, validation, and management
 * with proper BIP39 compliance and memory cleanup to prevent seed exposure.
 */

import { randomBytes } from 'node:crypto';
import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  type ValidatedSeedPhrase
} from '@tari-project/tarijs-core';
import { BIP39Validator } from './bip39.js';
import { SeedValidation } from './validation.js';

/**
 * Configuration options for seed phrase generation
 */
export interface SeedGenerationOptions {
  /** Number of words to generate (12, 15, 18, 21, or 24) */
  wordCount?: 12 | 15 | 18 | 21 | 24;
  /** Language for the wordlist (default: 'english') */
  language?: 'english' | 'japanese' | 'chinese_simplified' | 'chinese_traditional' | 'french' | 'italian' | 'korean' | 'spanish';
  /** Custom entropy source (for testing) */
  entropy?: Buffer;
}

/**
 * Result of seed phrase validation
 */
export interface SeedValidationResult {
  /** Whether the seed phrase is valid */
  isValid: boolean;
  /** Error messages if validation failed */
  errors: string[];
  /** The normalized seed words if valid */
  normalizedWords?: string[];
}

/**
 * Secure memory buffer that can be zeroed
 */
class SecureBuffer {
  private buffer: Buffer;
  private isDestroyed = false;

  constructor(data: string | Buffer | string[]) {
    if (Array.isArray(data)) {
      this.buffer = Buffer.from(data.join(' '), 'utf8');
    } else if (typeof data === 'string') {
      this.buffer = Buffer.from(data, 'utf8');
    } else {
      this.buffer = Buffer.from(data);
    }
  }

  /**
   * Get the buffer contents as string array
   */
  toWords(): string[] {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.InvalidState,
        'SecureBuffer has been destroyed',
        { severity: ErrorSeverity.Error }
      );
    }
    return this.buffer.toString('utf8').split(' ');
  }

  /**
   * Get the buffer contents as string
   */
  toString(): string {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.InvalidState,
        'SecureBuffer has been destroyed',
        { severity: ErrorSeverity.Error }
      );
    }
    return this.buffer.toString('utf8');
  }

  /**
   * Zero the buffer and mark as destroyed
   */
  destroy(): void {
    if (!this.isDestroyed) {
      this.buffer.fill(0);
      this.isDestroyed = true;
    }
  }

  /**
   * Check if buffer is destroyed
   */
  get destroyed(): boolean {
    return this.isDestroyed;
  }
}

/**
 * Seed phrase manager with BIP39 support and secure memory handling
 */
export class SeedManager {
  private static readonly bip39Validator = new BIP39Validator();
  private static readonly seedValidation = new SeedValidation();

  /**
   * Generate a new BIP39 seed phrase
   */
  static async generateSeedPhrase(options: SeedGenerationOptions = {}): Promise<ValidatedSeedPhrase> {
    const {
      wordCount = 24,
      language = 'english',
      entropy
    } = options;

    try {
      // Calculate required entropy bits
      const entropyBits = this.getEntropyBits(wordCount);
      const entropyBytes = entropyBits / 8;

      // Generate or use provided entropy
      const entropyBuffer = entropy || await this.generateSecureEntropy(entropyBytes);

      // Generate mnemonic from entropy
      const words = await this.bip39Validator.entropyToMnemonic(entropyBuffer, language);

      // Validate the generated phrase
      const validationResult = await this.validateSeedPhrase(words);
      if (!validationResult.isValid) {
        throw new WalletError(
          WalletErrorCode.CryptoError,
          `Generated seed phrase validation failed: ${validationResult.errors.join(', ')}`,
          { severity: ErrorSeverity.Error }
        );
      }

      // Clean up entropy
      if (!entropy) {
        entropyBuffer.fill(0);
      }

      return words as ValidatedSeedPhrase;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to generate seed phrase',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Validate a seed phrase against BIP39 standards
   */
  static async validateSeedPhrase(words: string[]): Promise<SeedValidationResult> {
    try {
      // Basic validation
      const basicValidation = this.seedValidation.validateBasicFormat(words);
      if (!basicValidation.isValid) {
        return basicValidation;
      }

      // BIP39 validation
      const bip39Validation = await this.bip39Validator.validateMnemonic(words);
      if (!bip39Validation.isValid) {
        return {
          isValid: false,
          errors: bip39Validation.errors,
        };
      }

      // Normalize words
      const normalizedWords = words.map(word => word.toLowerCase().trim());

      return {
        isValid: true,
        errors: [],
        normalizedWords
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Create a secure buffer for seed phrase handling
   */
  static createSecureBuffer(words: string[]): SecureBuffer {
    return new SecureBuffer(words);
  }

  /**
   * Normalize seed phrase format
   */
  static normalizeSeedPhrase(words: string[]): string[] {
    return words
      .map(word => word.toLowerCase().trim())
      .filter(word => word.length > 0);
  }

  /**
   * Check if two seed phrases are equivalent
   */
  static areSeedPhrasesEquivalent(words1: string[], words2: string[]): boolean {
    const normalized1 = this.normalizeSeedPhrase(words1);
    const normalized2 = this.normalizeSeedPhrase(words2);

    if (normalized1.length !== normalized2.length) {
      return false;
    }

    return normalized1.every((word, index) => word === normalized2[index]);
  }

  /**
   * Convert seed phrase to entropy
   */
  static async seedPhraseToEntropy(words: string[]): Promise<Buffer> {
    const validationResult = await this.validateSeedPhrase(words);
    if (!validationResult.isValid) {
      throw new WalletError(
        WalletErrorCode.CryptoError,
        `Invalid seed phrase: ${validationResult.errors.join(', ')}`,
        { severity: ErrorSeverity.Error }
      );
    }

    return this.bip39Validator.mnemonicToEntropy(validationResult.normalizedWords!);
  }

  /**
   * Get required entropy bits for word count
   */
  private static getEntropyBits(wordCount: number): number {
    switch (wordCount) {
      case 12: return 128;
      case 15: return 160;
      case 18: return 192;
      case 21: return 224;
      case 24: return 256;
      default:
        throw new WalletError(
          WalletErrorCode.InvalidParameters,
          `Unsupported word count: ${wordCount}`,
          { severity: ErrorSeverity.Error }
        );
    }
  }

  /**
   * Generate cryptographically secure entropy
   */
  private static async generateSecureEntropy(bytes: number): Promise<Buffer> {
    try {
      return randomBytes(bytes);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to generate secure entropy',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }
}

export { SecureBuffer };
