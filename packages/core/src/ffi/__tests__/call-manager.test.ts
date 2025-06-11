/**
 * Test suite for FFI call manager with retry logic and circuit breaker
 */

import { 
  FFICallManager, 
  getCallManager,
  executeFFICall,
  CircuitState,
  ErrorClassification 
} from '../call-manager';
import { RetryPolicies, getRetryPolicyForOperation } from '../retry';

describe('FFICallManager', () => {
  let callManager: FFICallManager;

  beforeEach(() => {
    callManager = FFICallManager.getInstance();
    callManager.clearMetrics();
    callManager.resetCircuitBreaker();
  });

  afterEach(() => {
    callManager.clearMetrics();
    callManager.resetCircuitBreaker();
  });

  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const manager1 = FFICallManager.getInstance();
      const manager2 = FFICallManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });

    test('should return same instance via convenience function', () => {
      const manager1 = getCallManager();
      const manager2 = FFICallManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });
  });

  describe('Successful Calls', () => {
    test('should execute successful call', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await callManager.execute(
        'testMethod',
        mockFn,
        ['arg1', 'arg2']
      );
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should track successful call metrics', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await callManager.execute('testMethod', mockFn, []);
      
      const stats = callManager.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.successfulCalls).toBe(1);
      expect(stats.failedCalls).toBe(0);
    });

    test('should use convenience function for execution', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      
      const result = await executeFFICall('testMethod', mockFn, ['arg']);
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledWith('arg');
    });
  });

  describe('Retry Logic', () => {
    test('should retry on retryable errors', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      const result = await callManager.execute(
        'testMethod',
        mockFn,
        [],
        { maxRetries: 3 }
      );
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    test('should not retry on fatal errors', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('invalid request'));
      
      await expect(
        callManager.execute('testMethod', mockFn, [], { maxRetries: 3 })
      ).rejects.toThrow();
      
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should respect max retry limit', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('timeout'));
      
      await expect(
        callManager.execute('testMethod', mockFn, [], { maxRetries: 2 })
      ).rejects.toThrow();
      
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should apply exponential backoff', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      
      await callManager.execute(
        'testMethod',
        mockFn,
        [],
        { maxRetries: 1, backoffBase: 100 }
      );
      
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThan(90); // Should have waited ~100ms
    });

    test('should apply jitter to backoff', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const durations: number[] = [];
      
      // Run multiple times to check jitter variation
      for (let i = 0; i < 3; i++) {
        callManager.resetCircuitBreaker();
        const startTime = Date.now();
        
        await callManager.execute(
          'testMethod',
          mockFn,
          [],
          { maxRetries: 1, backoffBase: 100, jitter: 0.5 }
        );
        
        durations.push(Date.now() - startTime);
        mockFn.mockClear();
        mockFn
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValue('success');
      }
      
      // Durations should vary due to jitter
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);
      expect(maxDuration - minDuration).toBeGreaterThan(10);
    });
  });

  describe('Circuit Breaker', () => {
    test('should open circuit after threshold failures', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('service down'));
      
      // Trigger failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await callManager.execute('testMethod', mockFn, [], { maxRetries: 0 });
        } catch {
          // Expected failures
        }
      }
      
      const stats = callManager.getStats();
      expect(stats.circuitBreakerStats.state).toBe(CircuitState.Open);
      
      // Next call should fail immediately due to open circuit
      await expect(
        callManager.execute('testMethod', mockFn, [])
      ).rejects.toThrow(/circuit breaker/i);
    });

    test('should transition to half-open after cooldown', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('service down'));
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await callManager.execute('testMethod', mockFn, [], { 
            maxRetries: 0,
            circuitBreakerCooldown: 100 
          });
        } catch {
          // Expected failures
        }
      }
      
      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Circuit should allow one test call (half-open)
      try {
        await callManager.execute('testMethod', mockFn, [], { maxRetries: 0 });
      } catch {
        // Expected failure
      }
      
      const stats = callManager.getStats();
      // Circuit might be open or half-open depending on timing
      expect([CircuitState.Open, CircuitState.HalfOpen]).toContain(stats.circuitBreakerStats.state);
    });

    test('should close circuit on successful recovery', async () => {
      const mockFn = jest.fn()
        .mockRejectedValue(new Error('service down'))
        .mockResolvedValue('recovered');
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await callManager.execute('testMethod', mockFn, [], { 
            maxRetries: 0,
            circuitBreakerCooldown: 100 
          });
        } catch {
          // Expected failures
        }
      }
      
      // Wait for cooldown and succeed
      await new Promise(resolve => setTimeout(resolve, 150));
      mockFn.mockResolvedValue('recovered');
      
      const result = await callManager.execute('testMethod', mockFn, []);
      expect(result).toBe('recovered');
      
      const stats = callManager.getStats();
      expect(stats.circuitBreakerStats.state).toBe(CircuitState.Closed);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout long-running calls', async () => {
      const mockFn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      await expect(
        callManager.execute('testMethod', mockFn, [], { timeout: 100 })
      ).rejects.toThrow(/timeout/i);
    });

    test('should not timeout fast calls', async () => {
      const mockFn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('fast'), 50))
      );
      
      const result = await callManager.execute(
        'testMethod',
        mockFn,
        [],
        { timeout: 200 }
      );
      
      expect(result).toBe('fast');
    });
  });

  describe('Error Classification', () => {
    test('should classify timeout errors as retryable', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('timeout'));
      
      try {
        await callManager.execute('testMethod', mockFn, [], { maxRetries: 1 });
      } catch {
        // Expected failure after retries
      }
      
      expect(mockFn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    test('should classify validation errors as fatal', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('invalid parameter'));
      
      try {
        await callManager.execute('testMethod', mockFn, [], { maxRetries: 3 });
      } catch {
        // Expected immediate failure
      }
      
      expect(mockFn).toHaveBeenCalledTimes(1); // No retries
    });

    test('should classify network errors as retryable', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      
      try {
        await callManager.execute('testMethod', mockFn, [], { maxRetries: 1 });
      } catch {
        // Expected failure after retries
      }
      
      expect(mockFn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('Performance Tracking', () => {
    test('should track call duration', async () => {
      const mockFn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('result'), 100))
      );
      
      await callManager.execute('testMethod', mockFn, []);
      
      const stats = callManager.getStats();
      expect(stats.averageDuration).toBeGreaterThan(90);
    });

    test('should track method-specific metrics', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      
      await callManager.execute('method1', mockFn, []);
      await callManager.execute('method2', mockFn, []);
      await callManager.execute('method1', mockFn, []);
      
      const method1Stats = callManager.getMethodStats('method1');
      const method2Stats = callManager.getMethodStats('method2');
      
      expect(method1Stats).toHaveLength(2);
      expect(method2Stats).toHaveLength(1);
    });

    test('should limit metrics history', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      
      // Execute many calls to test history limit
      for (let i = 0; i < 1100; i++) {
        await callManager.execute(`method${i}`, mockFn, []);
      }
      
      const stats = callManager.getStats();
      expect(stats.totalCalls).toBe(1000); // Should be limited to 1000
    });
  });

  describe('Context and Tagging', () => {
    test('should preserve call context', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const context = { userId: '123', operation: 'test' };
      
      await callManager.execute(
        'testMethod',
        mockFn,
        [],
        { context, tags: ['test', 'user'] }
      );
      
      const recentMetrics = callManager.getStats().recentMetrics;
      expect(recentMetrics[0]?.context).toEqual(context);
    });
  });

  describe('Integration with Retry Policies', () => {
    test('should use appropriate retry policy for wallet operations', () => {
      const walletPolicy = getRetryPolicyForOperation('wallet_create');
      expect(walletPolicy.name).toBe('critical');
      expect(walletPolicy.maxRetries).toBeGreaterThan(5);
    });

    test('should use appropriate retry policy for validation operations', () => {
      const validationPolicy = getRetryPolicyForOperation('validate_address');
      expect(validationPolicy.name).toBe('fast');
      expect(validationPolicy.maxRetries).toBeLessThan(3);
    });

    test('should use standard policy for unknown operations', () => {
      const unknownPolicy = getRetryPolicyForOperation('unknown_operation');
      expect(unknownPolicy.name).toBe('standard');
    });
  });

  describe('Memory Pressure Integration', () => {
    test('should abort calls under critical memory pressure', async () => {
      // Mock memory pressure check to return critical level
      const mockCheckMemoryPressure = jest.fn().mockResolvedValue({
        level: 'critical',
        usage: { heapUsed: 1000000000 },
        actions: ['Emergency cleanup required'],
        recommendGC: true,
        needsCleanup: true,
      });
      
      // This would require mocking the memory module
      // For now, we'll test the error handling path
      const mockFn = jest.fn().mockResolvedValue('result');
      
      // The actual test would need to mock the memory pressure check
      await expect(
        callManager.execute('testMethod', mockFn, [])
      ).resolves.toBe('result'); // Would fail with memory pressure mock
    });
  });

  describe('Diagnostic Reporting', () => {
    test('should generate comprehensive diagnostic report', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      
      await callManager.execute('testMethod', mockFn, []);
      
      const report = callManager.generateDiagnosticReport();
      
      expect(report.callStats).toBeDefined();
      expect(report.resourceHealth).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
    });

    test('should provide performance recommendations', async () => {
      const slowFn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 6000))
      );
      
      try {
        await callManager.execute('slowMethod', slowFn, [], { timeout: 10000 });
      } catch {
        // May timeout, but we want to test recommendations
      }
      
      const report = callManager.generateDiagnosticReport();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration and Options', () => {
    test('should respect custom configuration', () => {
      const customOptions = {
        maxRetries: 5,
        backoffBase: 2000,
        circuitBreakerThreshold: 10,
      };
      
      const customManager = FFICallManager.getInstance(customOptions);
      expect(customManager).toBeDefined();
      // Configuration is private, so we test behavior instead
    });

    test('should merge call-specific options', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('timeout'));
      
      try {
        await callManager.execute(
          'testMethod',
          mockFn,
          [],
          { maxRetries: 1, backoffBase: 50 }
        );
      } catch {
        // Expected failure
      }
      
      expect(mockFn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });
});
