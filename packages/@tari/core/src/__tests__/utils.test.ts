import { formatTari, parseTari, validateAddress, generateSeedWords } from '../utils';

describe('Utils', () => {
  describe('formatTari', () => {
    it('should format microTari to human readable', () => {
      expect(formatTari(1000000n)).toBe('1.000000 XTR');
      expect(formatTari(1500000n)).toBe('1.500000 XTR');
      expect(formatTari(0n)).toBe('0.000000 XTR');
    });

    it('should handle large amounts', () => {
      expect(formatTari(1234567890123456n)).toBe('1234567890.123456 XTR');
    });

    it('should handle decimal option', () => {
      expect(formatTari(1000000n, 2)).toBe('1.00 XTR');
      expect(formatTari(1230000n, 1)).toBe('1.2 XTR');
    });
  });

  describe('parseTari', () => {
    it('should parse XTR string to microTari', () => {
      expect(parseTari('1.000000')).toBe(1000000n);
      expect(parseTari('1.5')).toBe(1500000n);
      expect(parseTari('0')).toBe(0n);
    });

    it('should handle various formats', () => {
      expect(parseTari('1')).toBe(1000000n);
      expect(parseTari('0.001')).toBe(1000n);
      expect(parseTari('1234567890.123456')).toBe(1234567890123456n);
    });

    it('should throw for invalid format', () => {
      expect(() => parseTari('invalid')).toThrow('Invalid Tari amount format');
      expect(() => parseTari('')).toThrow('Invalid Tari amount format');
      expect(() => parseTari('1.2.3')).toThrow('Invalid Tari amount format');
    });
  });

  describe('validateAddress', () => {
    it('should validate emoji addresses', () => {
      expect(validateAddress('🎉🎨🎭🎪🎯🎲🎸🎺')).toBe(true);
      expect(validateAddress('🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(validateAddress('')).toBe(false);
      expect(validateAddress('not_emoji')).toBe(false);
      expect(validateAddress('123456789')).toBe(false);
      expect(validateAddress('🎉')).toBe(false); // Too short
    });

    it('should handle hex addresses', () => {
      const hexAddress = '1234567890abcdef1234567890abcdef12345678';
      expect(validateAddress(hexAddress)).toBe(true);
      
      expect(validateAddress('invalid_hex')).toBe(false);
      expect(validateAddress('123')).toBe(false); // Too short
    });
  });

  describe('generateSeedWords', () => {
    it('should generate 24 words by default', () => {
      const words = generateSeedWords();
      expect(words.split(' ')).toHaveLength(24);
    });

    it('should generate specified number of words', () => {
      const words12 = generateSeedWords(12);
      expect(words12.split(' ')).toHaveLength(12);
      
      const words15 = generateSeedWords(15);
      expect(words15.split(' ')).toHaveLength(15);
    });

    it('should generate unique words each time', () => {
      const words1 = generateSeedWords();
      const words2 = generateSeedWords();
      expect(words1).not.toBe(words2);
    });

    it('should throw for invalid word count', () => {
      expect(() => generateSeedWords(11)).toThrow('Invalid word count');
      expect(() => generateSeedWords(25)).toThrow('Invalid word count');
    });
  });
});
