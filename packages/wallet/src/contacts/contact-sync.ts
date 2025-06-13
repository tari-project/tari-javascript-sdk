/**
 * @fileoverview Contact Synchronization Service for Tari Wallet
 * 
 * Provides synchronization between local contact storage and FFI layer,
 * with conflict resolution and two-way sync capabilities.
 */

import {
  Contact,
  WalletError,
  WalletErrorCode,
  type WalletHandle,
  type FFIContact
} from '@tari-project/tarijs-core';

import { ContactStore } from './contact-store.js';
import { ContactEventEmitter } from './contact-events.js';

/**
 * Sync configuration options
 */
export interface ContactSyncConfig {
  /** Enable automatic synchronization */
  autoSync?: boolean;
  
  /** Sync interval in milliseconds */
  syncInterval?: number;
  
  /** Conflict resolution strategy */
  conflictResolution?: 'local' | 'ffi' | 'merge' | 'ask';
  
  /** Maximum retry attempts for sync operations */
  maxRetries?: number;
  
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Sync conflict information
 */
export interface ContactSyncConflict {
  /** Contact ID */
  contactId: string;
  
  /** Local contact version */
  localContact: Contact;
  
  /** FFI contact version */
  ffiContact: FFIContact;
  
  /** Conflict type */
  conflictType: 'alias' | 'address' | 'metadata' | 'existence';
  
  /** Conflict description */
  description: string;
}

/**
 * Sync result information
 */
export interface ContactSyncResult {
  /** Whether sync was successful */
  success: boolean;
  
  /** Number of contacts synchronized */
  syncedCount: number;
  
  /** Number of conflicts found */
  conflictCount: number;
  
  /** Detailed conflicts */
  conflicts: ContactSyncConflict[];
  
  /** Sync duration in milliseconds */
  duration: number;
  
  /** Any errors encountered */
  errors: Array<{ operation: string; error: string }>;
}

/**
 * Contact synchronization service
 */
export class ContactSyncService {
  private readonly walletHandle: WalletHandle;
  private readonly store: ContactStore;
  private readonly events: ContactEventEmitter;
  private readonly config: Required<ContactSyncConfig>;
  private syncTimer?: NodeJS.Timeout;
  private isSyncing = false;
  private lastSyncTime = 0;

  constructor(
    walletHandle: WalletHandle,
    store: ContactStore,
    events: ContactEventEmitter,
    config?: Partial<ContactSyncConfig>
  ) {
    this.walletHandle = walletHandle;
    this.store = store;
    this.events = events;
    
    this.config = {
      autoSync: false,
      syncInterval: 30000, // 30 seconds
      conflictResolution: 'local',
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
  }

  /**
   * Start automatic synchronization
   */
  public start(): void {
    if (this.config.autoSync && !this.syncTimer) {
      this.syncTimer = setInterval(
        () => this.performSync(),
        this.config.syncInterval
      );
    }
  }

  /**
   * Stop automatic synchronization
   */
  public stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /**
   * Perform manual synchronization
   */
  public async sync(): Promise<ContactSyncResult> {
    return this.performSync();
  }

  /**
   * Force full synchronization (overwrites conflicts based on strategy)
   */
  public async forcSync(): Promise<ContactSyncResult> {
    return this.performSync(true);
  }

  /**
   * Get synchronization status
   */
  public getSyncStatus(): {
    isActive: boolean;
    isSyncing: boolean;
    lastSyncTime: number;
    nextSyncTime?: number;
  } {
    return {
      isActive: !!this.syncTimer,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      nextSyncTime: this.syncTimer ? 
        this.lastSyncTime + this.config.syncInterval : undefined
    };
  }

  /**
   * Set conflict resolution strategy
   */
  public setConflictResolution(strategy: ContactSyncConfig['conflictResolution']): void {
    if (strategy) {
      this.config.conflictResolution = strategy;
    }
  }

  /**
   * Destroy sync service and cleanup
   */
  public destroy(): void {
    this.stop();
  }

  // Private implementation methods

  private async performSync(force = false): Promise<ContactSyncResult> {
    if (this.isSyncing) {
      throw new WalletError(
        WalletErrorCode.OperationInProgress,
        'Synchronization already in progress'
      );
    }

    const startTime = Date.now();
    this.isSyncing = true;

    try {
      const result = await this.syncWithRetry(force);
      
      this.lastSyncTime = Date.now();
      
      // Emit sync event
      this.events.emitContactsSynced(result.syncedCount);
      
      return {
        ...result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.SyncFailed,
        'Contact synchronization failed',
        { cause: error instanceof Error ? error : undefined }
      );
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncWithRetry(force = false): Promise<ContactSyncResult> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.performSyncOperation(force);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw lastError || new Error('Unknown sync error');
  }

  private async performSyncOperation(force = false): Promise<ContactSyncResult> {
    const result: ContactSyncResult = {
      success: false,
      syncedCount: 0,
      conflictCount: 0,
      conflicts: [],
      duration: 0,
      errors: []
    };

    try {
      // Step 1: Get contacts from both sources
      const [localContacts, ffiContacts] = await Promise.all([
        this.store.list(),
        this.getFFIContacts()
      ]);

      // Step 2: Find differences and conflicts
      const {
        toAddLocal,
        toAddFFI,
        toUpdateLocal,
        toUpdateFFI,
        conflicts
      } = this.analyzeDifferences(localContacts, ffiContacts);

      result.conflictCount = conflicts.length;
      result.conflicts = conflicts;

      // Step 3: Handle conflicts based on strategy
      if (conflicts.length > 0 && !force) {
        if (this.config.conflictResolution === 'ask') {
          // For 'ask' strategy, return conflicts for user resolution
          result.success = false;
          return result;
        }
      }

      // Step 4: Apply changes based on conflict resolution
      const resolvedChanges = this.resolveConflicts(
        { toAddLocal, toAddFFI, toUpdateLocal, toUpdateFFI },
        conflicts,
        force
      );

      // Step 5: Execute sync operations
      let syncedCount = 0;
      
      // Add new contacts to local store
      for (const ffiContact of resolvedChanges.toAddLocal) {
        try {
          const contact = this.ffiToContact(ffiContact);
          await this.store.add(contact);
          syncedCount++;
        } catch (error) {
          result.errors.push({
            operation: `add_local_${ffiContact.alias}`,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Add new contacts to FFI
      for (const contact of resolvedChanges.toAddFFI) {
        try {
          await this.addFFIContact(contact);
          syncedCount++;
        } catch (error) {
          result.errors.push({
            operation: `add_ffi_${contact.alias}`,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Update local contacts
      for (const contact of resolvedChanges.toUpdateLocal) {
        try {
          await this.store.update(contact);
          syncedCount++;
        } catch (error) {
          result.errors.push({
            operation: `update_local_${contact.id}`,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Update FFI contacts
      for (const contact of resolvedChanges.toUpdateFFI) {
        try {
          await this.updateFFIContact(contact);
          syncedCount++;
        } catch (error) {
          result.errors.push({
            operation: `update_ffi_${contact.id}`,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      result.syncedCount = syncedCount;
      result.success = result.errors.length === 0;

      return result;
    } catch (error) {
      result.errors.push({
        operation: 'sync_operation',
        error: error instanceof Error ? error.message : String(error)
      });
      
      return result;
    }
  }

  private analyzeDifferences(
    localContacts: Contact[],
    ffiContacts: FFIContact[]
  ): {
    toAddLocal: FFIContact[];
    toAddFFI: Contact[];
    toUpdateLocal: Contact[];
    toUpdateFFI: Contact[];
    conflicts: ContactSyncConflict[];
  } {
    const result = {
      toAddLocal: [] as FFIContact[],
      toAddFFI: [] as Contact[],
      toUpdateLocal: [] as Contact[],
      toUpdateFFI: [] as Contact[],
      conflicts: [] as ContactSyncConflict[]
    };

    // Create lookup maps
    const localByAlias = new Map(localContacts.map(c => [c.alias, c]));
    const localByAddress = new Map(localContacts.map(c => [c.address, c]));
    const ffiByAlias = new Map(ffiContacts.map(c => [c.alias, c]));
    const ffiByAddress = new Map(ffiContacts.map(c => [c.address, c]));

    // Check FFI contacts against local
    for (const ffiContact of ffiContacts) {
      const localByAliasMatch = localByAlias.get(ffiContact.alias);
      const localByAddressMatch = localByAddress.get(ffiContact.address as any);

      if (!localByAliasMatch && !localByAddressMatch) {
        // New contact from FFI
        result.toAddLocal.push(ffiContact);
      } else if (localByAliasMatch && localByAddressMatch && 
                 localByAliasMatch.id === localByAddressMatch.id) {
        // Same contact, check for updates
        if (this.needsUpdate(localByAliasMatch, ffiContact)) {
          if (this.hasConflict(localByAliasMatch, ffiContact)) {
            result.conflicts.push(this.createConflict(
              localByAliasMatch, 
              ffiContact, 
              'metadata',
              'Contact metadata differs between local and FFI'
            ));
          } else {
            result.toUpdateLocal.push(this.mergeContactWithFFI(localByAliasMatch, ffiContact));
          }
        }
      } else {
        // Conflict: different contacts with same alias or address
        const conflictContact = localByAliasMatch || localByAddressMatch!;
        const conflictType = localByAliasMatch ? 'alias' : 'address';
        
        result.conflicts.push(this.createConflict(
          conflictContact,
          ffiContact,
          conflictType,
          `Contact ${conflictType} conflict: ${ffiContact.alias} / ${ffiContact.address}`
        ));
      }
    }

    // Check local contacts against FFI
    for (const localContact of localContacts) {
      const ffiByAliasMatch = ffiByAlias.get(localContact.alias);
      const ffiByAddressMatch = ffiByAddress.get(localContact.address);

      if (!ffiByAliasMatch && !ffiByAddressMatch) {
        // New contact from local
        result.toAddFFI.push(localContact);
      }
    }

    return result;
  }

  private resolveConflicts(
    changes: {
      toAddLocal: FFIContact[];
      toAddFFI: Contact[];
      toUpdateLocal: Contact[];
      toUpdateFFI: Contact[];
    },
    conflicts: ContactSyncConflict[],
    force: boolean
  ): typeof changes {
    if (!force && conflicts.length > 0 && this.config.conflictResolution === 'ask') {
      return changes;
    }

    // Apply conflict resolution strategy
    for (const conflict of conflicts) {
      switch (this.config.conflictResolution) {
        case 'local':
          // Prefer local version - add local to FFI
          changes.toAddFFI.push(conflict.localContact);
          break;
          
        case 'ffi':
          // Prefer FFI version - add FFI to local
          changes.toAddLocal.push(conflict.ffiContact);
          break;
          
        case 'merge':
          // Merge both versions
          const merged = this.mergeContactWithFFI(conflict.localContact, conflict.ffiContact);
          changes.toUpdateLocal.push(merged);
          changes.toUpdateFFI.push(merged);
          break;
      }
    }

    return changes;
  }

  private createConflict(
    localContact: Contact,
    ffiContact: FFIContact,
    conflictType: ContactSyncConflict['conflictType'],
    description: string
  ): ContactSyncConflict {
    return {
      contactId: localContact.id,
      localContact,
      ffiContact,
      conflictType,
      description
    };
  }

  private needsUpdate(local: Contact, ffi: FFIContact): boolean {
    return local.isFavorite !== ffi.isFavorite ||
           (ffi.lastSeen !== undefined && 
            (!local.lastSeenAt || local.lastSeenAt !== ffi.lastSeen));
  }

  private hasConflict(local: Contact, ffi: FFIContact): boolean {
    // For now, consider it a conflict if favorite status differs
    return local.isFavorite !== ffi.isFavorite;
  }

  private mergeContactWithFFI(local: Contact, ffi: FFIContact): Contact {
    return {
      ...local,
      isFavorite: ffi.isFavorite, // Prefer FFI favorite status
      lastSeenAt: ffi.lastSeen ? ffi.lastSeen as any : local.lastSeenAt,
      updatedAt: Date.now() as any
    };
  }

  private ffiToContact(ffiContact: FFIContact): Contact {
    return {
      id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      alias: ffiContact.alias,
      address: ffiContact.address as any,
      publicKey: ffiContact.public_key as any,
      isFavorite: ffiContact.isFavorite,
      tags: [],
      metadata: {
        source: 'sync' as any,
        type: 'unknown' as any,
        transactionCount: 0,
        verified: false
      },
      createdAt: Date.now() as any,
      updatedAt: Date.now() as any,
      lastSeenAt: ffiContact.lastSeen as any
    };
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // FFI interaction methods (placeholder implementations)
  
  private async getFFIContacts(): Promise<FFIContact[]> {
    try {
      // TODO: Replace with actual FFI call when available
      // return await ffi.walletGetContacts(this.walletHandle);
      
      // Placeholder implementation - returns empty array
      console.log('FFI contact retrieval not yet implemented, returning empty array');
      return [];
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.FFICallFailed,
        'Failed to get contacts from FFI',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async addFFIContact(contact: Contact): Promise<void> {
    try {
      // TODO: Replace with actual FFI call when available
      // await ffi.walletAddContact(this.walletHandle, {
      //   alias: contact.alias,
      //   address: contact.address,
      //   isFavorite: contact.isFavorite,
      //   lastSeen: contact.lastSeenAt
      // });
      
      // Placeholder implementation
      console.log(`FFI contact addition not yet implemented for: ${contact.alias}`);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.FFICallFailed,
        'Failed to add contact to FFI',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  private async updateFFIContact(contact: Contact): Promise<void> {
    try {
      // TODO: Replace with actual FFI call when available
      // await ffi.walletUpdateContact(this.walletHandle, contact.id, {
      //   alias: contact.alias,
      //   address: contact.address,
      //   isFavorite: contact.isFavorite,
      //   lastSeen: contact.lastSeenAt
      // });
      
      // Placeholder implementation
      console.log(`FFI contact update not yet implemented for: ${contact.alias}`);
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.FFICallFailed,
        'Failed to update contact in FFI',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }
}
