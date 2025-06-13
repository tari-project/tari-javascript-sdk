/**
 * @fileoverview FFI error translation layer for Tari JavaScript SDK
 * 
 * Translates error codes from the native Tari FFI library to TypeScript WalletError
 * instances with proper context and error information.
 */

import { WalletError, ErrorContext, createWalletError, wrapError } from './wallet-error';
import { WalletErrorCode } from './codes';
import type { NativeErrorInfo } from '../ffi/native';

/**
 * Map of Tari FFI error codes to WalletErrorCode equivalents
 * These codes come from the native Tari implementation
 */
export const FFI_ERROR_MAP: Record<number, WalletErrorCode> = {
  // Success codes
  0: WalletErrorCode.Unknown, // Should not reach here for success
  
  // Initialization errors (100-199)
  100: WalletErrorCode.InitializationFailed,
  101: WalletErrorCode.InvalidConfig,
  102: WalletErrorCode.WalletExists,
  103: WalletErrorCode.WalletNotFound,
  104: WalletErrorCode.DatabaseCorrupted,
  105: WalletErrorCode.MigrationFailed,
  106: WalletErrorCode.InvalidNetworkType,
  107: WalletErrorCode.InvalidDataDir,
  108: WalletErrorCode.PermissionDenied,
  109: WalletErrorCode.DiskSpaceInsufficient,
  
  // Transaction errors (200-299)
  200: WalletErrorCode.TransactionFailed,
  201: WalletErrorCode.InsufficientFunds,
  202: WalletErrorCode.InvalidAddress,
  203: WalletErrorCode.InvalidAmount,
  204: WalletErrorCode.TransactionNotFound,
  205: WalletErrorCode.TransactionAlreadyExists,
  206: WalletErrorCode.FeeCalculationFailed,
  207: WalletErrorCode.OutputNotFound,
  208: WalletErrorCode.InputNotFound,
  209: WalletErrorCode.TransactionTooLarge,
  210: WalletErrorCode.InvalidFee,
  211: WalletErrorCode.TransactionExpired,
  212: WalletErrorCode.DuplicateTransaction,
  213: WalletErrorCode.TransactionRejected,
  214: WalletErrorCode.ChangeNotFound,
  215: WalletErrorCode.InvalidSignature,
  216: WalletErrorCode.InvalidScriptOffset,
  217: WalletErrorCode.InvalidKernel,
  218: WalletErrorCode.InvalidCommitment,
  219: WalletErrorCode.InvalidRangeProof,
  
  // Network errors (300-399)
  300: WalletErrorCode.NetworkUnavailable,
  301: WalletErrorCode.ConnectionFailed,
  302: WalletErrorCode.ConnectionTimeout,
  303: WalletErrorCode.PeerNotFound,
  304: WalletErrorCode.SyncFailed,
  305: WalletErrorCode.BaseNodeUnavailable,
  306: WalletErrorCode.ConsensusNotAchieved,
  307: WalletErrorCode.BlockchainSyncRequired,
  308: WalletErrorCode.InvalidPeerResponse,
  309: WalletErrorCode.TooManyRequests,
  310: WalletErrorCode.ServiceUnavailable,
  311: WalletErrorCode.NetworkPartition,
  312: WalletErrorCode.InvalidBlock,
  313: WalletErrorCode.ChainReorg,
  314: WalletErrorCode.ForkDetected,
  
  // Validation errors (400-499)
  400: WalletErrorCode.InvalidFormat,
  401: WalletErrorCode.RequiredFieldMissing,
  402: WalletErrorCode.ValueOutOfRange,
  403: WalletErrorCode.InvalidChecksum,
  404: WalletErrorCode.InvalidLength,
  405: WalletErrorCode.InvalidCharacters,
  406: WalletErrorCode.InvalidNetworkByte,
  407: WalletErrorCode.InvalidEmojiId,
  408: WalletErrorCode.InvalidBase58,
  409: WalletErrorCode.InvalidHex,
  410: WalletErrorCode.InvalidJson,
  411: WalletErrorCode.SchemaValidationFailed,
  412: WalletErrorCode.InvalidTimestamp,
  413: WalletErrorCode.InvalidUrl,
  414: WalletErrorCode.InvalidPortNumber,
  
  // FFI-specific errors (500-599)
  500: WalletErrorCode.FFICallFailed,
  501: WalletErrorCode.UseAfterFree,
  502: WalletErrorCode.ResourceDestroyed,
  503: WalletErrorCode.NullPointer,
  504: WalletErrorCode.InvalidHandle,
  505: WalletErrorCode.HandleNotFound,
  506: WalletErrorCode.MemoryAllocationFailed,
  507: WalletErrorCode.SerializationFailed,
  508: WalletErrorCode.DeserializationFailed,
  509: WalletErrorCode.TypeConversionFailed,
  510: WalletErrorCode.BufferOverflow,
  511: WalletErrorCode.InvalidParameters,
  512: WalletErrorCode.CallbackFailed,
  513: WalletErrorCode.ThreadingError,
  514: WalletErrorCode.AsyncOperationFailed,
  
  // Resource errors (600-699)
  600: WalletErrorCode.ResourceExhausted,
  601: WalletErrorCode.MemoryLimitExceeded,
  602: WalletErrorCode.FileNotFound,
  603: WalletErrorCode.FileAccessDenied,
  604: WalletErrorCode.DirectoryNotFound,
  605: WalletErrorCode.DiskFull,
  606: WalletErrorCode.FileSystemError,
  607: WalletErrorCode.DatabaseLocked,
  608: WalletErrorCode.DatabaseBusy,
  609: WalletErrorCode.TooManyOpenFiles,
  610: WalletErrorCode.ResourceLeak,
  611: WalletErrorCode.HandleLimitExceeded,
  612: WalletErrorCode.MemoryCorruption,
  613: WalletErrorCode.ResourceTimeout,
  614: WalletErrorCode.ResourceUnavailable,
  
  // Security errors (700-799)
  700: WalletErrorCode.AuthenticationFailed,
  701: WalletErrorCode.AuthorizationFailed,
  702: WalletErrorCode.InvalidCredentials,
  703: WalletErrorCode.PermissionDenied,
  704: WalletErrorCode.SecurityViolation,
  705: WalletErrorCode.TamperedData,
  706: WalletErrorCode.InvalidCertificate,
  707: WalletErrorCode.CertificateExpired,
  708: WalletErrorCode.CryptoError,
  709: WalletErrorCode.KeyGenerationFailed,
  710: WalletErrorCode.EncryptionFailed,
  711: WalletErrorCode.DecryptionFailed,
  712: WalletErrorCode.HashingFailed,
  713: WalletErrorCode.SigningFailed,
  714: WalletErrorCode.VerificationFailed,
  
  // Configuration errors (800-899)
  800: WalletErrorCode.ConfigNotFound,
  801: WalletErrorCode.ConfigInvalid,
  802: WalletErrorCode.ConfigCorrupted,
  803: WalletErrorCode.ConfigVersionMismatch,
  804: WalletErrorCode.MissingRequiredConfig,
  805: WalletErrorCode.InvalidConfigFormat,
  806: WalletErrorCode.ConfigParseError,
  807: WalletErrorCode.ConfigValidationFailed,
  808: WalletErrorCode.UnsupportedConfigVersion,
  809: WalletErrorCode.ConfigMigrationFailed,
  810: WalletErrorCode.ConfigAccessDenied,
  811: WalletErrorCode.ConfigLocked,
  812: WalletErrorCode.DefaultConfigFailed,
  813: WalletErrorCode.ConfigBackupFailed,
  814: WalletErrorCode.ConfigRestoreFailed,
  
  // General errors (900-999)
  900: WalletErrorCode.Unknown,
  901: WalletErrorCode.NotImplemented,
  902: WalletErrorCode.Unsupported,
  903: WalletErrorCode.Deprecated,
  904: WalletErrorCode.InvalidState,
  905: WalletErrorCode.OperationCancelled,
  906: WalletErrorCode.OperationTimeout,
  907: WalletErrorCode.RateLimited,
  908: WalletErrorCode.ServiceDegraded,
  909: WalletErrorCode.MaintenanceMode,
  910: WalletErrorCode.VersionMismatch,
  911: WalletErrorCode.IncompatibleVersion,
  912: WalletErrorCode.FeatureDisabled,
  913: WalletErrorCode.QuotaExceeded,
  914: WalletErrorCode.InternalError,
};

/**
 * Error information extracted from FFI exceptions
 */
export interface FFIErrorInfo {
  /** FFI error code */
  code: number;
  /** Error message from FFI */
  message: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
  /** Additional context from FFI */
  context?: string;
  /** Stack trace from native code */
  nativeStackTrace?: string;
}

/**
 * Extract error information from various FFI error formats
 */
export function extractFFIErrorInfo(error: unknown): FFIErrorInfo {
  // Handle NativeErrorInfo from FFI
  if (error && typeof error === 'object' && 'code' in error) {
    const nativeError = error as NativeErrorInfo;
    return {
      code: nativeError.code,
      message: nativeError.message,
      recoverable: nativeError.recoverable,
      context: nativeError.context,
    };
  }
  
  // Handle standard JavaScript Error
  if (error instanceof Error) {
    // Try to extract FFI error code from message
    const codeMatch = error.message.match(/FFI Error (\d+):/);
    const code = codeMatch ? parseInt(codeMatch[1], 10) : 500; // Default to FFICallFailed
    
    return {
      code,
      message: error.message,
      nativeStackTrace: error.stack,
    };
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    const codeMatch = error.match(/FFI Error (\d+):/);
    const code = codeMatch ? parseInt(codeMatch[1], 10) : 500;
    
    return {
      code,
      message: error,
    };
  }
  
  // Fallback for unknown error types
  return {
    code: 500, // FFICallFailed
    message: String(error || 'Unknown FFI error'),
  };
}

/**
 * Translate FFI error code to WalletErrorCode
 */
export function translateFFIErrorCode(ffiCode: number): WalletErrorCode {
  return FFI_ERROR_MAP[ffiCode] || WalletErrorCode.FFICallFailed;
}

/**
 * Create a WalletError from FFI error information
 */
export function createFFIError(
  ffiError: FFIErrorInfo,
  context?: Partial<ErrorContext>
): WalletError {
  const walletCode = translateFFIErrorCode(ffiError.code);
  const details = ffiError.message;
  
  const errorContext: ErrorContext = {
    ...context,
    component: 'FFI',
    metadata: {
      ffiErrorCode: ffiError.code,
      recoverable: ffiError.recoverable,
      nativeContext: ffiError.context,
      ...(ffiError.nativeStackTrace && { nativeStackTrace: ffiError.nativeStackTrace }),
      ...context?.metadata,
    },
  };

  return createWalletError(walletCode, details, errorContext);
}

/**
 * Wrap an FFI error as a WalletError
 */
export function wrapFFIError(
  cause: unknown,
  context?: Partial<ErrorContext>
): WalletError {
  const ffiError = extractFFIErrorInfo(cause);
  const walletError = createFFIError(ffiError, context);
  
  // If we have an original Error, preserve it as the cause
  if (cause instanceof Error) {
    return wrapError(cause, walletError.code, walletError.details, walletError.context);
  }
  
  return walletError;
}

/**
 * Execute an FFI function with error translation
 */
export async function executeFFI<T>(
  operation: () => Promise<T>,
  context?: Partial<ErrorContext>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw wrapFFIError(error, context);
  }
}

/**
 * Execute a synchronous FFI function with error translation
 */
export function executeFFISync<T>(
  operation: () => T,
  context?: Partial<ErrorContext>
): T {
  try {
    return operation();
  } catch (error) {
    throw wrapFFIError(error, context);
  }
}

/**
 * Check if an error is an FFI-related error
 */
export function isFFIError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  
  // Check if it's a WalletError with FFI category
  if (error instanceof WalletError) {
    return error.category === 'FFI' || 
           (error.context?.component === 'FFI') ||
           (typeof error.context?.metadata?.ffiErrorCode === 'number');
  }
  
  // Check if it's a native error with FFI code
  if ('code' in error && typeof (error as any).code === 'number') {
    return true;
  }
  
  // Check for FFI error patterns in message
  if (error instanceof Error) {
    return /FFI Error \d+:/.test(error.message) || 
           error.message.includes('native') ||
           error.message.includes('NAPI');
  }
  
  return false;
}

/**
 * Get additional FFI error context from error
 */
export function getFFIErrorContext(error: WalletError): {
  ffiCode?: number;
  nativeStackTrace?: string;
  recoverable?: boolean;
} {
  const metadata = error.context?.metadata;
  if (!metadata) return {};
  
  return {
    ffiCode: typeof metadata.ffiErrorCode === 'number' ? metadata.ffiErrorCode : undefined,
    nativeStackTrace: typeof metadata.nativeStackTrace === 'string' ? metadata.nativeStackTrace : undefined,
    recoverable: typeof metadata.recoverable === 'boolean' ? metadata.recoverable : undefined,
  };
}

/**
 * Format FFI error for debugging
 */
export function formatFFIError(error: WalletError): string {
  const ffiContext = getFFIErrorContext(error);
  let result = error.getDescription();
  
  if (ffiContext.ffiCode !== undefined) {
    result += ` | FFI Code: ${ffiContext.ffiCode}`;
  }
  
  if (ffiContext.nativeStackTrace) {
    result += `\nNative Stack:\n${ffiContext.nativeStackTrace}`;
  }
  
  return result;
}

/**
 * Common FFI error codes for quick reference
 */
export const CommonFFIErrorCodes = {
  Success: 0,
  InitializationFailed: 100,
  InvalidConfig: 101,
  WalletExists: 102,
  WalletNotFound: 103,
  TransactionFailed: 200,
  InsufficientFunds: 201,
  InvalidAddress: 202,
  NetworkUnavailable: 300,
  ConnectionFailed: 301,
  FFICallFailed: 500,
  UseAfterFree: 501,
  ResourceDestroyed: 502,
  InvalidHandle: 504,
  HandleNotFound: 505,
} as const;

/**
 * Helper to check if an FFI error code indicates success
 */
export function isFFISuccess(code: number): boolean {
  return code === CommonFFIErrorCodes.Success;
}

/**
 * Helper to check if an FFI error code is a known error
 */
export function isKnownFFIError(code: number): boolean {
  return code in FFI_ERROR_MAP;
}
