/**
 * @fileoverview Security-focused tests for Tauri integration
 * 
 * Tests Tauri security features, permission system, IPC validation,
 * attack resistance, and security boundary enforcement.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SecureInvoker, type SecurityConfig } from '../../packages/wallet/src/tauri/secure-invoke.js';
import { TauriAdapter } from '../../packages/wallet/src/tauri/tauri-adapter.js';
import { mockTauriRuntime, mockTauriCommands, restoreTauriRuntime } from '../mocks/tauri-mocks.js';

describe('Tauri Security Features', () => {
  let secureInvoker: SecureInvoker;
  let mockInvoke: jest.MockedFunction<any>;

  beforeEach(() => {
    const tauriMock = mockTauriRuntime();
    mockInvoke = tauriMock.invoke;
    
    secureInvoker = new SecureInvoker({
      enableValidation: true,
      enableRateLimiting: true,
      maxRequestsPerSecond: 10,
      timeout: 5000,
      allowedCommands: [
        'store_secure_data_command',
        'retrieve_secure_data_command',
        'remove_secure_data_command'
      ]
    });
  });

  afterEach(() => {
    if (secureInvoker) {
      secureInvoker.destroy();
    }
    restoreTauriRuntime();
    jest.clearAllMocks();
  });

  describe('Command Allowlisting', () => {
    test('should allow whitelisted commands', async () => {
      mockInvoke.mockResolvedValueOnce({
        success: true,
        data: 'test-response'
      });

      const result = await secureInvoker.invoke('store_secure_data_command', {
        key: 'test',
        value: [1, 2, 3]
      });

      expect(result.success).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('store_secure_data_command', {
        key: 'test',
        value: [1, 2, 3]
      });
    });

    test('should reject non-whitelisted commands', async () => {
      const result = await secureInvoker.invoke('malicious_command', {
        payload: 'dangerous'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not allowed');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    test('should handle command injection attempts', async () => {
      const maliciousCommands = [
        'store_secure_data_command; rm -rf /',
        'store_secure_data_command && cat /etc/passwd',
        'eval("malicious_code()")',
        '../../../etc/passwd'
      ];

      for (const maliciousCommand of maliciousCommands) {
        const result = await secureInvoker.invoke(maliciousCommand, {});
        expect(result.success).toBe(false);
        expect(result.error).toContain('Command not allowed');
      }

      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits per origin', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      // Perform operations beyond rate limit
      const promises = Array.from({ length: 20 }, () =>
        secureInvoker.invoke('store_secure_data_command', { key: 'test' })
      );

      const results = await Promise.all(promises);
      
      // Some operations should be rate limited
      const rateLimitedResults = results.filter(r => 
        !r.success && r.error?.includes('rate limit')
      );
      
      expect(rateLimitedResults.length).toBeGreaterThan(0);
    });

    test('should reset rate limits after time window', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      // Hit rate limit
      const rapidPromises = Array.from({ length: 15 }, () =>
        secureInvoker.invoke('store_secure_data_command', { key: 'test' })
      );

      await Promise.all(rapidPromises);
      
      // Wait for rate limit reset (1 second window)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should work again
      const result = await secureInvoker.invoke('store_secure_data_command', { key: 'test' });
      expect(result.success).toBe(true);
    });

    test('should handle distributed rate limiting correctly', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      // Create multiple invokers (simulating different contexts)
      const invokers = Array.from({ length: 3 }, () => 
        new SecureInvoker({
          enableRateLimiting: true,
          maxRequestsPerSecond: 5
        })
      );

      try {
        // Each should have independent rate limits
        const promises = invokers.map(invoker =>
          Promise.all(Array.from({ length: 5 }, () =>
            invoker.invoke('store_secure_data_command', { key: 'test' })
          ))
        );

        const results = await Promise.all(promises);
        
        // Each invoker should succeed within its limit
        results.forEach(invokerResults => {
          const successCount = invokerResults.filter(r => r.success).length;
          expect(successCount).toBeGreaterThan(0);
        });
      } finally {
        invokers.forEach(invoker => invoker.destroy());
      }
    });
  });

  describe('Payload Validation', () => {
    test('should validate payload size limits', async () => {
      const largePayload = {
        key: 'test',
        value: Array.from({ length: 100000 }, (_, i) => i % 256) // ~100KB
      };

      const result = await secureInvoker.invoke('store_secure_data_command', largePayload);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Payload too large');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    test('should sanitize dangerous payload content', async () => {
      const dangerousPayloads = [
        { key: '<script>alert("xss")</script>', value: [1, 2, 3] },
        { key: '"; DROP TABLE users; --', value: [1, 2, 3] },
        { key: 'test', value: 'function(){return eval("malicious")}' },
        { key: '../../../etc/passwd', value: [1, 2, 3] }
      ];

      mockInvoke.mockResolvedValue({ success: true });

      for (const payload of dangerousPayloads) {
        const result = await secureInvoker.invoke('store_secure_data_command', payload);
        
        if (result.success) {
          // If allowed, verify payload was sanitized
          const lastCall = mockInvoke.mock.calls[mockInvoke.mock.calls.length - 1];
          const sanitizedPayload = lastCall[1];
          
          // Key should be sanitized
          expect(sanitizedPayload.key).not.toContain('<script>');
          expect(sanitizedPayload.key).not.toContain('DROP TABLE');
          expect(sanitizedPayload.key).not.toContain('../');
        }
      }
    });

    test('should validate required payload fields', async () => {
      const invalidPayloads = [
        {},
        { key: '' },
        { value: [1, 2, 3] },
        { key: null, value: [1, 2, 3] },
        { key: 'test', value: null }
      ];

      for (const payload of invalidPayloads) {
        const result = await secureInvoker.invoke('store_secure_data_command', payload);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid payload');
      }
      
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('Error Sanitization', () => {
    test('should sanitize error messages to prevent information leakage', async () => {
      const sensitiveErrors = [
        'Database connection failed: mysql://user:password@localhost/db',
        'File not found: /home/user/.secret/private.key',
        'Network error: Internal server details...'
      ];

      for (const sensitiveError of sensitiveErrors) {
        mockInvoke.mockRejectedValueOnce(new Error(sensitiveError));
        
        const result = await secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] });
        
        expect(result.success).toBe(false);
        expect(result.error).not.toContain('password');
        expect(result.error).not.toContain('private.key');
        expect(result.error).not.toContain('Internal server');
      }
    });

    test('should maintain error context while removing sensitive details', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Storage backend error: Connection timeout'));
      
      const result = await secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage operation failed');
      expect(result.error).not.toContain('backend error');
      expect(result.error).not.toContain('Connection timeout');
    });
  });

  describe('Timeout Protection', () => {
    test('should enforce operation timeouts', async () => {
      // Mock long-running operation
      mockInvoke.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 10000)) // 10 seconds
      );

      const startTime = Date.now();
      const result = await secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(duration).toBeLessThan(6000); // Should timeout in ~5 seconds
    });

    test('should handle concurrent timeout scenarios', async () => {
      // Mock operations that timeout
      mockInvoke.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      const promises = Array.from({ length: 5 }, () =>
        secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] })
      );

      const results = await Promise.all(promises);
      
      // All should timeout
      expect(results.every(r => !r.success && r.error?.includes('timeout'))).toBe(true);
    });
  });

  describe('Permission System Integration', () => {
    test('should handle Tauri permission system correctly', async () => {
      // Mock permission denied
      mockInvoke.mockRejectedValueOnce(new Error('Permission denied: fs:write'));
      
      const result = await secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient permissions');
    });

    test('should validate permission context', async () => {
      // Mock Tauri runtime with limited permissions
      restoreTauriRuntime();
      const limitedMock = mockTauriRuntime();
      limitedMock.invoke.mockRejectedValue(new Error('Command not allowed'));
      
      const result = await secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('Attack Resistance', () => {
    test('should resist timing attacks', async () => {
      const validKey = 'valid-key-12345';
      const invalidKeys = [
        'invalid-key-123',
        'wrong-key',
        '',
        'x'.repeat(1000)
      ];

      mockInvoke.mockImplementation(async ({ key }) => {
        if (key === validKey) {
          return { success: true, data: 'valid-data' };
        }
        throw new Error('Key not found');
      });

      // Measure timing for valid and invalid keys
      const timings: { key: string; duration: number }[] = [];

      for (const key of [validKey, ...invalidKeys]) {
        const start = Date.now();
        await secureInvoker.invoke('retrieve_secure_data_command', { key });
        const duration = Date.now() - start;
        timings.push({ key, duration });
      }

      // Timing variance should be minimal (constant-time operations)
      const durations = timings.map(t => t.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance = durations.reduce((acc, d) => acc + Math.pow(d - avgDuration, 2), 0) / durations.length;
      
      // Variance should be low for timing attack resistance
      expect(variance).toBeLessThan(avgDuration * 0.5);
    });

    test('should resist replay attacks', async () => {
      const request = { key: 'test', value: [1, 2, 3] };
      
      mockInvoke.mockResolvedValue({ success: true });

      // Make initial request
      const result1 = await secureInvoker.invoke('store_secure_data_command', request);
      expect(result1.success).toBe(true);

      // Replaying the exact same request should still work (not an issue for storage operations)
      // But the secure invoker should add unique request IDs
      const result2 = await secureInvoker.invoke('store_secure_data_command', request);
      expect(result2.success).toBe(true);

      // Verify requests had different metadata
      const calls = mockInvoke.mock.calls;
      expect(calls.length).toBe(2);
      
      // Each call should have unique identifiers
      expect(calls[0][1]).not.toEqual(calls[1][1]);
    });

    test('should handle malformed Tauri responses', async () => {
      const malformedResponses = [
        null,
        undefined,
        'invalid-json',
        { malformed: true },
        { success: 'not-boolean' },
        { success: true, data: null, extra: 'injection' }
      ];

      for (const response of malformedResponses) {
        mockInvoke.mockResolvedValueOnce(response);
        
        const result = await secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] });
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid response format');
      }
    });
  });

  describe('Resource Protection', () => {
    test('should prevent resource exhaustion attacks', async () => {
      // Attempt to create many concurrent operations
      const promises = Array.from({ length: 1000 }, (_, i) =>
        secureInvoker.invoke('store_secure_data_command', { key: `test-${i}`, value: [1] })
      );

      const results = await Promise.all(promises);
      
      // Should handle gracefully without crashing
      expect(results.length).toBe(1000);
      
      // Some operations should be rejected due to resource limits
      const rejectedResults = results.filter(r => 
        !r.success && (r.error?.includes('resource limit') || r.error?.includes('rate limit'))
      );
      expect(rejectedResults.length).toBeGreaterThan(0);
    });

    test('should cleanup resources properly on destruction', async () => {
      // Create operations and then destroy
      const promises = Array.from({ length: 10 }, () =>
        secureInvoker.invoke('store_secure_data_command', { key: 'test', value: [1] })
      );

      secureInvoker.destroy();

      const results = await Promise.all(promises);
      
      // Operations should fail gracefully after destruction
      expect(results.every(r => !r.success)).toBe(true);
    });
  });
});

describe('Tauri Adapter Security', () => {
  let adapter: TauriAdapter;

  beforeEach(() => {
    mockTauriRuntime();
    
    adapter = new TauriAdapter({
      enableValidation: true,
      enableTauriOptimizations: true,
      securityLevel: 'strict'
    });
  });

  afterEach(() => {
    if (adapter) {
      adapter.destroy();
    }
    restoreTauriRuntime();
    jest.clearAllMocks();
  });

  describe('Framework Security Validation', () => {
    test('should validate Tauri runtime environment', async () => {
      const capabilities = await adapter.getCapabilities();
      
      expect(capabilities.secureStorage.available).toBe(true);
      expect(capabilities.secureStorage.level).toBe('hardware');
      expect(capabilities.framework).toBe('tauri');
    });

    test('should detect runtime tampering', async () => {
      // Mock tampered Tauri runtime
      restoreTauriRuntime();
      (global as any).window = {
        __TAURI__: {
          invoke: null, // Tampered invoke function
          version: '1.5.0'
        }
      };

      const result = await adapter.validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Tauri runtime validation failed');
    });

    test('should enforce minimum Tauri version requirements', async () => {
      // Mock old Tauri version
      restoreTauriRuntime();
      (global as any).window = {
        __TAURI__: {
          invoke: jest.fn(),
          version: '0.9.0' // Old version
        }
      };

      const result = await adapter.validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Tauri version');
    });
  });

  describe('Configuration Security', () => {
    test('should validate security configuration', async () => {
      const secureConfig = {
        enableValidation: true,
        enableTauriOptimizations: true,
        securityLevel: 'strict' as const
      };

      const storage = await adapter.createStorage(secureConfig);
      expect(storage).toBeDefined();
    });

    test('should reject insecure configurations', async () => {
      const insecureConfigs = [
        { enableValidation: false },
        { securityLevel: 'none' as any },
        { allowUnsafeOperations: true } as any
      ];

      for (const config of insecureConfigs) {
        await expect(adapter.createStorage(config)).rejects.toThrow();
      }
    });
  });

  describe('Storage Security Enforcement', () => {
    test('should enforce secure storage policies', async () => {
      const storage = await adapter.createStorage({
        enableValidation: true,
        securityLevel: 'strict'
      });

      // Storage operations should have security validations
      const testResult = await storage.test();
      expect(testResult.success).toBe(true);
    });

    test('should prevent insecure storage operations', async () => {
      const storage = await adapter.createStorage({
        enableValidation: true,
        securityLevel: 'strict'
      });

      // Attempt insecure operation (oversized data)
      const largeData = Buffer.alloc(100 * 1024 * 1024); // 100MB
      
      const result = await storage.store('test', largeData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('size limit');
    });
  });
});
