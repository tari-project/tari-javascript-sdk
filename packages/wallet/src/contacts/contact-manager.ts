/**
 * @fileoverview Contact Management System for Tari Wallet
 * 
 * Provides comprehensive contact management with local encrypted storage,
 * validation, search capabilities, and future FFI synchronization support.
 */

import {
  Contact,
  CreateContactParams,
  UpdateContactParams,
  ContactFilter,
  ContactQueryOptions,
  ContactSortBy,
  ContactStatistics,
  ContactUtils,
  ContactValidationResult,
  ContactExportData,
  ContactImportResult,
  WalletError,
  WalletErrorCode,
  type WalletHandle
} from '@tari-project/tarijs-core';

import { ContactStore } from './contact-store.js';
import { ContactValidator } from './contact-validator.js';
import { ContactEventEmitter } from './contact-events.js';

/**
 * Contact manager with CRUD operations and validation
 */
export class ContactManager {
  private readonly store: ContactStore;
  private readonly validator: ContactValidator;
  private readonly events: ContactEventEmitter;
  private readonly walletHandle: WalletHandle;

  constructor(walletHandle: WalletHandle, storagePath?: string) {
    this.walletHandle = walletHandle;
    this.store = new ContactStore(walletHandle, storagePath);
    this.validator = new ContactValidator();
    this.events = new ContactEventEmitter();
  }

  /**
   * Initialize contact manager and setup storage
   */
  public async initialize(): Promise<void> {
    try {
      await this.store.initialize();
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactInitializationFailed,
        'Failed to initialize contact manager',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Destroy contact manager and cleanup resources
   */
  public async destroy(): Promise<void> {
    try {
      await this.store.destroy();
      this.events.removeAllListeners();
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactCleanupFailed,
        'Failed to destroy contact manager',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Add a new contact
   */
  public async add(params: CreateContactParams): Promise<Contact> {
    try {
      // Validate contact data
      const validation = this.validator.validateCreate(params);
      if (!validation.valid) {
        throw new WalletError(
          WalletErrorCode.ContactValidationFailed,
          `Invalid contact data: ${validation.errors[0]?.message}`,
          { context: { validation } }
        );
      }

      // Check for duplicates
      await this.validateNoDuplicates(params.alias, params.address);

      // Create contact with defaults
      const contact = ContactUtils.create(params);

      // Store contact
      await this.store.add(contact);

      // Emit event
      this.events.emitContactAdded(contact);

      return contact;
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        WalletErrorCode.ContactAddFailed,
        'Failed to add contact',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Update an existing contact
   */
  public async update(params: UpdateContactParams): Promise<Contact> {
    try {
      // Get existing contact
      const existing = await this.store.get(params.id);
      if (!existing) {
        throw new WalletError(
          WalletErrorCode.ContactNotFound,
          `Contact not found: ${params.id}`,
          { context: { contactId: params.id } }
        );
      }

      // Validate update data
      const validation = this.validator.validateUpdate(params);
      if (!validation.valid) {
        throw new WalletError(
          WalletErrorCode.ContactValidationFailed,
          `Invalid contact update: ${validation.errors[0]?.message}`,
          { context: { validation } }
        );
      }

      // Check for duplicates if alias or address changed
      if (params.alias && params.alias !== existing.alias) {
        await this.validateNoDuplicateAlias(params.alias, params.id);
      }
      if (params.address && params.address !== existing.address) {
        await this.validateNoDuplicateAddress(params.address, params.id);
      }

      // Update contact
      const updated = ContactUtils.update(existing, params);

      // Store updated contact
      await this.store.update(updated);

      // Emit event
      this.events.emitContactUpdated(updated, existing);

      return updated;
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        WalletErrorCode.ContactUpdateFailed,
        'Failed to update contact',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Remove a contact
   */
  public async remove(contactId: string): Promise<void> {
    try {
      // Check contact exists
      const existing = await this.store.get(contactId);
      if (!existing) {
        throw new WalletError(
          WalletErrorCode.ContactNotFound,
          `Contact not found: ${contactId}`,
          { context: { contactId } }
        );
      }

      // Remove from storage
      await this.store.remove(contactId);

      // Emit event
      this.events.emitContactRemoved(contactId);
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        WalletErrorCode.ContactRemoveFailed,
        'Failed to remove contact',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get a single contact by ID
   */
  public async get(contactId: string): Promise<Contact | null> {
    try {
      return await this.store.get(contactId);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactGetFailed,
        'Failed to get contact',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get a contact by alias
   */
  public async getByAlias(alias: string): Promise<Contact | null> {
    try {
      return await this.store.getByAlias(alias);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactGetFailed,
        'Failed to get contact by alias',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get a contact by address
   */
  public async getByAddress(address: string): Promise<Contact | null> {
    try {
      return await this.store.getByAddress(address);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactGetFailed,
        'Failed to get contact by address',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * List all contacts with optional filtering and pagination
   */
  public async list(
    filter?: ContactFilter,
    options?: ContactQueryOptions
  ): Promise<Contact[]> {
    try {
      let contacts = await this.store.list();

      // Apply filtering
      if (filter) {
        contacts = ContactUtils.filter(contacts, filter);
      }

      // Apply sorting
      if (options?.sortBy) {
        contacts = ContactUtils.sort(
          contacts,
          options.sortBy,
          options.sortOrder || 'asc'
        );
      }

      // Apply pagination
      if (options?.offset || options?.limit) {
        const start = options.offset || 0;
        const end = options.limit ? start + options.limit : undefined;
        contacts = contacts.slice(start, end);
      }

      return contacts;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactListFailed,
        'Failed to list contacts',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get contact statistics
   */
  public async getStatistics(): Promise<ContactStatistics> {
    try {
      const contacts = await this.store.list();
      return ContactUtils.calculateStatistics(contacts);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactStatsFailed,
        'Failed to get contact statistics',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Search contacts by text
   */
  public async search(
    query: string,
    options?: ContactQueryOptions
  ): Promise<Contact[]> {
    try {
      const filter: ContactFilter = {
        aliasSearch: query
      };

      return await this.list(filter, options);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactSearchFailed,
        'Failed to search contacts',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Export contacts to encrypted backup
   */
  public async export(): Promise<ContactExportData> {
    try {
      const contacts = await this.store.list();
      
      return {
        version: '1.0',
        exportedAt: Date.now() as any,
        count: contacts.length,
        contacts,
        metadata: {
          walletId: this.walletHandle.toString(),
          network: 'testnet' // TODO: Get from wallet config
        }
      };
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactExportFailed,
        'Failed to export contacts',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Import contacts from backup
   */
  public async import(data: ContactExportData): Promise<ContactImportResult> {
    try {
      let imported = 0;
      let skipped = 0;
      let updated = 0;
      const errors: any[] = [];
      const importedIds: string[] = [];

      for (let i = 0; i < data.contacts.length; i++) {
        const contact = data.contacts[i];
        
        try {
          // Check if contact already exists
          const existing = await this.store.getByAlias(contact.alias);
          
          if (existing) {
            if (existing.address === contact.address) {
              skipped++;
              continue;
            } else {
              // Update existing contact
              const updateParams: UpdateContactParams = {
                id: existing.id,
                address: contact.address,
                isFavorite: contact.isFavorite,
                emoji: contact.emoji,
                notes: contact.notes,
                tags: contact.tags,
                metadata: contact.metadata
              };
              
              await this.update(updateParams);
              updated++;
              importedIds.push(existing.id);
            }
          } else {
            // Add new contact
            const createParams: CreateContactParams = {
              alias: contact.alias,
              address: contact.address,
              publicKey: contact.publicKey,
              isFavorite: contact.isFavorite,
              emoji: contact.emoji,
              notes: contact.notes,
              tags: contact.tags,
              metadata: contact.metadata
            };
            
            const newContact = await this.add(createParams);
            imported++;
            importedIds.push(newContact.id);
          }
        } catch (error) {
          errors.push({
            index: i,
            contact,
            error: error instanceof Error ? error.message : 'Unknown error',
            code: 'IMPORT_ERROR'
          });
        }
      }

      return {
        success: errors.length === 0,
        imported,
        skipped,
        updated,
        errors,
        importedIds
      };
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactImportFailed,
        'Failed to import contacts',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Clear all contacts
   */
  public async clear(): Promise<void> {
    try {
      await this.store.clear();
      this.events.emitContactsCleared();
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.ContactClearFailed,
        'Failed to clear contacts',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get event emitter for contact events
   */
  public getEventEmitter(): ContactEventEmitter {
    return this.events;
  }

  // Private helper methods

  private async validateNoDuplicates(alias: string, address: string): Promise<void> {
    await this.validateNoDuplicateAlias(alias);
    await this.validateNoDuplicateAddress(address);
  }

  private async validateNoDuplicateAlias(alias: string, excludeId?: string): Promise<void> {
    const existing = await this.store.getByAlias(alias);
    if (existing && existing.id !== excludeId) {
      throw new WalletError(
        WalletErrorCode.ContactDuplicateAlias,
        `Contact with alias "${alias}" already exists`,
        { context: { alias, existingId: existing.id } }
      );
    }
  }

  private async validateNoDuplicateAddress(address: string, excludeId?: string): Promise<void> {
    const existing = await this.store.getByAddress(address);
    if (existing && existing.id !== excludeId) {
      throw new WalletError(
        WalletErrorCode.ContactDuplicateAddress,
        `Contact with address "${address}" already exists`,
        { context: { address, existingId: existing.id } }
      );
    }
  }
}
