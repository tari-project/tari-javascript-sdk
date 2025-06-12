/**
 * @fileoverview Message signing implementation with wallet private key
 * 
 * Provides secure message signing using the wallet's private key with
 * proper encoding, validation, and integration with FFI bindings.
 */

import { 
  getFFIBindings,
  WalletError, 
  WalletErrorCode, 
  ErrorSeverity,
  type WalletHandle
} from '@tari-project/tarijs-core';
import { 
  ResourceManager,
  ResourceType 
} from '../lifecycle/index.js';

/**
 * Message signing options
 */
export interface MessageSigningOptions {
  /** Message encoding format (default: 'utf8') */
  encoding?: 'utf8' | 'hex' | 'base64';
  /** Include timestamp in signature metadata */
  includeTimestamp?: boolean;
  /** Include wallet address in signature metadata */
  includeAddress?: boolean;
  /** Custom metadata to include with signature */
  metadata?: Record<string, any>;
  /** Validate message before signing */
  validateMessage?: boolean;
  /** Maximum message length (default: 64KB) */
  maxMessageLength?: number;
}

/**
 * Signed message result
 */
export interface SignedMessage {
  /** Original message that was signed */
  message: string;
  /** Signature in hex format */
  signature: string;
  /** Public key used for signing in hex format */
  publicKey: string;
  /** Wallet address (if includeAddress was true) */
  address?: string;
  /** Timestamp when message was signed (if includeTimestamp was true) */
  timestamp?: Date;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Message encoding used */
  encoding: string;
}

/**
 * Signature verification result
 */
export interface SignatureVerificationResult {
  /** Whether the signature is valid */
  isValid: boolean;
  /** Public key that was used for signing */
  publicKey?: string;
  /** Wallet address associated with the public key */
  address?: string;
  /** Error message if verification failed */
  error?: string;
  /** Additional verification details */
  details?: {
    signatureFormat: 'valid' | 'invalid_format' | 'invalid_length';
    messageHash: string;
    recoveredPublicKey?: string;
  };
}

/**
 * Message signing service with comprehensive validation and error handling
 * 
 * This service provides:
 * - Secure message signing with wallet private key
 * - Multiple message encoding formats
 * - Signature metadata management
 * - Input validation and sanitization
 * - Resource management integration
 */
export class MessageSigner {
  private readonly walletHandle: WalletHandle;
  private readonly walletId: string;
  private readonly resourceManager: ResourceManager;
  private readonly defaultOptions: Required<MessageSigningOptions>;

  constructor(walletHandle: WalletHandle, walletId: string, options: Partial<MessageSigningOptions> = {}) {
    this.walletHandle = walletHandle;
    this.walletId = walletId;
    this.resourceManager = ResourceManager.getInstance();
    
    this.defaultOptions = {
      encoding: 'utf8',
      includeTimestamp: true,
      includeAddress: false,
      metadata: {},
      validateMessage: true,
      maxMessageLength: 64 * 1024, // 64KB
      ...options
    };
  }

  /**
   * Sign a message with the wallet's private key
   */
  public async signMessage(
    message: string,
    options: Partial<MessageSigningOptions> = {}
  ): Promise<SignedMessage> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Validate input message
      if (opts.validateMessage) {
        this.validateMessage(message, opts);
      }

      // Get bindings
      const bindings = getFFIBindings();

      // Encode message according to specified format
      const encodedMessage = this.encodeMessage(message, opts.encoding);

      // Sign the message using FFI
      const signature = await bindings.signMessage(this.walletHandle, encodedMessage);

      // Get public key for the signature
      const publicKey = await bindings.getPublicKey(this.walletHandle);

      // Build result object
      const result: SignedMessage = {
        message,
        signature,
        publicKey,
        encoding: opts.encoding,
        metadata: { ...opts.metadata }
      };

      // Add optional fields
      if (opts.includeTimestamp) {
        result.timestamp = new Date();
      }

      if (opts.includeAddress) {
        result.address = await bindings.getAddress(this.walletHandle);
      }

      // Touch resource to indicate usage
      this.touchResource();

      return result;

    } catch (error) {
      throw new WalletError(
        WalletErrorCode.SigningFailed,
        'Failed to sign message',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            messageLength: message.length,
            encoding: opts.encoding,
            walletId: this.walletId
          }
        }
      );
    }
  }

  /**
   * Sign multiple messages in batch
   */
  public async signMessages(
    messages: string[],
    options: Partial<MessageSigningOptions> = {}
  ): Promise<SignedMessage[]> {
    if (messages.length === 0) {
      return [];
    }

    const results: SignedMessage[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    for (let i = 0; i < messages.length; i++) {
      try {
        const signedMessage = await this.signMessage(messages[i], options);
        results.push(signedMessage);
      } catch (error) {
        errors.push({ index: i, error: error as Error });
      }
    }

    if (errors.length > 0) {
      throw new WalletError(
        WalletErrorCode.SigningFailed,
        `Failed to sign ${errors.length}/${messages.length} messages`,
        {
          severity: ErrorSeverity.Error,
          context: {
            totalMessages: messages.length,
            failedMessages: errors.length,
            errors: errors.map(e => ({ index: e.index, message: e.error.message }))
          }
        }
      );
    }

    return results;
  }

  /**
   * Get the public key for this wallet
   */
  public async getPublicKey(): Promise<string> {
    try {
      const bindings = getFFIBindings();
      const publicKey = await bindings.getPublicKey(this.walletHandle);
      this.touchResource();
      return publicKey;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to get wallet public key',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { walletId: this.walletId }
        }
      );
    }
  }

  /**
   * Get the wallet address for verification
   */
  public async getWalletAddress(): Promise<string> {
    try {
      const bindings = getFFIBindings();
      const address = await bindings.getAddress(this.walletHandle);
      this.touchResource();
      return address;
    } catch (error) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to get wallet address',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: { walletId: this.walletId }
        }
      );
    }
  }

  /**
   * Create a signature object for external verification
   */
  public async createSignatureObject(
    message: string,
    options: Partial<MessageSigningOptions> = {}
  ): Promise<{
    message: string;
    signature: string;
    publicKey: string;
    address: string;
    timestamp: string;
    metadata?: Record<string, any>;
  }> {
    const signedMessage = await this.signMessage(message, {
      ...options,
      includeAddress: true,
      includeTimestamp: true
    });

    return {
      message: signedMessage.message,
      signature: signedMessage.signature,
      publicKey: signedMessage.publicKey,
      address: signedMessage.address!,
      timestamp: signedMessage.timestamp!.toISOString(),
      metadata: signedMessage.metadata
    };
  }

  /**
   * Validate signing capabilities
   */
  public async validateSigningCapability(): Promise<{
    canSign: boolean;
    hasPrivateKey: boolean;
    hasPublicKey: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    let hasPrivateKey = false;
    let hasPublicKey = false;

    try {
      // Try to get public key
      await this.getPublicKey();
      hasPublicKey = true;
    } catch (error) {
      issues.push('Cannot access wallet public key');
    }

    try {
      // Try to sign a test message
      await this.signMessage('test', { validateMessage: false });
      hasPrivateKey = true;
    } catch (error) {
      issues.push('Cannot access wallet private key for signing');
    }

    return {
      canSign: hasPrivateKey && hasPublicKey,
      hasPrivateKey,
      hasPublicKey,
      issues
    };
  }

  /**
   * Get signing statistics
   */
  public getSigningStats(): {
    walletId: string;
    defaultOptions: MessageSigningOptions;
    resourceManagerStats: any;
  } {
    return {
      walletId: this.walletId,
      defaultOptions: { ...this.defaultOptions },
      resourceManagerStats: this.resourceManager.getStats()
    };
  }

  // Private helper methods

  private validateMessage(message: string, options: MessageSigningOptions): void {
    if (typeof message !== 'string') {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Message must be a string',
        { severity: ErrorSeverity.Error }
      );
    }

    if (message.length === 0) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Message cannot be empty',
        { severity: ErrorSeverity.Error }
      );
    }

    if (message.length > options.maxMessageLength!) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        `Message too long: ${message.length} > ${options.maxMessageLength} bytes`,
        { severity: ErrorSeverity.Error }
      );
    }

    // Check for control characters that might cause issues
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(message)) {
      throw new WalletError(
        WalletErrorCode.InvalidFormat,
        'Message contains invalid control characters',
        { severity: ErrorSeverity.Warning }
      );
    }
  }

  private encodeMessage(message: string, encoding: string): string {
    switch (encoding) {
      case 'utf8':
        return message;
      case 'hex':
        return Buffer.from(message, 'utf8').toString('hex');
      case 'base64':
        return Buffer.from(message, 'utf8').toString('base64');
      default:
        throw new WalletError(
          WalletErrorCode.InvalidFormat,
          `Unsupported encoding: ${encoding}`,
          { severity: ErrorSeverity.Error }
        );
    }
  }

  private touchResource(): void {
    // Find our wallet resource and touch it to indicate usage
    const stats = this.resourceManager.getStats();
    // This is a simplified approach - in a real implementation we'd need
    // to track the resource ID when the wallet is created
    if (stats.totalResources > 0) {
      // Resource manager will handle the touch internally
    }
  }
}

/**
 * Utility function to create a message signer
 */
export function createMessageSigner(
  walletHandle: WalletHandle,
  walletId: string,
  options?: Partial<MessageSigningOptions>
): MessageSigner {
  return new MessageSigner(walletHandle, walletId, options);
}
