/**
 * @fileoverview Message signing and verification module exports
 * 
 * Comprehensive message signing system with cryptographic verification,
 * batch operations, and detailed metadata support for Tari wallet signatures.
 */

// Core signing functionality
export {
  MessageSigner,
  createMessageSigner,
  type MessageSigningOptions,
  type SignedMessage,
  type SignatureVerificationResult
} from './message-signer.js';

// Signature verification
export {
  SignatureVerifier,
  createSignatureVerifier,
  quickVerify,
  quickVerifySignedMessage,
  type SignatureVerificationOptions,
  type VerificationContext,
  type BatchVerificationResult
} from './signature-verifier.js';

// Comprehensive type system
export {
  SignatureAlgorithm,
  SignatureEncoding,
  MessageEncoding,
  VerificationStatus,
  SignatureErrorType,
  type SignatureMetadata,
  type ExtendedSignedMessage,
  type DetailedVerificationResult,
  type SigningContext,
  type BatchSigningOperation,
  type BatchSigningResult,
  type SignatureValidationRules,
  type SignatureArchive,
  type CryptographicKeyInfo,
  type VerificationPolicy,
  type SignatureOperation
} from './signature-types.js';
