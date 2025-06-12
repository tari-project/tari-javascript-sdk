/**
 * @fileoverview Signature verification utilities for message signatures
 * 
 * Provides comprehensive signature verification including message validation,
 * public key recovery, and cryptographic verification without requiring access
 * to the original wallet.
 */

import { 
  getFFIBindings,
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity 
} from '@tari-project/tarijs-core';
import type { 
  SignedMessage, 
  SignatureVerificationResult,
  MessageSigningOptions
} from './message-signer.js';

/**
 * Signature verification options
 */
export interface SignatureVerificationOptions {
  /** Strict verification mode (default: true) */
  strict?: boolean;
  /** Verify timestamp if present (default: true) */
  verifyTimestamp?: boolean;
  /** Maximum age for timestamp verification in milliseconds */
  maxAge?: number;
  /** Expected public key (optional) */
  expectedPublicKey?: string;
  /** Expected wallet address (optional) */
  expectedAddress?: string;
  /** Additional verification checks */
  additionalChecks?: {
    /** Verify message encoding */
    verifyEncoding?: boolean;
    /** Check signature format */
    checkSignatureFormat?: boolean;
    /** Validate metadata structure */
    validateMetadata?: boolean;
  };
}

/**
 * Signature verification context
 */
export interface VerificationContext {
  /** Signature being verified */
  signature: string;
  /** Original message */
  message: string;
  /** Public key used for signing */
  publicKey: string;
  /** Message encoding */
  encoding?: string;
  /** Timestamp when signature was created */
  timestamp?: Date;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  /** Total number of signatures verified */
  total: number;
  /** Number of valid signatures */
  valid: number;
  /** Number of invalid signatures */
  invalid: number;
  /** Individual verification results */
  results: Array<{
    index: number;
    result: SignatureVerificationResult;
    context: VerificationContext;
  }>;
  /** Summary of failures */
  failures: Array<{
    index: number;
    reason: string;
    error?: string;
  }>;
}

/**
 * Comprehensive signature verifier for Tari wallet message signatures
 * 
 * This verifier provides:
 * - Cryptographic signature verification
 * - Public key recovery and validation
 * - Timestamp and metadata verification
 * - Batch verification capabilities
 * - Detailed error reporting and diagnostics
 */
export class SignatureVerifier {
  private readonly defaultOptions: Required<SignatureVerificationOptions>;

  constructor(options: Partial<SignatureVerificationOptions> = {}) {
    this.defaultOptions = {
      strict: true,
      verifyTimestamp: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      expectedPublicKey: '',
      expectedAddress: '',
      additionalChecks: {
        verifyEncoding: true,
        checkSignatureFormat: true,
        validateMetadata: true
      },
      ...options
    };
  }

  /**
   * Verify a message signature
   */
  public async verifySignature(
    message: string,
    signature: string,
    publicKey: string,
    options: Partial<SignatureVerificationOptions> = {}
  ): Promise<SignatureVerificationResult> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Validate inputs
      this.validateVerificationInputs(message, signature, publicKey, opts);

      // Get FFI bindings for verification
      const bindings = getFFIBindings();

      // Perform cryptographic verification
      const isValid = await bindings.verifyMessageSignature(message, signature, publicKey);

      const result: SignatureVerificationResult = {
        isValid,
        publicKey,
        details: {
          signatureFormat: this.validateSignatureFormat(signature),
          messageHash: this.hashMessage(message),
          recoveredPublicKey: publicKey
        }
      };

      // Add address if verification successful
      if (isValid) {
        try {
          result.address = await bindings.publicKeyToAddress(publicKey);
        } catch (error) {
          // Address derivation failed, but signature is still valid
          console.warn('Could not derive address from public key:', error);
        }
      } else {
        result.error = 'Signature verification failed - invalid signature';
      }

      return result;

    } catch (error) {
      return {
        isValid: false,
        error: (error as Error).message,
        details: {
          signatureFormat: 'invalid_format',
          messageHash: this.hashMessage(message)
        }
      };
    }
  }

  /**
   * Verify a complete signed message object
   */
  public async verifySignedMessage(
    signedMessage: SignedMessage,
    options: Partial<SignatureVerificationOptions> = {}
  ): Promise<SignatureVerificationResult> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Basic signature verification
      const basicResult = await this.verifySignature(
        signedMessage.message,
        signedMessage.signature,
        signedMessage.publicKey,
        options
      );

      if (!basicResult.isValid) {
        return basicResult;
      }

      // Additional verifications for signed message object
      const additionalChecks = await this.performAdditionalVerifications(signedMessage, opts);
      
      if (!additionalChecks.allPassed) {
        return {
          isValid: false,
          publicKey: signedMessage.publicKey,
          error: `Additional verification failed: ${additionalChecks.failures.join(', ')}`,
          details: basicResult.details
        };
      }

      return {
        ...basicResult,
        address: signedMessage.address || basicResult.address
      };

    } catch (error) {
      return {
        isValid: false,
        error: (error as Error).message,
        details: {
          signatureFormat: 'invalid_format',
          messageHash: this.hashMessage(signedMessage.message)
        }
      };
    }
  }

  /**
   * Verify multiple signatures in batch
   */
  public async verifyBatch(
    verifications: Array<{
      message: string;
      signature: string;
      publicKey: string;
      metadata?: Record<string, any>;
    }>,
    options: Partial<SignatureVerificationOptions> = {}
  ): Promise<BatchVerificationResult> {
    const results: BatchVerificationResult['results'] = [];
    const failures: BatchVerificationResult['failures'] = [];
    let validCount = 0;

    for (let i = 0; i < verifications.length; i++) {
      const verification = verifications[i];
      
      try {
        const result = await this.verifySignature(
          verification.message,
          verification.signature,
          verification.publicKey,
          options
        );

        const context: VerificationContext = {
          signature: verification.signature,
          message: verification.message,
          publicKey: verification.publicKey,
          metadata: verification.metadata
        };

        results.push({ index: i, result, context });

        if (result.isValid) {
          validCount++;
        } else {
          failures.push({
            index: i,
            reason: 'Signature verification failed',
            error: result.error
          });
        }

      } catch (error) {
        const result: SignatureVerificationResult = {
          isValid: false,
          error: (error as Error).message
        };

        const context: VerificationContext = {
          signature: verification.signature,
          message: verification.message,
          publicKey: verification.publicKey,
          metadata: verification.metadata
        };

        results.push({ index: i, result, context });
        failures.push({
          index: i,
          reason: 'Verification error',
          error: (error as Error).message
        });
      }
    }

    return {
      total: verifications.length,
      valid: validCount,
      invalid: verifications.length - validCount,
      results,
      failures
    };
  }

  /**
   * Recover public key from signature (if supported)
   */
  public async recoverPublicKey(
    message: string,
    signature: string
  ): Promise<string | null> {
    try {
      const bindings = getFFIBindings();
      
      // Try to recover public key from signature
      // Note: This depends on the signature scheme used
      const publicKey = await bindings.recoverPublicKey(message, signature);
      return publicKey;
    } catch (error) {
      // Public key recovery not supported or failed
      return null;
    }
  }

  /**
   * Validate signature format without cryptographic verification
   */
  public validateSignatureFormat(signature: string): 'valid' | 'invalid_format' | 'invalid_length' {
    if (typeof signature !== 'string') {
      return 'invalid_format';
    }

    // Check if it's a valid hex string
    if (!/^[0-9a-fA-F]+$/.test(signature)) {
      return 'invalid_format';
    }

    // Check length (typical signature lengths)
    const expectedLengths = [128, 130, 132]; // Common signature lengths in hex
    if (!expectedLengths.includes(signature.length)) {
      return 'invalid_length';
    }

    return 'valid';
  }

  /**
   * Create verification context from signed message
   */
  public createVerificationContext(signedMessage: SignedMessage): VerificationContext {
    return {
      signature: signedMessage.signature,
      message: signedMessage.message,
      publicKey: signedMessage.publicKey,
      encoding: signedMessage.encoding,
      timestamp: signedMessage.timestamp,
      metadata: signedMessage.metadata
    };
  }

  /**
   * Get verification statistics
   */
  public getVerificationStats(): {
    defaultOptions: SignatureVerificationOptions;
    supportedSignatureFormats: string[];
    supportedEncodings: string[];
  } {
    return {
      defaultOptions: { ...this.defaultOptions },
      supportedSignatureFormats: ['hex'],
      supportedEncodings: ['utf8', 'hex', 'base64']
    };
  }

  // Private helper methods

  private validateVerificationInputs(
    message: string,
    signature: string,
    publicKey: string,
    options: SignatureVerificationOptions
  ): void {
    if (typeof message !== 'string' || message.length === 0) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Message must be a non-empty string',
        { severity: ErrorSeverity.Error }
      );
    }

    if (typeof signature !== 'string' || signature.length === 0) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Signature must be a non-empty string',
        { severity: ErrorSeverity.Error }
      );
    }

    if (typeof publicKey !== 'string' || publicKey.length === 0) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Public key must be a non-empty string',
        { severity: ErrorSeverity.Error }
      );
    }

    // Additional format validations
    if (options.additionalChecks?.checkSignatureFormat) {
      const signatureFormat = this.validateSignatureFormat(signature);
      if (signatureFormat !== 'valid') {
        throw new WalletError(
          WalletErrorCode.InvalidFormat,
          `Invalid signature format: ${signatureFormat}`,
          { severity: ErrorSeverity.Error }
        );
      }
    }

    // Check expected values if provided
    if (options.expectedPublicKey && publicKey !== options.expectedPublicKey) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Public key does not match expected value',
        { severity: ErrorSeverity.Error }
      );
    }
  }

  private async performAdditionalVerifications(
    signedMessage: SignedMessage,
    options: SignatureVerificationOptions
  ): Promise<{ allPassed: boolean; failures: string[] }> {
    const failures: string[] = [];

    // Verify timestamp if present and requested
    if (options.verifyTimestamp && signedMessage.timestamp) {
      const age = Date.now() - signedMessage.timestamp.getTime();
      if (age > options.maxAge!) {
        failures.push(`Signature too old: ${age}ms > ${options.maxAge}ms`);
      }
      if (age < 0) {
        failures.push('Signature timestamp is in the future');
      }
    }

    // Verify expected address if provided
    if (options.expectedAddress && signedMessage.address) {
      if (signedMessage.address !== options.expectedAddress) {
        failures.push('Address does not match expected value');
      }
    }

    // Validate metadata structure if requested
    if (options.additionalChecks?.validateMetadata && signedMessage.metadata) {
      try {
        JSON.stringify(signedMessage.metadata);
      } catch (error) {
        failures.push('Invalid metadata structure');
      }
    }

    // Verify encoding if requested
    if (options.additionalChecks?.verifyEncoding && signedMessage.encoding) {
      const supportedEncodings = ['utf8', 'hex', 'base64'];
      if (!supportedEncodings.includes(signedMessage.encoding)) {
        failures.push(`Unsupported encoding: ${signedMessage.encoding}`);
      }
    }

    return {
      allPassed: failures.length === 0,
      failures
    };
  }

  private hashMessage(message: string): string {
    // Simple hash for demonstration - in production use proper crypto hash
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
  }
}

/**
 * Utility function to create a signature verifier
 */
export function createSignatureVerifier(
  options?: Partial<SignatureVerificationOptions>
): SignatureVerifier {
  return new SignatureVerifier(options);
}

/**
 * Quick signature verification utility
 */
export async function quickVerify(
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    const verifier = new SignatureVerifier({ strict: false });
    const result = await verifier.verifySignature(message, signature, publicKey);
    return result.isValid;
  } catch {
    return false;
  }
}

/**
 * Verify a signed message object quickly
 */
export async function quickVerifySignedMessage(
  signedMessage: SignedMessage
): Promise<boolean> {
  try {
    const verifier = new SignatureVerifier({ strict: false });
    const result = await verifier.verifySignedMessage(signedMessage);
    return result.isValid;
  } catch {
    return false;
  }
}
