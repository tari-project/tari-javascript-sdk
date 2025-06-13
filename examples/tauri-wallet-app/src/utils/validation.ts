import { z } from 'zod';

/**
 * Validation schemas using Zod for runtime type checking
 */

export const sendTransactionSchema = z.object({
  recipient: z.string()
    .min(1, 'Recipient address is required')
    .length(64, 'Address must be 64 characters long')
    .regex(/^[0-9a-fA-F]+$/, 'Address must be valid hexadecimal'),
  
  amount: z.string()
    .min(1, 'Amount is required')
    .refine((val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    }, 'Amount must be a positive number')
    .refine((val) => {
      const num = parseFloat(val);
      return num <= 21_000_000;
    }, 'Amount exceeds maximum supply')
    .refine((val) => {
      const decimalPlaces = (val.split('.')[1] || '').length;
      return decimalPlaces <= 6;
    }, 'Too many decimal places (max 6)'),
  
  message: z.string().max(500, 'Message too long (max 500 characters)').optional()
});

export const walletConfigSchema = z.object({
  network: z.enum(['testnet', 'mainnet', 'localnet'], {
    errorMap: () => ({ message: 'Network must be testnet, mainnet, or localnet' })
  }),
  
  storage_path: z.string()
    .min(1, 'Storage path is required')
    .max(255, 'Storage path too long'),
  
  log_level: z.enum(['error', 'warn', 'info', 'debug', 'trace'], {
    errorMap: () => ({ message: 'Invalid log level' })
  }),
  
  passphrase: z.string().optional()
});

export const addressSchema = z.string()
  .min(1, 'Address is required')
  .length(64, 'Address must be 64 characters long')
  .regex(/^[0-9a-fA-F]+$/, 'Address must be valid hexadecimal');

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validate send transaction form data
 */
export function validateSendTransaction(data: unknown): ValidationResult<z.infer<typeof sendTransactionSchema>> {
  try {
    const validData = sendTransactionSchema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => err.message)
      };
    }
    return {
      success: false,
      errors: ['Validation failed']
    };
  }
}

/**
 * Validate wallet configuration
 */
export function validateWalletConfig(data: unknown): ValidationResult<z.infer<typeof walletConfigSchema>> {
  try {
    const validData = walletConfigSchema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => err.message)
      };
    }
    return {
      success: false,
      errors: ['Validation failed']
    };
  }
}

/**
 * Validate address format
 */
export function validateAddress(address: unknown): ValidationResult<string> {
  try {
    const validAddress = addressSchema.parse(address);
    return { success: true, data: validAddress };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => err.message)
      };
    }
    return {
      success: false,
      errors: ['Validation failed']
    };
  }
}

/**
 * Sanitize string input for security
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
    .trim()
    .slice(0, 1000); // Limit length
}

/**
 * Validate numeric input range
 */
export function validateNumericRange(
  value: number,
  min: number,
  max: number,
  fieldName: string = 'value'
): ValidationResult<number> {
  if (isNaN(value)) {
    return {
      success: false,
      errors: [`${fieldName} must be a number`]
    };
  }

  if (value < min) {
    return {
      success: false,
      errors: [`${fieldName} must be at least ${min}`]
    };
  }

  if (value > max) {
    return {
      success: false,
      errors: [`${fieldName} must be at most ${max}`]
    };
  }

  return { success: true, data: value };
}

/**
 * Validate fee amount
 */
export function validateFee(fee: number): ValidationResult<number> {
  return validateNumericRange(fee, 1, 10000, 'Fee');
}

/**
 * Validate transaction amount in microTari
 */
export function validateTransactionAmount(amount: number): ValidationResult<number> {
  // Minimum 1 microTari, maximum 21 million Tari
  return validateNumericRange(amount, 1, 21_000_000_000_000, 'Amount');
}
