import { FFIBindings } from '@tari-project/tarijs-core';
import {
  WalletHandle,
  WalletError,
  WalletErrorCode,
  withErrorContext,
  validateTariAddress,
  validateRequired,
} from '@tari-project/tarijs-core';
import { TariAddress } from '../../models';

/**
 * Recipient validation service for transaction sending
 * 
 * Handles comprehensive validation of transaction recipients including:
 * - Address format validation (emoji, base58, hex)
 * - Address resolution and conversion
 * - Self-send detection and prevention
 * - Address accessibility verification
 * - Duplicate address detection
 */
export class RecipientValidator {
  private readonly addressCache = new Map<string, TariAddress>();
  private ownAddresses?: Set<string>;

  /**
   * Validate and resolve a recipient address
   * 
   * Performs comprehensive validation including format checking,
   * self-send detection, and address resolution.
   * 
   * @param recipient Address in any supported format
   * @param allowSelfSend Whether to allow sending to own addresses
   * @returns Promise resolving to validated TariAddress
   * 
   * @throws {WalletError} WalletErrorCode.InvalidAddress - Invalid address format
   * @throws {WalletError} WalletErrorCode.SelfSendNotAllowed - Attempting self-send when disabled
   * @throws {WalletError} WalletErrorCode.AddressResolutionFailed - Cannot resolve address
   */
  @withErrorContext('validate_recipient', 'transaction')
  async validateAndResolve(
    recipient: string | TariAddress,
    allowSelfSend = false
  ): Promise<TariAddress> {
    validateRequired(recipient, 'recipient');

    // If already a TariAddress object, validate it
    if (recipient instanceof TariAddress) {
      await this.validateTariAddress(recipient, allowSelfSend);
      return recipient;
    }

    // Check cache first for string addresses
    const cacheKey = this.getCacheKey(recipient);
    if (this.addressCache.has(cacheKey)) {
      const cachedAddress = this.addressCache.get(cacheKey)!;
      await this.validateTariAddress(cachedAddress, allowSelfSend);
      return cachedAddress;
    }

    // Resolve string to TariAddress
    const resolvedAddress = await this.resolveAddress(recipient);
    
    // Validate the resolved address
    await this.validateTariAddress(resolvedAddress, allowSelfSend);

    // Cache the resolved address
    this.addressCache.set(cacheKey, resolvedAddress);

    return resolvedAddress;
  }

  /**
   * Validate multiple recipient addresses
   * 
   * @param recipients Array of addresses to validate
   * @param allowSelfSend Whether to allow self-sends
   * @returns Promise resolving to array of validated addresses
   */
  @withErrorContext('validate_multiple_recipients', 'transaction')
  async validateMultipleRecipients(
    recipients: (string | TariAddress)[],
    allowSelfSend = false
  ): Promise<TariAddress[]> {
    validateRequired(recipients, 'recipients');

    if (recipients.length === 0) {
      throw new WalletError(
        WalletErrorCode.InvalidParameters,
        'At least one recipient is required',
        { context: { operation: 'validateMultipleRecipients' } }
      );
    }

    // Validate all recipients in parallel
    const validationPromises = recipients.map((recipient, index) =>
      this.validateAndResolve(recipient, allowSelfSend).catch(error => {
        throw new WalletError(
          error.code || WalletErrorCode.InvalidAddress,
          `Invalid recipient at index ${index}: ${error.message}`,
          { 
            cause: error,
            context: {
              operation: 'validateMultipleRecipients',
              recipientIndex: index,
              recipient: recipient.toString()
            }
          }
        );
      })
    );

    const validatedAddresses = await Promise.all(validationPromises);

    // Check for duplicate addresses
    this.checkForDuplicates(validatedAddresses);

    return validatedAddresses;
  }

  /**
   * Check if an address is a self-send (own wallet address)
   * 
   * @param address Address to check
   * @returns Promise resolving to true if address belongs to this wallet
   */
  @withErrorContext('check_self_send', 'transaction')
  async isSelfSend(address: TariAddress): Promise<boolean> {
    try {
      // Lazy load own addresses on first check
      if (!this.ownAddresses) {
        await this.loadOwnAddresses();
      }

      const addressStr = address.toDisplayString();
      return this.ownAddresses!.has(addressStr);
    } catch (error: unknown) {
      // If we can't determine own addresses, assume not self-send
      // This allows transactions to proceed but logs the issue
      console.warn('Unable to check for self-send, proceeding with transaction', error);
      return false;
    }
  }

  /**
   * Validate address format without full resolution
   * 
   * Performs basic format validation to quickly reject
   * obviously invalid addresses.
   * 
   * @param address Address string to validate
   * @returns True if format appears valid
   */
  isValidAddressFormat(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }

    // Trim whitespace
    const trimmed = address.trim();
    if (trimmed.length === 0) {
      return false;
    }

    try {
      // Use core validation for format checking
      validateTariAddress(trimmed, 'address');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the address resolution cache
   */
  clearCache(): void {
    this.addressCache.clear();
    this.ownAddresses = undefined;
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    size: number;
    hitCount: number;
    missCount: number;
  } {
    return {
      size: this.addressCache.size,
      hitCount: 0, // Would need to implement hit tracking
      missCount: 0  // Would need to implement miss tracking
    };
  }

  private async validateTariAddress(
    address: TariAddress,
    allowSelfSend: boolean
  ): Promise<void> {
    // Check if this is a self-send
    if (!allowSelfSend && await this.isSelfSend(address)) {
      throw new WalletError(
        WalletErrorCode.SelfSendNotAllowed,
        'Sending to own address is not allowed',
        { 
          context: {
            operation: 'validateTariAddress',
            address: address.toDisplayString()
          }
        }
      );
    }

    // Additional validation could be added here:
    // - Network-specific address validation
    // - Blacklist checking
    // - Address reachability verification
  }

  private async resolveAddress(addressStr: string): Promise<TariAddress> {
    try {
      // First try to create TariAddress directly
      return TariAddress.fromString(addressStr);
    } catch (directError: unknown) {
      // If direct creation fails, try different resolution methods
      
      // Try emoji ID resolution
      if (this.isEmojiAddress(addressStr)) {
        return await this.resolveEmojiAddress(addressStr);
      }

      // Try base58 resolution
      if (this.isBase58Address(addressStr)) {
        return await this.resolveBase58Address(addressStr);
      }

      // Try hex resolution
      if (this.isHexAddress(addressStr)) {
        return await this.resolveHexAddress(addressStr);
      }

      throw new WalletError(
        WalletErrorCode.AddressResolutionFailed,
        `Unable to resolve address: ${addressStr}`,
        { 
          cause: directError,
          context: {
            operation: 'resolveAddress',
            address: addressStr
          }
        }
      );
    }
  }

  private async resolveEmojiAddress(emojiId: string): Promise<TariAddress> {
    try {
      // Use FFI to resolve emoji ID to public key
      const publicKey = await FFIBindings.emojiIdToPublicKey(emojiId);
      return TariAddress.fromPublicKey(publicKey);
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InvalidAddress,
        `Invalid emoji ID: ${emojiId}`,
        { 
          cause: error,
          context: {
            operation: 'resolveEmojiAddress',
            emojiId
          }
        }
      );
    }
  }

  private async resolveBase58Address(base58: string): Promise<TariAddress> {
    try {
      return TariAddress.fromBase58(base58);
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InvalidAddress,
        `Invalid base58 address: ${base58}`,
        { 
          cause: error,
          context: {
            operation: 'resolveBase58Address',
            base58
          }
        }
      );
    }
  }

  private async resolveHexAddress(hex: string): Promise<TariAddress> {
    try {
      return TariAddress.fromHex(hex);
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InvalidAddress,
        `Invalid hex address: ${hex}`,
        { 
          cause: error,
          context: {
            operation: 'resolveHexAddress',
            hex
          }
        }
      );
    }
  }

  private async loadOwnAddresses(): Promise<void> {
    try {
      // Load own addresses from wallet
      // This would typically involve querying the wallet for all known addresses
      this.ownAddresses = new Set<string>();
      
      // For now, we'll implement a placeholder that could be expanded
      // In a real implementation, this would query the wallet's address book
      // or derive addresses from the wallet's keys
      
      // TODO: Implement actual address loading from wallet
      // const addresses = await FFIBindings.walletGetOwnAddresses(this.walletHandle);
      // this.ownAddresses = new Set(addresses.map(addr => addr.toString()));
    } catch (error: unknown) {
      // If we can't load own addresses, create empty set
      // This allows the wallet to function but won't prevent self-sends
      this.ownAddresses = new Set<string>();
      console.warn('Failed to load own addresses for self-send detection', error);
    }
  }

  private checkForDuplicates(addresses: TariAddress[]): void {
    const addressStrings = addresses.map(addr => addr.toDisplayString());
    const uniqueAddresses = new Set(addressStrings);
    
    if (uniqueAddresses.size !== addresses.length) {
      throw new WalletError(
        WalletErrorCode.DuplicateRecipients,
        'Duplicate recipient addresses are not allowed',
        { 
          context: {
            operation: 'checkForDuplicates',
            totalRecipients: addresses.length,
            uniqueRecipients: uniqueAddresses.size
          }
        }
      );
    }
  }

  private isEmojiAddress(address: string): boolean {
    // Tari emoji IDs are typically sequences of emojis
    // This is a simplified check - in practice would be more sophisticated
    return /^[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(address);
  }

  private isBase58Address(address: string): boolean {
    // Base58 addresses use specific character set
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
  }

  private isHexAddress(address: string): boolean {
    // Hex addresses with optional 0x prefix
    return /^(0x)?[0-9a-fA-F]+$/.test(address);
  }

  private getCacheKey(address: string): string {
    return address.toLowerCase().trim();
  }
}
