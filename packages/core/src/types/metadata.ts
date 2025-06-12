/**
 * @fileoverview Metadata types and management for the Tari JavaScript SDK
 * 
 * Defines metadata structures for storing additional information
 * about wallet entities like transactions, contacts, and settings.
 */

import type { UnixTimestamp } from './branded.js';

// Base metadata interface
export interface Metadata {
  /** Metadata entries as key-value pairs */
  readonly entries: Record<string, MetadataValue>;
  /** When metadata was created */
  readonly createdAt: UnixTimestamp;
  /** When metadata was last updated */
  readonly updatedAt: UnixTimestamp;
  /** Metadata version for migration support */
  readonly version: number;
}

// Metadata value types
export type MetadataValue = 
  | string
  | number
  | boolean
  | null
  | MetadataArray
  | MetadataObject;

export type MetadataArray = MetadataValue[];
export type MetadataObject = { [key: string]: MetadataValue };

// Metadata entry with additional information
export interface MetadataEntry {
  /** Entry key */
  readonly key: string;
  /** Entry value */
  readonly value: MetadataValue;
  /** Value type */
  readonly type: MetadataType;
  /** When entry was created */
  readonly createdAt: UnixTimestamp;
  /** When entry was last updated */
  readonly updatedAt: UnixTimestamp;
  /** Whether entry is encrypted */
  readonly encrypted: boolean;
  /** Entry description or purpose */
  readonly description?: string;
  /** Entry tags for categorization */
  readonly tags: string[];
}

// Metadata value types
export const MetadataType = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Null: 'null',
  Array: 'array',
  Object: 'object',
  Binary: 'binary',
  Encrypted: 'encrypted'
} as const;

export type MetadataType = typeof MetadataType[keyof typeof MetadataType];

// Metadata namespaces for organization
export const MetadataNamespace = {
  // Core wallet metadata
  Wallet: 'wallet',
  Account: 'account',
  Settings: 'settings',
  
  // Transaction metadata
  Transaction: 'transaction',
  Payment: 'payment',
  Invoice: 'invoice',
  
  // Contact metadata
  Contact: 'contact',
  AddressBook: 'address_book',
  
  // Application metadata
  Application: 'application',
  Plugin: 'plugin',
  Extension: 'extension',
  
  // User metadata
  User: 'user',
  Profile: 'profile',
  Preferences: 'preferences',
  
  // System metadata
  System: 'system',
  Debug: 'debug',
  Analytics: 'analytics',
  
  // Custom namespaces
  Custom: 'custom'
} as const;

export type MetadataNamespace = typeof MetadataNamespace[keyof typeof MetadataNamespace];

// Metadata schema for validation
export interface MetadataSchema {
  /** Schema name */
  readonly name: string;
  /** Schema version */
  readonly version: number;
  /** Namespace this schema applies to */
  readonly namespace: MetadataNamespace;
  /** Field definitions */
  readonly fields: MetadataFieldSchema[];
  /** Whether additional fields are allowed */
  readonly additionalFields: boolean;
  /** Schema description */
  readonly description?: string;
}

export interface MetadataFieldSchema {
  /** Field name */
  readonly name: string;
  /** Field type */
  readonly type: MetadataType;
  /** Whether field is required */
  readonly required: boolean;
  /** Default value */
  readonly defaultValue?: MetadataValue;
  /** Field description */
  readonly description?: string;
  /** Validation rules */
  readonly validation?: MetadataValidationRule[];
  /** Whether field should be encrypted */
  readonly encrypted?: boolean;
}

// Metadata validation rules
export interface MetadataValidationRule {
  /** Rule type */
  readonly type: MetadataValidationType;
  /** Rule parameters */
  readonly params: Record<string, any>;
  /** Error message for validation failure */
  readonly message: string;
}

export const MetadataValidationType = {
  MinLength: 'min_length',
  MaxLength: 'max_length',
  MinValue: 'min_value',
  MaxValue: 'max_value',
  Pattern: 'pattern',
  Enum: 'enum',
  Custom: 'custom'
} as const;

export type MetadataValidationType = typeof MetadataValidationType[keyof typeof MetadataValidationType];

// Metadata query and filter options
export interface MetadataQuery {
  /** Namespace to search in */
  namespace?: MetadataNamespace;
  /** Keys to include */
  keys?: string[];
  /** Key pattern to match */
  keyPattern?: string;
  /** Value filters */
  valueFilters?: MetadataValueFilter[];
  /** Tag filters */
  tags?: string[];
  /** Date range filter */
  dateRange?: {
    start?: UnixTimestamp;
    end?: UnixTimestamp;
  };
  /** Include encrypted entries */
  includeEncrypted?: boolean;
  /** Limit number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface MetadataValueFilter {
  /** Field to filter on */
  field: string;
  /** Filter operator */
  operator: MetadataFilterOperator;
  /** Filter value */
  value: MetadataValue;
}

export const MetadataFilterOperator = {
  Equals: 'eq',
  NotEquals: 'ne',
  GreaterThan: 'gt',
  GreaterThanOrEqual: 'gte',
  LessThan: 'lt',
  LessThanOrEqual: 'lte',
  Contains: 'contains',
  StartsWith: 'starts_with',
  EndsWith: 'ends_with',
  In: 'in',
  NotIn: 'not_in',
  Exists: 'exists',
  NotExists: 'not_exists'
} as const;

export type MetadataFilterOperator = typeof MetadataFilterOperator[keyof typeof MetadataFilterOperator];

// Metadata validation result
export interface MetadataValidationResult {
  /** Whether metadata is valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: MetadataValidationError[];
  /** Validation warnings */
  readonly warnings: MetadataValidationWarning[];
  /** Schema used for validation */
  readonly schema?: MetadataSchema;
}

export interface MetadataValidationError {
  readonly code: string;
  readonly message: string;
  readonly field: string;
  readonly value?: MetadataValue;
}

export interface MetadataValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly field: string;
  readonly recommendation: string;
}

// Metadata operation result
export interface MetadataOperationResult {
  /** Whether operation was successful */
  readonly success: boolean;
  /** Number of entries affected */
  readonly affected: number;
  /** Operation errors */
  readonly errors: string[];
  /** Result data */
  readonly data?: any;
}

// Metadata encryption information
export interface MetadataEncryption {
  /** Encryption algorithm used */
  readonly algorithm: string;
  /** Encrypted data */
  readonly data: string;
  /** Initialization vector */
  readonly iv: string;
  /** Authentication tag */
  readonly tag: string;
  /** Salt used for key derivation */
  readonly salt: string;
}

// Metadata backup and restore
export interface MetadataBackup {
  /** Backup format version */
  readonly version: string;
  /** Backup timestamp */
  readonly timestamp: UnixTimestamp;
  /** Metadata entries */
  readonly metadata: Record<string, MetadataEntry>;
  /** Schemas used */
  readonly schemas: MetadataSchema[];
  /** Backup checksum */
  readonly checksum: string;
}

// Metadata utilities
export class MetadataUtils {
  /**
   * Create new metadata instance
   */
  static create(entries: Record<string, MetadataValue> = {}): Metadata {
    const now = Date.now() as UnixTimestamp;
    return {
      entries,
      createdAt: now,
      updatedAt: now,
      version: 1
    };
  }

  /**
   * Update metadata with new entries
   */
  static update(metadata: Metadata, updates: Record<string, MetadataValue>): Metadata {
    return {
      ...metadata,
      entries: { ...metadata.entries, ...updates },
      updatedAt: Date.now() as UnixTimestamp,
      version: metadata.version + 1
    };
  }

  /**
   * Remove entries from metadata
   */
  static remove(metadata: Metadata, keys: string[]): Metadata {
    const newEntries = { ...metadata.entries };
    for (const key of keys) {
      delete newEntries[key];
    }

    return {
      ...metadata,
      entries: newEntries,
      updatedAt: Date.now() as UnixTimestamp,
      version: metadata.version + 1
    };
  }

  /**
   * Get metadata value by key
   */
  static get<T extends MetadataValue>(metadata: Metadata, key: string): T | undefined {
    return metadata.entries[key] as T;
  }

  /**
   * Get metadata value with default
   */
  static getOrDefault<T extends MetadataValue>(
    metadata: Metadata, 
    key: string, 
    defaultValue: T
  ): T {
    const value = metadata.entries[key];
    return value !== undefined ? value as T : defaultValue;
  }

  /**
   * Check if metadata has key
   */
  static has(metadata: Metadata, key: string): boolean {
    return key in metadata.entries;
  }

  /**
   * Get all keys from metadata
   */
  static keys(metadata: Metadata): string[] {
    return Object.keys(metadata.entries);
  }

  /**
   * Get metadata size (number of entries)
   */
  static size(metadata: Metadata): number {
    return Object.keys(metadata.entries).length;
  }

  /**
   * Check if metadata is empty
   */
  static isEmpty(metadata: Metadata): boolean {
    return this.size(metadata) === 0;
  }

  /**
   * Merge multiple metadata objects
   */
  static merge(...metadatas: Metadata[]): Metadata {
    const merged = metadatas.reduce((acc, meta) => ({
      ...acc,
      ...meta.entries
    }), {} as Record<string, MetadataValue>);

    return this.create(merged);
  }

  /**
   * Filter metadata by keys
   */
  static filter(metadata: Metadata, predicate: (key: string, value: MetadataValue) => boolean): Metadata {
    const filtered: Record<string, MetadataValue> = {};
    
    for (const [key, value] of Object.entries(metadata.entries)) {
      if (predicate(key, value)) {
        filtered[key] = value;
      }
    }

    return this.create(filtered);
  }

  /**
   * Map metadata values
   */
  static map<T>(
    metadata: Metadata, 
    mapper: (key: string, value: MetadataValue) => T
  ): Record<string, T> {
    const result: Record<string, T> = {};
    
    for (const [key, value] of Object.entries(metadata.entries)) {
      result[key] = mapper(key, value);
    }

    return result;
  }

  /**
   * Validate metadata value type
   */
  static validateType(value: MetadataValue, expectedType: MetadataType): boolean {
    switch (expectedType) {
      case MetadataType.String:
        return typeof value === 'string';
      case MetadataType.Number:
        return typeof value === 'number';
      case MetadataType.Boolean:
        return typeof value === 'boolean';
      case MetadataType.Null:
        return value === null;
      case MetadataType.Array:
        return Array.isArray(value);
      case MetadataType.Object:
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Infer metadata value type
   */
  static inferType(value: MetadataValue): MetadataType {
    if (value === null) return MetadataType.Null;
    if (Array.isArray(value)) return MetadataType.Array;
    
    const type = typeof value;
    switch (type) {
      case 'string': return MetadataType.String;
      case 'number': return MetadataType.Number;
      case 'boolean': return MetadataType.Boolean;
      case 'object': return MetadataType.Object;
      default: return MetadataType.String;
    }
  }

  /**
   * Validate metadata against schema
   */
  static validate(metadata: Metadata, schema: MetadataSchema): MetadataValidationResult {
    const errors: MetadataValidationError[] = [];
    const warnings: MetadataValidationWarning[] = [];

    // Check required fields
    for (const field of schema.fields) {
      if (field.required && !this.has(metadata, field.name)) {
        errors.push({
          code: 'REQUIRED_FIELD_MISSING',
          message: `Required field '${field.name}' is missing`,
          field: field.name
        });
        continue;
      }

      const value = this.get(metadata, field.name);
      if (value === undefined) continue;

      // Type validation
      if (!this.validateType(value, field.type)) {
        errors.push({
          code: 'INVALID_TYPE',
          message: `Field '${field.name}' has invalid type. Expected ${field.type}`,
          field: field.name,
          value
        });
        continue;
      }

      // Custom validation rules
      if (field.validation) {
        for (const rule of field.validation) {
          const validationResult = this.validateRule(value, rule);
          if (!validationResult.valid) {
            errors.push({
              code: rule.type.toUpperCase(),
              message: rule.message,
              field: field.name,
              value
            });
          }
        }
      }
    }

    // Check for unknown fields if not allowed
    if (!schema.additionalFields) {
      const allowedFields = new Set(schema.fields.map(f => f.name));
      for (const key of this.keys(metadata)) {
        if (!allowedFields.has(key)) {
          warnings.push({
            code: 'UNKNOWN_FIELD',
            message: `Unknown field '${key}' found`,
            field: key,
            recommendation: 'Remove unknown field or update schema to allow additional fields'
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      schema
    };
  }

  /**
   * Validate single rule
   */
  private static validateRule(value: MetadataValue, rule: MetadataValidationRule): { valid: boolean } {
    switch (rule.type) {
      case MetadataValidationType.MinLength:
        return { valid: typeof value === 'string' && value.length >= rule.params.min };
      
      case MetadataValidationType.MaxLength:
        return { valid: typeof value === 'string' && value.length <= rule.params.max };
      
      case MetadataValidationType.MinValue:
        return { valid: typeof value === 'number' && value >= rule.params.min };
      
      case MetadataValidationType.MaxValue:
        return { valid: typeof value === 'number' && value <= rule.params.max };
      
      case MetadataValidationType.Pattern:
        return { valid: typeof value === 'string' && new RegExp(rule.params.pattern).test(value) };
      
      case MetadataValidationType.Enum:
        return { valid: Array.isArray(rule.params.values) && rule.params.values.includes(value) };
      
      default:
        return { valid: true };
    }
  }

  /**
   * Convert metadata to JSON
   */
  static toJSON(metadata: Metadata): string {
    return JSON.stringify(metadata, null, 2);
  }

  /**
   * Parse metadata from JSON
   */
  static fromJSON(json: string): Metadata {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed === 'object' && parsed !== null && 'entries' in parsed) {
        return parsed as Metadata;
      }
      throw new Error('Invalid metadata JSON structure');
    } catch (error) {
      throw new Error(`Failed to parse metadata JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create metadata backup
   */
  static createBackup(metadata: Metadata, schemas: MetadataSchema[] = []): MetadataBackup {
    const backup: MetadataBackup = {
      version: '1.0.0',
      timestamp: Date.now() as UnixTimestamp,
      metadata: this.convertToEntries(metadata),
      schemas,
      checksum: this.calculateChecksum(metadata)
    };

    return backup;
  }

  /**
   * Restore metadata from backup
   */
  static restoreFromBackup(backup: MetadataBackup): Metadata {
    const entries: Record<string, MetadataValue> = {};
    
    for (const [key, entry] of Object.entries(backup.metadata)) {
      entries[key] = entry.value;
    }

    return this.create(entries);
  }

  /**
   * Convert metadata to entries format
   */
  private static convertToEntries(metadata: Metadata): Record<string, MetadataEntry> {
    const entries: Record<string, MetadataEntry> = {};
    
    for (const [key, value] of Object.entries(metadata.entries)) {
      entries[key] = {
        key,
        value,
        type: this.inferType(value),
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        encrypted: false,
        tags: []
      };
    }

    return entries;
  }

  /**
   * Calculate metadata checksum
   */
  private static calculateChecksum(metadata: Metadata): string {
    const data = JSON.stringify(metadata.entries);
    // Simple hash function - in real implementation would use crypto
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

// Export utilities
export { MetadataUtils as Utils };

// Common metadata schemas
export const CommonSchemas = {
  WalletSettings: {
    name: 'wallet_settings',
    version: 1,
    namespace: MetadataNamespace.Settings,
    additionalFields: true,
    fields: [
      {
        name: 'theme',
        type: MetadataType.String,
        required: false,
        defaultValue: 'light',
        validation: [{
          type: MetadataValidationType.Enum,
          params: { values: ['light', 'dark', 'auto'] },
          message: 'Theme must be light, dark, or auto'
        }]
      },
      {
        name: 'currency',
        type: MetadataType.String,
        required: false,
        defaultValue: 'USD'
      },
      {
        name: 'notifications',
        type: MetadataType.Boolean,
        required: false,
        defaultValue: true
      }
    ]
  } as MetadataSchema,

  TransactionTags: {
    name: 'transaction_tags',
    version: 1,
    namespace: MetadataNamespace.Transaction,
    additionalFields: false,
    fields: [
      {
        name: 'category',
        type: MetadataType.String,
        required: false
      },
      {
        name: 'description',
        type: MetadataType.String,
        required: false,
        validation: [{
          type: MetadataValidationType.MaxLength,
          params: { max: 256 },
          message: 'Description cannot exceed 256 characters'
        }]
      },
      {
        name: 'tags',
        type: MetadataType.Array,
        required: false
      }
    ]
  } as MetadataSchema
};
