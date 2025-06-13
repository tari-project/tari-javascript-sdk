/**
 * @fileoverview Address types and validation for the Tari JavaScript SDK
 * 
 * Defines address structures with validation for emoji, base58, and hex formats
 * following Tari address standards and mobile wallet implementations.
 */

import type {
  TariAddressString,
  EmojiId,
  Base58Address,
  HexAddress,
  PublicKey
} from './branded';
import { AddressFormat, ValidationResult } from './enums';
import { EMOJI_SET, BASE58_ALPHABET, REGEX_PATTERNS } from './constants';

// Address validation result
export interface AddressValidationResult {
  /** Whether the address is valid */
  readonly valid: boolean;
  /** Detected address format */
  readonly format?: AddressFormat;
  /** Validation errors */
  readonly errors: AddressValidationError[];
  /** Validation warnings */
  readonly warnings: AddressValidationWarning[];
  /** Normalized address string */
  readonly normalized?: string;
}

export interface AddressValidationError {
  readonly code: string;
  readonly message: string;
  readonly position?: number;
  readonly character?: string;
}

export interface AddressValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly recommendation: string;
}

// Address parsing result
export interface AddressParseResult {
  /** Whether parsing was successful */
  readonly success: boolean;
  /** Parsed address components */
  readonly address?: ParsedAddress;
  /** Parse error if any */
  readonly error?: string;
}

export interface ParsedAddress {
  /** Original input string */
  readonly raw: string;
  /** Detected format */
  readonly format: AddressFormat;
  /** Normalized address string */
  readonly normalized: string;
  /** Public key if extractable */
  readonly publicKey?: PublicKey;
  /** Checksum if present */
  readonly checksum?: string;
  /** Network identifier if present */
  readonly network?: string;
}

// Address conversion options
export interface AddressConversionOptions {
  /** Target format for conversion */
  format: AddressFormat;
  /** Include checksum in output */
  includeChecksum?: boolean;
  /** Validate input before conversion */
  validateInput?: boolean;
  /** Normalize output */
  normalize?: boolean;
}

// Core address validation utilities
export class AddressValidator {
  /**
   * Validate emoji address format
   */
  static validateEmojiAddress(address: string): AddressValidationResult {
    const errors: AddressValidationError[] = [];
    const warnings: AddressValidationWarning[] = [];

    // Check basic length
    const emojiArray = Array.from(address);
    if (emojiArray.length !== 33) {
      errors.push({
        code: 'INVALID_EMOJI_LENGTH',
        message: `Emoji address must be exactly 33 emojis, got ${emojiArray.length}`,
      });
    }

    // Validate each emoji character
    for (let i = 0; i < emojiArray.length; i++) {
      const emoji = emojiArray[i];
      if (!EMOJI_SET.includes(emoji as any)) {
        errors.push({
          code: 'INVALID_EMOJI_CHARACTER',
          message: `Invalid emoji character at position ${i + 1}`,
          position: i,
          character: emoji
        });
      }
    }

    // Check for common mistakes
    if (address.includes(' ')) {
      warnings.push({
        code: 'CONTAINS_SPACES',
        message: 'Emoji address contains spaces',
        recommendation: 'Remove all spaces from the emoji address'
      });
    }

    return {
      valid: errors.length === 0,
      format: AddressFormat.Emoji,
      errors,
      warnings,
      normalized: errors.length === 0 ? address.replace(/\s/g, '') : undefined
    };
  }

  /**
   * Validate Base58 address format
   */
  static validateBase58Address(address: string): AddressValidationResult {
    const errors: AddressValidationError[] = [];
    const warnings: AddressValidationWarning[] = [];

    const trimmed = address.trim();

    // Check length
    if (trimmed.length < 32 || trimmed.length > 64) {
      errors.push({
        code: 'INVALID_BASE58_LENGTH',
        message: `Base58 address length must be between 32 and 64 characters, got ${trimmed.length}`
      });
    }

    // Validate character set
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (!BASE58_ALPHABET.includes(char)) {
        errors.push({
          code: 'INVALID_BASE58_CHARACTER',
          message: `Invalid Base58 character '${char}' at position ${i + 1}`,
          position: i,
          character: char
        });
      }
    }

    // Check for commonly confused characters
    const confusedChars = ['0', 'O', 'I', 'l'];
    for (const char of confusedChars) {
      if (trimmed.includes(char)) {
        warnings.push({
          code: 'CONFUSED_CHARACTER',
          message: `Address contains character '${char}' which is not in Base58 alphabet`,
          recommendation: 'Double-check the address for transcription errors'
        });
      }
    }

    return {
      valid: errors.length === 0,
      format: AddressFormat.Base58,
      errors,
      warnings,
      normalized: errors.length === 0 ? trimmed : undefined
    };
  }

  /**
   * Validate hex address format
   */
  static validateHexAddress(address: string): AddressValidationResult {
    const errors: AddressValidationError[] = [];
    const warnings: AddressValidationWarning[] = [];

    let normalized = address.trim().toLowerCase();

    // Remove optional 0x prefix
    if (normalized.startsWith('0x')) {
      normalized = normalized.slice(2);
    }

    // Check length (32 bytes = 64 hex characters)
    if (normalized.length !== 64) {
      errors.push({
        code: 'INVALID_HEX_LENGTH',
        message: `Hex address must be exactly 64 characters (32 bytes), got ${normalized.length}`
      });
    }

    // Validate hex characters
    if (!REGEX_PATTERNS.HEX_STRING.test(normalized)) {
      errors.push({
        code: 'INVALID_HEX_CHARACTER',
        message: 'Address contains non-hexadecimal characters'
      });
    }

    // Check for uppercase (not an error, but normalize to lowercase)
    if (address !== address.toLowerCase()) {
      warnings.push({
        code: 'MIXED_CASE',
        message: 'Hex address contains uppercase characters',
        recommendation: 'Use lowercase for consistency'
      });
    }

    return {
      valid: errors.length === 0,
      format: AddressFormat.Hex,
      errors,
      warnings,
      normalized: errors.length === 0 ? normalized : undefined
    };
  }

  /**
   * Detect and validate address format
   */
  static validate(address: string): AddressValidationResult {
    if (!address || typeof address !== 'string') {
      return {
        valid: false,
        errors: [{
          code: 'INVALID_INPUT',
          message: 'Address must be a non-empty string'
        }],
        warnings: []
      };
    }

    const trimmed = address.trim();

    // Try to detect format
    if (REGEX_PATTERNS.EMOJI_ADDRESS.test(trimmed)) {
      return this.validateEmojiAddress(trimmed);
    }

    if (REGEX_PATTERNS.BASE58_ADDRESS.test(trimmed)) {
      return this.validateBase58Address(trimmed);
    }

    if (REGEX_PATTERNS.HEX_STRING.test(trimmed.replace(/^0x/, ''))) {
      return this.validateHexAddress(trimmed);
    }

    // Unknown format
    return {
      valid: false,
      errors: [{
        code: 'UNKNOWN_FORMAT',
        message: 'Unable to detect valid address format (emoji, base58, or hex)'
      }],
      warnings: []
    };
  }

  /**
   * Quick format detection
   */
  static detectFormat(address: string): AddressFormat | null {
    const validation = this.validate(address);
    return validation.format || null;
  }

  /**
   * Check if address is valid
   */
  static isValid(address: string): boolean {
    return this.validate(address).valid;
  }
}

// Address conversion utilities
export class AddressConverter {
  /**
   * Convert emoji address to hex
   */
  static emojiToHex(emoji: EmojiId): HexAddress {
    // Implementation would use Tari's emoji-to-hex conversion
    // This is a placeholder that shows the expected signature
    throw new Error('Emoji to hex conversion requires FFI implementation');
  }

  /**
   * Convert hex address to emoji
   */
  static hexToEmoji(hex: HexAddress): EmojiId {
    // Implementation would use Tari's hex-to-emoji conversion
    throw new Error('Hex to emoji conversion requires FFI implementation');
  }

  /**
   * Convert base58 address to hex
   */
  static base58ToHex(base58: Base58Address): HexAddress {
    // Implementation would use Base58 decoding
    throw new Error('Base58 to hex conversion requires FFI implementation');
  }

  /**
   * Convert hex address to base58
   */
  static hexToBase58(hex: HexAddress): Base58Address {
    // Implementation would use Base58 encoding
    throw new Error('Hex to base58 conversion requires FFI implementation');
  }

  /**
   * Convert between any two formats
   */
  static convert(
    address: string,
    targetFormat: AddressFormat,
    options: Partial<AddressConversionOptions> = {}
  ): string {
    const { validateInput = true } = options;

    if (validateInput) {
      const validation = AddressValidator.validate(address);
      if (!validation.valid) {
        throw new Error(`Invalid address: ${validation.errors[0]?.message}`);
      }
    }

    const sourceFormat = AddressValidator.detectFormat(address);
    if (!sourceFormat) {
      throw new Error('Unable to detect source address format');
    }

    if (sourceFormat === targetFormat) {
      return address;
    }

    // Convert via hex as intermediate format
    let hexAddress: HexAddress;

    switch (sourceFormat) {
      case AddressFormat.Emoji:
        hexAddress = this.emojiToHex(address as EmojiId);
        break;
      case AddressFormat.Base58:
        hexAddress = this.base58ToHex(address as Base58Address);
        break;
      case AddressFormat.Hex:
        hexAddress = address as HexAddress;
        break;
      default:
        throw new Error(`Unsupported source format: ${sourceFormat}`);
    }

    switch (targetFormat) {
      case AddressFormat.Emoji:
        return this.hexToEmoji(hexAddress);
      case AddressFormat.Base58:
        return this.hexToBase58(hexAddress);
      case AddressFormat.Hex:
        return hexAddress;
      default:
        throw new Error(`Unsupported target format: ${targetFormat}`);
    }
  }
}

// Address parsing utilities
export class AddressParser {
  /**
   * Parse address string into components
   */
  static parse(address: string): AddressParseResult {
    try {
      const validation = AddressValidator.validate(address);
      
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors[0]?.message || 'Invalid address'
        };
      }

      // Extract additional information based on format
      let publicKey: PublicKey | undefined;
      let checksum: string | undefined;
      let network: string | undefined;

      switch (validation.format) {
        case AddressFormat.Hex:
          // Hex addresses are public keys
          publicKey = validation.normalized as PublicKey;
          break;
        case AddressFormat.Base58:
          // Base58 may include network info or checksum
          // Implementation would decode these components
          break;
        case AddressFormat.Emoji:
          // Emoji addresses are encoded public keys
          // Implementation would extract the public key
          break;
      }

      const parsed: ParsedAddress = {
        raw: address,
        format: validation.format!,
        normalized: validation.normalized!,
        publicKey,
        checksum,
        network
      };

      return {
        success: true,
        address: parsed
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error'
      };
    }
  }

  /**
   * Extract public key from address if possible
   */
  static extractPublicKey(address: string): PublicKey | null {
    const result = this.parse(address);
    return result.success ? result.address?.publicKey || null : null;
  }

  /**
   * Normalize address to canonical form
   */
  static normalize(address: string): string | null {
    const validation = AddressValidator.validate(address);
    return validation.valid ? validation.normalized || null : null;
  }
}

// Address utilities class
export class AddressUtils {
  /**
   * Compare two addresses for equality
   */
  static equals(a: string, b: string): boolean {
    const normalizedA = AddressParser.normalize(a);
    const normalizedB = AddressParser.normalize(b);
    
    if (!normalizedA || !normalizedB) {
      return false;
    }

    // Convert both to hex for comparison
    try {
      const hexA = AddressConverter.convert(normalizedA, AddressFormat.Hex);
      const hexB = AddressConverter.convert(normalizedB, AddressFormat.Hex);
      return hexA === hexB;
    } catch {
      return normalizedA === normalizedB;
    }
  }

  /**
   * Generate address checksum
   */
  static generateChecksum(address: string): string | null {
    const validation = AddressValidator.validate(address);
    if (!validation.valid) {
      return null;
    }

    // Implementation would calculate checksum based on Tari's algorithm
    // This is a placeholder
    throw new Error('Checksum generation requires FFI implementation');
  }

  /**
   * Verify address checksum
   */
  static verifyChecksum(address: string, checksum: string): boolean {
    const calculated = this.generateChecksum(address);
    return calculated === checksum;
  }

  /**
   * Get address display name based on format
   */
  static getDisplayName(address: string): string {
    const format = AddressValidator.detectFormat(address);
    switch (format) {
      case AddressFormat.Emoji:
        return 'Emoji Address';
      case AddressFormat.Base58:
        return 'Base58 Address';
      case AddressFormat.Hex:
        return 'Hex Address';
      default:
        return 'Unknown Address';
    }
  }

  /**
   * Truncate address for display
   */
  static truncate(address: string, startChars = 6, endChars = 6): string {
    const normalized = AddressParser.normalize(address);
    if (!normalized) {
      return address;
    }

    if (normalized.length <= startChars + endChars + 3) {
      return normalized;
    }

    return `${normalized.slice(0, startChars)}...${normalized.slice(-endChars)}`;
  }

  /**
   * Format address for specific display context
   */
  static format(address: string, context: 'short' | 'medium' | 'full' = 'medium'): string {
    const normalized = AddressParser.normalize(address);
    if (!normalized) {
      return address;
    }

    switch (context) {
      case 'short':
        return this.truncate(normalized, 4, 4);
      case 'medium':
        return this.truncate(normalized, 8, 8);
      case 'full':
        return normalized;
      default:
        return normalized;
    }
  }

  /**
   * Check if address matches a pattern
   */
  static matches(address: string, pattern: string): boolean {
    const normalized = AddressParser.normalize(address);
    if (!normalized) {
      return false;
    }

    // Simple pattern matching (could be extended for more complex patterns)
    return normalized.toLowerCase().includes(pattern.toLowerCase());
  }
}

// Export type guards
export function isEmojiAddress(address: string): address is EmojiId {
  const validation = AddressValidator.validateEmojiAddress(address);
  return validation.valid;
}

export function isBase58Address(address: string): address is Base58Address {
  const validation = AddressValidator.validateBase58Address(address);
  return validation.valid;
}

export function isHexAddress(address: string): address is HexAddress {
  const validation = AddressValidator.validateHexAddress(address);
  return validation.valid;
}

export function isValidAddress(address: string): address is TariAddressString {
  return AddressValidator.isValid(address);
}

// All utilities are already exported with their class declarations
