/**
 * @fileoverview Configuration validation for wallet creation and restoration
 * 
 * Provides comprehensive validation of wallet configuration with detailed
 * error messages and recovery suggestions.
 */

import { NetworkType } from '@tari-project/tarijs-core';
import { 
  WalletError, 
  WalletErrorCode,
  ErrorSeverity
} from '@tari-project/tarijs-core';
import type { WalletConfig } from '../types/index.js';

/**
 * Validation result for configuration
 */
export interface ValidationResult {
  isValid: boolean;
  errors: WalletError[];
  warnings: WalletError[];
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Whether to check if paths exist and are accessible */
  checkPaths?: boolean;
  /** Whether to validate seed words format */
  validateSeedWords?: boolean;
  /** Whether to check for sufficient disk space */
  checkDiskSpace?: boolean;
  /** Minimum required disk space in bytes */
  minDiskSpace?: number;
}

/**
 * Default validation options
 */
const DEFAULT_VALIDATION_OPTIONS: Required<ValidationOptions> = {
  checkPaths: true,
  validateSeedWords: true,
  checkDiskSpace: true,
  minDiskSpace: 100_000_000, // 100MB
};

/**
 * Validate wallet configuration with comprehensive checks
 */
export async function validateWalletConfig(
  config: WalletConfig,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  const errors: WalletError[] = [];
  const warnings: WalletError[] = [];

  // Required field validation
  if (!config.network) {
    errors.push(new WalletError(
      WalletErrorCode.RequiredFieldMissing,
      'Network type is required',
      { 
        severity: ErrorSeverity.Error
      }
    ));
  }

  if (!config.storagePath) {
    errors.push(new WalletError(
      WalletErrorCode.RequiredFieldMissing,
      'Storage path is required',
      {
        severity: ErrorSeverity.Error
      }
    ));
  }

  // Network validation
  if (config.network && !Object.values(NetworkType).includes(config.network)) {
    errors.push(new WalletError(
      WalletErrorCode.InvalidNetworkType,
      `Invalid network type: ${config.network}`,
      {
        severity: ErrorSeverity.Error
      }
    ));
  }

  // Path validation
  if (opts.checkPaths && config.storagePath) {
    try {
      await validatePath(config.storagePath, 'storage');
    } catch (error: unknown) {
      if (error instanceof WalletError) {
        errors.push(error);
      } else {
        errors.push(new WalletError(
          WalletErrorCode.InvalidDataDir,
          `Storage path validation failed: ${error}`,
          {
            severity: ErrorSeverity.Error,
            cause: error as Error
          }
        ));
      }
    }
  }

  if (opts.checkPaths && config.logPath) {
    try {
      await validatePath(config.logPath, 'log');
    } catch (error: unknown) {
      // Log path issues are warnings, not errors
      warnings.push(new WalletError(
        WalletErrorCode.InvalidDataDir,
        `Log path validation failed: ${error}`,
        {
          severity: ErrorSeverity.Warning,
          cause: error as Error
        }
      ));
    }
  }

  // Numeric range validation
  if (config.logLevel !== undefined) {
    if (!Number.isInteger(config.logLevel) || config.logLevel < 0 || config.logLevel > 5) {
      errors.push(new WalletError(
        WalletErrorCode.ValueOutOfRange,
        `Log level must be an integer between 0 and 5, got: ${config.logLevel}`,
        {
          severity: ErrorSeverity.Error
        }
      ));
    }
  }

  if (config.numRollingLogFiles !== undefined) {
    if (!Number.isInteger(config.numRollingLogFiles) || config.numRollingLogFiles < 1) {
      errors.push(new WalletError(
        WalletErrorCode.ValueOutOfRange,
        `Number of rolling log files must be at least 1, got: ${config.numRollingLogFiles}`,
        {
          severity: ErrorSeverity.Error
        }
      ));
    }
  }

  if (config.rollingLogFileSize !== undefined) {
    if (!Number.isInteger(config.rollingLogFileSize) || config.rollingLogFileSize < 1024) {
      errors.push(new WalletError(
        WalletErrorCode.ValueOutOfRange,
        `Rolling log file size must be at least 1024 bytes, got: ${config.rollingLogFileSize}`,
        {
          severity: ErrorSeverity.Error
        }
      ));
    }
  }

  // Seed words validation
  if (opts.validateSeedWords && config.seedWords) {
    try {
      validateSeedWords(config.seedWords);
    } catch (error: unknown) {
      if (error instanceof WalletError) {
        errors.push(error);
      } else {
        errors.push(new WalletError(
          WalletErrorCode.InvalidFormat,
          `Seed words validation failed: ${error}`,
          {
            severity: ErrorSeverity.Error,
            cause: error as Error
          }
        ));
      }
    }
  }

  // Passphrase validation
  if (config.passphrase !== undefined && typeof config.passphrase !== 'string') {
    errors.push(new WalletError(
      WalletErrorCode.InvalidFormat,
      'Passphrase must be a string',
      {
        severity: ErrorSeverity.Error
      }
    ));
  }

  // Disk space validation
  if (opts.checkDiskSpace && config.storagePath && errors.length === 0) {
    try {
      const available = await getAvailableDiskSpace(config.storagePath);
      if (available < opts.minDiskSpace) {
        warnings.push(new WalletError(
          WalletErrorCode.DiskSpaceInsufficient,
          `Insufficient disk space: ${formatBytes(available)} available, ${formatBytes(opts.minDiskSpace)} required`,
          {
            severity: ErrorSeverity.Warning
          }
        ));
      }
    } catch (error: unknown) {
      // Disk space check failure is a warning
      warnings.push(new WalletError(
        WalletErrorCode.Unknown,
        `Could not check disk space: ${error}`,
        {
          severity: ErrorSeverity.Warning,
          cause: error as Error
        }
      ));
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate a file system path
 */
async function validatePath(path: string, pathType: string): Promise<void> {
  if (!path || typeof path !== 'string') {
    throw new WalletError(
      WalletErrorCode.InvalidDataDir,
      `${pathType} path must be a non-empty string`
    );
  }

  // Check for obviously invalid paths
  if (path.includes('\0')) {
    throw new WalletError(
      WalletErrorCode.InvalidCharacters,
      `${pathType} path contains null characters`
    );
  }

  // Platform-specific path validation
  if (typeof process !== 'undefined' && process.platform === 'win32') {
    // Windows path validation
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(path)) {
      throw new WalletError(
        WalletErrorCode.InvalidCharacters,
        `${pathType} path contains invalid Windows characters: < > : " | ? *`
      );
    }
  }

  // Try to access the directory (create parent if needed)
  try {
    const fs = await import('node:fs/promises');
    const dirname = await import('node:path').then(p => p.dirname);
    
    // Ensure parent directory exists
    await fs.mkdir(dirname(path), { recursive: true });
    
    // Check if we can write to the directory
    await fs.access(dirname(path), fs.constants.W_OK);
  } catch (error: unknown) {
    throw new WalletError(
      WalletErrorCode.PermissionDeniedInit,
      `Cannot access ${pathType} path: ${error}`,
      { cause: error as Error }
    );
  }
}

/**
 * Validate seed words format and content
 */
function validateSeedWords(seedWords: string[]): void {
  if (!Array.isArray(seedWords)) {
    throw new WalletError(
      WalletErrorCode.InvalidFormat,
      'Seed words must be an array'
    );
  }

  if (seedWords.length !== 24) {
    throw new WalletError(
      WalletErrorCode.InvalidLength,
      `Seed phrase must contain exactly 24 words, got ${seedWords.length}`
    );
  }

  // Check for empty or invalid words
  for (let i = 0; i < seedWords.length; i++) {
    const word = seedWords[i];
    if (!word || typeof word !== 'string') {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        `Seed word at position ${i + 1} is invalid: ${word}`
      );
    }

    if (word.trim() !== word || word.includes(' ')) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        `Seed word at position ${i + 1} contains whitespace: "${word}"`
      );
    }

    if (!/^[a-z]+$/.test(word)) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        `Seed word at position ${i + 1} contains invalid characters: "${word}"`
      );
    }
  }

  // Check for duplicate words
  const uniqueWords = new Set(seedWords);
  if (uniqueWords.size !== seedWords.length) {
    throw new WalletError(
      WalletErrorCode.InvalidFormat,
      'Seed phrase contains duplicate words'
    );
  }
}

/**
 * Get available disk space for a given path
 */
async function getAvailableDiskSpace(path: string): Promise<number> {
  try {
    const fs = await import('node:fs/promises');
    const stats = await fs.statfs(path).catch(() => null);
    
    if (stats) {
      return stats.bavail * stats.bsize;
    }
    
    // Fallback: assume sufficient space if we can't check
    return Number.MAX_SAFE_INTEGER;
  } catch {
    // If we can't check disk space, assume it's sufficient
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Quick validation for required fields only
 */
export function validateRequiredFields(config: Partial<WalletConfig>): void {
  if (!config.network) {
    throw new WalletError(
      WalletErrorCode.RequiredFieldMissing,
      'Network type is required'
    );
  }

  if (!config.storagePath) {
    throw new WalletError(
      WalletErrorCode.RequiredFieldMissing,
      'Storage path is required'
    );
  }
}
