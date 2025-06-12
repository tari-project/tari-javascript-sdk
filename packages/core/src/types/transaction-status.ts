/**
 * @fileoverview Transaction status types and state management
 * 
 * Provides detailed transaction status tracking with state transitions
 * and lifecycle management for all transaction types.
 */

import type { TransactionId, UnixTimestamp, BlockHeight } from './branded.js';
import { TransactionStatus, TransactionDirection } from './enums.js';
import type { TransactionCancellationReason } from './transaction.js';

// Transaction state machine states
export const TransactionState = {
  // Initial states
  Created: 'created',
  Validating: 'validating',
  
  // Pending states
  PendingInbound: 'pending_inbound',
  PendingOutbound: 'pending_outbound',
  
  // Broadcast states
  Broadcasting: 'broadcasting',
  Broadcast: 'broadcast',
  
  // Mining states
  InMempool: 'in_mempool',
  Mining: 'mining',
  Mined: 'mined',
  
  // Confirmation states
  Confirming: 'confirming',
  Confirmed: 'confirmed',
  
  // Final states
  Completed: 'completed',
  Cancelled: 'cancelled',
  Failed: 'failed',
  
  // Special states
  Imported: 'imported',
  Coinbase: 'coinbase',
  Unknown: 'unknown'
} as const;

export type TransactionState = typeof TransactionState[keyof typeof TransactionState];

// Transaction status details
export interface TransactionStatusInfo {
  /** Current status */
  readonly status: TransactionStatus;
  /** Current state in state machine */
  readonly state: TransactionState;
  /** Status timestamp */
  readonly timestamp: UnixTimestamp;
  /** Human-readable description */
  readonly description: string;
  /** Technical details */
  readonly details?: TransactionStatusDetails;
  /** Whether this is a final state */
  readonly isFinal: boolean;
  /** Whether this status can be cancelled */
  readonly cancellable: boolean;
}

// Detailed status information
export interface TransactionStatusDetails {
  /** Block height (for mined transactions) */
  blockHeight?: BlockHeight;
  /** Number of confirmations */
  confirmations?: number;
  /** Estimated time to next state */
  estimatedTimeToNext?: number;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  /** Cancellation details */
  cancellation?: {
    reason: TransactionCancellationReason;
    timestamp: UnixTimestamp;
    details?: string;
  };
}

// Transaction lifecycle event
export interface TransactionLifecycleEvent {
  /** Transaction ID */
  readonly transactionId: TransactionId;
  /** Event timestamp */
  readonly timestamp: UnixTimestamp;
  /** Previous state */
  readonly previousState: TransactionState;
  /** New state */
  readonly newState: TransactionState;
  /** Previous status */
  readonly previousStatus: TransactionStatus;
  /** New status */
  readonly newStatus: TransactionStatus;
  /** Event details */
  readonly details?: Record<string, any>;
  /** Event source */
  readonly source: TransactionEventSource;
}

// Transaction event sources
export const TransactionEventSource = {
  Wallet: 'wallet',
  BaseNode: 'base_node',
  Network: 'network',
  User: 'user',
  System: 'system',
  External: 'external'
} as const;

export type TransactionEventSource = typeof TransactionEventSource[keyof typeof TransactionEventSource];

// State transition rules
export interface StateTransition {
  /** Source state */
  from: TransactionState;
  /** Target state */
  to: TransactionState;
  /** Transition trigger */
  trigger: TransactionTrigger;
  /** Conditions for transition */
  conditions?: TransitionCondition[];
  /** Actions to perform during transition */
  actions?: TransitionAction[];
}

// Transition triggers
export const TransactionTrigger = {
  // User actions
  UserCancel: 'user_cancel',
  UserConfirm: 'user_confirm',
  
  // Network events
  NetworkAccepted: 'network_accepted',
  NetworkRejected: 'network_rejected',
  BlockMined: 'block_mined',
  
  // System events
  TimerExpired: 'timer_expired',
  ValidationCompleted: 'validation_completed',
  ValidationFailed: 'validation_failed',
  
  // Peer events
  PeerResponse: 'peer_response',
  PeerTimeout: 'peer_timeout',
  
  // Error conditions
  InsufficientFunds: 'insufficient_funds',
  NetworkError: 'network_error',
  SystemError: 'system_error'
} as const;

export type TransactionTrigger = typeof TransactionTrigger[keyof typeof TransactionTrigger];

// Transition conditions
export interface TransitionCondition {
  /** Condition type */
  type: 'confirmations' | 'time_elapsed' | 'balance_sufficient' | 'network_connected' | 'custom';
  /** Condition parameters */
  params: Record<string, any>;
  /** Whether condition must be met */
  required: boolean;
}

// Transition actions
export interface TransitionAction {
  /** Action type */
  type: 'notify' | 'update_balance' | 'cleanup' | 'log' | 'custom';
  /** Action parameters */
  params: Record<string, any>;
  /** Whether action is async */
  async?: boolean;
}

// Status change notification
export interface TransactionStatusChange {
  /** Transaction ID */
  readonly transactionId: TransactionId;
  /** Change timestamp */
  readonly timestamp: UnixTimestamp;
  /** Previous status info */
  readonly previous: TransactionStatusInfo;
  /** New status info */
  readonly current: TransactionStatusInfo;
  /** Change reason */
  readonly reason?: string;
  /** Additional metadata */
  readonly metadata?: Record<string, any>;
}

// Transaction progress information
export interface TransactionProgress {
  /** Transaction ID */
  readonly transactionId: TransactionId;
  /** Current step in lifecycle */
  readonly currentStep: number;
  /** Total steps in lifecycle */
  readonly totalSteps: number;
  /** Progress percentage (0-100) */
  readonly percentage: number;
  /** Current step description */
  readonly stepDescription: string;
  /** Estimated time remaining in seconds */
  readonly estimatedTimeRemaining?: number;
  /** Whether transaction can be cancelled at this step */
  readonly cancellable: boolean;
}

// Transaction status manager
export class TransactionStatusManager {
  private static readonly STATE_TRANSITIONS: StateTransition[] = [
    // Creation flow
    {
      from: TransactionState.Created,
      to: TransactionState.Validating,
      trigger: TransactionTrigger.ValidationCompleted
    },
    {
      from: TransactionState.Validating,
      to: TransactionState.PendingOutbound,
      trigger: TransactionTrigger.ValidationCompleted
    },
    
    // Outbound flow
    {
      from: TransactionState.PendingOutbound,
      to: TransactionState.Broadcasting,
      trigger: TransactionTrigger.UserConfirm
    },
    {
      from: TransactionState.Broadcasting,
      to: TransactionState.Broadcast,
      trigger: TransactionTrigger.NetworkAccepted
    },
    {
      from: TransactionState.Broadcast,
      to: TransactionState.InMempool,
      trigger: TransactionTrigger.NetworkAccepted
    },
    {
      from: TransactionState.InMempool,
      to: TransactionState.Mining,
      trigger: TransactionTrigger.BlockMined
    },
    {
      from: TransactionState.Mining,
      to: TransactionState.Mined,
      trigger: TransactionTrigger.BlockMined
    },
    {
      from: TransactionState.Mined,
      to: TransactionState.Confirming,
      trigger: TransactionTrigger.BlockMined
    },
    {
      from: TransactionState.Confirming,
      to: TransactionState.Confirmed,
      trigger: TransactionTrigger.BlockMined,
      conditions: [{
        type: 'confirmations',
        params: { required: 6 },
        required: true
      }]
    },
    {
      from: TransactionState.Confirmed,
      to: TransactionState.Completed,
      trigger: TransactionTrigger.ValidationCompleted
    },
    
    // Cancellation flows
    {
      from: TransactionState.PendingOutbound,
      to: TransactionState.Cancelled,
      trigger: TransactionTrigger.UserCancel
    },
    {
      from: TransactionState.Broadcasting,
      to: TransactionState.Cancelled,
      trigger: TransactionTrigger.NetworkRejected
    },
    
    // Error flows
    {
      from: TransactionState.Validating,
      to: TransactionState.Failed,
      trigger: TransactionTrigger.ValidationFailed
    },
    {
      from: TransactionState.Broadcasting,
      to: TransactionState.Failed,
      trigger: TransactionTrigger.NetworkError
    }
  ];

  /**
   * Get status information for a transaction state
   */
  static getStatusInfo(
    status: TransactionStatus,
    state: TransactionState,
    details?: TransactionStatusDetails
  ): TransactionStatusInfo {
    return {
      status,
      state,
      timestamp: Date.now() as UnixTimestamp,
      description: this.getStatusDescription(status, state),
      details,
      isFinal: this.isFinalState(state),
      cancellable: this.isCancellable(state)
    };
  }

  /**
   * Get human-readable description for status
   */
  static getStatusDescription(status: TransactionStatus, state: TransactionState): string {
    switch (state) {
      case TransactionState.Created:
        return 'Transaction created';
      case TransactionState.Validating:
        return 'Validating transaction';
      case TransactionState.PendingInbound:
        return 'Waiting to receive transaction';
      case TransactionState.PendingOutbound:
        return 'Ready to send';
      case TransactionState.Broadcasting:
        return 'Broadcasting to network';
      case TransactionState.Broadcast:
        return 'Broadcast to network';
      case TransactionState.InMempool:
        return 'In memory pool';
      case TransactionState.Mining:
        return 'Being mined';
      case TransactionState.Mined:
        return 'Mined in block';
      case TransactionState.Confirming:
        return 'Confirming';
      case TransactionState.Confirmed:
        return 'Confirmed';
      case TransactionState.Completed:
        return 'Transaction completed';
      case TransactionState.Cancelled:
        return 'Transaction cancelled';
      case TransactionState.Failed:
        return 'Transaction failed';
      case TransactionState.Imported:
        return 'Imported transaction';
      case TransactionState.Coinbase:
        return 'Coinbase transaction';
      default:
        return 'Unknown status';
    }
  }

  /**
   * Check if state is final (no further transitions)
   */
  static isFinalState(state: TransactionState): boolean {
    const finalStates = [
      TransactionState.Completed,
      TransactionState.Cancelled,
      TransactionState.Failed,
      TransactionState.Imported,
      TransactionState.Coinbase
    ] as TransactionState[];
    return finalStates.includes(state);
  }

  /**
   * Check if transaction can be cancelled in this state
   */
  static isCancellable(state: TransactionState): boolean {
    const cancellableStates = [
      TransactionState.Created,
      TransactionState.Validating,
      TransactionState.PendingOutbound,
      TransactionState.Broadcasting
    ] as TransactionState[];
    return cancellableStates.includes(state);
  }

  /**
   * Get possible next states from current state
   */
  static getPossibleNextStates(currentState: TransactionState): TransactionState[] {
    return this.STATE_TRANSITIONS
      .filter(transition => transition.from === currentState)
      .map(transition => transition.to);
  }

  /**
   * Check if state transition is valid
   */
  static canTransition(
    from: TransactionState,
    to: TransactionState,
    trigger: TransactionTrigger
  ): boolean {
    return this.STATE_TRANSITIONS.some(
      transition => 
        transition.from === from && 
        transition.to === to && 
        transition.trigger === trigger
    );
  }

  /**
   * Calculate transaction progress
   */
  static calculateProgress(
    state: TransactionState,
    direction: TransactionDirection,
    details?: TransactionStatusDetails
  ): TransactionProgress {
    const steps = this.getLifecycleSteps(direction);
    const currentStep = steps.indexOf(state);
    const totalSteps = steps.length;
    
    let percentage = 0;
    if (currentStep >= 0) {
      percentage = Math.round((currentStep / (totalSteps - 1)) * 100);
    }

    return {
      transactionId: ('' as unknown) as TransactionId, // Would be provided by caller
      currentStep: Math.max(0, currentStep),
      totalSteps,
      percentage,
      stepDescription: this.getStatusDescription(
        this.stateToStatus(state),
        state
      ),
      estimatedTimeRemaining: details?.estimatedTimeToNext,
      cancellable: this.isCancellable(state)
    };
  }

  /**
   * Get lifecycle steps for transaction direction
   */
  private static getLifecycleSteps(direction: TransactionDirection): TransactionState[] {
    if (direction === TransactionDirection.Outbound) {
      return [
        TransactionState.Created,
        TransactionState.PendingOutbound,
        TransactionState.Broadcasting,
        TransactionState.Broadcast,
        TransactionState.InMempool,
        TransactionState.Mined,
        TransactionState.Confirmed,
        TransactionState.Completed
      ];
    } else {
      return [
        TransactionState.PendingInbound,
        TransactionState.Broadcast,
        TransactionState.Mined,
        TransactionState.Confirmed,
        TransactionState.Completed
      ];
    }
  }

  /**
   * Convert state to status
   */
  private static stateToStatus(state: TransactionState): TransactionStatus {
    switch (state) {
      case TransactionState.PendingInbound:
      case TransactionState.PendingOutbound:
      case TransactionState.Created:
      case TransactionState.Validating:
        return TransactionStatus.Pending;
      case TransactionState.Broadcasting:
      case TransactionState.Broadcast:
      case TransactionState.InMempool:
        return TransactionStatus.Broadcast;
      case TransactionState.Mining:
      case TransactionState.Mined:
        return TransactionStatus.MinedUnconfirmed;
      case TransactionState.Confirming:
      case TransactionState.Confirmed:
      case TransactionState.Completed:
        return TransactionStatus.MinedConfirmed;
      case TransactionState.Cancelled:
        return TransactionStatus.Cancelled;
      case TransactionState.Imported:
        return TransactionStatus.Imported;
      case TransactionState.Coinbase:
        return TransactionStatus.Coinbase;
      default:
        return TransactionStatus.Unknown;
    }
  }

  /**
   * Estimate time to completion
   */
  static estimateTimeToCompletion(
    currentState: TransactionState,
    direction: TransactionDirection
  ): number | null {
    // Rough estimates in seconds
    const timeEstimates: Record<TransactionState, number> = {
      [TransactionState.Created]: 30,
      [TransactionState.Validating]: 10,
      [TransactionState.PendingOutbound]: 0,
      [TransactionState.Broadcasting]: 30,
      [TransactionState.Broadcast]: 60,
      [TransactionState.InMempool]: 120, // 2 minutes average block time
      [TransactionState.Mining]: 120,
      [TransactionState.Mined]: 12 * 60, // 12 minutes for 6 confirmations
      [TransactionState.Confirming]: 6 * 120, // 6 more blocks
      [TransactionState.Confirmed]: 0,
      [TransactionState.Completed]: 0,
      [TransactionState.PendingInbound]: 180,
      [TransactionState.Cancelled]: 0,
      [TransactionState.Failed]: 0,
      [TransactionState.Imported]: 0,
      [TransactionState.Coinbase]: 0,
      [TransactionState.Unknown]: 0
    };

    return timeEstimates[currentState] || null;
  }
}

// Export utilities
export { TransactionStatusManager as StatusManager };
