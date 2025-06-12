/**
 * @fileoverview BIP39 wordlist validation and mnemonic operations
 * 
 * This module provides BIP39-compliant mnemonic validation, entropy conversion,
 * and wordlist checking with support for multiple languages.
 */

import { createHash, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity
} from '@tari-project/tarijs-core';

const pbkdf2Async = promisify(pbkdf2);

/**
 * BIP39 wordlist interface
 */
export interface BIP39Wordlist {
  words: string[];
  language: string;
}

/**
 * Validation result for BIP39 operations
 */
export interface BIP39ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * BIP39 English wordlist (2048 words)
 * This is a subset for demonstration - in production, import from a proper BIP39 library
 */
const ENGLISH_WORDLIST: string[] = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
  'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
  'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
  'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'against', 'age',
  'agent', 'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol',
  'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also',
  'alter', 'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient',
  'anger', 'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna',
  'antique', 'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch',
  'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange',
  'arrest', 'arrive', 'arrow', 'art', 'article', 'artist', 'artwork', 'ask', 'aspect', 'assault',
  'asset', 'assist', 'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract',
  'auction', 'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid',
  'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor', 'bacon',
  'badge', 'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana', 'banner', 'bar', 'barely',
  'bargain', 'barrel', 'base', 'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because',
  'become', 'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench',
  'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike', 'bind',
  'biology', 'bird', 'birth', 'bitter', 'black', 'blade', 'blame', 'blanket', 'blast', 'bleak',
  'bless', 'blind', 'blood', 'blossom', 'blow', 'blue', 'blur', 'blush', 'board', 'boat',
  // NOTE: This is truncated for demonstration. In production, use a complete BIP39 library
  // The full list contains 2048 words
];

/**
 * BIP39 validator for mnemonic seed phrases
 */
export class BIP39Validator {
  private static readonly wordlists: Map<string, BIP39Wordlist> = new Map([
    ['english', { words: ENGLISH_WORDLIST, language: 'english' }]
  ]);

  /**
   * Validate a mnemonic against BIP39 standards
   */
  async validateMnemonic(words: string[], language: string = 'english'): Promise<BIP39ValidationResult> {
    const errors: string[] = [];

    try {
      // Get wordlist
      const wordlist = BIP39Validator.wordlists.get(language);
      if (!wordlist) {
        errors.push(`Unsupported language: ${language}`);
        return { isValid: false, errors };
      }

      // Check word count
      if (![12, 15, 18, 21, 24].includes(words.length)) {
        errors.push(`Invalid word count: ${words.length}. Must be 12, 15, 18, 21, or 24 words.`);
      }

      // Normalize words
      const normalizedWords = words.map(word => word.toLowerCase().trim());

      // Check each word is in wordlist
      const invalidWords: string[] = [];
      const wordIndices: number[] = [];

      for (let i = 0; i < normalizedWords.length; i++) {
        const word = normalizedWords[i];
        const index = wordlist.words.indexOf(word);
        
        if (index === -1) {
          invalidWords.push(`"${word}" at position ${i + 1}`);
        } else {
          wordIndices.push(index);
        }
      }

      if (invalidWords.length > 0) {
        errors.push(`Invalid words not in BIP39 wordlist: ${invalidWords.join(', ')}`);
      }

      // Check checksum if all words are valid
      if (invalidWords.length === 0 && wordIndices.length === words.length) {
        const checksumValid = await this.validateChecksum(wordIndices, words.length);
        if (!checksumValid) {
          errors.push('Invalid checksum - this is not a valid BIP39 mnemonic');
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error: unknown) {
      errors.push(`Validation error: ${(error as Error).message}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Convert entropy to mnemonic
   */
  async entropyToMnemonic(entropy: Buffer, language: string = 'english'): Promise<string[]> {
    const wordlist = BIP39Validator.wordlists.get(language);
    if (!wordlist) {
      throw new WalletError(
        WalletErrorCode.InvalidParameters,
        `Unsupported language: ${language}`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Check entropy length
    if (entropy.length < 16 || entropy.length > 32 || entropy.length % 4 !== 0) {
      throw new WalletError(
        WalletErrorCode.InvalidParameters,
        `Invalid entropy length: ${entropy.length}. Must be 16-32 bytes and divisible by 4.`,
        { severity: ErrorSeverity.Error }
      );
    }

    try {
      // Calculate checksum
      const hash = createHash('sha256').update(entropy).digest();
      const checksumBits = entropy.length / 4; // 1 bit per 4 bytes of entropy
      
      // Convert entropy + checksum to binary string
      let binaryString = '';
      
      // Add entropy bits
      for (const byte of entropy) {
        binaryString += byte.toString(2).padStart(8, '0');
      }
      
      // Add checksum bits
      const checksumByte = hash[0];
      const checksumBinary = checksumByte.toString(2).padStart(8, '0');
      binaryString += checksumBinary.substring(0, checksumBits);

      // Convert to word indices (11 bits each)
      const words: string[] = [];
      for (let i = 0; i < binaryString.length; i += 11) {
        const indexBinary = binaryString.substring(i, i + 11);
        const index = parseInt(indexBinary, 2);
        
        if (index >= wordlist.words.length) {
          throw new WalletError(
            WalletErrorCode.InternalError,
            `Word index ${index} exceeds wordlist length`,
            { severity: ErrorSeverity.Error }
          );
        }
        
        words.push(wordlist.words[index]);
      }

      return words;
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to convert entropy to mnemonic',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Convert mnemonic to entropy
   */
  async mnemonicToEntropy(words: string[], language: string = 'english'): Promise<Buffer> {
    const wordlist = BIP39Validator.wordlists.get(language);
    if (!wordlist) {
      throw new WalletError(
        WalletErrorCode.InvalidParameters,
        `Unsupported language: ${language}`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Validate mnemonic first
    const validation = await this.validateMnemonic(words, language);
    if (!validation.isValid) {
      throw new WalletError(
        WalletErrorCode.CryptoError,
        `Invalid mnemonic: ${validation.errors.join(', ')}`,
        { severity: ErrorSeverity.Error }
      );
    }

    try {
      // Convert words to indices
      const normalizedWords = words.map(word => word.toLowerCase().trim());
      const indices = normalizedWords.map(word => {
        const index = wordlist.words.indexOf(word);
        if (index === -1) {
          throw new WalletError(
            WalletErrorCode.CryptoError,
            `Word "${word}" not found in wordlist`,
            { severity: ErrorSeverity.Error }
          );
        }
        return index;
      });

      // Convert indices to binary string
      let binaryString = '';
      for (const index of indices) {
        binaryString += index.toString(2).padStart(11, '0');
      }

      // Calculate entropy length
      const entropyBits = (words.length * 11) - (words.length * 11 / 33);
      const entropyBytes = Math.floor(entropyBits / 8);

      // Extract entropy (without checksum)
      const entropyBinary = binaryString.substring(0, entropyBits);
      const entropyBuffer = Buffer.alloc(entropyBytes);

      for (let i = 0; i < entropyBytes; i++) {
        const byteBinary = entropyBinary.substring(i * 8, (i + 1) * 8);
        entropyBuffer[i] = parseInt(byteBinary, 2);
      }

      return entropyBuffer;
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to convert mnemonic to entropy',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Generate seed from mnemonic with optional passphrase
   */
  async mnemonicToSeed(words: string[], passphrase: string = ''): Promise<Buffer> {
    const mnemonic = words.join(' ');
    const salt = `mnemonic${passphrase}`;

    try {
      return await pbkdf2Async(mnemonic, salt, 2048, 64, 'sha512');
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to derive seed from mnemonic',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error
        }
      );
    }
  }

  /**
   * Get available languages
   */
  static getAvailableLanguages(): string[] {
    return Array.from(BIP39Validator.wordlists.keys());
  }

  /**
   * Check if a word is in the wordlist
   */
  isWordInWordlist(word: string, language: string = 'english'): boolean {
    const wordlist = BIP39Validator.wordlists.get(language);
    if (!wordlist) {
      return false;
    }
    return wordlist.words.includes(word.toLowerCase().trim());
  }

  /**
   * Get word suggestions for partial matches
   */
  getWordSuggestions(partial: string, language: string = 'english', limit: number = 10): string[] {
    const wordlist = BIP39Validator.wordlists.get(language);
    if (!wordlist) {
      return [];
    }

    const normalized = partial.toLowerCase().trim();
    return wordlist.words
      .filter(word => word.startsWith(normalized))
      .slice(0, limit);
  }

  /**
   * Validate checksum of word indices
   */
  private async validateChecksum(wordIndices: number[], wordCount: number): Promise<boolean> {
    try {
      // Convert indices to binary
      let binaryString = '';
      for (const index of wordIndices) {
        binaryString += index.toString(2).padStart(11, '0');
      }

      // Calculate entropy and checksum lengths
      const totalBits = wordCount * 11;
      const checksumBits = totalBits / 33;
      const entropyBits = totalBits - checksumBits;

      // Extract entropy and checksum
      const entropyBinary = binaryString.substring(0, entropyBits);
      const checksumBinary = binaryString.substring(entropyBits);

      // Convert entropy to bytes
      const entropyBytes = Math.floor(entropyBits / 8);
      const entropyBuffer = Buffer.alloc(entropyBytes);

      for (let i = 0; i < entropyBytes; i++) {
        const byteBinary = entropyBinary.substring(i * 8, (i + 1) * 8);
        entropyBuffer[i] = parseInt(byteBinary, 2);
      }

      // Calculate expected checksum
      const hash = createHash('sha256').update(entropyBuffer).digest();
      const expectedChecksumBinary = hash[0].toString(2).padStart(8, '0').substring(0, checksumBits);

      return checksumBinary === expectedChecksumBinary;
    } catch {
      return false;
    }
  }
}
