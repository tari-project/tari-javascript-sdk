/**
 * @fileoverview Address generation and management utilities
 * 
 * Provides high-level wallet address services built on top of the core
 * Tari address system. Includes caching, formatting, and emoji conversion
 * with proper lifecycle management and error handling.
 */

export { AddressService, type AddressServiceConfig } from './address-service.js';
export { AddressFormatter, type FormattingOptions } from './address-formatter.js';
export { EmojiConverter, type EmojiConversionOptions } from './emoji-converter.js';
export * from './types.js';
