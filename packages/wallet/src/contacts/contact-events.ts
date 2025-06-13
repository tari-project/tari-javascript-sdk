/**
 * @fileoverview Contact Event System for Tari Wallet
 * 
 * Provides typed event emission for contact operations with
 * proper event handling and listener management.
 */

import {
  Contact,
  WalletError,
  WalletErrorCode
} from '@tari-project/tarijs-core';
import { TypedEventEmitter } from '@tari-project/tarijs-core/utils/typed-event-emitter';

/**
 * Contact-specific event types
 */
export interface ContactEvents extends Record<string, (...args: any[]) => void> {
  /** Emitted when a contact is added */
  contactAdded: (contact: Contact) => void;
  
  /** Emitted when a contact is updated */
  contactUpdated: (contact: Contact, previousContact: Contact) => void;
  
  /** Emitted when a contact is removed */
  contactRemoved: (contactId: string) => void;
  
  /** Emitted when all contacts are cleared */
  contactsCleared: () => void;
  
  /** Emitted when contact data is synchronized */
  contactsSynced: (syncedCount: number) => void;
  
  /** Emitted when contact data import completes */
  contactsImported: (importedCount: number, skippedCount: number) => void;
  
  /** Emitted when contact data export completes */
  contactsExported: (exportedCount: number) => void;
  
  /** Emitted when contact validation fails */
  contactValidationFailed: (contactId: string, errors: string[]) => void;
  
  /** Emitted when contact storage operation fails */
  contactStorageError: (operation: string, error: string) => void;
  
  /** Emitted when contact metadata is updated */
  contactMetadataUpdated: (contactId: string, field: string, value: any) => void;
}

/**
 * Contact event data for enriched event handling
 */
export interface ContactEventData {
  /** Timestamp when event occurred */
  timestamp: number;
  
  /** Source of the event */
  source: 'user' | 'sync' | 'import' | 'system';
  
  /** Additional context data */
  context?: Record<string, any>;
}

/**
 * Contact event emitter with enhanced functionality
 */
export class ContactEventEmitter extends TypedEventEmitter<ContactEvents> {
  private eventHistory: Array<{
    event: keyof ContactEvents;
    data: ContactEventData;
    args: any[];
  }> = [];
  
  private maxHistorySize = 100;

  /**
   * Emit a contact event with metadata
   */
  public emitWithData<K extends keyof ContactEvents>(
    event: K,
    data: ContactEventData,
    ...args: Parameters<ContactEvents[K]>
  ): boolean {
    // Store event in history
    this.eventHistory.push({
      event,
      data,
      args
    });

    // Limit history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Emit the event
    return this.emit(event, ...args);
  }

  /**
   * Emit contact added event
   */
  public emitContactAdded(contact: Contact, source: ContactEventData['source'] = 'user'): void {
    this.emitWithData('contactAdded', {
      timestamp: Date.now(),
      source,
      context: {
        contactId: contact.id,
        alias: contact.alias,
        address: contact.address
      }
    }, contact);
  }

  /**
   * Emit contact updated event
   */
  public emitContactUpdated(
    contact: Contact, 
    previousContact: Contact, 
    source: ContactEventData['source'] = 'user'
  ): void {
    // Determine what changed
    const changes: Record<string, { old: any; new: any }> = {};
    
    if (contact.alias !== previousContact.alias) {
      changes.alias = { old: previousContact.alias, new: contact.alias };
    }
    
    if (contact.address !== previousContact.address) {
      changes.address = { old: previousContact.address, new: contact.address };
    }
    
    if (contact.isFavorite !== previousContact.isFavorite) {
      changes.isFavorite = { old: previousContact.isFavorite, new: contact.isFavorite };
    }
    
    if (contact.notes !== previousContact.notes) {
      changes.notes = { old: previousContact.notes, new: contact.notes };
    }

    this.emitWithData('contactUpdated', {
      timestamp: Date.now(),
      source,
      context: {
        contactId: contact.id,
        changes
      }
    }, contact, previousContact);
  }

  /**
   * Emit contact removed event
   */
  public emitContactRemoved(contactId: string, source: ContactEventData['source'] = 'user'): void {
    this.emitWithData('contactRemoved', {
      timestamp: Date.now(),
      source,
      context: {
        contactId
      }
    }, contactId);
  }

  /**
   * Emit contacts cleared event
   */
  public emitContactsCleared(source: ContactEventData['source'] = 'user'): void {
    this.emitWithData('contactsCleared', {
      timestamp: Date.now(),
      source
    });
  }

  /**
   * Emit contacts synced event
   */
  public emitContactsSynced(syncedCount: number): void {
    this.emitWithData('contactsSynced', {
      timestamp: Date.now(),
      source: 'sync',
      context: {
        syncedCount
      }
    }, syncedCount);
  }

  /**
   * Emit contacts imported event
   */
  public emitContactsImported(importedCount: number, skippedCount: number): void {
    this.emitWithData('contactsImported', {
      timestamp: Date.now(),
      source: 'import',
      context: {
        importedCount,
        skippedCount
      }
    }, importedCount, skippedCount);
  }

  /**
   * Emit contacts exported event
   */
  public emitContactsExported(exportedCount: number): void {
    this.emitWithData('contactsExported', {
      timestamp: Date.now(),
      source: 'user',
      context: {
        exportedCount
      }
    }, exportedCount);
  }

  /**
   * Emit contact validation failed event
   */
  public emitContactValidationFailed(contactId: string, errors: string[]): void {
    this.emitWithData('contactValidationFailed', {
      timestamp: Date.now(),
      source: 'system',
      context: {
        contactId,
        errorCount: errors.length
      }
    }, contactId, errors);
  }

  /**
   * Emit contact storage error event
   */
  public emitContactStorageError(operation: string, error: string): void {
    this.emitWithData('contactStorageError', {
      timestamp: Date.now(),
      source: 'system',
      context: {
        operation
      }
    }, operation, error);
  }

  /**
   * Emit contact metadata updated event
   */
  public emitContactMetadataUpdated(contactId: string, field: string, value: any): void {
    this.emitWithData('contactMetadataUpdated', {
      timestamp: Date.now(),
      source: 'system',
      context: {
        contactId,
        field
      }
    }, contactId, field, value);
  }

  /**
   * Get event history
   */
  public getEventHistory(): ReadonlyArray<{
    event: keyof ContactEvents;
    data: ContactEventData;
    args: any[];
  }> {
    return this.eventHistory.slice();
  }

  /**
   * Clear event history
   */
  public clearEventHistory(): void {
    this.eventHistory.length = 0;
  }

  /**
   * Get events for a specific contact
   */
  public getContactEvents(contactId: string): ReadonlyArray<{
    event: keyof ContactEvents;
    data: ContactEventData;
    args: any[];
  }> {
    return this.eventHistory.filter(entry => {
      const context = entry.data.context;
      return context && context.contactId === contactId;
    });
  }

  /**
   * Get recent events (last N events)
   */
  public getRecentEvents(count: number = 10): ReadonlyArray<{
    event: keyof ContactEvents;
    data: ContactEventData;
    args: any[];
  }> {
    return this.eventHistory.slice(-count);
  }

  /**
   * Get events by type
   */
  public getEventsByType<K extends keyof ContactEvents>(
    eventType: K
  ): ReadonlyArray<{
    event: K;
    data: ContactEventData;
    args: Parameters<ContactEvents[K]>;
  }> {
    return this.eventHistory
      .filter(entry => entry.event === eventType)
      .map(entry => ({
        event: entry.event as K,
        data: entry.data,
        args: entry.args as Parameters<ContactEvents[K]>
      }));
  }

  /**
   * Wait for a specific event with timeout
   */
  public waitForEvent<K extends keyof ContactEvents>(
    eventType: K,
    timeout: number = 5000
  ): Promise<Parameters<ContactEvents[K]>> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(eventType, listener);
        reject(new WalletError(
          WalletErrorCode.ContactEventTimeout,
          `Timeout waiting for event: ${String(eventType)}`,
          { context: { eventType: String(eventType), timeout } }
        ));
      }, timeout);

      const listener = (...args: Parameters<ContactEvents[K]>) => {
        clearTimeout(timeoutId);
        this.off(eventType, listener);
        resolve(args);
      };

      this.on(eventType, listener);
    });
  }

  /**
   * Create an event stream for a specific event type
   */
  public createEventStream<K extends keyof ContactEvents>(
    eventType: K
  ): AsyncIterable<Parameters<ContactEvents[K]>> {
    const events: Parameters<ContactEvents[K]>[] = [];
    let resolveNext: ((value: IteratorResult<Parameters<ContactEvents[K]>>) => void) | null = null;
    let isFinished = false;

    const listener = (...args: Parameters<ContactEvents[K]>) => {
      if (resolveNext) {
        resolveNext({ value: args, done: false });
        resolveNext = null;
      } else {
        events.push(args);
      }
    };

    this.on(eventType, listener);

    return {
      [Symbol.asyncIterator](): AsyncIterator<Parameters<ContactEvents[K]>> {
        return {
          async next(): Promise<IteratorResult<Parameters<ContactEvents[K]>>> {
            if (isFinished) {
              return { value: undefined, done: true };
            }

            if (events.length > 0) {
              return { value: events.shift()!, done: false };
            }

            return new Promise(resolve => {
              resolveNext = resolve;
            });
          },

          async return(): Promise<IteratorResult<Parameters<ContactEvents[K]>>> {
            isFinished = true;
            // @ts-ignore - Remove listener reference
            this.off(eventType, listener);
            return { value: undefined, done: true };
          }
        };
      }
    };
  }
}
