import { 
  formatBalance, 
  parseBalance, 
  validateSeedWords, 
  validateEmojiId,
  mapErrorCode
} from '../utils';
import { TariErrorCode } from '../types';

describe('Utils', () => {
  describe('formatBalance', () => {
    it('should format microTari to human readable', () => {
      expect(formatBalance(1000000n)).toBe('1');
      expect(formatBalance(1500000n)).toBe('1.5');
      expect(formatBalance(0n)).toBe('0');
    });

    it('should handle large amounts', () => {
      expect(formatBalance(1234567890123456n)).toBe('1234567890.123456');
    });

    it('should handle custom decimal places', () => {
      expect(formatBalance(1000000n, 2)).toBe('10000');
      expect(formatBalance(1230000n, 1)).toBe('123000');
    });

    it('should remove trailing zeros', () => {
      expect(formatBalance(1000000n)).toBe('1');
      expect(formatBalance(1500000n)).toBe('1.5');
    });
  });

  describe('parseBalance', () => {
    it('should parse balance string to microTari', () => {
      expect(parseBalance('1.000000')).toBe(1000000n);
      expect(parseBalance('1.5')).toBe(1500000n);
      expect(parseBalance('0')).toBe(0n);
    });

    it('should handle various formats', () => {
      expect(parseBalance('1')).toBe(1000000n);
      expect(parseBalance('0.001')).toBe(1000n);
      expect(parseBalance('1234567890.123456')).toBe(1234567890123456n);
    });

    it('should throw for invalid format', () => {
      expect(() => parseBalance('invalid')).toThrow('Invalid balance string');
      expect(() => parseBalance('')).toThrow('Invalid balance string');
      expect(() => parseBalance('1.2.3')).toThrow('Invalid balance format');
    });

    it('should throw for too many decimal places', () => {
      expect(() => parseBalance('1.1234567')).toThrow('Invalid balance string');
    });
  });

  describe('validateSeedWords', () => {
    it('should validate correct seed word lengths', () => {
      const words12 = Array(12).fill('abandon').join(' ');
      const words24 = Array(24).fill('abandon').join(' ');
      
      expect(validateSeedWords(words12)).toBe(true);
      expect(validateSeedWords(words24)).toBe(true);
    });

    it('should reject invalid word counts', () => {
      const words11 = Array(11).fill('abandon').join(' ');
      const words25 = Array(25).fill('abandon').join(' ');
      
      expect(validateSeedWords(words11)).toBe(false);
      expect(validateSeedWords(words25)).toBe(false);
    });

    it('should reject empty or invalid input', () => {
      expect(validateSeedWords('')).toBe(false);
      expect(validateSeedWords('   ')).toBe(false);
      expect(validateSeedWords(null as any)).toBe(false);
      expect(validateSeedWords(undefined as any)).toBe(false);
    });

    it('should handle extra whitespace', () => {
      const words = '  abandon   abandon   abandon  ';
      expect(validateSeedWords(words)).toBe(false); // Only 3 words
    });
  });

  describe('validateEmojiId', () => {
    it('should validate emoji addresses', () => {
      // Note: This is a basic test - real validation would be more complex
      expect(validateEmojiId('🎉🎨🎭🎪🎯🎲🎸🎺')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(validateEmojiId('')).toBe(false);
      expect(validateEmojiId('not_emoji')).toBe(false);
      expect(validateEmojiId('123456789')).toBe(false);
      expect(validateEmojiId(null as any)).toBe(false);
    });
  });

  describe('mapErrorCode', () => {
    it('should map known error codes', () => {
      const result = mapErrorCode(TariErrorCode.InvalidArgument);
      expect(result.code).toBe(TariErrorCode.InvalidArgument);
      expect(result.message).toContain('Invalid argument');
    });

    it('should map success code', () => {
      const result = mapErrorCode(TariErrorCode.Success);
      expect(result.code).toBe(TariErrorCode.Success);
      expect(result.message).toContain('Success');
    });

    it('should handle unknown error codes', () => {
      const result = mapErrorCode(999999);
      expect(result.code).toBe(TariErrorCode.UnknownError);
      expect(result.message).toContain('Unknown error');
    });

    it('should map all defined error codes', () => {
      const errorCodes = [
        TariErrorCode.InvalidArgument,
        TariErrorCode.NetworkError,
        TariErrorCode.InsufficientBalance,
        TariErrorCode.TransactionError,
        TariErrorCode.DatabaseError,
        TariErrorCode.KeyError,
        TariErrorCode.AddressError
      ];

      errorCodes.forEach(code => {
        const result = mapErrorCode(code);
        expect(result.code).toBe(code);
        expect(result.message).toBeTruthy();
        expect(typeof result.message).toBe('string');
      });
    });
  });
});
