/**
 * @fileoverview Storage migration system for backend transitions
 * 
 * Provides seamless data migration between storage backends with
 * validation, rollback capabilities, and progress tracking.
 */

import type { SecureStorage, StorageResult } from './secure-storage.js';

export interface MigrationPlan {
  id: string;
  source: SecureStorage;
  target: SecureStorage;
  strategy: MigrationStrategy;
  validation: ValidationStrategy;
  rollbackEnabled: boolean;
  batchSize?: number;
  preserveSource?: boolean;
}

export interface MigrationProgress {
  planId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back';
  totalItems: number;
  migratedItems: number;
  failedItems: number;
  startTime: Date;
  endTime?: Date;
  errors: MigrationError[];
  lastProcessedKey?: string;
}

export interface MigrationError {
  key: string;
  operation: 'read' | 'write' | 'validate' | 'delete';
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

export interface MigrationConfig {
  maxRetries: number;
  retryDelay: number;
  validateData: boolean;
  preserveTimestamps: boolean;
  enableRollback: boolean;
  progressCallback?: (progress: MigrationProgress) => void;
  errorCallback?: (error: MigrationError) => void;
}

export enum MigrationStrategy {
  /** Copy all data, then validate */
  CopyThenValidate = 'copy-then-validate',
  /** Validate as we copy */
  ValidateWhileCopy = 'validate-while-copy',
  /** Copy only specific keys */
  Selective = 'selective',
  /** Merge data from multiple sources */
  Merge = 'merge',
}

export enum ValidationStrategy {
  /** No validation */
  None = 'none',
  /** Check that data exists in target */
  Existence = 'existence',
  /** Verify data integrity by comparing bytes */
  DataIntegrity = 'data-integrity',
  /** Full validation including metadata */
  Complete = 'complete',
}

/**
 * Manages storage backend migrations
 */
export class StorageMigrator {
  private activeMigrations = new Map<string, MigrationProgress>();
  private config: MigrationConfig;

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      validateData: true,
      preserveTimestamps: true,
      enableRollback: true,
      ...config,
    };
  }

  /**
   * Create a migration plan
   */
  createMigrationPlan(
    source: SecureStorage,
    target: SecureStorage,
    options: {
      strategy?: MigrationStrategy;
      validation?: ValidationStrategy;
      rollbackEnabled?: boolean;
      batchSize?: number;
      preserveSource?: boolean;
      keyFilter?: (key: string) => boolean;
    } = {}
  ): MigrationPlan {
    const id = `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id,
      source,
      target,
      strategy: options.strategy || MigrationStrategy.CopyThenValidate,
      validation: options.validation || ValidationStrategy.DataIntegrity,
      rollbackEnabled: options.rollbackEnabled ?? this.config.enableRollback,
      batchSize: options.batchSize || 10,
      preserveSource: options.preserveSource ?? true,
    };
  }

  /**
   * Execute a migration plan
   */
  async executeMigration(plan: MigrationPlan): Promise<MigrationProgress> {
    // Initialize progress tracking
    const progress: MigrationProgress = {
      planId: plan.id,
      status: 'pending',
      totalItems: 0,
      migratedItems: 0,
      failedItems: 0,
      startTime: new Date(),
      errors: [],
    };

    this.activeMigrations.set(plan.id, progress);

    try {
      progress.status = 'running';
      this.notifyProgress(progress);

      // Get list of keys to migrate
      const sourceKeys = await this.getSourceKeys(plan.source);
      progress.totalItems = sourceKeys.length;
      this.notifyProgress(progress);

      // Execute migration based on strategy
      switch (plan.strategy) {
        case MigrationStrategy.CopyThenValidate:
          await this.executeCopyThenValidate(plan, progress, sourceKeys);
          break;
        case MigrationStrategy.ValidateWhileCopy:
          await this.executeValidateWhileCopy(plan, progress, sourceKeys);
          break;
        case MigrationStrategy.Selective:
          await this.executeSelective(plan, progress, sourceKeys);
          break;
        case MigrationStrategy.Merge:
          await this.executeMerge(plan, progress, sourceKeys);
          break;
        default:
          throw new Error(`Unknown migration strategy: ${plan.strategy}`);
      }

      progress.status = 'completed';
      progress.endTime = new Date();
      this.notifyProgress(progress);

    } catch (error) {
      progress.status = 'failed';
      progress.endTime = new Date();
      
      this.addError(progress, {
        key: progress.lastProcessedKey || 'unknown',
        operation: 'read',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        recoverable: false,
      });

      this.notifyProgress(progress);

      // Attempt rollback if enabled
      if (plan.rollbackEnabled) {
        await this.rollbackMigration(plan, progress);
      }
    }

    return progress;
  }

  /**
   * Get migration progress
   */
  getMigrationProgress(planId: string): MigrationProgress | undefined {
    return this.activeMigrations.get(planId);
  }

  /**
   * Get all active migrations
   */
  getActiveMigrations(): MigrationProgress[] {
    return Array.from(this.activeMigrations.values());
  }

  /**
   * Cancel a running migration
   */
  async cancelMigration(planId: string): Promise<boolean> {
    const progress = this.activeMigrations.get(planId);
    
    if (!progress || progress.status !== 'running') {
      return false;
    }

    progress.status = 'failed';
    progress.endTime = new Date();
    this.notifyProgress(progress);

    return true;
  }

  /**
   * Validate a completed migration
   */
  async validateMigration(plan: MigrationPlan): Promise<{
    valid: boolean;
    errors: string[];
    statistics: {
      totalKeys: number;
      validatedKeys: number;
      missingKeys: number;
      corruptedKeys: number;
    };
  }> {
    const errors: string[] = [];
    const statistics = {
      totalKeys: 0,
      validatedKeys: 0,
      missingKeys: 0,
      corruptedKeys: 0,
    };

    try {
      const sourceKeys = await this.getSourceKeys(plan.source);
      statistics.totalKeys = sourceKeys.length;

      for (const key of sourceKeys) {
        try {
          // Check if key exists in target
          const targetExists = await plan.target.exists(key);
          if (!targetExists.success || !targetExists.data) {
            statistics.missingKeys++;
            errors.push(`Missing key in target: ${key}`);
            continue;
          }

          // Validate data integrity if requested
          if (plan.validation === ValidationStrategy.DataIntegrity ||
              plan.validation === ValidationStrategy.Complete) {
            
            const sourceData = await plan.source.retrieve(key);
            const targetData = await plan.target.retrieve(key);

            if (!sourceData.success || !targetData.success) {
              statistics.corruptedKeys++;
              errors.push(`Cannot read data for key: ${key}`);
              continue;
            }

            if (!sourceData.data!.equals(targetData.data!)) {
              statistics.corruptedKeys++;
              errors.push(`Data mismatch for key: ${key}`);
              continue;
            }
          }

          statistics.validatedKeys++;

        } catch (error) {
          statistics.corruptedKeys++;
          errors.push(`Validation error for key ${key}: ${error}`);
        }
      }

    } catch (error) {
      errors.push(`Migration validation failed: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      statistics,
    };
  }

  /**
   * Clean up completed migrations
   */
  cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    for (const [id, progress] of this.activeMigrations) {
      if (progress.status === 'completed' || progress.status === 'failed') {
        if (progress.endTime && progress.endTime.getTime() < oneHourAgo) {
          this.activeMigrations.delete(id);
        }
      }
    }
  }

  /**
   * Execute copy-then-validate strategy
   */
  private async executeCopyThenValidate(
    plan: MigrationPlan,
    progress: MigrationProgress,
    keys: string[]
  ): Promise<void> {
    // Phase 1: Copy all data
    for (const key of keys) {
      progress.lastProcessedKey = key;
      
      try {
        const sourceData = await plan.source.retrieve(key);
        if (!sourceData.success) {
          this.addError(progress, {
            key,
            operation: 'read',
            error: sourceData.error || 'Failed to read from source',
            timestamp: new Date(),
            recoverable: true,
          });
          continue;
        }

        const targetResult = await plan.target.store(key, sourceData.data!);
        if (!targetResult.success) {
          this.addError(progress, {
            key,
            operation: 'write',
            error: targetResult.error || 'Failed to write to target',
            timestamp: new Date(),
            recoverable: true,
          });
          continue;
        }

        progress.migratedItems++;

      } catch (error) {
        this.addError(progress, {
          key,
          operation: 'read',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
          recoverable: true,
        });
      }

      this.notifyProgress(progress);
    }

    // Phase 2: Validate if requested
    if (plan.validation !== ValidationStrategy.None) {
      await this.validateCopiedData(plan, progress, keys);
    }
  }

  /**
   * Execute validate-while-copy strategy
   */
  private async executeValidateWhileCopy(
    plan: MigrationPlan,
    progress: MigrationProgress,
    keys: string[]
  ): Promise<void> {
    for (const key of keys) {
      progress.lastProcessedKey = key;
      
      try {
        // Read from source
        const sourceData = await plan.source.retrieve(key);
        if (!sourceData.success) {
          this.addError(progress, {
            key,
            operation: 'read',
            error: sourceData.error || 'Failed to read from source',
            timestamp: new Date(),
            recoverable: true,
          });
          continue;
        }

        // Write to target
        const targetResult = await plan.target.store(key, sourceData.data!);
        if (!targetResult.success) {
          this.addError(progress, {
            key,
            operation: 'write',
            error: targetResult.error || 'Failed to write to target',
            timestamp: new Date(),
            recoverable: true,
          });
          continue;
        }

        // Immediate validation if requested
        if (plan.validation === ValidationStrategy.DataIntegrity ||
            plan.validation === ValidationStrategy.Complete) {
          
          const verifyResult = await plan.target.retrieve(key);
          if (!verifyResult.success || !verifyResult.data!.equals(sourceData.data!)) {
            this.addError(progress, {
              key,
              operation: 'validate',
              error: 'Data validation failed after copy',
              timestamp: new Date(),
              recoverable: false,
            });
            continue;
          }
        }

        progress.migratedItems++;

      } catch (error) {
        this.addError(progress, {
          key,
          operation: 'read',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
          recoverable: true,
        });
      }

      this.notifyProgress(progress);
    }
  }

  /**
   * Execute selective migration strategy
   */
  private async executeSelective(
    plan: MigrationPlan,
    progress: MigrationProgress,
    keys: string[]
  ): Promise<void> {
    // For selective migration, we would apply filters here
    // For now, implement same as copy-then-validate
    await this.executeCopyThenValidate(plan, progress, keys);
  }

  /**
   * Execute merge migration strategy
   */
  private async executeMerge(
    plan: MigrationPlan,
    progress: MigrationProgress,
    keys: string[]
  ): Promise<void> {
    for (const key of keys) {
      progress.lastProcessedKey = key;
      
      try {
        // Check if key already exists in target
        const targetExists = await plan.target.exists(key);
        
        if (targetExists.success && targetExists.data) {
          // Key exists, decide merge strategy (for now, skip)
          continue;
        }

        // Key doesn't exist, copy it
        const sourceData = await plan.source.retrieve(key);
        if (!sourceData.success) {
          this.addError(progress, {
            key,
            operation: 'read',
            error: sourceData.error || 'Failed to read from source',
            timestamp: new Date(),
            recoverable: true,
          });
          continue;
        }

        const targetResult = await plan.target.store(key, sourceData.data!);
        if (!targetResult.success) {
          this.addError(progress, {
            key,
            operation: 'write',
            error: targetResult.error || 'Failed to write to target',
            timestamp: new Date(),
            recoverable: true,
          });
          continue;
        }

        progress.migratedItems++;

      } catch (error) {
        this.addError(progress, {
          key,
          operation: 'read',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
          recoverable: true,
        });
      }

      this.notifyProgress(progress);
    }
  }

  /**
   * Validate copied data
   */
  private async validateCopiedData(
    plan: MigrationPlan,
    progress: MigrationProgress,
    keys: string[]
  ): Promise<void> {
    for (const key of keys) {
      try {
        const targetExists = await plan.target.exists(key);
        if (!targetExists.success || !targetExists.data) {
          this.addError(progress, {
            key,
            operation: 'validate',
            error: 'Key missing in target after copy',
            timestamp: new Date(),
            recoverable: false,
          });
          continue;
        }

        if (plan.validation === ValidationStrategy.DataIntegrity ||
            plan.validation === ValidationStrategy.Complete) {
          
          const sourceData = await plan.source.retrieve(key);
          const targetData = await plan.target.retrieve(key);

          if (!sourceData.success || !targetData.success) {
            this.addError(progress, {
              key,
              operation: 'validate',
              error: 'Failed to read data for validation',
              timestamp: new Date(),
              recoverable: false,
            });
            continue;
          }

          if (!sourceData.data!.equals(targetData.data!)) {
            this.addError(progress, {
              key,
              operation: 'validate',
              error: 'Data integrity check failed',
              timestamp: new Date(),
              recoverable: false,
            });
          }
        }

      } catch (error) {
        this.addError(progress, {
          key,
          operation: 'validate',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
          recoverable: false,
        });
      }
    }
  }

  /**
   * Rollback a failed migration
   */
  private async rollbackMigration(plan: MigrationPlan, progress: MigrationProgress): Promise<void> {
    try {
      progress.status = 'rolled-back';
      
      // Get list of keys that were successfully migrated
      const targetKeys = await this.getSourceKeys(plan.target);
      
      // Remove migrated keys from target
      for (const key of targetKeys) {
        try {
          await plan.target.remove(key);
        } catch (error) {
          // Log rollback errors but don't fail the rollback
          console.warn(`Failed to remove key ${key} during rollback:`, error);
        }
      }

    } catch (error) {
      console.warn('Rollback failed:', error);
    }
  }

  /**
   * Get list of keys from a storage backend
   */
  private async getSourceKeys(storage: SecureStorage): Promise<string[]> {
    const listResult = await storage.list();
    if (!listResult.success) {
      throw new Error(`Failed to list keys: ${listResult.error}`);
    }
    return listResult.data || [];
  }

  /**
   * Add an error to the progress tracking
   */
  private addError(progress: MigrationProgress, error: MigrationError): void {
    progress.errors.push(error);
    progress.failedItems++;
    
    if (this.config.errorCallback) {
      this.config.errorCallback(error);
    }
  }

  /**
   * Notify progress callback
   */
  private notifyProgress(progress: MigrationProgress): void {
    if (this.config.progressCallback) {
      this.config.progressCallback(progress);
    }
  }
}

/**
 * Utility functions for migration
 */
export class MigrationUtils {
  /**
   * Estimate migration time based on data size and backend performance
   */
  static estimateMigrationTime(
    totalKeys: number,
    averageDataSize: number,
    sourcePerformance: number,
    targetPerformance: number
  ): number {
    // Simple estimation based on read + write operations
    const readTime = totalKeys * sourcePerformance;
    const writeTime = totalKeys * targetPerformance;
    const overheadTime = totalKeys * 50; // 50ms overhead per operation
    
    return readTime + writeTime + overheadTime;
  }

  /**
   * Create a migration report
   */
  static createMigrationReport(progress: MigrationProgress): string {
    const duration = progress.endTime 
      ? progress.endTime.getTime() - progress.startTime.getTime()
      : Date.now() - progress.startTime.getTime();

    let report = `Migration Report\n`;
    report += `Plan ID: ${progress.planId}\n`;
    report += `Status: ${progress.status.toUpperCase()}\n`;
    report += `Duration: ${Math.round(duration / 1000)}s\n`;
    report += `Total Items: ${progress.totalItems}\n`;
    report += `Migrated: ${progress.migratedItems}\n`;
    report += `Failed: ${progress.failedItems}\n`;
    
    if (progress.totalItems > 0) {
      const successRate = (progress.migratedItems / progress.totalItems) * 100;
      report += `Success Rate: ${successRate.toFixed(2)}%\n`;
    }

    if (progress.errors.length > 0) {
      report += `\nErrors:\n`;
      const recentErrors = progress.errors.slice(-10);
      for (const error of recentErrors) {
        report += `- ${error.key}: ${error.error}\n`;
      }
      
      if (progress.errors.length > 10) {
        report += `... and ${progress.errors.length - 10} more errors\n`;
      }
    }

    return report;
  }

  /**
   * Check if a migration is recommended
   */
  static shouldMigrate(
    sourceHealth: any,
    targetHealth: any,
    migrationHistory: MigrationProgress[]
  ): {
    recommended: boolean;
    reasons: string[];
    risks: string[];
  } {
    const reasons: string[] = [];
    const risks: string[] = [];
    
    // Check source health
    if (sourceHealth.status === 'unhealthy') {
      reasons.push('Source backend is unhealthy');
    } else if (sourceHealth.status === 'degraded') {
      reasons.push('Source backend performance is degraded');
    }

    // Check target health
    if (targetHealth.status === 'healthy' && sourceHealth.status !== 'healthy') {
      reasons.push('Target backend is healthier than source');
    }

    // Check recent migration failures
    const recentFailures = migrationHistory.filter(m => 
      m.status === 'failed' && 
      Date.now() - m.startTime.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    if (recentFailures.length > 0) {
      risks.push(`${recentFailures.length} migration(s) failed in the last 24 hours`);
    }

    // Check data loss risk
    if (sourceHealth.available === false) {
      risks.push('Source backend is unavailable - data may be lost');
    }

    const recommended = reasons.length > 0 && risks.length === 0;

    return { recommended, reasons, risks };
  }
}
