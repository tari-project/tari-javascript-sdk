# Testing Guide

> 📖 This guide provides comprehensive testing documentation for the Tari JavaScript SDK. For general contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Overview

The Tari JavaScript SDK includes a comprehensive testing suite with >90% code coverage across all packages. This guide covers everything you need to know about testing in this project.

## Quick Reference

```bash
# Run all tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests
pnpm test:integration

# Coverage report
pnpm test:coverage

# Watch mode (development)
pnpm test:watch

# Test specific package
pnpm --filter @tari/wallet test
```

## Test Categories

### 1. Unit Tests (`packages/*/src/__tests__/`)

**@tari/core Package:**
- `wrapper.test.ts` - FFI wrapper functionality
- `utils.test.ts` - Utility functions (formatTari, parseTari, validation)

**@tari/wallet Package:**
- `wallet.test.ts` - Main wallet class functionality
- `exchange/deposit-manager.test.ts` - Deposit address management
- `exchange/withdrawal-processor.test.ts` - Withdrawal queue processing

**Coverage:**
- Functions: >90%
- Lines: >90%
- Branches: >80%
- Statements: >90%

### 2. Integration Tests (`integration-tests/`)

**Exchange Simulation (`exchange-simulation.test.ts`):**
- Complete deposit flow testing
- Withdrawal processing workflows
- Balance management consistency
- Event handling verification
- Error recovery scenarios
- Performance under load

### 3. Mock Infrastructure

**Native Bindings Mock (`packages/@tari/core/src/__mocks__/bindings.ts`):**
- Complete mock implementation of native FFI functions
- Realistic data simulation
- Handle management
- Error condition testing

## Test Features

### Comprehensive Scenarios

✅ **Wallet Operations**
- Creation, connection, disconnection
- Balance retrieval and validation
- Transaction sending and monitoring
- Address generation and management
- Event emission and handling

✅ **Exchange Integration**
- Deposit address generation
- Real-time deposit monitoring
- Withdrawal queue management
- Batch processing
- Priority handling
- Retry mechanisms

✅ **Error Handling**
- Network connection failures
- Insufficient balance scenarios
- Invalid input validation
- Resource cleanup
- Graceful shutdown

✅ **Event System**
- Event listener registration
- Event emission verification
- Event cleanup on disconnect
- Multi-listener support

✅ **Resource Management**
- Handle creation and destruction
- Memory leak prevention
- Proper cleanup on exit
- Resource tracking

### Mock Capabilities

The test suite includes sophisticated mocks that simulate:

- **Wallet Creation**: Returns realistic handles
- **Balance Queries**: Configurable balance amounts
- **Transaction Sending**: Generates transaction IDs
- **Address Generation**: Creates emoji-style addresses
- **Error Conditions**: Network timeouts, invalid inputs
- **State Management**: Tracks created resources

## Example Test Usage

### Basic Unit Test
```typescript
describe('TariWallet', () => {
  let wallet: TariWallet;

  beforeEach(() => {
    wallet = new TariWallet({
      network: Network.Testnet,
      seedWords: 'test seed words',
    });
  });

  it('should connect successfully', async () => {
    await wallet.connect();
    expect(wallet.getReceiveAddress()).toBeDefined();
  });
});
```

### Integration Test
```typescript
describe('Exchange Integration', () => {
  it('should handle complete deposit flow', async () => {
    const wallet = await createExchangeWallet({...});
    const deposits = new DepositManager(wallet);
    
    const address = await deposits.generateAddress('user1');
    expect(address).toMatch(/^🎉🎨🎭🎪/);
  });
});
```

### Error Testing
```typescript
it('should handle insufficient balance', async () => {
  await expect(
    wallet.sendTransaction({
      destination: 'test',
      amount: 10000000000n, // More than available
    })
  ).rejects.toThrow('Insufficient balance');
});
```

## Test Data

### Sample Seed Words
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art
```

### Sample Addresses
```
🎉🎨🎭🎪🎯🎲🎸🎺🎻🎰🎱🎳🎮🎪🎨🎭🎯🎲🎸🎺🎻🎰🎱🎳
```

### Sample Transaction IDs
```
tx_1234567890_abc123def456
```

## Continuous Integration

### GitHub Actions
The test suite runs automatically on:
- Pull requests
- Push to main branch
- Release creation

### Test Matrix
Tests run against:
- Node.js 16, 18, 20
- Ubuntu, macOS, Windows
- Multiple TypeScript versions

### Quality Gates
- All tests must pass
- Coverage must be >90%
- No linting errors
- Build must succeed

## Writing New Tests

### Best Practices

1. **Descriptive Names**: Use clear, descriptive test names
   ```typescript
   it('should emit deposit event for incoming transaction', async () => {
   ```

2. **Arrange-Act-Assert**: Structure tests clearly
   ```typescript
   // Arrange
   const wallet = new TariWallet({...});
   
   // Act
   await wallet.connect();
   
   // Assert
   expect(wallet.isConnected()).toBe(true);
   ```

3. **Mock External Dependencies**: Don't test external services
   ```typescript
   jest.mock('@tari/core', () => ({
     ffi: mockImplementation
   }));
   ```

4. **Test Error Conditions**: Cover unhappy paths
   ```typescript
   it('should throw for invalid wallet handle', () => {
     expect(() => wrapper.getBalance(999)).toThrow('Invalid wallet handle');
   });
   ```

5. **Clean Up Resources**: Prevent test pollution
   ```typescript
   afterEach(async () => {
     if (wallet) {
       await wallet.close();
     }
   });
   ```

### Adding Package Tests

1. Create `__tests__` directory in `src/`
2. Add test files with `.test.ts` extension
3. Update `jest.config.js` if needed
4. Ensure adequate coverage

### Adding Integration Tests

1. Create test file in `integration-tests/`
2. Use realistic scenarios
3. Test complete workflows
4. Include error recovery

## Debugging Tests

### Debug Mode
```bash
# Run with debug output
DEBUG=* pnpm test

# Run specific test with debug
jest --testNamePattern="deposit flow" --verbose
```

### IDE Integration
Most IDEs support Jest debugging:
- VS Code: Install Jest extension
- WebStorm: Built-in Jest support
- Vim/Neovim: Use appropriate plugins

### Common Issues

**Tests Timing Out:**
```typescript
// Increase timeout for slow operations
jest.setTimeout(30000);
```

**Mock Not Working:**
```typescript
// Ensure mocks are in __mocks__ directory
// Use manual mocks for complex scenarios
```

**Resource Leaks:**
```typescript
// Always clean up in afterEach
afterEach(async () => {
  await cleanup();
});
```

## Performance Testing

### Load Testing
```typescript
it('should handle 100 concurrent deposit addresses', async () => {
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(deposits.generateAddress(`user${i}`));
  }
  
  const addresses = await Promise.all(promises);
  expect(addresses).toHaveLength(100);
});
```

### Memory Testing
```typescript
it('should not leak memory with many operations', async () => {
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Perform many operations
  for (let i = 0; i < 1000; i++) {
    await wallet.getBalance();
  }
  
  // Force garbage collection
  global.gc();
  
  const finalMemory = process.memoryUsage().heapUsed;
  expect(finalMemory - initialMemory).toBeLessThan(10 * 1024 * 1024); // 10MB
});
```

## Test Coverage

### Coverage Reports
```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

### Coverage Thresholds
- **Lines**: 90% minimum
- **Functions**: 80% minimum  
- **Branches**: 80% minimum
- **Statements**: 90% minimum

### Excluded from Coverage
- Type definitions (`.d.ts`)
- Index files (`index.ts`)
- Mock implementations
- Example applications

## Related Documentation

- [Contributing Guide](CONTRIBUTING.md) - General contribution guidelines
- [API Reference](docs/api-reference.md) - Complete API documentation
- [Examples](examples/) - Working code examples with tests

## Conclusion

The Tari JavaScript SDK test suite provides comprehensive coverage of all functionality, ensuring reliability and robustness for production use. The combination of unit tests, integration tests, and performance tests gives confidence in the SDK's quality and behavior.
