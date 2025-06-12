/**
 * @fileoverview Seed phrase management module exports
 * 
 * This module provides a complete seed phrase management system with BIP39 support,
 * secure memory handling, and comprehensive validation.
 */

// Core seed manager
export {
  SeedManager,
  SecureBuffer,
  type SeedGenerationOptions,
  type SeedValidationResult
} from './seed-manager.js';

// BIP39 validation and conversion
export {
  BIP39Validator,
  type BIP39Wordlist,
  type BIP39ValidationResult
} from './bip39.js';

// Format validation utilities
export {
  SeedValidation,
  SeedValidationUtils,
  type BasicValidationResult,
  type ValidationConfig
} from './validation.js';

// Re-export core types for convenience
export type { ValidatedSeedPhrase } from '@tari-project/tarijs-core';
