/**
 * Utility functions for formatting wallet data
 */

/**
 * Format microTari amount to human-readable Tari
 */
export function formatAmount(microTari: number): string {
  const tari = microTari / 1_000_000;
  return tari.toFixed(6);
}

/**
 * Parse human-readable Tari to microTari
 */
export function parseAmount(tari: string): number {
  const amount = parseFloat(tari);
  if (isNaN(amount) || amount < 0) {
    throw new Error('Invalid amount');
  }
  return Math.floor(amount * 1_000_000);
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, length: number = 16): string {
  if (address.length <= length) return address;
  return `${address.slice(0, length / 2)}...${address.slice(-length / 2)}`;
}

/**
 * Format timestamp to human-readable date
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Format transaction status with appropriate styling
 */
export function formatTransactionStatus(status: string): {
  text: string;
  className: string;
} {
  switch (status.toLowerCase()) {
    case 'completed':
      return { text: 'Completed', className: 'status-completed' };
    case 'pending':
      return { text: 'Pending', className: 'status-pending' };
    case 'cancelled':
      return { text: 'Cancelled', className: 'status-cancelled' };
    case 'failed':
      return { text: 'Failed', className: 'status-failed' };
    default:
      return { text: status, className: 'status-unknown' };
  }
}

/**
 * Format file size in bytes to human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format percentage with proper rounding
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return (value * 100).toFixed(decimals) + '%';
}

/**
 * Format network name for display
 */
export function formatNetworkName(network: string): string {
  switch (network.toLowerCase()) {
    case 'testnet':
      return 'Testnet';
    case 'mainnet':
      return 'Mainnet';
    case 'localnet':
      return 'Localnet';
    default:
      return network.charAt(0).toUpperCase() + network.slice(1);
  }
}

/**
 * Validate and format amount input
 */
export function validateAmountInput(input: string): {
  isValid: boolean;
  error?: string;
  formatted?: string;
} {
  if (!input || input.trim() === '') {
    return { isValid: false, error: 'Amount is required' };
  }

  const amount = parseFloat(input);
  
  if (isNaN(amount)) {
    return { isValid: false, error: 'Invalid amount format' };
  }

  if (amount <= 0) {
    return { isValid: false, error: 'Amount must be greater than 0' };
  }

  if (amount > 21_000_000) {
    return { isValid: false, error: 'Amount exceeds maximum supply' };
  }

  // Check for too many decimal places (microTari precision)
  const decimalPlaces = (input.split('.')[1] || '').length;
  if (decimalPlaces > 6) {
    return { isValid: false, error: 'Too many decimal places (max 6)' };
  }

  return {
    isValid: true,
    formatted: amount.toFixed(6)
  };
}

/**
 * Validate address format
 */
export function validateAddressFormat(address: string): {
  isValid: boolean;
  error?: string;
} {
  if (!address || address.trim() === '') {
    return { isValid: false, error: 'Address is required' };
  }

  // Basic hex validation - should be 64 characters for public key
  if (address.length !== 64) {
    return { isValid: false, error: 'Address must be 64 characters long' };
  }

  // Check if it's valid hex
  if (!/^[0-9a-fA-F]+$/.test(address)) {
    return { isValid: false, error: 'Address must be valid hexadecimal' };
  }

  return { isValid: true };
}
