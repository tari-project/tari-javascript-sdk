/**
 * @fileoverview Type definitions for message signing and verification
 * 
 * Comprehensive type system for message signing operations including
 * signature formats, verification results, and cryptographic metadata.
 */

/**
 * Signature algorithm types supported by Tari
 */
export enum SignatureAlgorithm {
  /** Ristretto25519 signature scheme */
  Ristretto25519 = 'ristretto25519',
  /** Schnorr signature scheme */
  Schnorr = 'schnorr',
  /** EdDSA signature scheme */
  EdDSA = 'eddsa'
}

/**
 * Signature encoding formats
 */
export enum SignatureEncoding {
  /** Hexadecimal encoding */
  Hex = 'hex',
  /** Base64 encoding */
  Base64 = 'base64',
  /** DER encoding */
  DER = 'der',
  /** Raw bytes */
  Raw = 'raw'
}

/**
 * Message encoding formats
 */
export enum MessageEncoding {
  /** UTF-8 text encoding */
  UTF8 = 'utf8',
  /** Hexadecimal encoding */
  Hex = 'hex',
  /** Base64 encoding */
  Base64 = 'base64',
  /** Raw binary data */
  Binary = 'binary'
}

/**
 * Signature verification status
 */
export enum VerificationStatus {
  /** Signature is valid */
  Valid = 'valid',
  /** Signature is invalid */
  Invalid = 'invalid',
  /** Signature format is malformed */
  Malformed = 'malformed',
  /** Public key is invalid */
  InvalidPublicKey = 'invalid_public_key',
  /** Message is invalid or corrupted */
  InvalidMessage = 'invalid_message',
  /** Verification process failed */
  VerificationError = 'verification_error',
  /** Signature has expired */
  Expired = 'expired',
  /** Signature is not yet valid */
  NotYetValid = 'not_yet_valid'
}

/**
 * Comprehensive signature metadata
 */
export interface SignatureMetadata {
  /** Signature algorithm used */
  algorithm: SignatureAlgorithm;
  /** Signature encoding format */
  signatureEncoding: SignatureEncoding;
  /** Message encoding format */
  messageEncoding: MessageEncoding;
  /** Signature creation timestamp */
  createdAt: Date;
  /** Signature expiration timestamp (optional) */
  expiresAt?: Date;
  /** Version of the signing implementation */
  version: string;
  /** Additional custom metadata */
  custom?: Record<string, any>;
  /** Nonce used in signature (if applicable) */
  nonce?: string;
  /** Chain ID or network identifier */
  chainId?: string;
}

/**
 * Extended signed message with full metadata
 */
export interface ExtendedSignedMessage {
  /** Original message content */
  message: string;
  /** Cryptographic signature */
  signature: string;
  /** Public key used for signing */
  publicKey: string;
  /** Wallet address (optional) */
  address?: string;
  /** Comprehensive signature metadata */
  metadata: SignatureMetadata;
  /** Message hash for verification */
  messageHash: string;
  /** Additional context data */
  context?: {
    /** Purpose or use case for this signature */
    purpose?: string;
    /** Application or service that created the signature */
    application?: string;
    /** User agent or client information */
    userAgent?: string;
    /** Geographic location (if relevant) */
    location?: string;
  };
}

/**
 * Signature verification result with detailed analysis
 */
export interface DetailedVerificationResult {
  /** Overall verification status */
  status: VerificationStatus;
  /** Whether the signature is cryptographically valid */
  isValid: boolean;
  /** Public key that was used for verification */
  publicKey: string;
  /** Derived wallet address */
  address?: string;
  /** Verification timestamp */
  verifiedAt: Date;
  /** Time taken for verification (milliseconds) */
  verificationTime: number;
  /** Detailed analysis results */
  analysis: {
    /** Signature format validation */
    signatureFormat: {
      isValid: boolean;
      encoding: SignatureEncoding;
      length: number;
      expectedLength?: number;
    };
    /** Message validation */
    messageValidation: {
      isValid: boolean;
      encoding: MessageEncoding;
      length: number;
      hash: string;
    };
    /** Public key validation */
    publicKeyValidation: {
      isValid: boolean;
      format: string;
      length: number;
      algorithm?: SignatureAlgorithm;
    };
    /** Timestamp validation */
    timestampValidation?: {
      isValid: boolean;
      age: number; // milliseconds
      isExpired: boolean;
      isNotYetValid: boolean;
    };
    /** Cryptographic verification details */
    cryptographicVerification: {
      algorithm: SignatureAlgorithm;
      success: boolean;
      errorCode?: number;
      errorMessage?: string;
    };
  };
  /** Any errors or warnings */
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    field?: string;
  }>;
}

/**
 * Signature creation context
 */
export interface SigningContext {
  /** Unique identifier for this signing operation */
  operationId: string;
  /** Purpose of the signature */
  purpose: string;
  /** Application creating the signature */
  application: string;
  /** User or entity requesting the signature */
  requester?: string;
  /** Additional context metadata */
  metadata?: Record<string, any>;
  /** Security requirements */
  security?: {
    /** Minimum signature strength */
    minStrength?: number;
    /** Required algorithm */
    requiredAlgorithm?: SignatureAlgorithm;
    /** Maximum signature age */
    maxAge?: number;
    /** Require timestamp */
    requireTimestamp?: boolean;
  };
}

/**
 * Batch signing operation
 */
export interface BatchSigningOperation {
  /** Unique batch identifier */
  batchId: string;
  /** Messages to sign */
  messages: Array<{
    id: string;
    content: string;
    encoding?: MessageEncoding;
    metadata?: Record<string, any>;
  }>;
  /** Common signing options */
  options: {
    algorithm?: SignatureAlgorithm;
    includeTimestamp?: boolean;
    includeAddress?: boolean;
    metadata?: Record<string, any>;
  };
  /** Batch context */
  context: SigningContext;
}

/**
 * Batch signing result
 */
export interface BatchSigningResult {
  /** Batch identifier */
  batchId: string;
  /** Total number of messages */
  total: number;
  /** Number of successfully signed messages */
  successful: number;
  /** Number of failed signatures */
  failed: number;
  /** Individual results */
  results: Array<{
    messageId: string;
    success: boolean;
    signature?: ExtendedSignedMessage;
    error?: {
      code: string;
      message: string;
    };
  }>;
  /** Batch completion time */
  completedAt: Date;
  /** Total time taken (milliseconds) */
  duration: number;
}

/**
 * Signature validation rules
 */
export interface SignatureValidationRules {
  /** Allowed signature algorithms */
  allowedAlgorithms: SignatureAlgorithm[];
  /** Allowed signature encodings */
  allowedSignatureEncodings: SignatureEncoding[];
  /** Allowed message encodings */
  allowedMessageEncodings: MessageEncoding[];
  /** Maximum message length */
  maxMessageLength: number;
  /** Maximum signature age (milliseconds) */
  maxSignatureAge?: number;
  /** Minimum signature age (milliseconds) */
  minSignatureAge?: number;
  /** Required metadata fields */
  requiredMetadata?: string[];
  /** Custom validation functions */
  customValidators?: Array<{
    name: string;
    validator: (signature: ExtendedSignedMessage) => Promise<boolean>;
  }>;
}

/**
 * Signature archive format for long-term storage
 */
export interface SignatureArchive {
  /** Archive format version */
  version: string;
  /** Archive creation timestamp */
  createdAt: Date;
  /** Archived signatures */
  signatures: Array<{
    id: string;
    signature: ExtendedSignedMessage;
    verification: DetailedVerificationResult;
    archivedAt: Date;
  }>;
  /** Archive metadata */
  metadata: {
    purpose: string;
    creator: string;
    totalSignatures: number;
    archiveHash: string;
  };
}

/**
 * Cryptographic key information
 */
export interface CryptographicKeyInfo {
  /** Public key in various formats */
  publicKey: {
    hex: string;
    base64: string;
    der?: string;
  };
  /** Key algorithm */
  algorithm: SignatureAlgorithm;
  /** Key length in bits */
  keyLength: number;
  /** Key creation timestamp */
  createdAt?: Date;
  /** Key expiration timestamp */
  expiresAt?: Date;
  /** Key usage restrictions */
  usage: string[];
  /** Associated wallet address */
  address?: string;
}

/**
 * Signature verification policy
 */
export interface VerificationPolicy {
  /** Policy name */
  name: string;
  /** Policy version */
  version: string;
  /** Validation rules */
  rules: SignatureValidationRules;
  /** Trust requirements */
  trust: {
    /** Trusted public keys */
    trustedKeys?: string[];
    /** Trusted addresses */
    trustedAddresses?: string[];
    /** Certificate authorities */
    certificateAuthorities?: string[];
  };
  /** Policy metadata */
  metadata: {
    description: string;
    createdAt: Date;
    createdBy: string;
    lastModified: Date;
  };
}

/**
 * Utility type for signature-related operations
 */
export type SignatureOperation = 
  | 'sign'
  | 'verify'
  | 'batch_sign'
  | 'batch_verify'
  | 'key_recovery'
  | 'archive'
  | 'validate_policy';

/**
 * Error types specific to signature operations
 */
export enum SignatureErrorType {
  InvalidSignature = 'invalid_signature',
  InvalidPublicKey = 'invalid_public_key',
  InvalidMessage = 'invalid_message',
  UnsupportedAlgorithm = 'unsupported_algorithm',
  UnsupportedEncoding = 'unsupported_encoding',
  SignatureExpired = 'signature_expired',
  SignatureNotYetValid = 'signature_not_yet_valid',
  PolicyViolation = 'policy_violation',
  CryptographicError = 'cryptographic_error',
  KeyNotFound = 'key_not_found',
  VerificationTimeout = 'verification_timeout'
}
