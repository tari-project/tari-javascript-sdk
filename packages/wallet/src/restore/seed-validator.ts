/**
 * @fileoverview Enhanced seed validation for wallet restoration
 * 
 * Provides comprehensive seed phrase validation specifically for restoration
 * scenarios including entropy checking, format validation, and recovery safety.
 */

import { 
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity 
} from '@tari-project/tarijs-core';
import { 
  SeedManager, 
  type SeedValidationResult 
} from '../seed/index.js';

/**
 * Restoration seed validation options
 */
export interface RestorationSeedValidationOptions {
  requireMinEntropy?: boolean;
  minEntropyBits?: number;
  checkDuplicates?: boolean;
  allowCustomWordlist?: boolean;
  validateChecksum?: boolean;
  networkSpecific?: boolean;
  strictMode?: boolean;
}

/**
 * Extended validation result for restoration
 */
export interface RestorationSeedValidationResult extends SeedValidationResult {
  entropyBits?: number;
  hasDuplicates?: boolean;
  duplicateWords?: string[];
  estimatedBruteForceTime?: string;
  securityLevel?: 'low' | 'medium' | 'high' | 'very_high';
  restorationRisk?: 'low' | 'medium' | 'high';
  recommendations?: string[];
}

/**
 * Common seed phrase issues and their fixes
 */
export interface SeedIssueAnalysis {
  issues: SeedIssue[];
  canAutoFix: boolean;
  suggestions: string[];
  fixedWords?: string[];
}

/**
 * Individual seed issue
 */
export interface SeedIssue {
  type: 'typo' | 'duplicate' | 'invalid_word' | 'wrong_length' | 'checksum' | 'entropy';
  position?: number;
  word?: string;
  suggestion?: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
}

/**
 * Enhanced seed validator specifically designed for wallet restoration
 * 
 * This validator provides:
 * - Comprehensive BIP39 validation
 * - Entropy and security analysis  
 * - Common error detection and correction
 * - Restoration-specific safety checks
 * - Performance optimized validation
 */
export class RestorationSeedValidator {
  private static readonly MINIMUM_ENTROPY_BITS = 128;
  private static readonly RECOMMENDED_ENTROPY_BITS = 256;
  
  /**
   * Perform comprehensive validation for restoration
   */
  public static async validateForRestoration(
    seedWords: string[],
    options: RestorationSeedValidationOptions = {}
  ): Promise<RestorationSeedValidationResult> {
    const {
      requireMinEntropy = true,
      minEntropyBits = this.MINIMUM_ENTROPY_BITS,
      checkDuplicates = true,
      allowCustomWordlist = false,
      validateChecksum = true,
      networkSpecific = false,
      strictMode = true
    } = options;

    // Start with basic validation
    const basicValidation = await SeedManager.validateSeedPhrase(seedWords);
    
    const result: RestorationSeedValidationResult = {
      ...basicValidation,
      recommendations: []
    };

    if (!basicValidation.isValid) {
      // Try to analyze and provide better error information
      const issueAnalysis = await this.analyzeSeedIssues(seedWords);
      result.recommendations = issueAnalysis.suggestions;
      return result;
    }

    // Perform extended validation for restoration
    try {
      // Check entropy
      if (requireMinEntropy) {
        const entropyAnalysis = this.analyzeEntropy(seedWords);
        result.entropyBits = entropyAnalysis.bits;
        result.securityLevel = entropyAnalysis.securityLevel;
        result.estimatedBruteForceTime = entropyAnalysis.bruteForceTime;

        if (entropyAnalysis.bits < minEntropyBits) {
          result.isValid = false;
          result.errors.push(`Insufficient entropy: ${entropyAnalysis.bits} bits (minimum: ${minEntropyBits})`);
          result.recommendations!.push('Consider using a seed phrase with more entropy for better security');
        }
      }

      // Check for duplicate words
      if (checkDuplicates) {
        const duplicateAnalysis = this.checkDuplicateWords(seedWords);
        result.hasDuplicates = duplicateAnalysis.hasDuplicates;
        result.duplicateWords = duplicateAnalysis.duplicates;

        if (duplicateAnalysis.hasDuplicates && strictMode) {
          result.isValid = false;
          result.errors.push(`Duplicate words found: ${duplicateAnalysis.duplicates.join(', ')}`);
          result.recommendations!.push('Ensure all words in the seed phrase are unique');
        }
      }

      // Assess restoration risk
      result.restorationRisk = this.assessRestorationRisk(result);

      // Add security recommendations
      this.addSecurityRecommendations(result);

    } catch (error: unknown) {
      result.isValid = false;
      result.errors.push(`Validation error: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Analyze and suggest fixes for common seed phrase issues
   */
  public static async analyzeSeedIssues(seedWords: string[]): Promise<SeedIssueAnalysis> {
    const issues: SeedIssue[] = [];
    const suggestions: string[] = [];
    let canAutoFix = true;
    const fixedWords: string[] = [...seedWords];

    // Check word count
    if (seedWords.length !== 12 && seedWords.length !== 15 && 
        seedWords.length !== 18 && seedWords.length !== 21 && 
        seedWords.length !== 24) {
      issues.push({
        type: 'wrong_length',
        severity: 'error',
        description: `Invalid word count: ${seedWords.length}. Must be 12, 15, 18, 21, or 24 words.`
      });
      suggestions.push('Ensure you have the complete seed phrase with the correct number of words');
      canAutoFix = false;
    }

    // Check each word  
    const { BIP39Validator } = await import('../seed/bip39.js');
    const wordlistData = BIP39Validator['wordlists'].get('english');
    if (!wordlistData) {
      throw new WalletError(WalletErrorCode.InternalError, 'English wordlist not available');
    }
    const wordlist = wordlistData.words;
    for (let i = 0; i < seedWords.length; i++) {
      const word = seedWords[i].toLowerCase().trim();
      
      if (!word) {
        issues.push({
          type: 'invalid_word',
          position: i,
          word: seedWords[i],
          severity: 'error',
          description: `Empty word at position ${i + 1}`
        });
        canAutoFix = false;
        continue;
      }

      if (!wordlist.includes(word)) {
        // Try to find close matches
        const suggestions = this.findClosestWords(word, wordlist);
        
        issues.push({
          type: 'invalid_word',
          position: i,
          word,
          suggestion: suggestions[0],
          severity: 'error',
          description: `Invalid word "${word}" at position ${i + 1}`
        });

        if (suggestions.length > 0) {
          suggestions.push(`Consider "${suggestions[0]}" instead of "${word}"`);
          fixedWords[i] = suggestions[0];
        } else {
          canAutoFix = false;
        }
      }
    }

    // Check for duplicates
    const duplicates = this.checkDuplicateWords(seedWords);
    if (duplicates.hasDuplicates) {
      for (const duplicate of duplicates.duplicates) {
        issues.push({
          type: 'duplicate',
          word: duplicate,
          severity: 'warning',
          description: `Word "${duplicate}" appears multiple times`
        });
      }
      suggestions.push('Remove duplicate words from the seed phrase');
      canAutoFix = false;
    }

    return {
      issues,
      canAutoFix,
      suggestions,
      fixedWords: canAutoFix ? fixedWords : undefined
    };
  }

  /**
   * Suggest corrections for a seed phrase
   */
  public static async suggestCorrections(seedWords: string[]): Promise<{
    originalWords: string[];
    suggestedWords: string[];
    confidence: number;
    changes: Array<{ position: number; from: string; to: string; confidence: number }>;
  }> {
    const { BIP39Validator } = await import('../seed/bip39.js');
    const wordlistData = BIP39Validator['wordlists'].get('english');
    if (!wordlistData) {
      throw new WalletError(WalletErrorCode.InternalError, 'English wordlist not available');
    }
    const wordlist = wordlistData.words;
    const changes: Array<{ position: number; from: string; to: string; confidence: number }> = [];
    const suggestedWords = [...seedWords];
    let totalConfidence = 0;

    for (let i = 0; i < seedWords.length; i++) {
      const word = seedWords[i].toLowerCase().trim();
      
      if (!wordlist.includes(word)) {
        const closestWords = this.findClosestWords(word, wordlist);
        
        if (closestWords.length > 0) {
          const confidence = this.calculateWordConfidence(word, closestWords[0]);
          changes.push({
            position: i,
            from: word,
            to: closestWords[0],
            confidence
          });
          suggestedWords[i] = closestWords[0];
          totalConfidence += confidence;
        }
      } else {
        totalConfidence += 1.0; // Perfect match
      }
    }

    return {
      originalWords: seedWords,
      suggestedWords,
      confidence: totalConfidence / seedWords.length,
      changes
    };
  }

  /**
   * Quick validation for UX (lightweight)
   */
  public static async quickValidate(seedWords: string[]): Promise<{
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    mainIssue?: string;
  }> {
    let errorCount = 0;
    let warningCount = 0;
    let mainIssue: string | undefined;

    // Check word count
    const validLengths = [12, 15, 18, 21, 24];
    if (!validLengths.includes(seedWords.length)) {
      errorCount++;
      mainIssue = `Invalid word count: ${seedWords.length}`;
    }

    // Quick word validation
    const { BIP39Validator } = await import('../seed/bip39.js');
    const wordlistData = BIP39Validator['wordlists'].get('english');
    if (!wordlistData) {
      throw new WalletError(WalletErrorCode.InternalError, 'English wordlist not available');
    }
    const wordlist = wordlistData.words;
    for (const word of seedWords) {
      const cleanWord = word.toLowerCase().trim();
      if (!cleanWord) {
        errorCount++;
        if (!mainIssue) mainIssue = 'Empty words found';
      } else if (!wordlist.includes(cleanWord)) {
        errorCount++;
        if (!mainIssue) mainIssue = `Invalid word: "${cleanWord}"`;
      }
    }

    // Check for duplicates
    const duplicates = this.checkDuplicateWords(seedWords);
    if (duplicates.hasDuplicates) {
      warningCount++;
      if (!mainIssue) mainIssue = 'Duplicate words found';
    }

    return {
      isValid: errorCount === 0,
      errorCount,
      warningCount,
      mainIssue
    };
  }

  // Private helper methods

  private static analyzeEntropy(seedWords: string[]): {
    bits: number;
    securityLevel: 'low' | 'medium' | 'high' | 'very_high';
    bruteForceTime: string;
  } {
    const wordCount = seedWords.length;
    const bitsPerWord = Math.log2(2048); // BIP39 wordlist size
    const totalBits = wordCount * bitsPerWord;

    let securityLevel: 'low' | 'medium' | 'high' | 'very_high';
    if (totalBits < 128) {
      securityLevel = 'low';
    } else if (totalBits < 160) {
      securityLevel = 'medium';
    } else if (totalBits < 256) {
      securityLevel = 'high';
    } else {
      securityLevel = 'very_high';
    }

    // Rough estimate of brute force time
    const combinations = Math.pow(2, totalBits);
    const attemptsPerSecond = 1e9; // Assume 1 billion attempts per second
    const secondsToBreak = combinations / (2 * attemptsPerSecond); // Average case
    
    let bruteForceTime: string;
    if (secondsToBreak < 60) {
      bruteForceTime = `${Math.round(secondsToBreak)} seconds`;
    } else if (secondsToBreak < 3600) {
      bruteForceTime = `${Math.round(secondsToBreak / 60)} minutes`;
    } else if (secondsToBreak < 86400) {
      bruteForceTime = `${Math.round(secondsToBreak / 3600)} hours`;
    } else if (secondsToBreak < 31536000) {
      bruteForceTime = `${Math.round(secondsToBreak / 86400)} days`;
    } else {
      bruteForceTime = `${Math.round(secondsToBreak / 31536000)} years`;
    }

    return {
      bits: Math.round(totalBits),
      securityLevel,
      bruteForceTime
    };
  }

  private static checkDuplicateWords(seedWords: string[]): {
    hasDuplicates: boolean;
    duplicates: string[];
  } {
    const wordCounts = new Map<string, number>();
    const duplicates: string[] = [];

    for (const word of seedWords) {
      const cleanWord = word.toLowerCase().trim();
      const count = wordCounts.get(cleanWord) || 0;
      wordCounts.set(cleanWord, count + 1);

      if (count === 1) { // Second occurrence
        duplicates.push(cleanWord);
      }
    }

    return {
      hasDuplicates: duplicates.length > 0,
      duplicates
    };
  }

  private static findClosestWords(word: string, wordlist: string[]): string[] {
    const distances = wordlist.map(listWord => ({
      word: listWord,
      distance: this.levenshteinDistance(word.toLowerCase(), listWord)
    }));

    distances.sort((a, b) => a.distance - b.distance);
    
    // Return top 3 closest matches with distance <= 2
    return distances
      .filter(item => item.distance <= 2)
      .slice(0, 3)
      .map(item => item.word);
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private static calculateWordConfidence(original: string, suggestion: string): number {
    const distance = this.levenshteinDistance(original, suggestion);
    const maxLength = Math.max(original.length, suggestion.length);
    return Math.max(0, 1 - (distance / maxLength));
  }

  private static assessRestorationRisk(result: RestorationSeedValidationResult): 'low' | 'medium' | 'high' {
    let riskScore = 0;

    // Factor in entropy
    if (result.entropyBits && result.entropyBits < 128) {
      riskScore += 3;
    } else if (result.entropyBits && result.entropyBits < 160) {
      riskScore += 1;
    }

    // Factor in duplicates
    if (result.hasDuplicates) {
      riskScore += 2;
    }

    // Factor in overall validity
    if (!result.isValid) {
      riskScore += 3;
    }

    if (riskScore >= 4) {
      return 'high';
    } else if (riskScore >= 2) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private static addSecurityRecommendations(result: RestorationSeedValidationResult): void {
    if (!result.recommendations) {
      result.recommendations = [];
    }

    if (result.securityLevel === 'low') {
      result.recommendations.push('Consider using a 24-word seed phrase for maximum security');
    }

    if (result.hasDuplicates) {
      result.recommendations.push('Avoid using duplicate words in your seed phrase');
    }

    if (result.restorationRisk === 'high') {
      result.recommendations.push('High restoration risk detected - verify your seed phrase carefully');
    }

    // General security recommendations
    result.recommendations.push('Store your seed phrase securely and never share it');
    result.recommendations.push('Consider using a hardware wallet for maximum security');
  }
}
