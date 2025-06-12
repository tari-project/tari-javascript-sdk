/**
 * @fileoverview Recovery state management and persistence for wallet restoration
 * 
 * Provides state management for wallet recovery operations including
 * progress persistence, recovery session tracking, and state restoration.
 */

import { 
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity 
} from '@tari-project/tarijs-core';
import { RestorationStage, type RestorationProgress, type RestorationState } from './restoration-service.js';

/**
 * Recovery session information
 */
export interface RecoverySession {
  id: string;
  walletId: string;
  startedAt: Date;
  lastUpdated: Date;
  stage: RestorationStage;
  progress: RestorationProgress;
  isComplete: boolean;
  isAborted: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Recovery state persistence options
 */
export interface RecoveryPersistenceOptions {
  enablePersistence?: boolean;
  persistenceKey?: string;
  autoCleanup?: boolean;
  maxSessionAge?: number; // milliseconds
  maxSessions?: number;
}

/**
 * Recovery state manager for tracking and persisting restoration progress
 * 
 * This class provides:
 * - Session tracking for multiple recovery operations
 * - Progress persistence across application restarts
 * - Recovery session cleanup and management
 * - State validation and error recovery
 */
export class RecoveryStateManager {
  private readonly sessions = new Map<string, RecoverySession>();
  private readonly config: Required<RecoveryPersistenceOptions>;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(options: RecoveryPersistenceOptions = {}) {
    this.config = {
      enablePersistence: true,
      persistenceKey: 'tari_wallet_recovery_sessions',
      autoCleanup: true,
      maxSessionAge: 24 * 60 * 60 * 1000, // 24 hours
      maxSessions: 10,
      ...options
    };

    // Load existing sessions if persistence is enabled
    if (this.config.enablePersistence) {
      this.loadPersistedSessions();
    }

    // Start automatic cleanup if enabled
    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Create a new recovery session
   */
  public createSession(walletId: string, metadata?: Record<string, any>): string {
    const sessionId = `recovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: RecoverySession = {
      id: sessionId,
      walletId,
      startedAt: new Date(),
      lastUpdated: new Date(),
      stage: RestorationStage.Validating,
      progress: {
        stage: RestorationStage.Validating,
        percentage: 0,
        message: 'Recovery session created'
      },
      isComplete: false,
      isAborted: false,
      metadata
    };

    this.sessions.set(sessionId, session);
    this.persistSessions();
    
    // Cleanup old sessions if we exceed the limit
    this.enforceSessionLimit();

    return sessionId;
  }

  /**
   * Update session progress
   */
  public updateSessionProgress(
    sessionId: string,
    progress: RestorationProgress,
    metadata?: Record<string, any>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new WalletError(
        WalletErrorCode.ResourceNotFound,
        `Recovery session ${sessionId} not found`,
        { severity: ErrorSeverity.Error }
      );
    }

    if (session.isComplete || session.isAborted) {
      throw new WalletError(
        WalletErrorCode.InvalidConfig,
        `Cannot update completed or aborted recovery session ${sessionId}`,
        { severity: ErrorSeverity.Warning }
      );
    }

    session.stage = progress.stage;
    session.progress = { ...progress };
    session.lastUpdated = new Date();
    
    if (metadata) {
      session.metadata = { ...session.metadata, ...metadata };
    }

    // Mark as complete if we reached the complete stage
    if (progress.stage === RestorationStage.Complete) {
      session.isComplete = true;
    }

    this.persistSessions();
  }

  /**
   * Mark session as complete
   */
  public completeSession(sessionId: string, finalProgress?: RestorationProgress): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new WalletError(
        WalletErrorCode.ResourceNotFound,
        `Recovery session ${sessionId} not found`,
        { severity: ErrorSeverity.Error }
      );
    }

    session.isComplete = true;
    session.lastUpdated = new Date();
    
    if (finalProgress) {
      session.progress = { ...finalProgress };
      session.stage = finalProgress.stage;
    } else {
      session.progress.stage = RestorationStage.Complete;
      session.progress.percentage = 100;
      session.progress.message = 'Recovery completed successfully';
    }

    this.persistSessions();
  }

  /**
   * Mark session as aborted
   */
  public abortSession(sessionId: string, error?: Error): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new WalletError(
        WalletErrorCode.ResourceNotFound,
        `Recovery session ${sessionId} not found`,
        { severity: ErrorSeverity.Error }
      );
    }

    session.isAborted = true;
    session.lastUpdated = new Date();
    session.error = error?.message;

    this.persistSessions();
  }

  /**
   * Get session information
   */
  public getSession(sessionId: string): RecoverySession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : undefined;
  }

  /**
   * Get all sessions for a wallet
   */
  public getWalletSessions(walletId: string): RecoverySession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.walletId === walletId)
      .map(session => ({ ...session }));
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): RecoverySession[] {
    return Array.from(this.sessions.values())
      .filter(session => !session.isComplete && !session.isAborted)
      .map(session => ({ ...session }));
  }

  /**
   * Get all sessions
   */
  public getAllSessions(): RecoverySession[] {
    return Array.from(this.sessions.values())
      .map(session => ({ ...session }));
  }

  /**
   * Remove a session
   */
  public removeSession(sessionId: string): boolean {
    const removed = this.sessions.delete(sessionId);
    if (removed) {
      this.persistSessions();
    }
    return removed;
  }

  /**
   * Clean up old sessions
   */
  public cleanupOldSessions(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastUpdated.getTime();
      
      // Remove if too old or if complete and older than an hour
      const shouldRemove = (
        age > this.config.maxSessionAge ||
        (session.isComplete && age > 60 * 60 * 1000) ||
        session.isAborted
      );

      if (shouldRemove) {
        this.sessions.delete(sessionId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.persistSessions();
    }

    return removedCount;
  }

  /**
   * Clear all sessions
   */
  public clearAllSessions(): void {
    this.sessions.clear();
    this.persistSessions();
  }

  /**
   * Get recovery state statistics
   */
  public getStats(): {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    abortedSessions: number;
    oldestSession?: Date;
    newestSession?: Date;
  } {
    const sessions = Array.from(this.sessions.values());
    
    let oldestSession: Date | undefined;
    let newestSession: Date | undefined;

    for (const session of sessions) {
      if (!oldestSession || session.startedAt < oldestSession) {
        oldestSession = session.startedAt;
      }
      if (!newestSession || session.startedAt > newestSession) {
        newestSession = session.startedAt;
      }
    }

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => !s.isComplete && !s.isAborted).length,
      completedSessions: sessions.filter(s => s.isComplete).length,
      abortedSessions: sessions.filter(s => s.isAborted).length,
      oldestSession,
      newestSession
    };
  }

  /**
   * Export sessions for backup
   */
  public exportSessions(): RecoverySession[] {
    return this.getAllSessions();
  }

  /**
   * Import sessions from backup
   */
  public importSessions(sessions: RecoverySession[]): void {
    for (const session of sessions) {
      // Validate session structure
      if (this.isValidSession(session)) {
        this.sessions.set(session.id, { ...session });
      }
    }
    this.persistSessions();
  }

  /**
   * Destroy the state manager
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
  }

  // Private methods

  private loadPersistedSessions(): void {
    try {
      if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
        return; // Not in browser environment
      }

      const stored = (globalThis as any).localStorage.getItem(this.config.persistenceKey);
      if (!stored) {
        return;
      }

      const sessions: RecoverySession[] = JSON.parse(stored);
      
      for (const session of sessions) {
        if (this.isValidSession(session)) {
          // Convert date strings back to Date objects
          session.startedAt = new Date(session.startedAt);
          session.lastUpdated = new Date(session.lastUpdated);
          
          this.sessions.set(session.id, session);
        }
      }
    } catch (error: unknown) {
      console.warn('Failed to load persisted recovery sessions:', error);
    }
  }

  private persistSessions(): void {
    if (!this.config.enablePersistence || typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }

    try {
      const sessions = this.getAllSessions();
      (globalThis as any).localStorage.setItem(this.config.persistenceKey, JSON.stringify(sessions));
    } catch (error: unknown) {
      console.warn('Failed to persist recovery sessions:', error);
    }
  }

  private enforceSessionLimit(): void {
    if (this.sessions.size <= this.config.maxSessions) {
      return;
    }

    // Remove oldest completed or aborted sessions
    const sessions = Array.from(this.sessions.values())
      .filter(s => s.isComplete || s.isAborted)
      .sort((a, b) => a.lastUpdated.getTime() - b.lastUpdated.getTime());

    const toRemove = this.sessions.size - this.config.maxSessions;
    for (let i = 0; i < toRemove && i < sessions.length; i++) {
      this.sessions.delete(sessions[i].id);
    }

    this.persistSessions();
  }

  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions();
    }, 60 * 60 * 1000); // Clean up every hour
  }

  private isValidSession(session: any): session is RecoverySession {
    return (
      typeof session === 'object' &&
      typeof session.id === 'string' &&
      typeof session.walletId === 'string' &&
      session.startedAt &&
      session.lastUpdated &&
      typeof session.stage === 'string' &&
      typeof session.progress === 'object' &&
      typeof session.isComplete === 'boolean' &&
      typeof session.isAborted === 'boolean'
    );
  }
}

/**
 * Default recovery state manager instance
 */
export const defaultRecoveryStateManager = new RecoveryStateManager();

/**
 * Utility function to create restoration state from recovery session
 */
export function createRestorationStateFromSession(session: RecoverySession): RestorationState {
  return {
    isRestoring: !session.isComplete && !session.isAborted,
    startedAt: session.startedAt,
    progress: { ...session.progress },
    error: session.error ? new Error(session.error) : undefined,
    walletId: session.walletId
  };
}

/**
 * Utility function to validate restoration progress
 */
export function validateRestorationProgress(progress: RestorationProgress): boolean {
  return (
    Object.values(RestorationStage).includes(progress.stage) &&
    typeof progress.percentage === 'number' &&
    progress.percentage >= 0 &&
    progress.percentage <= 100
  );
}
