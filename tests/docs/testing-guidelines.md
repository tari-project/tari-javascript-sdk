# Testing Guidelines for Tari JavaScript SDK

## Overview

This document provides comprehensive guidelines for testing in the Tari JavaScript SDK, covering best practices, patterns, and troubleshooting techniques developed through systematic test reliability improvements.

## Test Architecture

### Three-Tier Testing Strategy

1. **Unit Tests** (`jest.config.unit.js`)
   - Fast, isolated tests with comprehensive mocking
   - Focus on individual functions and components
   - Target: < 3 seconds total execution time

2. **Integration Tests** (`jest.config.integration.js`)
   - Test component interactions with limited real dependencies
   - Validate FFI integration with controlled environments
   - Target: < 30 seconds total execution time

3. **End-to-End Tests** (`jest.config.e2e.js`)
   - Full system tests with real network connections
   - Validate complete user workflows
   - Target: Test against live testnet when possible

## Mock System Guidelines

### FFI Mocking Strategy

The SDK uses a sophisticated mock system for FFI operations that provides:

- **Realistic Behavior**: Mock functions mirror real FFI behavior patterns
- **Failure Simulation**: Configurable failure modes for error path testing
- **Performance Optimization**: Test environment detection for speed
- **State Management**: Comprehensive state tracking and validation

```typescript
// Good: Proper mock usage with cleanup
test('should handle wallet operations', async () => {
  const mockBindings = getMockNativeBindings();
  
  try {
    const handle = await mockBindings.walletCreate(config);
    expect(handle).toBeValidWalletHandle();
    
    // Test operations...
  } finally {
    // Cleanup is handled automatically by test setup
  }
});
```

### Mock State Isolation

Always ensure tests don't leak state between runs:

```typescript
beforeEach(() => {
  // Module isolation
  jest.resetModules();
  
  // Mock state reset  
  jest.clearAllMocks();
  jest.restoreAllMocks();
  
  // Custom mock state reset
  resetMockNativeBindings();
  resetMockStateManager();
});

afterEach(() => {
  // Complete cleanup
  jest.resetAllMocks();
  resetMockNativeBindings();
  resetMockStateManager();
});
```

## Timer Management

### Fake Timers Best Practices

The SDK uses modern Jest fake timers for performance and reliability:

```typescript
// Good: Modern fake timers configuration
jest.useFakeTimers({ legacyFakeTimers: false });

// In test environment, latency simulation is disabled
// Operations complete via setImmediate for speed
const result = await mockOperation();
expect(result).toBeDefined();

// Cleanup
jest.useRealTimers();
```

### Async Operation Handling

For operations that involve timers or delays:

```typescript
// Good: Proper async handling
test('should handle async operations', async () => {
  const promise = mockAsyncOperation();
  
  // Don't advance timers in test environment
  // Mock automatically uses setImmediate
  const result = await promise;
  
  expect(result).toBeDefined();
});
```

## Error Testing Patterns

### Proper Error Expectations

Use Jest's native error matchers instead of custom implementations:

```typescript
// Good: Jest native error matchers
await expect(failingOperation()).rejects.toThrow();
await expect(failingOperation()).rejects.toThrow(/specific error pattern/);

// Good: Sync error handling
expect(() => syncFailingOperation()).toThrow();

// Avoid: Custom error throwing
// Don't use expect.fail() - it's not a Jest method
```

### Mock Failure Simulation

Test error paths by configuring mock failure modes:

```typescript
test('should handle failures gracefully', async () => {
  const mockBindings = getMockNativeBindings();
  mockBindings.setFailureMode(true);
  
  // Operations will now fail as expected
  await expect(mockBindings.walletCreate(config)).rejects.toThrow(/Mock.*failed/);
});
```

## Debugging Test Issues

### Common Test Failures and Solutions

#### 1. Test Timeouts

**Symptoms**: Tests exceed timeout limits (30+ seconds)
**Causes**: 
- Real timers interfering with fake timers
- Latency simulation not disabled in test environment
- Hanging async operations

**Solutions**:
```typescript
// Ensure test environment detection
if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
  // Use setImmediate instead of setTimeout
  await new Promise(resolve => setImmediate(resolve));
}

// Use reasonable test timeouts
test('operation', async () => {
  // Test logic
}, 5000); // 5 second timeout
```

#### 2. Mock State Bleeding

**Symptoms**: Tests pass individually but fail when run together
**Causes**: Shared mock state between tests

**Solutions**:
```typescript
// Use module reset for complete isolation
beforeEach(() => {
  jest.resetModules();
  resetMockNativeBindings();
});
```

#### 3. Error Expectation Failures

**Symptoms**: `expect().rejects.toThrow()` receives resolved promise
**Causes**: Mock not actually throwing errors

**Solutions**:
```typescript
// Verify mock failure mode is set correctly
const mockBindings = getMockNativeBindings();
mockBindings.setFailureMode(true);

// Test the actual operations, not the loader
await expect(mockBindings.init_logging(0)).rejects.toThrow();
```

### Debug Tools

Use the test debug infrastructure for complex issues:

```typescript
import { TestDebugger } from '../utils/test-debug-helpers';

// Enable debugging for specific tests
TestDebugger.enable();

test('complex operation', async () => {
  TestDebugger.logTimerState();
  TestDebugger.validateMockConsistency();
  
  // Test logic
  
  TestDebugger.trackAsyncOperations();
});
```

## Performance Guidelines

### Test Execution Speed

- **Unit tests**: Should complete in under 3 seconds total
- **Individual tests**: Should complete in under 100ms each
- **Mock operations**: Should be near-instantaneous in test environment

### Memory Management

- Use mock state validation to detect memory leaks
- Ensure proper cleanup in test teardown
- Monitor active handles and pending operations

```typescript
afterEach(async () => {
  // Check for memory leaks
  const leakCheck = getMockStateManager().checkForLeaks();
  if (leakCheck.hasLeaks) {
    console.warn('Memory leaks detected:', leakCheck.issues);
  }
});
```

## Custom Matchers

The SDK provides custom Jest matchers for common assertions:

```typescript
// Wallet handle validation
expect(walletHandle).toBeValidWalletHandle();

// Tari address validation  
expect(address).toBeValidTariAddress();

// Test state validation
expect().toHaveCleanTestState();
```

## Integration Testing

### FFI Integration Patterns

When testing real FFI integration:

```typescript
// Mark integration tests clearly
describe('FFI Integration', () => {
  // Skip in unit test environment
  const skipCondition = process.env.JEST_CONFIG?.includes('unit');
  
  (skipCondition ? describe.skip : describe)('real FFI operations', () => {
    test('should work with real bindings', async () => {
      // Use real FFI here
    });
  });
});
```

### Environment Detection

Tests should behave appropriately based on environment:

```typescript
// Test environment detection
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
const isUnitTest = process.env.JEST_CONFIG?.includes('unit');
const isIntegrationTest = process.env.JEST_CONFIG?.includes('integration');

if (isUnitTest) {
  // Use mocks, optimize for speed
} else if (isIntegrationTest) {
  // Use limited real dependencies
} else {
  // E2E environment - use real everything
}
```

## Troubleshooting Checklist

When tests are failing, check:

1. **Isolation**: Are tests properly isolated with `jest.resetModules()`?
2. **Timers**: Are fake timers configured correctly?
3. **Mocks**: Are mock states being reset between tests?
4. **Errors**: Are error expectations using Jest native matchers?
5. **Async**: Are all async operations properly awaited?
6. **Environment**: Is test environment detection working correctly?

## Best Practices Summary

### Do:
- Use `jest.resetModules()` for complete test isolation
- Configure modern fake timers with `{ legacyFakeTimers: false }`
- Use Jest native error matchers (`rejects.toThrow()`)
- Reset mock state between tests
- Keep tests fast with optimized mock behavior
- Use custom matchers for domain-specific assertions

### Don't:
- Use `expect.fail()` (not a Jest method)
- Rely on real timers in unit tests
- Let mock state bleed between tests  
- Create artificial delays in test environment
- Use overly complex error simulation
- Skip test cleanup in afterEach hooks

## Conclusion

These guidelines represent lessons learned from systematic test reliability improvements. Following these patterns will help maintain fast, reliable tests that properly validate SDK functionality while avoiding common pitfalls like timeouts, state bleeding, and error expectation failures.

For additional debugging, use the test debug infrastructure and refer to the mock state management tools provided in the SDK.
