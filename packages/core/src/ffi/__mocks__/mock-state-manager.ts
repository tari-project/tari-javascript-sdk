/**
 * Mock state manager for FFI testing
 * Provides state tracking and validation capabilities for mock FFI
 */

import { getMockNativeBindings } from './native';

export interface MockStateSnapshot {
  walletCount: number;
  activeCallbacks: number;
  pendingTransactions: number;
  failureMode: boolean;
  latency: number;
  timestamp: number;
}

/**
 * Manager for mock FFI state tracking and validation
 */
export class MockStateManager {
  private snapshots: MockStateSnapshot[] = [];
  private maxSnapshots = 10;

  /**
   * Take a snapshot of current mock state
   */
  takeSnapshot(): MockStateSnapshot {
    const mock = getMockNativeBindings();
    const walletCount = mock.getWalletCount();
    
    let activeCallbacks = 0;
    let pendingTransactions = 0;
    
    // Count active callbacks and pending transactions
    for (let i = 1; i <= walletCount; i++) {
      const wallet = mock.getWalletState(i);
      if (wallet) {
        if (wallet.eventCallback) activeCallbacks++;
        pendingTransactions += wallet.pendingInbound.length + wallet.pendingOutbound.length;
      }
    }

    const snapshot: MockStateSnapshot = {
      walletCount,
      activeCallbacks,
      pendingTransactions,
      failureMode: false, // We can't access private shouldFail directly
      latency: 0, // We can't access private latency directly
      timestamp: Date.now()
    };

    this.snapshots.push(snapshot);
    
    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Get the latest state snapshot
   */
  getLatestSnapshot(): MockStateSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * Validate mock state consistency
   */
  validateState(): { isValid: boolean; errors: string[] } {
    const mock = getMockNativeBindings();
    const errors: string[] = [];
    
    try {
      const walletCount = mock.getWalletCount();
      
      // Validate wallet count consistency
      if (walletCount < 0) {
        errors.push(`Negative wallet count: ${walletCount}`);
      }
      
      // Validate each wallet state
      for (let i = 1; i <= walletCount; i++) {
        const wallet = mock.getWalletState(i);
        if (wallet) {
          // Check for destroyed wallets still in collection
          if (wallet.destroyed) {
            errors.push(`Destroyed wallet ${i} still in collection`);
          }
          
          // Validate address format
          if (!wallet.address || wallet.address.length !== 64) {
            errors.push(`Invalid address format for wallet ${i}: ${wallet.address}`);
          }
          
          // Validate balance consistency
          const balance = wallet.balance;
          const available = parseInt(balance.available, 10);
          const pendingIn = parseInt(balance.pending_incoming, 10);
          const pendingOut = parseInt(balance.pending_outgoing, 10);
          const timelocked = parseInt(balance.timelocked, 10);
          
          if (available < 0 || pendingIn < 0 || pendingOut < 0 || timelocked < 0) {
            errors.push(`Negative balance values for wallet ${i}`);
          }
        }
      }
      
    } catch (error) {
      errors.push(`State validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Reset state manager
   */
  reset(): void {
    this.snapshots = [];
  }

  /**
   * Debug helper - get state history
   */
  getStateHistory(): MockStateSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Check for potential memory leaks in mock state
   */
  checkForLeaks(): { hasLeaks: boolean; issues: string[] } {
    const issues: string[] = [];
    
    const latest = this.getLatestSnapshot();
    if (!latest) {
      return { hasLeaks: false, issues: [] };
    }

    // Check for excessive callback accumulation
    if (latest.activeCallbacks > 10) {
      issues.push(`High callback count: ${latest.activeCallbacks}`);
    }

    // Check for excessive pending transactions
    if (latest.pendingTransactions > 50) {
      issues.push(`High pending transaction count: ${latest.pendingTransactions}`);
    }

    // Check for wallet count accumulation over time
    if (this.snapshots.length >= 3) {
      const walletCounts = this.snapshots.slice(-3).map(s => s.walletCount);
      const isIncreasing = walletCounts.every((count, i) => i === 0 || count >= walletCounts[i - 1]);
      
      if (isIncreasing && walletCounts[walletCounts.length - 1] > 5) {
        issues.push(`Wallet count continuously increasing: ${walletCounts.join(' -> ')}`);
      }
    }

    return {
      hasLeaks: issues.length > 0,
      issues
    };
  }
}

// Singleton instance for global use
let stateManagerInstance: MockStateManager | null = null;

/**
 * Get the global mock state manager instance
 */
export function getMockStateManager(): MockStateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new MockStateManager();
  }
  return stateManagerInstance;
}

/**
 * Reset the global mock state manager
 */
export function resetMockStateManager(): void {
  if (stateManagerInstance) {
    stateManagerInstance.reset();
  }
  stateManagerInstance = null;
}
