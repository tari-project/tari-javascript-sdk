/**
 * @fileoverview Contact Validation for Tari Wallet
 * 
 * Provides comprehensive validation for contact data including
 * alias checks, address validation, and business rule enforcement.
 */

import {
  CreateContactParams,
  UpdateContactParams,
  ContactValidationResult,
  ContactValidationError,
  ContactValidationWarning,
  ContactUtils,
  MAX_CONTACT_ALIAS_LENGTH,
  MIN_CONTACT_ALIAS_LENGTH,
  VALIDATION_PATTERNS,
  WalletError,
  WalletErrorCode
} from '@tari-project/tarijs-core';

/**
 * Enhanced contact validator with comprehensive rules
 */
export class ContactValidator {
  private readonly maxNotesLength = 512;
  private readonly maxTagLength = 32;
  private readonly maxTags = 10;
  private readonly maxEmojiLength = 10;

  /**
   * Validate contact creation parameters
   */
  public validateCreate(params: CreateContactParams): ContactValidationResult {
    const errors: ContactValidationError[] = [];
    const warnings: ContactValidationWarning[] = [];

    // Validate required fields
    this.validateAlias(params.alias, errors, warnings);
    this.validateAddress(params.address, errors, warnings);

    // Validate optional fields
    if (params.notes !== undefined) {
      this.validateNotes(params.notes, errors, warnings);
    }

    if (params.tags !== undefined) {
      this.validateTags(params.tags, errors, warnings);
    }

    if (params.emoji !== undefined) {
      this.validateEmoji(params.emoji, errors, warnings);
    }

    if (params.metadata !== undefined) {
      this.validateMetadata(params.metadata, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate contact update parameters
   */
  public validateUpdate(params: UpdateContactParams): ContactValidationResult {
    const errors: ContactValidationError[] = [];
    const warnings: ContactValidationWarning[] = [];

    // Validate ID is present
    if (!params.id || params.id.trim().length === 0) {
      errors.push({
        code: 'MISSING_ID',
        message: 'Contact ID is required for updates',
        field: 'id'
      });
    }

    // Validate fields that are being updated
    if (params.alias !== undefined) {
      this.validateAlias(params.alias, errors, warnings);
    }

    if (params.address !== undefined) {
      this.validateAddress(params.address, errors, warnings);
    }

    if (params.notes !== undefined) {
      this.validateNotes(params.notes, errors, warnings);
    }

    if (params.tags !== undefined) {
      this.validateTags(params.tags, errors, warnings);
    }

    if (params.emoji !== undefined) {
      this.validateEmoji(params.emoji, errors, warnings);
    }

    if (params.metadata !== undefined) {
      this.validateMetadata(params.metadata, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate contact alias
   */
  private validateAlias(
    alias: string,
    errors: ContactValidationError[],
    warnings: ContactValidationWarning[]
  ): void {
    if (!alias || alias.trim().length === 0) {
      errors.push({
        code: 'EMPTY_ALIAS',
        message: 'Contact alias cannot be empty',
        field: 'alias'
      });
      return;
    }

    const trimmedAlias = alias.trim();

    // Length validation
    if (trimmedAlias.length < MIN_CONTACT_ALIAS_LENGTH) {
      errors.push({
        code: 'ALIAS_TOO_SHORT',
        message: `Contact alias must be at least ${MIN_CONTACT_ALIAS_LENGTH} character(s)`,
        field: 'alias'
      });
    }

    if (trimmedAlias.length > MAX_CONTACT_ALIAS_LENGTH) {
      errors.push({
        code: 'ALIAS_TOO_LONG',
        message: `Contact alias cannot exceed ${MAX_CONTACT_ALIAS_LENGTH} characters`,
        field: 'alias'
      });
    }

    // Pattern validation
    if (!VALIDATION_PATTERNS.CONTACT_ALIAS.test(trimmedAlias)) {
      warnings.push({
        code: 'INVALID_ALIAS_CHARS',
        message: 'Contact alias contains special characters',
        field: 'alias',
        recommendation: 'Use only letters, numbers, spaces, dots, hyphens, and underscores'
      });
    }

    // Additional alias rules
    if (trimmedAlias.startsWith(' ') || trimmedAlias.endsWith(' ')) {
      warnings.push({
        code: 'ALIAS_WHITESPACE',
        message: 'Contact alias has leading or trailing whitespace',
        field: 'alias',
        recommendation: 'Remove leading and trailing spaces'
      });
    }

    if (trimmedAlias.includes('  ')) {
      warnings.push({
        code: 'ALIAS_MULTIPLE_SPACES',
        message: 'Contact alias contains multiple consecutive spaces',
        field: 'alias',
        recommendation: 'Use single spaces between words'
      });
    }

    // Reserved words check
    const reservedWords = ['admin', 'system', 'wallet', 'tari', 'null', 'undefined'];
    if (reservedWords.includes(trimmedAlias.toLowerCase())) {
      warnings.push({
        code: 'ALIAS_RESERVED_WORD',
        message: `"${trimmedAlias}" is a reserved word`,
        field: 'alias',
        recommendation: 'Choose a different alias'
      });
    }
  }

  /**
   * Validate Tari address
   */
  private validateAddress(
    address: string,
    errors: ContactValidationError[],
    warnings: ContactValidationWarning[]
  ): void {
    if (!address || address.trim().length === 0) {
      errors.push({
        code: 'EMPTY_ADDRESS',
        message: 'Contact address cannot be empty',
        field: 'address'
      });
      return;
    }

    const trimmedAddress = address.trim();

    // Basic format validation (placeholder - real validation would use Tari address format)
    if (trimmedAddress.length < 10) {
      errors.push({
        code: 'ADDRESS_TOO_SHORT',
        message: 'Contact address appears to be too short',
        field: 'address'
      });
    }

    if (trimmedAddress.length > 200) {
      errors.push({
        code: 'ADDRESS_TOO_LONG',
        message: 'Contact address appears to be too long',
        field: 'address'
      });
    }

    // Check for valid characters (hex-like for now)
    if (!/^[a-fA-F0-9]+$/.test(trimmedAddress)) {
      warnings.push({
        code: 'ADDRESS_INVALID_CHARS',
        message: 'Address contains non-hexadecimal characters',
        field: 'address',
        recommendation: 'Verify the address format is correct'
      });
    }

    // Check for common mistakes
    if (trimmedAddress.includes(' ')) {
      errors.push({
        code: 'ADDRESS_CONTAINS_SPACES',
        message: 'Address cannot contain spaces',
        field: 'address'
      });
    }

    if (trimmedAddress !== address) {
      warnings.push({
        code: 'ADDRESS_WHITESPACE',
        message: 'Address has leading or trailing whitespace',
        field: 'address',
        recommendation: 'Remove leading and trailing spaces'
      });
    }
  }

  /**
   * Validate contact notes
   */
  private validateNotes(
    notes: string,
    errors: ContactValidationError[],
    warnings: ContactValidationWarning[]
  ): void {
    if (notes.length > this.maxNotesLength) {
      errors.push({
        code: 'NOTES_TOO_LONG',
        message: `Contact notes cannot exceed ${this.maxNotesLength} characters`,
        field: 'notes'
      });
    }

    // Check for potentially sensitive information
    const sensitivePatterns = [
      /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/, // Credit card pattern
      /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/, // SSN pattern
      /password|passphrase|private.?key|seed.?phrase/i, // Security-related terms
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(notes)) {
        warnings.push({
          code: 'NOTES_SENSITIVE_DATA',
          message: 'Notes may contain sensitive information',
          field: 'notes',
          recommendation: 'Avoid storing sensitive data in contact notes'
        });
        break;
      }
    }

    // Check for very long lines
    const lines = notes.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 100) {
        warnings.push({
          code: 'NOTES_LONG_LINE',
          message: `Line ${i + 1} in notes is very long`,
          field: 'notes',
          recommendation: 'Consider breaking long lines for better readability'
        });
        break;
      }
    }
  }

  /**
   * Validate contact tags
   */
  private validateTags(
    tags: string[],
    errors: ContactValidationError[],
    warnings: ContactValidationWarning[]
  ): void {
    if (tags.length > this.maxTags) {
      warnings.push({
        code: 'TOO_MANY_TAGS',
        message: `Contact has more than ${this.maxTags} tags`,
        field: 'tags',
        recommendation: 'Consider reducing the number of tags for better organization'
      });
    }

    // Validate individual tags
    const seenTags = new Set<string>();
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      
      if (!tag || tag.trim().length === 0) {
        errors.push({
          code: 'EMPTY_TAG',
          message: `Tag at index ${i} is empty`,
          field: 'tags'
        });
        continue;
      }

      const trimmedTag = tag.trim();
      
      if (trimmedTag.length > this.maxTagLength) {
        errors.push({
          code: 'TAG_TOO_LONG',
          message: `Tag "${trimmedTag}" exceeds ${this.maxTagLength} characters`,
          field: 'tags'
        });
      }

      // Check for duplicates
      const lowerTag = trimmedTag.toLowerCase();
      if (seenTags.has(lowerTag)) {
        warnings.push({
          code: 'DUPLICATE_TAG',
          message: `Duplicate tag: "${trimmedTag}"`,
          field: 'tags',
          recommendation: 'Remove duplicate tags'
        });
      } else {
        seenTags.add(lowerTag);
      }

      // Tag format validation
      if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmedTag)) {
        warnings.push({
          code: 'TAG_INVALID_CHARS',
          message: `Tag "${trimmedTag}" contains special characters`,
          field: 'tags',
          recommendation: 'Use only letters, numbers, spaces, hyphens, and underscores in tags'
        });
      }
    }
  }

  /**
   * Validate contact emoji
   */
  private validateEmoji(
    emoji: string,
    errors: ContactValidationError[],
    warnings: ContactValidationWarning[]
  ): void {
    if (emoji.length > this.maxEmojiLength) {
      errors.push({
        code: 'EMOJI_TOO_LONG',
        message: `Emoji field cannot exceed ${this.maxEmojiLength} characters`,
        field: 'emoji'
      });
    }

    // Basic emoji validation (simplified)
    const emojiPattern = /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]$/u;
    
    if (emoji.length > 0 && !emojiPattern.test(emoji)) {
      warnings.push({
        code: 'INVALID_EMOJI',
        message: 'Emoji field contains non-emoji characters',
        field: 'emoji',
        recommendation: 'Use a single emoji character'
      });
    }
  }

  /**
   * Validate contact metadata
   */
  private validateMetadata(
    metadata: any,
    errors: ContactValidationError[],
    warnings: ContactValidationWarning[]
  ): void {
    if (typeof metadata !== 'object' || metadata === null) {
      errors.push({
        code: 'INVALID_METADATA',
        message: 'Metadata must be an object',
        field: 'metadata'
      });
      return;
    }

    // Validate metadata size
    const metadataSize = JSON.stringify(metadata).length;
    if (metadataSize > 10000) {
      warnings.push({
        code: 'METADATA_TOO_LARGE',
        message: 'Metadata is very large',
        field: 'metadata',
        recommendation: 'Consider reducing metadata size for better performance'
      });
    }

    // Validate specific metadata fields
    if (metadata.displayName && typeof metadata.displayName !== 'string') {
      errors.push({
        code: 'INVALID_DISPLAY_NAME',
        message: 'Display name must be a string',
        field: 'metadata.displayName'
      });
    }

    if (metadata.organization && typeof metadata.organization !== 'string') {
      errors.push({
        code: 'INVALID_ORGANIZATION',
        message: 'Organization must be a string',
        field: 'metadata.organization'
      });
    }

    if (metadata.transactionCount !== undefined && 
        (typeof metadata.transactionCount !== 'number' || metadata.transactionCount < 0)) {
      errors.push({
        code: 'INVALID_TRANSACTION_COUNT',
        message: 'Transaction count must be a non-negative number',
        field: 'metadata.transactionCount'
      });
    }

    if (metadata.totalTransacted !== undefined && 
        typeof metadata.totalTransacted !== 'bigint' && 
        typeof metadata.totalTransacted !== 'number') {
      errors.push({
        code: 'INVALID_TOTAL_TRANSACTED',
        message: 'Total transacted must be a number or bigint',
        field: 'metadata.totalTransacted'
      });
    }

    if (metadata.verified !== undefined && typeof metadata.verified !== 'boolean') {
      errors.push({
        code: 'INVALID_VERIFIED',
        message: 'Verified flag must be a boolean',
        field: 'metadata.verified'
      });
    }

    // Check for suspicious metadata
    if (metadata.customFields && typeof metadata.customFields === 'object') {
      const customFieldsSize = JSON.stringify(metadata.customFields).length;
      if (customFieldsSize > 5000) {
        warnings.push({
          code: 'CUSTOM_FIELDS_TOO_LARGE',
          message: 'Custom fields are very large',
          field: 'metadata.customFields',
          recommendation: 'Consider reducing custom fields size'
        });
      }
    }
  }

  /**
   * Quick validation for alias uniqueness (without errors/warnings arrays)
   */
  public isValidAlias(alias: string): boolean {
    if (!alias || alias.trim().length === 0) {
      return false;
    }

    const trimmed = alias.trim();
    
    return trimmed.length >= MIN_CONTACT_ALIAS_LENGTH &&
           trimmed.length <= MAX_CONTACT_ALIAS_LENGTH &&
           VALIDATION_PATTERNS.CONTACT_ALIAS.test(trimmed);
  }

  /**
   * Quick validation for address format (simplified)
   */
  public isValidAddress(address: string): boolean {
    if (!address || address.trim().length === 0) {
      return false;
    }

    const trimmed = address.trim();
    
    return trimmed.length >= 10 &&
           trimmed.length <= 200 &&
           !trimmed.includes(' ') &&
           /^[a-fA-F0-9]+$/.test(trimmed);
  }

  /**
   * Validate business rules for contact operations
   */
  public validateBusinessRules(
    operation: 'create' | 'update' | 'delete',
    contactData?: any,
    context?: any
  ): ContactValidationResult {
    const errors: ContactValidationError[] = [];
    const warnings: ContactValidationWarning[] = [];

    switch (operation) {
      case 'create':
        // Check if wallet has too many contacts
        if (context?.contactCount && context.contactCount >= 10000) {
          warnings.push({
            code: 'TOO_MANY_CONTACTS',
            message: 'Wallet has a large number of contacts',
            field: 'general',
            recommendation: 'Consider organizing or removing unused contacts'
          });
        }
        break;

      case 'update':
        // Check if contact has been used in transactions
        if (contactData?.metadata?.transactionCount > 0) {
          warnings.push({
            code: 'CONTACT_HAS_TRANSACTIONS',
            message: 'This contact has transaction history',
            field: 'general',
            recommendation: 'Be careful when modifying contacts with transaction history'
          });
        }
        break;

      case 'delete':
        // Prevent deletion of heavily used contacts without confirmation
        if (contactData?.metadata?.transactionCount > 10) {
          errors.push({
            code: 'DELETE_ACTIVE_CONTACT',
            message: 'Cannot delete contact with significant transaction history',
            field: 'general'
          });
        }

        if (contactData?.isFavorite) {
          warnings.push({
            code: 'DELETE_FAVORITE_CONTACT',
            message: 'Deleting a favorite contact',
            field: 'general',
            recommendation: 'Consider unfavoriting before deletion'
          });
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
