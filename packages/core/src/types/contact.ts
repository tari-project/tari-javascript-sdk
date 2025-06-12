/**
 * @fileoverview Contact types and management for the Tari JavaScript SDK
 * 
 * Defines contact structures for address book management with support
 * for favorites, metadata, and contact validation.
 */

import type {
  TariAddressString,
  UnixTimestamp
} from './branded.js';

// Core contact interface
export interface Contact {
  /** Unique contact identifier */
  readonly id: string;
  /** User-friendly alias for the contact */
  readonly alias: string;
  /** Tari address for the contact */
  readonly address: TariAddressString;
  /** Whether this contact is marked as favorite */
  readonly isFavorite: boolean;
  /** Optional emoji or icon identifier */
  readonly emoji?: string;
  /** Contact notes or description */
  readonly notes?: string;
  /** Contact tags for categorization */
  readonly tags: string[];
  /** Custom metadata */
  readonly metadata: ContactMetadata;
  /** When contact was created */
  readonly createdAt: UnixTimestamp;
  /** When contact was last updated */
  readonly updatedAt: UnixTimestamp;
  /** When contact was last seen in transactions */
  readonly lastSeenAt?: UnixTimestamp;
}

// Contact metadata for additional information
export interface ContactMetadata {
  /** Contact's preferred name */
  displayName?: string;
  /** Contact's organization or company */
  organization?: string;
  /** Contact type classification */
  type?: ContactType;
  /** Source where contact was added from */
  source?: ContactSource;
  /** Number of transactions with this contact */
  transactionCount?: number;
  /** Total amount transacted */
  totalTransacted?: bigint;
  /** Average transaction amount */
  averageAmount?: bigint;
  /** Last transaction date */
  lastTransactionAt?: UnixTimestamp;
  /** Contact verification status */
  verified?: boolean;
  /** External identifiers */
  externalIds?: Record<string, string>;
  /** Custom fields */
  customFields?: Record<string, any>;
}

// Contact type classifications
export const ContactType = {
  Personal: 'personal',
  Business: 'business',
  Exchange: 'exchange',
  Service: 'service',
  DApp: 'dapp',
  Merchant: 'merchant',
  Unknown: 'unknown'
} as const;

export type ContactType = typeof ContactType[keyof typeof ContactType];

// Contact source origins
export const ContactSource = {
  Manual: 'manual',
  Transaction: 'transaction',
  Import: 'import',
  QRCode: 'qr_code',
  AddressBook: 'address_book',
  External: 'external',
  Discovery: 'discovery'
} as const;

export type ContactSource = typeof ContactSource[keyof typeof ContactSource];

// Contact creation parameters
export interface CreateContactParams {
  /** Contact alias */
  alias: string;
  /** Contact address */
  address: TariAddressString;
  /** Mark as favorite */
  isFavorite?: boolean;
  /** Optional emoji */
  emoji?: string;
  /** Contact notes */
  notes?: string;
  /** Contact tags */
  tags?: string[];
  /** Additional metadata */
  metadata?: Partial<ContactMetadata>;
}

// Contact update parameters
export interface UpdateContactParams {
  /** Contact ID to update */
  id: string;
  /** New alias */
  alias?: string;
  /** New address */
  address?: TariAddressString;
  /** Update favorite status */
  isFavorite?: boolean;
  /** Update emoji */
  emoji?: string;
  /** Update notes */
  notes?: string;
  /** Update tags */
  tags?: string[];
  /** Update metadata */
  metadata?: Partial<ContactMetadata>;
}

// Contact search and filter options
export interface ContactFilter {
  /** Search in alias */
  aliasSearch?: string;
  /** Filter by favorite status */
  isFavorite?: boolean;
  /** Filter by tags */
  tags?: string[];
  /** Filter by contact type */
  type?: ContactType;
  /** Filter by source */
  source?: ContactSource;
  /** Filter by verification status */
  verified?: boolean;
  /** Filter by address */
  address?: TariAddressString;
  /** Filter by creation date range */
  createdRange?: {
    start?: UnixTimestamp;
    end?: UnixTimestamp;
  };
  /** Filter by last seen date range */
  lastSeenRange?: {
    start?: UnixTimestamp;
    end?: UnixTimestamp;
  };
  /** Filter by transaction count range */
  transactionCountRange?: {
    min?: number;
    max?: number;
  };
}

// Contact sorting options
export const ContactSortBy = {
  Alias: 'alias',
  Address: 'address',
  CreatedAt: 'created_at',
  UpdatedAt: 'updated_at',
  LastSeenAt: 'last_seen_at',
  TransactionCount: 'transaction_count',
  TotalTransacted: 'total_transacted',
  Favorite: 'favorite'
} as const;

export type ContactSortBy = typeof ContactSortBy[keyof typeof ContactSortBy];

// Contact query options
export interface ContactQueryOptions {
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
  /** Sort by field */
  sortBy?: ContactSortBy;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Include metadata in results */
  includeMetadata?: boolean;
}

// Contact validation result
export interface ContactValidationResult {
  /** Whether contact is valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: ContactValidationError[];
  /** Validation warnings */
  readonly warnings: ContactValidationWarning[];
}

export interface ContactValidationError {
  readonly code: string;
  readonly message: string;
  readonly field: string;
}

export interface ContactValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly field: string;
  readonly recommendation: string;
}

// Contact import/export formats
export interface ContactExportData {
  /** Export format version */
  version: string;
  /** Export timestamp */
  exportedAt: UnixTimestamp;
  /** Number of contacts */
  count: number;
  /** Contact data */
  contacts: Contact[];
  /** Export metadata */
  metadata?: {
    walletId?: string;
    walletName?: string;
    network?: string;
  };
}

export interface ContactImportResult {
  /** Whether import was successful */
  readonly success: boolean;
  /** Number of contacts imported */
  readonly imported: number;
  /** Number of contacts skipped */
  readonly skipped: number;
  /** Number of contacts updated */
  readonly updated: number;
  /** Import errors */
  readonly errors: ContactImportError[];
  /** Imported contact IDs */
  readonly importedIds: string[];
}

export interface ContactImportError {
  readonly index: number;
  readonly contact: Partial<Contact>;
  readonly error: string;
  readonly code: string;
}

// Contact merge information
export interface ContactMergeInfo {
  /** Primary contact (will be kept) */
  primary: Contact;
  /** Secondary contact (will be merged into primary) */
  secondary: Contact;
  /** Merge strategy */
  strategy: ContactMergeStrategy;
  /** Fields to merge */
  fieldsToMerge: ContactMergeField[];
  /** Conflicts that need resolution */
  conflicts: ContactMergeConflict[];
}

export const ContactMergeStrategy = {
  KeepPrimary: 'keep_primary',
  KeepSecondary: 'keep_secondary',
  Merge: 'merge',
  Ask: 'ask'
} as const;

export type ContactMergeStrategy = typeof ContactMergeStrategy[keyof typeof ContactMergeStrategy];

export const ContactMergeField = {
  Alias: 'alias',
  Notes: 'notes',
  Tags: 'tags',
  Metadata: 'metadata',
  Favorite: 'favorite',
  Emoji: 'emoji'
} as const;

export type ContactMergeField = typeof ContactMergeField[keyof typeof ContactMergeField];

export interface ContactMergeConflict {
  readonly field: ContactMergeField;
  readonly primaryValue: any;
  readonly secondaryValue: any;
  readonly resolution?: 'primary' | 'secondary' | 'both' | 'custom';
  readonly customValue?: any;
}

// Contact statistics
export interface ContactStatistics {
  /** Total number of contacts */
  readonly total: number;
  /** Number of favorite contacts */
  readonly favorites: number;
  /** Number of verified contacts */
  readonly verified: number;
  /** Number by contact type */
  readonly byType: Record<ContactType, number>;
  /** Number by source */
  readonly bySource: Record<ContactSource, number>;
  /** Most used tags */
  readonly topTags: Array<{ tag: string; count: number }>;
  /** Contact activity stats */
  readonly activity: {
    withTransactions: number;
    recentlyUsed: number; // Used in last 30 days
    neverUsed: number;
  };
  /** Date ranges */
  readonly dateRanges: {
    earliestCreated: UnixTimestamp;
    latestCreated: UnixTimestamp;
    earliestSeen?: UnixTimestamp;
    latestSeen?: UnixTimestamp;
  };
}

// Contact utilities
export class ContactUtils {
  /**
   * Generate unique contact ID
   */
  static generateId(): string {
    return `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate contact data
   */
  static validate(contact: CreateContactParams | UpdateContactParams): ContactValidationResult {
    const errors: ContactValidationError[] = [];
    const warnings: ContactValidationWarning[] = [];

    // Validate alias
    if ('alias' in contact && contact.alias !== undefined) {
      if (!contact.alias || contact.alias.trim().length === 0) {
        errors.push({
          code: 'EMPTY_ALIAS',
          message: 'Contact alias cannot be empty',
          field: 'alias'
        });
      } else if (contact.alias.length > 64) {
        errors.push({
          code: 'ALIAS_TOO_LONG',
          message: 'Contact alias cannot exceed 64 characters',
          field: 'alias'
        });
      } else if (!/^[a-zA-Z0-9_\-\s\.]+$/.test(contact.alias)) {
        warnings.push({
          code: 'INVALID_ALIAS_CHARS',
          message: 'Contact alias contains special characters',
          field: 'alias',
          recommendation: 'Use only letters, numbers, spaces, dots, hyphens, and underscores'
        });
      }
    }

    // Validate notes length
    if (contact.notes && contact.notes.length > 512) {
      errors.push({
        code: 'NOTES_TOO_LONG',
        message: 'Contact notes cannot exceed 512 characters',
        field: 'notes'
      });
    }

    // Validate tags
    if (contact.tags) {
      if (contact.tags.length > 10) {
        warnings.push({
          code: 'TOO_MANY_TAGS',
          message: 'Contact has more than 10 tags',
          field: 'tags',
          recommendation: 'Consider reducing the number of tags for better organization'
        });
      }

      for (const tag of contact.tags) {
        if (tag.length > 32) {
          errors.push({
            code: 'TAG_TOO_LONG',
            message: `Tag "${tag}" exceeds 32 characters`,
            field: 'tags'
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create contact with defaults
   */
  static create(params: CreateContactParams): Contact {
    const validation = this.validate(params);
    if (!validation.valid) {
      throw new Error(`Invalid contact: ${validation.errors[0]?.message}`);
    }

    const now = Date.now() as UnixTimestamp;
    
    return {
      id: this.generateId(),
      alias: params.alias.trim(),
      address: params.address,
      isFavorite: params.isFavorite || false,
      emoji: params.emoji,
      notes: params.notes || '',
      tags: params.tags || [],
      metadata: {
        source: ContactSource.Manual,
        type: ContactType.Unknown,
        transactionCount: 0,
        verified: false,
        ...params.metadata
      },
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Update contact with validation
   */
  static update(existing: Contact, params: UpdateContactParams): Contact {
    const validation = this.validate(params);
    if (!validation.valid) {
      throw new Error(`Invalid contact update: ${validation.errors[0]?.message}`);
    }

    return {
      ...existing,
      alias: params.alias !== undefined ? params.alias.trim() : existing.alias,
      address: params.address || existing.address,
      isFavorite: params.isFavorite !== undefined ? params.isFavorite : existing.isFavorite,
      emoji: params.emoji !== undefined ? params.emoji : existing.emoji,
      notes: params.notes !== undefined ? params.notes : existing.notes,
      tags: params.tags || existing.tags,
      metadata: params.metadata ? { ...existing.metadata, ...params.metadata } : existing.metadata,
      updatedAt: Date.now() as UnixTimestamp
    };
  }

  /**
   * Check if two contacts are duplicates
   */
  static isDuplicate(a: Contact, b: Contact): boolean {
    return a.address === b.address || 
           (a.alias.toLowerCase() === b.alias.toLowerCase() && a.address === b.address);
  }

  /**
   * Find duplicate contacts in list
   */
  static findDuplicates(contacts: Contact[]): Contact[][] {
    const duplicates: Contact[][] = [];
    const seen = new Set<string>();

    for (let i = 0; i < contacts.length; i++) {
      if (seen.has(contacts[i].id)) continue;

      const group = [contacts[i]];
      seen.add(contacts[i].id);

      for (let j = i + 1; j < contacts.length; j++) {
        if (this.isDuplicate(contacts[i], contacts[j])) {
          group.push(contacts[j]);
          seen.add(contacts[j].id);
        }
      }

      if (group.length > 1) {
        duplicates.push(group);
      }
    }

    return duplicates;
  }

  /**
   * Sort contacts by criteria
   */
  static sort(
    contacts: Contact[],
    sortBy: ContactSortBy = ContactSortBy.Alias,
    order: 'asc' | 'desc' = 'asc'
  ): Contact[] {
    return contacts.slice().sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case ContactSortBy.Alias:
          comparison = a.alias.toLowerCase().localeCompare(b.alias.toLowerCase());
          break;
        case ContactSortBy.Address:
          comparison = a.address.localeCompare(b.address);
          break;
        case ContactSortBy.CreatedAt:
          comparison = a.createdAt - b.createdAt;
          break;
        case ContactSortBy.UpdatedAt:
          comparison = a.updatedAt - b.updatedAt;
          break;
        case ContactSortBy.LastSeenAt:
          const aLastSeen = a.lastSeenAt || 0;
          const bLastSeen = b.lastSeenAt || 0;
          comparison = aLastSeen - bLastSeen;
          break;
        case ContactSortBy.TransactionCount:
          const aCount = a.metadata.transactionCount || 0;
          const bCount = b.metadata.transactionCount || 0;
          comparison = aCount - bCount;
          break;
        case ContactSortBy.TotalTransacted:
          const aTotal = a.metadata.totalTransacted || 0n;
          const bTotal = b.metadata.totalTransacted || 0n;
          comparison = aTotal < bTotal ? -1 : aTotal > bTotal ? 1 : 0;
          break;
        case ContactSortBy.Favorite:
          comparison = Number(b.isFavorite) - Number(a.isFavorite);
          break;
        default:
          comparison = 0;
      }

      return order === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Filter contacts by criteria
   */
  static filter(contacts: Contact[], filter: ContactFilter): Contact[] {
    return contacts.filter(contact => {
      // Alias search
      if (filter.aliasSearch) {
        const searchTerm = filter.aliasSearch.toLowerCase();
        if (!contact.alias.toLowerCase().includes(searchTerm)) {
          return false;
        }
      }

      // Favorite filter
      if (filter.isFavorite !== undefined && contact.isFavorite !== filter.isFavorite) {
        return false;
      }

      // Tags filter
      if (filter.tags && filter.tags.length > 0) {
        const hasMatchingTag = filter.tags.some(tag => contact.tags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      // Type filter
      if (filter.type && contact.metadata.type !== filter.type) {
        return false;
      }

      // Source filter
      if (filter.source && contact.metadata.source !== filter.source) {
        return false;
      }

      // Verification filter
      if (filter.verified !== undefined && contact.metadata.verified !== filter.verified) {
        return false;
      }

      // Address filter
      if (filter.address && contact.address !== filter.address) {
        return false;
      }

      // Created date range
      if (filter.createdRange) {
        if (filter.createdRange.start && contact.createdAt < filter.createdRange.start) {
          return false;
        }
        if (filter.createdRange.end && contact.createdAt > filter.createdRange.end) {
          return false;
        }
      }

      // Last seen date range
      if (filter.lastSeenRange && contact.lastSeenAt) {
        if (filter.lastSeenRange.start && contact.lastSeenAt < filter.lastSeenRange.start) {
          return false;
        }
        if (filter.lastSeenRange.end && contact.lastSeenAt > filter.lastSeenRange.end) {
          return false;
        }
      }

      // Transaction count range
      if (filter.transactionCountRange) {
        const count = contact.metadata.transactionCount || 0;
        if (filter.transactionCountRange.min && count < filter.transactionCountRange.min) {
          return false;
        }
        if (filter.transactionCountRange.max && count > filter.transactionCountRange.max) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Calculate contact statistics
   */
  static calculateStatistics(contacts: Contact[]): ContactStatistics {
    const stats = {
      total: contacts.length,
      favorites: 0,
      verified: 0,
      byType: {} as Record<ContactType, number>,
      bySource: {} as Record<ContactSource, number>,
      topTags: [] as Array<{ tag: string; count: number }>,
      activity: {
        withTransactions: 0,
        recentlyUsed: 0,
        neverUsed: 0
      },
      dateRanges: {
        earliestCreated: Date.now() as UnixTimestamp,
        latestCreated: 0 as UnixTimestamp,
        earliestSeen: undefined as UnixTimestamp | undefined,
        latestSeen: undefined as UnixTimestamp | undefined
      }
    };

    if (contacts.length === 0) {
      return stats;
    }

    // Initialize type and source counters
    Object.values(ContactType).forEach(type => {
      stats.byType[type] = 0;
    });
    Object.values(ContactSource).forEach(source => {
      stats.bySource[source] = 0;
    });

    const tagCounts = new Map<string, number>();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    for (const contact of contacts) {
      // Basic counts
      if (contact.isFavorite) stats.favorites++;
      if (contact.metadata.verified) stats.verified++;

      // Type and source counts
      const type = contact.metadata.type || ContactType.Unknown;
      const source = contact.metadata.source || ContactSource.Manual;
      stats.byType[type]++;
      stats.bySource[source]++;

      // Tag counts
      for (const tag of contact.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      // Activity stats
      const transactionCount = contact.metadata.transactionCount || 0;
      if (transactionCount > 0) {
        stats.activity.withTransactions++;
      } else {
        stats.activity.neverUsed++;
      }

      if (contact.lastSeenAt && contact.lastSeenAt > thirtyDaysAgo) {
        stats.activity.recentlyUsed++;
      }

      // Date ranges
      if (contact.createdAt < stats.dateRanges.earliestCreated) {
        stats.dateRanges.earliestCreated = contact.createdAt;
      }
      if (contact.createdAt > stats.dateRanges.latestCreated) {
        stats.dateRanges.latestCreated = contact.createdAt;
      }

      if (contact.lastSeenAt) {
        if (!stats.dateRanges.earliestSeen || contact.lastSeenAt < stats.dateRanges.earliestSeen) {
          stats.dateRanges.earliestSeen = contact.lastSeenAt;
        }
        if (!stats.dateRanges.latestSeen || contact.lastSeenAt > stats.dateRanges.latestSeen) {
          stats.dateRanges.latestSeen = contact.lastSeenAt;
        }
      }
    }

    // Sort tags by count
    stats.topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return stats;
  }
}

// Export utilities
// ContactUtils is already exported with its class declaration
