/**
 * @fileoverview Seed phrase validation utilities
 * 
 * This module provides comprehensive validation for seed phrases including
 * format validation, length checks, and character validation.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity
} from '@tari-project/tarijs-core';

/**
 * Basic validation result for seed phrases
 */
export interface BasicValidationResult {
  isValid: boolean;
  errors: string[];
  normalizedWords?: string[];
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /** Allow different word counts */
  allowedWordCounts?: number[];
  /** Require lowercase words */
  requireLowercase?: boolean;
  /** Allow extra whitespace */
  allowExtraWhitespace?: boolean;
  /** Maximum word length */
  maxWordLength?: number;
}

/**
 * Default validation configuration
 */
const DEFAULT_CONFIG: Required<ValidationConfig> = {
  allowedWordCounts: [12, 15, 18, 21, 24],
  requireLowercase: true,
  allowExtraWhitespace: true,
  maxWordLength: 15 // Longest BIP39 word is 8 characters, but allow some buffer
};

/**
 * Seed phrase validation utilities
 */
export class SeedValidation {
  private readonly config: Required<ValidationConfig>;

  constructor(config: ValidationConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate basic seed phrase format
   */
  validateBasicFormat(words: string[] | string): BasicValidationResult {
    const errors: string[] = [];
    let wordArray: string[];

    try {
      // Handle string input
      if (typeof words === 'string') {
        wordArray = this.parseWordsFromString(words);
      } else {
        wordArray = [...words]; // Create copy to avoid mutation
      }

      // Check if array is empty
      if (!wordArray || wordArray.length === 0) {
        errors.push('Seed phrase cannot be empty');
        return { isValid: false, errors };
      }

      // Validate word count
      if (!this.config.allowedWordCounts.includes(wordArray.length)) {
        errors.push(
          `Invalid word count: ${wordArray.length}. ` +
          `Allowed counts: ${this.config.allowedWordCounts.join(', ')}`
        );
      }

      // Normalize and validate each word
      const normalizedWords: string[] = [];
      const wordErrors: string[] = [];

      for (let i = 0; i < wordArray.length; i++) {
        const word = wordArray[i];
        const validation = this.validateSingleWord(word, i + 1);
        
        if (validation.isValid && validation.normalizedWord) {
          normalizedWords.push(validation.normalizedWord);
        } else {
          wordErrors.push(...validation.errors);
        }
      }

      errors.push(...wordErrors);

      // Check for duplicate words
      const duplicates = this.findDuplicateWords(normalizedWords);
      if (duplicates.length > 0) {
        errors.push(`Duplicate words found: ${duplicates.join(', ')}`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        normalizedWords: errors.length === 0 ? normalizedWords : undefined
      };
    } catch (error: unknown) {
      errors.push(`Validation error: ${(error as Error).message}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Parse words from a string input
   */
  parseWordsFromString(input: string): string[] {
    if (!input || typeof input !== 'string') {
      return [];
    }

    // Split on whitespace and filter empty strings
    const words = input
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0);

    return words;
  }

  /**
   * Validate a single word
   */
  validateSingleWord(word: string, position: number): {
    isValid: boolean;
    errors: string[];
    normalizedWord?: string;
  } {
    const errors: string[] = [];

    // Check if word is string
    if (typeof word !== 'string') {
      errors.push(`Word at position ${position} is not a string`);
      return { isValid: false, errors };
    }

    // Check if word is empty
    const trimmed = word.trim();
    if (trimmed.length === 0) {
      errors.push(`Word at position ${position} is empty`);
      return { isValid: false, errors };
    }

    // Check word length
    if (trimmed.length > this.config.maxWordLength) {
      errors.push(
        `Word at position ${position} is too long: "${trimmed}" ` +
        `(${trimmed.length} characters, max ${this.config.maxWordLength})`
      );
    }

    // Check for invalid characters
    if (!/^[a-zA-Z]+$/.test(trimmed)) {
      errors.push(
        `Word at position ${position} contains invalid characters: "${trimmed}". ` +
        'Only letters are allowed.'
      );
    }

    // Normalize case
    const normalized = this.config.requireLowercase ? trimmed.toLowerCase() : trimmed;

    // Check case requirement
    if (this.config.requireLowercase && trimmed !== normalized) {
      // This is not an error, just normalization
    }

    return {
      isValid: errors.length === 0,
      errors,
      normalizedWord: errors.length === 0 ? normalized : undefined
    };
  }

  /**
   * Find duplicate words in the array
   */
  findDuplicateWords(words: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const word of words) {
      if (seen.has(word)) {
        duplicates.add(word);
      } else {
        seen.add(word);
      }
    }

    return Array.from(duplicates);
  }

  /**
   * Validate seed phrase format for specific use cases
   */
  validateFormatStrict(words: string[]): void {
    const result = this.validateBasicFormat(words);
    
    if (!result.isValid) {
      throw new WalletError(
        WalletErrorCode.CryptoError,
        `Invalid seed phrase format: ${result.errors.join(', ')}`,
        { severity: ErrorSeverity.Error }
      );
    }
  }

  /**
   * Check if seed phrase looks like a valid BIP39 format
   */
  looksLikeBIP39(words: string[]): boolean {
    try {
      const result = this.validateBasicFormat(words);
      return result.isValid;
    } catch {
      return false;
    }
  }

  /**
   * Get validation summary for debugging
   */
  getValidationSummary(words: string[]): {
    wordCount: number;
    expectedWordCounts: number[];
    hasInvalidCharacters: boolean;
    hasDuplicates: boolean;
    errors: string[];
  } {
    const result = this.validateBasicFormat(words);
    const normalizedWords = result.normalizedWords || [];
    
    return {
      wordCount: words.length,
      expectedWordCounts: this.config.allowedWordCounts,
      hasInvalidCharacters: result.errors.some(error => 
        error.includes('invalid characters')
      ),
      hasDuplicates: this.findDuplicateWords(normalizedWords).length > 0,
      errors: result.errors
    };
  }

  /**
   * Create a new validator with different configuration
   */
  withConfig(config: Partial<ValidationConfig>): SeedValidation {
    return new SeedValidation({ ...this.config, ...config });
  }

  /**
   * Static method for quick validation
   */
  static validate(words: string[], config?: ValidationConfig): BasicValidationResult {
    const validator = new SeedValidation(config);
    return validator.validateBasicFormat(words);
  }

  /**
   * Static method to check if words look like a seed phrase
   */
  static looksLikeSeedPhrase(input: string | string[]): boolean {
    try {
      const validator = new SeedValidation();
      const words = typeof input === 'string' 
        ? validator.parseWordsFromString(input)
        : input;
      
      return validator.looksLikeBIP39(words);
    } catch {
      return false;
    }
  }
}

/**
 * Utility functions for seed validation
 */
export class SeedValidationUtils {
  /**
   * Clean and normalize seed phrase input
   */
  static cleanSeedPhrase(input: string): string[] {
    const validator = new SeedValidation({ allowExtraWhitespace: true });
    const words = validator.parseWordsFromString(input);
    const result = validator.validateBasicFormat(words);
    
    if (!result.isValid) {
      throw new WalletError(
        WalletErrorCode.CryptoError,
        `Cannot clean invalid seed phrase: ${result.errors.join(', ')}`,
        { severity: ErrorSeverity.Error }
      );
    }
    
    return result.normalizedWords!;
  }

  /**
   * Join words with proper spacing
   */
  static joinWords(words: string[]): string {
    return words.join(' ');
  }

  /**
   * Check if two seed phrases are identical after normalization
   */
  static areSeedPhrasesEqual(words1: string[], words2: string[]): boolean {
    try {
      const validator = new SeedValidation();
      const result1 = validator.validateBasicFormat(words1);
      const result2 = validator.validateBasicFormat(words2);
      
      if (!result1.isValid || !result2.isValid) {
        return false;
      }
      
      const normalized1 = result1.normalizedWords!;
      const normalized2 = result2.normalizedWords!;
      
      if (normalized1.length !== normalized2.length) {
        return false;
      }
      
      return normalized1.every((word, index) => word === normalized2[index]);
    } catch {
      return false;
    }
  }

  /**
   * Get suggested corrections for common typos
   */
  static getSuggestedCorrections(word: string): string[] {
    // This is a simple implementation - in production, you might want
    // to use a more sophisticated fuzzy matching algorithm
    const corrections: string[] = [];
    
    // Common typos
    const commonTypos: Record<string, string[]> = {
      'abandont': ['abandon'],
      'abilitys': ['ability'],
      'accout': ['account'],
      'adress': ['address'],
      'recieve': ['receive'],
      'seperate': ['separate'],
      'occured': ['occur'],
      'accomodate': ['accommodate']
    };
    
    const normalized = word.toLowerCase().trim();
    if (commonTypos[normalized]) {
      corrections.push(...commonTypos[normalized]);
    }
    
    return corrections;
  }
}
