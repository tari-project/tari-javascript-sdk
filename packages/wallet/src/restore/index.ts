/**
 * @fileoverview Wallet restoration module exports
 * 
 * Comprehensive wallet restoration system with progress tracking,
 * state management, and enhanced seed validation for safe recovery operations.
 */

// Core restoration service
export {
  WalletRestorationService,
  RestorationStage,
  type RestorationProgress,
  type RestorationState,
  type RestorationOptions,
  type RestorationResult,
  type RestorationEventHandlers
} from './restoration-service.js';

// Recovery state management
export {
  RecoveryStateManager,
  defaultRecoveryStateManager,
  createRestorationStateFromSession,
  validateRestorationProgress,
  type RecoverySession,
  type RecoveryPersistenceOptions
} from './recovery-state.js';

// Enhanced seed validation
export {
  RestorationSeedValidator,
  type RestorationSeedValidationOptions,
  type RestorationSeedValidationResult,
  type SeedIssueAnalysis,
  type SeedIssue
} from './seed-validator.js';
