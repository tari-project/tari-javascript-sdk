/**
 * @fileoverview Enhanced wallet error class with comprehensive error handling
 * 
 * Provides structured error information, context tracking, and recovery guidance
 * for all wallet operations in the Tari JavaScript SDK.
 */

import { WalletErrorCode, ErrorCategory, getErrorCategory } from './codes.js';

/**
 * Structured context information for debugging and telemetry
 */
export interface ErrorContext {
  /** Operation being performed when error occurred */
  operation?: string;
  /** Network type (mainnet, testnet, nextnet) */
  network?: string;
  /** Wallet identifier (non-sensitive) */
  walletId?: string;
  /** Transaction ID if applicable */
  transactionId?: string;
  /** Component or module where error originated */
  component?: string;
  /** Additional contextual data */
  metadata?: Record<string, unknown>;
  /** Timestamp when error occurred */
  timestamp?: Date;
  /** Request/correlation ID for tracing */
  requestId?: string;
  /** Allow additional properties for extensibility */
  [key: string]: unknown;
}

/**
 * Error severity levels for categorizing impact
 */
export enum ErrorSeverity {
  /** Informational error, operation can continue */
  Info = 'info',
  /** Warning error, degraded functionality */
  Warning = 'warning', 
  /** Error that prevents operation completion */
  Error = 'error',
  /** Critical error requiring immediate attention */
  Critical = 'critical',
}

/**
 * Enhanced wallet error class with structured error information
 * 
 * Extends the standard Error class with additional properties for
 * debugging, recovery, and telemetry purposes.
 */
export class WalletError extends Error {
  public readonly name = 'WalletError';
  public readonly code: WalletErrorCode;
  public readonly category: ErrorCategory;
  public readonly details: string;
  public readonly recoverable: boolean;
  public readonly severity: ErrorSeverity;
  public readonly context?: ErrorContext;
  public readonly timestamp: Date;
  
  constructor(
    code: WalletErrorCode,
    details: string,
    options: {
      recoverable?: boolean;
      severity?: ErrorSeverity;
      cause?: Error;
      context?: ErrorContext;
    } = {}
  ) {
    const message = WalletError.formatMessage(code, details);
    super(message);
    
    this.code = code;
    this.category = getErrorCategory(code);
    this.details = details;
    this.recoverable = options.recoverable ?? WalletError.isRecoverableByDefault(code);
    this.severity = options.severity ?? WalletError.getSeverityForCode(code);
    this.context = options.context;
    this.timestamp = new Date();
    
    if (options.cause) {
      this.cause = options.cause;
    }
    
    // Maintain prototype chain
    Object.setPrototypeOf(this, WalletError.prototype);
  }

  /**
   * Format error message based on code and details
   */
  private static formatMessage(code: WalletErrorCode, details: string): string {
    const baseMessage = WalletError.getMessageForCode(code);
    return details ? `${baseMessage}: ${details}` : baseMessage;
  }

  /**
   * Get human-readable message for error code
   */
  static getMessageForCode(code: WalletErrorCode): string {
    const messages: Partial<Record<WalletErrorCode, string>> = {
      // Initialization errors
      [WalletErrorCode.InvalidConfig]: 'Invalid wallet configuration',
      [WalletErrorCode.WalletExists]: 'Wallet already exists',
      [WalletErrorCode.WalletNotFound]: 'Wallet not found',
      [WalletErrorCode.InitializationFailed]: 'Wallet initialization failed',
      [WalletErrorCode.DatabaseCorrupted]: 'Wallet database is corrupted',
      [WalletErrorCode.MigrationFailed]: 'Database migration failed',
      [WalletErrorCode.InvalidNetworkType]: 'Invalid network type specified',
      [WalletErrorCode.InvalidDataDir]: 'Invalid data directory',
      [WalletErrorCode.PermissionDenied]: 'Permission denied',
      [WalletErrorCode.DiskSpaceInsufficient]: 'Insufficient disk space',
      
      // Transaction errors
      [WalletErrorCode.InsufficientFunds]: 'Insufficient funds for transaction',
      [WalletErrorCode.InvalidAddress]: 'Invalid wallet address format',
      [WalletErrorCode.InvalidAmount]: 'Invalid transaction amount',
      [WalletErrorCode.TransactionNotFound]: 'Transaction not found',
      [WalletErrorCode.TransactionAlreadyExists]: 'Transaction already exists',
      [WalletErrorCode.TransactionFailed]: 'Transaction failed',
      [WalletErrorCode.FeeCalculationFailed]: 'Fee calculation failed',
      [WalletErrorCode.OutputNotFound]: 'Transaction output not found',
      [WalletErrorCode.InputNotFound]: 'Transaction input not found',
      [WalletErrorCode.TransactionTooLarge]: 'Transaction size exceeds limit',
      [WalletErrorCode.InvalidFee]: 'Invalid transaction fee',
      [WalletErrorCode.TransactionExpired]: 'Transaction has expired',
      [WalletErrorCode.DuplicateTransaction]: 'Duplicate transaction detected',
      [WalletErrorCode.TransactionRejected]: 'Transaction rejected by network',
      
      // Network errors
      [WalletErrorCode.NetworkUnavailable]: 'Network is unavailable',
      [WalletErrorCode.ConnectionFailed]: 'Connection failed',
      [WalletErrorCode.ConnectionTimeout]: 'Connection timeout',
      [WalletErrorCode.PeerNotFound]: 'Peer not found',
      [WalletErrorCode.SyncFailed]: 'Blockchain synchronization failed',
      [WalletErrorCode.BaseNodeUnavailable]: 'Base node unavailable',
      [WalletErrorCode.ConsensusNotAchieved]: 'Network consensus not achieved',
      [WalletErrorCode.BlockchainSyncRequired]: 'Blockchain synchronization required',
      [WalletErrorCode.InvalidPeerResponse]: 'Invalid response from peer',
      [WalletErrorCode.TooManyRequests]: 'Too many requests',
      [WalletErrorCode.ServiceUnavailable]: 'Service temporarily unavailable',
      
      // Validation errors
      [WalletErrorCode.RequiredFieldMissing]: 'Required field is missing',
      [WalletErrorCode.InvalidFormat]: 'Invalid format',
      [WalletErrorCode.ValueOutOfRange]: 'Value is out of valid range',
      [WalletErrorCode.InvalidChecksum]: 'Invalid checksum',
      [WalletErrorCode.InvalidLength]: 'Invalid length',
      [WalletErrorCode.InvalidCharacters]: 'Contains invalid characters',
      [WalletErrorCode.InvalidNetworkByte]: 'Invalid network byte',
      [WalletErrorCode.InvalidEmojiId]: 'Invalid emoji ID format',
      [WalletErrorCode.InvalidBase58]: 'Invalid base58 encoding',
      [WalletErrorCode.InvalidHex]: 'Invalid hexadecimal format',
      
      // FFI errors
      [WalletErrorCode.FFICallFailed]: 'Native function call failed',
      [WalletErrorCode.UseAfterFree]: 'Use after free detected',
      [WalletErrorCode.ResourceDestroyed]: 'Resource has been destroyed',
      [WalletErrorCode.NullPointer]: 'Null pointer encountered',
      [WalletErrorCode.InvalidHandle]: 'Invalid resource handle',
      [WalletErrorCode.HandleNotFound]: 'Resource handle not found',
      [WalletErrorCode.MemoryAllocationFailed]: 'Memory allocation failed',
      [WalletErrorCode.SerializationFailed]: 'Data serialization failed',
      [WalletErrorCode.DeserializationFailed]: 'Data deserialization failed',
      [WalletErrorCode.TypeConversionFailed]: 'Type conversion failed',
      
      // Resource errors
      [WalletErrorCode.ResourceExhausted]: 'Resource exhausted',
      [WalletErrorCode.MemoryLimitExceeded]: 'Memory limit exceeded',
      [WalletErrorCode.FileNotFound]: 'File not found',
      [WalletErrorCode.FileAccessDenied]: 'File access denied',
      [WalletErrorCode.DirectoryNotFound]: 'Directory not found',
      [WalletErrorCode.DiskFull]: 'Disk space full',
      [WalletErrorCode.FileSystemError]: 'File system error',
      [WalletErrorCode.DatabaseLocked]: 'Database is locked',
      [WalletErrorCode.DatabaseBusy]: 'Database is busy',
      [WalletErrorCode.TooManyOpenFiles]: 'Too many open files',
      
      // Security errors
      [WalletErrorCode.AuthenticationFailed]: 'Authentication failed',
      [WalletErrorCode.AuthorizationFailed]: 'Authorization failed',
      [WalletErrorCode.InvalidCredentials]: 'Invalid credentials',
      [WalletErrorCode.SecurityViolation]: 'Security violation detected',
      [WalletErrorCode.TamperedData]: 'Data tampering detected',
      [WalletErrorCode.InvalidCertificate]: 'Invalid certificate',
      [WalletErrorCode.CertificateExpired]: 'Certificate has expired',
      [WalletErrorCode.CryptoError]: 'Cryptographic operation failed',
      [WalletErrorCode.KeyGenerationFailed]: 'Key generation failed',
      [WalletErrorCode.EncryptionFailed]: 'Encryption failed',
      [WalletErrorCode.DecryptionFailed]: 'Decryption failed',
      [WalletErrorCode.HashingFailed]: 'Hashing operation failed',
      [WalletErrorCode.SigningFailed]: 'Digital signing failed',
      [WalletErrorCode.VerificationFailed]: 'Signature verification failed',
      
      // Configuration errors
      [WalletErrorCode.ConfigNotFound]: 'Configuration not found',
      [WalletErrorCode.ConfigInvalid]: 'Invalid configuration',
      [WalletErrorCode.ConfigCorrupted]: 'Configuration is corrupted',
      [WalletErrorCode.ConfigVersionMismatch]: 'Configuration version mismatch',
      [WalletErrorCode.MissingRequiredConfig]: 'Missing required configuration',
      [WalletErrorCode.InvalidConfigFormat]: 'Invalid configuration format',
      [WalletErrorCode.ConfigParseError]: 'Configuration parse error',
      [WalletErrorCode.ConfigValidationFailed]: 'Configuration validation failed',
      
      // General errors
      [WalletErrorCode.Unknown]: 'Unknown error occurred',
      [WalletErrorCode.NotImplemented]: 'Feature not implemented',
      [WalletErrorCode.Unsupported]: 'Operation not supported',
      [WalletErrorCode.Deprecated]: 'Feature is deprecated',
      [WalletErrorCode.InvalidState]: 'Invalid state',
      [WalletErrorCode.OperationCancelled]: 'Operation was cancelled',
      [WalletErrorCode.OperationTimeout]: 'Operation timed out',
      [WalletErrorCode.RateLimited]: 'Rate limit exceeded',
      [WalletErrorCode.ServiceDegraded]: 'Service is degraded',
      [WalletErrorCode.MaintenanceMode]: 'Service in maintenance mode',
      [WalletErrorCode.VersionMismatch]: 'Version mismatch',
      [WalletErrorCode.IncompatibleVersion]: 'Incompatible version',
      [WalletErrorCode.FeatureDisabled]: 'Feature is disabled',
      [WalletErrorCode.QuotaExceeded]: 'Quota exceeded',
      [WalletErrorCode.InternalError]: 'Internal error',
    };

    return messages[code] || 'Unknown error';
  }

  /**
   * Determine if an error code is recoverable by default
   */
  private static isRecoverableByDefault(code: WalletErrorCode): boolean {
    const recoverableErrors = new Set([
      // Network errors (often transient)
      WalletErrorCode.NetworkUnavailable,
      WalletErrorCode.ConnectionFailed,
      WalletErrorCode.ConnectionTimeout,
      WalletErrorCode.BaseNodeUnavailable,
      WalletErrorCode.TooManyRequests,
      WalletErrorCode.ServiceUnavailable,
      
      // Resource errors (may resolve)
      WalletErrorCode.DatabaseLocked,
      WalletErrorCode.DatabaseBusy,
      WalletErrorCode.ResourceTimeout,
      WalletErrorCode.ResourceUnavailable,
      
      // General errors (may be transient)
      WalletErrorCode.OperationTimeout,
      WalletErrorCode.RateLimited,
      WalletErrorCode.ServiceDegraded,
    ]);

    return recoverableErrors.has(code);
  }

  /**
   * Get severity level for error code
   */
  private static getSeverityForCode(code: WalletErrorCode): ErrorSeverity {
    // Critical errors that require immediate attention
    const criticalErrors = new Set([
      WalletErrorCode.DatabaseCorrupted,
      WalletErrorCode.SecurityViolation,
      WalletErrorCode.TamperedData,
      WalletErrorCode.MemoryCorruption,
      WalletErrorCode.UseAfterFree,
    ]);

    // Warning errors that indicate degraded functionality
    const warningErrors = new Set([
      WalletErrorCode.ServiceDegraded,
      WalletErrorCode.MaintenanceMode,
      WalletErrorCode.FeatureDisabled,
      WalletErrorCode.Deprecated,
      WalletErrorCode.VersionMismatch,
    ]);

    // Info errors that are informational
    const infoErrors = new Set([
      WalletErrorCode.NotImplemented,
      WalletErrorCode.OperationCancelled,
      WalletErrorCode.BlockchainSyncRequired,
    ]);

    if (criticalErrors.has(code)) {
      return ErrorSeverity.Critical;
    } else if (warningErrors.has(code)) {
      return ErrorSeverity.Warning;
    } else if (infoErrors.has(code)) {
      return ErrorSeverity.Info;
    }
    
    return ErrorSeverity.Error;
  }

  /**
   * Create a new error with additional context
   */
  withContext(context: Partial<ErrorContext>): WalletError {
    const mergedContext = { ...this.context, ...context };
    return new WalletError(this.code, this.details, {
      recoverable: this.recoverable,
      severity: this.severity,
      cause: this.cause as Error,
      context: mergedContext,
    });
  }

  /**
   * Create a new error with updated severity
   */
  withSeverity(severity: ErrorSeverity): WalletError {
    return new WalletError(this.code, this.details, {
      recoverable: this.recoverable,
      severity,
      cause: this.cause as Error,
      context: this.context,
    });
  }

  /**
   * Check if this error is in a specific category
   */
  isCategory(category: ErrorCategory): boolean {
    return this.category === category;
  }

  /**
   * Check if this error has a specific severity
   */
  hasSeverity(severity: ErrorSeverity): boolean {
    return this.severity === severity;
  }

  /**
   * Serialize error to JSON for logging/telemetry
   */
  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause ? {
        name: (this.cause as Error).name,
        message: (this.cause as Error).message,
        stack: (this.cause as Error).stack,
      } : undefined,
    };
  }

  /**
   * Get sanitized context (removes sensitive data for logging)
   */
  getSanitizedContext(): ErrorContext | undefined {
    if (!this.context) return undefined;

    const { metadata, ...safeContext } = this.context;
    const sanitizedMetadata: Record<string, unknown> = {};

    // Only include non-sensitive metadata
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        // Skip potentially sensitive fields
        if (!this.isSensitiveField(key)) {
          sanitizedMetadata[key] = value;
        }
      }
    }

    return {
      ...safeContext,
      metadata: Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : undefined,
    };
  }

  /**
   * Check if a field name indicates sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /seed/i,
      /mnemonic/i,
      /private/i,
      /auth/i,
      /credential/i,
      /signature/i,
    ];

    return sensitivePatterns.some(pattern => pattern.test(fieldName));
  }

  /**
   * Get a developer-friendly error description
   */
  getDescription(): string {
    let description = `[${this.code}] ${this.category}: ${this.message}`;
    
    if (this.recoverable) {
      description += ' (Recoverable)';
    }
    
    if (this.context?.operation) {
      description += ` | Operation: ${this.context.operation}`;
    }
    
    return description;
  }
}

/**
 * Helper function to create a WalletError with context
 */
export function createWalletError(
  code: WalletErrorCode,
  details: string,
  context?: ErrorContext
): WalletError {
  return new WalletError(code, details, { context });
}

/**
 * Helper function to wrap an existing error as a WalletError
 */
export function wrapError(
  cause: Error,
  code: WalletErrorCode,
  details?: string,
  context?: ErrorContext
): WalletError {
  return new WalletError(code, details || cause.message, { cause, context });
}

/**
 * Type guard to check if an error is a WalletError
 */
export function isWalletError(error: unknown): error is WalletError {
  return error instanceof WalletError;
}
