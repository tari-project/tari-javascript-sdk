/**
 * @fileoverview Tests for core types module
 */

import { NetworkType, LogLevel, createError, ErrorCode } from '../index';

describe('Core Types', () => {
  describe('NetworkType', () => {
    it('should have correct network values', () => {
      expect(NetworkType.Mainnet).toBe('mainnet');
      expect(NetworkType.Testnet).toBe('testnet');
      expect(NetworkType.Nextnet).toBe('nextnet');
    });

    it('should include all expected networks', () => {
      const networks = Object.values(NetworkType);
      expect(networks).toHaveLength(3);
      expect(networks).toContain('mainnet');
      expect(networks).toContain('testnet');
      expect(networks).toContain('nextnet');
    });
  });

  describe('LogLevel', () => {
    it('should have correct log level values', () => {
      expect(LogLevel.Error).toBe('error');
      expect(LogLevel.Warn).toBe('warn');
      expect(LogLevel.Info).toBe('info');
      expect(LogLevel.Debug).toBe('debug');
      expect(LogLevel.Trace).toBe('trace');
    });
  });
});

describe('Error Handling', () => {
  describe('createError', () => {
    it('should create error with correct properties', () => {
      const error = createError(ErrorCode.InvalidConfig, 'Test error', { field: 'test' });
      
      expect(error.code).toBe(ErrorCode.InvalidConfig);
      expect(error.details).toBe('Test error');
      expect(error.context).toEqual({ field: 'test' });
      expect(error.message).toContain('Invalid configuration');
    });

    it('should create error without context', () => {
      const error = createError(ErrorCode.Unknown, 'Unknown test error');
      
      expect(error.code).toBe(ErrorCode.Unknown);
      expect(error.details).toBe('Unknown test error');
      expect(error.context).toBeUndefined();
    });
  });
});
