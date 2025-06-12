/**
 * @fileoverview Wallet state management and lifecycle tracking
 * 
 * Provides centralized state management for wallet instances including
 * lifecycle phases, resource tracking, and state transition validation.
 */

import { WalletError, WalletErrorCode, ErrorSeverity } from '@tari-project/tarijs-core';

/**
 * Wallet lifecycle states
 */
export enum WalletState {
  /** Wallet is being created */
  Initializing = 'initializing',
  /** Wallet is ready for operations */
  Ready = 'ready',
  /** Wallet is performing operations */
  Active = 'active',
  /** Wallet is being destroyed */
  Destroying = 'destroying',
  /** Wallet has been destroyed and cannot be used */
  Destroyed = 'destroyed',
  /** Wallet is in an error state */
  Error = 'error'
}

/**
 * Wallet state transition metadata
 */
export interface StateTransition {
  fromState: WalletState;
  toState: WalletState;
  timestamp: Date;
  reason?: string;
  error?: Error;
}

/**
 * Wallet state manager with transition validation and history
 */
export class WalletStateManager {
  private currentState: WalletState;
  private readonly stateHistory: StateTransition[] = [];
  private readonly createdAt: Date;
  private readonly walletId: string;

  constructor(walletId: string, initialState: WalletState = WalletState.Initializing) {
    this.walletId = walletId;
    this.currentState = initialState;
    this.createdAt = new Date();
    
    // Record initial state
    this.stateHistory.push({
      fromState: initialState,
      toState: initialState,
      timestamp: this.createdAt,
      reason: 'Initial state'
    });
  }

  /**
   * Get current wallet state
   */
  get state(): WalletState {
    return this.currentState;
  }

  /**
   * Get wallet creation timestamp
   */
  get created(): Date {
    return new Date(this.createdAt);
  }

  /**
   * Get wallet ID
   */
  get id(): string {
    return this.walletId;
  }

  /**
   * Check if wallet is in a usable state
   */
  get isUsable(): boolean {
    return this.currentState === WalletState.Ready || this.currentState === WalletState.Active;
  }

  /**
   * Check if wallet is destroyed
   */
  get isDestroyed(): boolean {
    return this.currentState === WalletState.Destroyed;
  }

  /**
   * Check if wallet is in error state
   */
  get isError(): boolean {
    return this.currentState === WalletState.Error;
  }

  /**
   * Transition to a new state with validation
   */
  transition(newState: WalletState, reason?: string, error?: Error): void {
    const fromState = this.currentState;

    // Validate transition
    if (!this.isValidTransition(fromState, newState)) {
      throw new WalletError(
        WalletErrorCode.InvalidStateTransition,
        `Invalid state transition from ${fromState} to ${newState}`,
        {
          severity: ErrorSeverity.Error,
          metadata: {
            fromState,
            toState: newState,
            walletId: this.walletId,
            validTransitions: this.getValidTransitions(fromState)
          }
        }
      );
    }

    // Record transition
    const transition: StateTransition = {
      fromState,
      toState: newState,
      timestamp: new Date(),
      reason,
      error
    };

    this.stateHistory.push(transition);
    this.currentState = newState;
  }

  /**
   * Force transition to error state
   */
  setError(error: Error, reason?: string): void {
    this.transition(WalletState.Error, reason || 'Error occurred', error);
  }

  /**
   * Get state transition history
   */
  getHistory(): readonly StateTransition[] {
    return [...this.stateHistory];
  }

  /**
   * Get last transition
   */
  getLastTransition(): StateTransition | null {
    return this.stateHistory.length > 0 
      ? this.stateHistory[this.stateHistory.length - 1] 
      : null;
  }

  /**
   * Ensure wallet is in a usable state
   */
  ensureUsable(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Cannot use wallet after it has been destroyed',
        {
          severity: ErrorSeverity.Error,
          metadata: {
            walletId: this.walletId,
            currentState: this.currentState,
            destroyedAt: this.getDestroyedAt()
          }
        }
      );
    }

    if (this.isError) {
      const lastError = this.getLastError();
      throw new WalletError(
        WalletErrorCode.WalletInErrorState,
        'Wallet is in error state and cannot be used',
        {
          severity: ErrorSeverity.Error,
          cause: lastError,
          metadata: {
            walletId: this.walletId,
            currentState: this.currentState
          }
        }
      );
    }

    if (!this.isUsable) {
      throw new WalletError(
        WalletErrorCode.WalletNotReady,
        `Wallet is not ready for operations (current state: ${this.currentState})`,
        {
          severity: ErrorSeverity.Error,
          metadata: {
            walletId: this.walletId,
            currentState: this.currentState
          }
        }
      );
    }
  }

  /**
   * Get statistics about state usage
   */
  getStats(): WalletStateStats {
    const stateCounts = new Map<WalletState, number>();
    const stateDurations = new Map<WalletState, number>();
    
    let totalDuration = 0;
    
    for (let i = 0; i < this.stateHistory.length; i++) {
      const current = this.stateHistory[i];
      const next = this.stateHistory[i + 1];
      
      // Count state occurrences
      stateCounts.set(current.toState, (stateCounts.get(current.toState) || 0) + 1);
      
      // Calculate duration in state
      if (next) {
        const duration = next.timestamp.getTime() - current.timestamp.getTime();
        stateDurations.set(current.toState, (stateDurations.get(current.toState) || 0) + duration);
        totalDuration += duration;
      }
    }

    return {
      walletId: this.walletId,
      currentState: this.currentState,
      createdAt: this.createdAt,
      totalDuration,
      transitionCount: this.stateHistory.length - 1,
      stateCounts: Object.fromEntries(stateCounts),
      stateDurations: Object.fromEntries(stateDurations),
      averageTransitionTime: this.stateHistory.length > 1 
        ? totalDuration / (this.stateHistory.length - 1) 
        : 0
    };
  }

  // Private helper methods

  private isValidTransition(from: WalletState, to: WalletState): boolean {
    const validTransitions = this.getValidTransitions(from);
    return validTransitions.includes(to);
  }

  private getValidTransitions(state: WalletState): WalletState[] {
    switch (state) {
      case WalletState.Initializing:
        return [WalletState.Ready, WalletState.Error, WalletState.Destroyed];
      
      case WalletState.Ready:
        return [WalletState.Active, WalletState.Destroying, WalletState.Error];
      
      case WalletState.Active:
        return [WalletState.Ready, WalletState.Destroying, WalletState.Error];
      
      case WalletState.Destroying:
        return [WalletState.Destroyed];
      
      case WalletState.Destroyed:
        return []; // No transitions allowed from destroyed state
      
      case WalletState.Error:
        return [WalletState.Ready, WalletState.Destroying, WalletState.Destroyed];
      
      default:
        return [];
    }
  }

  private getDestroyedAt(): Date | null {
    const destroyTransition = this.stateHistory.find(t => t.toState === WalletState.Destroyed);
    return destroyTransition ? destroyTransition.timestamp : null;
  }

  private getLastError(): Error | null {
    const errorTransition = this.stateHistory
      .slice()
      .reverse()
      .find(t => t.toState === WalletState.Error);
    return errorTransition?.error || null;
  }
}

/**
 * Wallet state statistics
 */
export interface WalletStateStats {
  walletId: string;
  currentState: WalletState;
  createdAt: Date;
  totalDuration: number;
  transitionCount: number;
  stateCounts: Record<string, number>;
  stateDurations: Record<string, number>;
  averageTransitionTime: number;
}

/**
 * Decorator for ensuring wallet is in usable state before method execution
 */
export function requireUsableState(
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>
): void {
  const method = descriptor.value;

  descriptor.value = function (this: { stateManager: WalletStateManager }, ...args: any[]) {
    this.stateManager.ensureUsable();
    return method.apply(this, args);
  };
}

/**
 * Decorator for tracking state transitions during method execution
 */
export function withStateTransition(
  activeState: WalletState = WalletState.Active,
  readyState: WalletState = WalletState.Ready
) {
  return function (
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<any>
  ): void {
    const method = descriptor.value;

    descriptor.value = async function (this: { stateManager: WalletStateManager }, ...args: any[]) {
      const stateManager = this.stateManager;
      
      // Transition to active state
      if (stateManager.state === WalletState.Ready) {
        stateManager.transition(activeState, `Starting ${propertyName}`);
      }

      try {
        const result = await method.apply(this, args);
        
        // Transition back to ready state
        if (stateManager.state === activeState) {
          stateManager.transition(readyState, `Completed ${propertyName}`);
        }
        
        return result;
      } catch (error) {
        // On error, go back to ready state or error state
        if (stateManager.state === activeState) {
          if (error instanceof WalletError && error.severity === ErrorSeverity.Critical) {
            stateManager.setError(error as Error, `Critical error in ${propertyName}`);
          } else {
            stateManager.transition(readyState, `Error in ${propertyName}`);
          }
        }
        throw error;
      }
    };
  };
}
