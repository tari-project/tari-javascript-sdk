/**
 * @fileoverview Contact Storage Layer with Encryption for Tari Wallet
 * 
 * Provides encrypted local storage for contacts with support for
 * CRUD operations, indexing, and data persistence.
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

import {
  Contact,
  WalletError,
  WalletErrorCode,
  type WalletHandle
} from '@tari-project/tarijs-core';

/**
 * Encrypted contact storage interface
 */
export interface ContactStoreConfig {
  storagePath?: string;
  encryptionKey?: Buffer;
  enableBackups?: boolean;
  maxBackups?: number;
}

/**
 * Storage encryption utilities
 */
class ContactStorageEncryption {
  private readonly algorithm = 'aes-256-cbc';
  private readonly keyDerivationSalt = 'tari_contact_encryption_salt_v1';

  /**
   * Derive encryption key from wallet handle
   */
  public deriveKey(walletHandle: WalletHandle): Buffer {
    const handleStr = walletHandle.toString();
    return createHash('sha256')
      .update(handleStr + this.keyDerivationSalt)
      .digest();
  }

  /**
   * Encrypt contact data
   */
  public encrypt(data: string, key: Buffer): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt contact data
   */
  public decrypt(encryptedData: string, key: Buffer): string {
    const [ivHex, encrypted] = encryptedData.split(':');
    
    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

/**
 * Contact storage implementation with encryption
 */
export class ContactStore {
  private readonly walletHandle: WalletHandle;
  private readonly config: ContactStoreConfig;
  private readonly encryption: ContactStorageEncryption;
  private readonly storageDir: string;
  private readonly contactsFile: string;
  private readonly indexFile: string;
  private encryptionKey: Buffer;
  private contacts: Map<string, Contact> = new Map();
  private aliasIndex: Map<string, string> = new Map(); // alias -> id
  private addressIndex: Map<string, string> = new Map(); // address -> id
  private isInitialized = false;

  constructor(
    walletHandle: WalletHandle, 
    storagePath?: string,
    config?: Partial<ContactStoreConfig>
  ) {
    this.walletHandle = walletHandle;
    this.config = {
      storagePath: storagePath || './wallet_data',
      enableBackups: true,
      maxBackups: 5,
      ...config
    };
    this.encryption = new ContactStorageEncryption();
    
    this.storageDir = join(this.config.storagePath!, 'contacts');
    this.contactsFile = join(this.storageDir, 'contacts.encrypted');
    this.indexFile = join(this.storageDir, 'index.encrypted');
    
    this.encryptionKey = this.config.encryptionKey || 
      this.encryption.deriveKey(walletHandle);
  }

  /**
   * Initialize storage and load existing contacts
   */
  public async initialize(): Promise<void> {
    try {
      // Ensure storage directory exists
      await this.ensureStorageDirectory();
      
      // Load existing contacts
      await this.loadContacts();
      
      this.isInitialized = true;
    } catch (error) {
      throw new WalletError(
        'Failed to initialize contact store',
        WalletErrorCode.ContactStorageInitFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Destroy storage and cleanup
   */
  public async destroy(): Promise<void> {
    this.contacts.clear();
    this.aliasIndex.clear();
    this.addressIndex.clear();
    this.isInitialized = false;
  }

  /**
   * Add a new contact
   */
  public async add(contact: Contact): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Check for duplicates
      if (this.contacts.has(contact.id)) {
        throw new WalletError(
          `Contact with ID ${contact.id} already exists`,
          WalletErrorCode.ContactDuplicateId
        );
      }
      
      if (this.aliasIndex.has(contact.alias.toLowerCase())) {
        throw new WalletError(
          `Contact with alias "${contact.alias}" already exists`,
          WalletErrorCode.ContactDuplicateAlias
        );
      }
      
      if (this.addressIndex.has(contact.address)) {
        throw new WalletError(
          `Contact with address "${contact.address}" already exists`,
          WalletErrorCode.ContactDuplicateAddress
        );
      }

      // Add to memory
      this.contacts.set(contact.id, contact);
      this.aliasIndex.set(contact.alias.toLowerCase(), contact.id);
      this.addressIndex.set(contact.address, contact.id);

      // Persist to disk
      await this.persistContacts();
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        'Failed to add contact to store',
        WalletErrorCode.ContactStorageAddFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Update an existing contact
   */
  public async update(contact: Contact): Promise<void> {
    this.ensureInitialized();
    
    try {
      const existing = this.contacts.get(contact.id);
      if (!existing) {
        throw new WalletError(
          `Contact with ID ${contact.id} not found`,
          WalletErrorCode.ContactNotFound
        );
      }

      // Update indexes if alias or address changed
      if (existing.alias !== contact.alias) {
        this.aliasIndex.delete(existing.alias.toLowerCase());
        
        if (this.aliasIndex.has(contact.alias.toLowerCase())) {
          throw new WalletError(
            `Contact with alias "${contact.alias}" already exists`,
            WalletErrorCode.ContactDuplicateAlias
          );
        }
        
        this.aliasIndex.set(contact.alias.toLowerCase(), contact.id);
      }

      if (existing.address !== contact.address) {
        this.addressIndex.delete(existing.address);
        
        if (this.addressIndex.has(contact.address)) {
          throw new WalletError(
            `Contact with address "${contact.address}" already exists`,
            WalletErrorCode.ContactDuplicateAddress
          );
        }
        
        this.addressIndex.set(contact.address, contact.id);
      }

      // Update contact
      this.contacts.set(contact.id, contact);

      // Persist to disk
      await this.persistContacts();
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        'Failed to update contact in store',
        WalletErrorCode.ContactStorageUpdateFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Remove a contact
   */
  public async remove(contactId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      const contact = this.contacts.get(contactId);
      if (!contact) {
        throw new WalletError(
          `Contact with ID ${contactId} not found`,
          WalletErrorCode.ContactNotFound
        );
      }

      // Remove from memory and indexes
      this.contacts.delete(contactId);
      this.aliasIndex.delete(contact.alias.toLowerCase());
      this.addressIndex.delete(contact.address);

      // Persist to disk
      await this.persistContacts();
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        'Failed to remove contact from store',
        WalletErrorCode.ContactStorageRemoveFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get a contact by ID
   */
  public async get(contactId: string): Promise<Contact | null> {
    this.ensureInitialized();
    return this.contacts.get(contactId) || null;
  }

  /**
   * Get a contact by alias
   */
  public async getByAlias(alias: string): Promise<Contact | null> {
    this.ensureInitialized();
    const contactId = this.aliasIndex.get(alias.toLowerCase());
    return contactId ? this.contacts.get(contactId) || null : null;
  }

  /**
   * Get a contact by address
   */
  public async getByAddress(address: string): Promise<Contact | null> {
    this.ensureInitialized();
    const contactId = this.addressIndex.get(address);
    return contactId ? this.contacts.get(contactId) || null : null;
  }

  /**
   * List all contacts
   */
  public async list(): Promise<Contact[]> {
    this.ensureInitialized();
    return Array.from(this.contacts.values());
  }

  /**
   * Clear all contacts
   */
  public async clear(): Promise<void> {
    this.ensureInitialized();
    
    try {
      this.contacts.clear();
      this.aliasIndex.clear();
      this.addressIndex.clear();
      
      await this.persistContacts();
    } catch (error) {
      throw new WalletError(
        'Failed to clear contact store',
        WalletErrorCode.ContactStorageClearFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get storage statistics
   */
  public getStatistics(): {
    contactCount: number;
    storageSize: number;
    indexSize: number;
  } {
    return {
      contactCount: this.contacts.size,
      storageSize: this.contacts.size,
      indexSize: this.aliasIndex.size + this.addressIndex.size
    };
  }

  // Private helper methods

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new WalletError(
        'Contact store not initialized',
        WalletErrorCode.ContactStoreNotInitialized
      );
    }
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new WalletError(
        'Failed to create storage directory',
        WalletErrorCode.ContactStorageDirectoryFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async loadContacts(): Promise<void> {
    try {
      // Load contacts file
      let contactsData: Contact[] = [];
      
      try {
        const encryptedData = await fs.readFile(this.contactsFile, 'utf8');
        const decryptedData = this.encryption.decrypt(encryptedData, this.encryptionKey);
        contactsData = JSON.parse(decryptedData);
      } catch (error) {
        // File doesn't exist or is corrupted - start with empty store
        if ((error as any)?.code !== 'ENOENT') {
          console.warn('Failed to load contacts, starting with empty store:', error);
        }
      }

      // Rebuild in-memory structures
      this.contacts.clear();
      this.aliasIndex.clear();
      this.addressIndex.clear();

      for (const contact of contactsData) {
        this.contacts.set(contact.id, contact);
        this.aliasIndex.set(contact.alias.toLowerCase(), contact.id);
        this.addressIndex.set(contact.address, contact.id);
      }
    } catch (error) {
      throw new WalletError(
        'Failed to load contacts from storage',
        WalletErrorCode.ContactStorageLoadFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async persistContacts(): Promise<void> {
    try {
      // Create backup if enabled
      if (this.config.enableBackups) {
        await this.createBackup();
      }

      // Serialize contacts
      const contactsArray = Array.from(this.contacts.values());
      const serializedData = JSON.stringify(contactsArray, null, 0);
      
      // Encrypt data
      const encryptedData = this.encryption.encrypt(serializedData, this.encryptionKey);
      
      // Write to disk atomically
      const tempFile = this.contactsFile + '.tmp';
      await fs.writeFile(tempFile, encryptedData, 'utf8');
      await fs.rename(tempFile, this.contactsFile);
      
      // Update index file
      const indexData = {
        aliases: Object.fromEntries(this.aliasIndex),
        addresses: Object.fromEntries(this.addressIndex),
        count: this.contacts.size,
        lastUpdated: Date.now()
      };
      
      const encryptedIndexData = this.encryption.encrypt(
        JSON.stringify(indexData), 
        this.encryptionKey
      );
      
      const tempIndexFile = this.indexFile + '.tmp';
      await fs.writeFile(tempIndexFile, encryptedIndexData, 'utf8');
      await fs.rename(tempIndexFile, this.indexFile);
      
    } catch (error) {
      throw new WalletError(
        'Failed to persist contacts to storage',
        WalletErrorCode.ContactStoragePersistFailed,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async createBackup(): Promise<void> {
    if (!this.config.enableBackups) {
      return;
    }

    try {
      const backupDir = join(this.storageDir, 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = join(backupDir, `contacts_${timestamp}.encrypted`);
      
      // Copy current file to backup
      try {
        await fs.copyFile(this.contactsFile, backupFile);
      } catch (error) {
        // Source file might not exist yet
        if ((error as any)?.code !== 'ENOENT') {
          throw error;
        }
      }
      
      // Clean up old backups
      await this.cleanupOldBackups(backupDir);
    } catch (error) {
      // Don't fail the main operation if backup fails
      console.warn('Failed to create contact backup:', error);
    }
  }

  private async cleanupOldBackups(backupDir: string): Promise<void> {
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('contacts_') && file.endsWith('.encrypted'))
        .map(file => ({
          name: file,
          path: join(backupDir, file)
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name (timestamp) desc

      // Remove excess backups
      const maxBackups = this.config.maxBackups || 5;
      for (let i = maxBackups; i < backupFiles.length; i++) {
        try {
          await fs.unlink(backupFiles[i].path);
        } catch (error) {
          console.warn('Failed to delete old backup:', backupFiles[i].path, error);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }
}
