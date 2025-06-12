/**
 * @fileoverview TariAddress class implementation
 * 
 * Provides a comprehensive address class with validation, conversion,
 * and utility methods for all Tari address formats.
 */

import type {
  TariAddressString,
  EmojiId,
  Base58Address,
  HexAddress,
  PublicKey
} from '../types/branded.js';
import { AddressFormat } from '../types/enums.js';
import {
  AddressValidator,
  AddressConverter,
  AddressParser,
  AddressUtils,
  type AddressValidationResult,
  type ParsedAddress
} from '../types/address.js';

// TariAddress class for object-oriented address handling
export class TariAddress {
  private readonly _address: string;
  private readonly _format: AddressFormat;
  private readonly _normalized: string;
  private readonly _publicKey?: PublicKey;
  private _cached: {
    emoji?: EmojiId;
    base58?: Base58Address;
    hex?: HexAddress;
  } = {};

  constructor(address: string) {
    // Validate the address
    const validation = AddressValidator.validate(address);
    if (!validation.valid) {
      throw new Error(`Invalid Tari address: ${validation.errors[0]?.message}`);
    }

    this._address = address;
    this._format = validation.format!;
    this._normalized = validation.normalized!;
    this._cached = {};

    // Parse for additional information
    const parseResult = AddressParser.parse(address);
    if (parseResult.success && parseResult.address?.publicKey) {
      this._publicKey = parseResult.address.publicKey;
    }
  }

  /**
   * Get the original address string
   */
  get raw(): string {
    return this._address;
  }

  /**
   * Get the normalized address string
   */
  get normalized(): string {
    return this._normalized;
  }

  /**
   * Get the address format
   */
  get format(): AddressFormat {
    return this._format;
  }

  /**
   * Get the public key if available
   */
  get publicKey(): PublicKey | undefined {
    return this._publicKey;
  }

  /**
   * Check if this is an emoji address
   */
  get isEmoji(): boolean {
    return this._format === AddressFormat.Emoji;
  }

  /**
   * Check if this is a base58 address
   */
  get isBase58(): boolean {
    return this._format === AddressFormat.Base58;
  }

  /**
   * Check if this is a hex address
   */
  get isHex(): boolean {
    return this._format === AddressFormat.Hex;
  }

  /**
   * Get address as emoji format
   */
  get emoji(): EmojiId {
    if (this._cached?.emoji) {
      return this._cached.emoji;
    }

    if (this._format === AddressFormat.Emoji) {
      this._cached.emoji = this._normalized as EmojiId;
    } else {
      this._cached.emoji = AddressConverter.convert(
        this._normalized,
        AddressFormat.Emoji
      ) as EmojiId;
    }

    return this._cached.emoji;
  }

  /**
   * Get address as base58 format
   */
  get base58(): Base58Address {
    if (this._cached?.base58) {
      return this._cached.base58;
    }

    if (this._format === AddressFormat.Base58) {
      this._cached.base58 = this._normalized as Base58Address;
    } else {
      this._cached.base58 = AddressConverter.convert(
        this._normalized,
        AddressFormat.Base58
      ) as Base58Address;
    }

    return this._cached.base58;
  }

  /**
   * Get address as hex format
   */
  get hex(): HexAddress {
    if (this._cached?.hex) {
      return this._cached.hex;
    }

    if (this._format === AddressFormat.Hex) {
      this._cached.hex = this._normalized as HexAddress;
    } else {
      this._cached.hex = AddressConverter.convert(
        this._normalized,
        AddressFormat.Hex
      ) as HexAddress;
    }

    return this._cached.hex;
  }

  /**
   * Convert to specific format
   */
  toFormat(format: AddressFormat): string {
    switch (format) {
      case AddressFormat.Emoji:
        return this.emoji;
      case AddressFormat.Base58:
        return this.base58;
      case AddressFormat.Hex:
        return this.hex;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Compare with another address
   */
  equals(other: TariAddress | string): boolean {
    const otherAddress = other instanceof TariAddress ? other.normalized : other;
    return AddressUtils.equals(this._normalized, otherAddress);
  }

  /**
   * Get display name for the address format
   */
  getDisplayName(): string {
    return AddressUtils.getDisplayName(this._normalized);
  }

  /**
   * Truncate address for display
   */
  truncate(startChars = 6, endChars = 6): string {
    return AddressUtils.truncate(this._normalized, startChars, endChars);
  }

  /**
   * Format address for display context
   */
  formatForDisplay(context: 'short' | 'medium' | 'full' = 'medium'): string {
    return AddressUtils.format(this._normalized, context);
  }

  /**
   * Check if address matches a pattern
   */
  matches(pattern: string): boolean {
    return AddressUtils.matches(this._normalized, pattern);
  }

  /**
   * Validate the address
   */
  validate(): AddressValidationResult {
    return AddressValidator.validate(this._address);
  }

  /**
   * Clone the address
   */
  clone(): TariAddress {
    return new TariAddress(this._address);
  }

  /**
   * Convert to string (returns normalized form)
   */
  toString(): string {
    return this._normalized;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): object {
    return {
      address: this._address,
      normalized: this._normalized,
      format: this._format,
      publicKey: this._publicKey
    };
  }

  /**
   * Get value for primitive conversion
   */
  valueOf(): string {
    return this._normalized;
  }

  /**
   * Custom inspect for Node.js debugging
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `TariAddress(${this._format}: ${this.truncate()})`;
  }

  // Static factory methods

  /**
   * Create from emoji address
   */
  static fromEmoji(emoji: EmojiId): TariAddress {
    return new TariAddress(emoji);
  }

  /**
   * Create from base58 address
   */
  static fromBase58(base58: Base58Address): TariAddress {
    return new TariAddress(base58);
  }

  /**
   * Create from hex address
   */
  static fromHex(hex: HexAddress): TariAddress {
    return new TariAddress(hex);
  }

  /**
   * Create from public key
   */
  static fromPublicKey(publicKey: PublicKey): TariAddress {
    // Implementation would convert public key to address
    // This requires FFI to get the proper address format
    return new TariAddress(publicKey);
  }

  /**
   * Parse from any string format
   */
  static fromString(address: string): TariAddress {
    return new TariAddress(address);
  }

  /**
   * Create from JSON representation
   */
  static fromJSON(json: any): TariAddress {
    if (typeof json === 'string') {
      return new TariAddress(json);
    }
    
    if (typeof json === 'object' && json.address) {
      return new TariAddress(json.address);
    }
    
    throw new Error('Invalid JSON format for TariAddress');
  }

  /**
   * Try to create address, returning null if invalid
   */
  static tryCreate(address: string): TariAddress | null {
    try {
      return new TariAddress(address);
    } catch {
      return null;
    }
  }

  /**
   * Validate address string without creating instance
   */
  static isValid(address: string): boolean {
    return AddressValidator.isValid(address);
  }

  /**
   * Detect format without creating instance
   */
  static detectFormat(address: string): AddressFormat | null {
    return AddressValidator.detectFormat(address);
  }

  /**
   * Compare two address strings
   */
  static equals(a: string, b: string): boolean {
    return AddressUtils.equals(a, b);
  }

  /**
   * Normalize address string
   */
  static normalize(address: string): string | null {
    return AddressParser.normalize(address);
  }

  /**
   * Generate random address for testing
   */
  static random(format: AddressFormat = AddressFormat.Hex): TariAddress {
    // Implementation would generate random valid address
    // This is a placeholder for testing purposes
    switch (format) {
      case AddressFormat.Hex:
        const randomHex = Array.from({ length: 64 }, () => 
          Math.floor(Math.random() * 16).toString(16)
        ).join('');
        return new TariAddress(randomHex);
      
      case AddressFormat.Emoji:
        // Generate random emoji address
        throw new Error('Random emoji address generation requires FFI implementation');
      
      case AddressFormat.Base58:
        // Generate random base58 address
        throw new Error('Random base58 address generation requires FFI implementation');
      
      default:
        throw new Error(`Unsupported format for random generation: ${format}`);
    }
  }
}

// Utility functions for working with TariAddress

/**
 * Create TariAddress from various input types
 */
export function createTariAddress(input: string | TariAddress): TariAddress {
  if (input instanceof TariAddress) {
    return input;
  }
  return new TariAddress(input);
}

/**
 * Check if value is a TariAddress instance
 */
export function isTariAddress(value: unknown): value is TariAddress {
  return value instanceof TariAddress;
}

/**
 * Convert multiple addresses to TariAddress instances
 */
export function createTariAddresses(addresses: (string | TariAddress)[]): TariAddress[] {
  return addresses.map(createTariAddress);
}

/**
 * Find unique addresses from a list
 */
export function uniqueAddresses(addresses: (string | TariAddress)[]): TariAddress[] {
  const seen = new Set<string>();
  const unique: TariAddress[] = [];

  for (const addr of addresses) {
    const tariAddr = createTariAddress(addr);
    if (!seen.has(tariAddr.normalized)) {
      seen.add(tariAddr.normalized);
      unique.push(tariAddr);
    }
  }

  return unique;
}

/**
 * Sort addresses by format and then lexicographically
 */
export function sortAddresses(addresses: TariAddress[]): TariAddress[] {
  return addresses.slice().sort((a, b) => {
    // Sort by format first
    if (a.format !== b.format) {
      return a.format.localeCompare(b.format);
    }
    // Then by normalized address
    return a.normalized.localeCompare(b.normalized);
  });
}

/**
 * Group addresses by format
 */
export function groupAddressesByFormat(addresses: TariAddress[]): Map<AddressFormat, TariAddress[]> {
  const groups = new Map<AddressFormat, TariAddress[]>();
  
  for (const address of addresses) {
    const existing = groups.get(address.format) || [];
    existing.push(address);
    groups.set(address.format, existing);
  }
  
  return groups;
}

// Export the main class and utilities
export { TariAddress as Address };
export default TariAddress;
