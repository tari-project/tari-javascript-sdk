# Contributing to Tari JavaScript SDK

Thank you for your interest in contributing to the Tari JavaScript SDK! This document provides guidelines and information for contributors.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Commit Guidelines](#commit-guidelines)
- [Issue Reporting](#issue-reporting)

## Development Setup

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher
- **Git**: Latest version
- **Rust**: 1.70.0 or higher (for FFI development)

### Initial Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/tari-javascript-sdk.git
   cd tari-javascript-sdk
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Verify Setup**
   ```bash
   npm run build
   npm test
   npm run lint
   ```

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Follow the code style guidelines
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   npm run build        # Ensure everything compiles
   npm test             # Run all tests
   npm run lint         # Check code style
   npm run typecheck    # Verify TypeScript types
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -S -m "Add descriptive commit message"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Project Structure

### Monorepo Layout

```
tari-javascript-sdk/
├── packages/
│   ├── core/           # Core FFI bindings and utilities
│   │   ├── src/
│   │   │   ├── types/     # Type definitions
│   │   │   ├── errors/    # Error handling
│   │   │   └── utils/     # Utility functions
│   │   └── package.json
│   ├── wallet/         # High-level wallet API
│   │   ├── src/
│   │   │   ├── types/     # Wallet-specific types
│   │   │   ├── models/    # Domain models
│   │   │   └── wallet/    # Main wallet class
│   │   └── package.json
│   └── build/          # Build utilities (private)
├── scripts/            # Development scripts
├── docs/              # Documentation
└── native/            # Rust FFI workspace (future)
```

### Package Dependencies

- `core`: No internal dependencies
- `wallet`: Depends on `core`
- `build`: Depends on `core`

## Code Style

### TypeScript Guidelines

- **Strict Mode**: All code must pass TypeScript strict mode
- **Explicit Types**: Prefer explicit return types for public APIs
- **ESLint**: Follow the configured ESLint rules
- **Prettier**: Code must be formatted with Prettier

### Naming Conventions

- **Variables/Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Files**: `kebab-case.ts` or `PascalCase.ts` for classes
- **Packages**: `@tari-project/tarijs-*`

### Code Organization

- **Exports**: Use named exports, avoid default exports
- **Imports**: Group and sort imports (external, internal, relative)
- **Error Handling**: Use custom error types with proper error codes
- **Documentation**: Add JSDoc comments for public APIs

### Example Code Style

```typescript
/**
 * Represents a Tari wallet transaction
 */
export class Transaction {
  private readonly id: TransactionId;
  private readonly amount: bigint;

  constructor(id: TransactionId, amount: bigint) {
    this.validateAmount(amount);
    this.id = id;
    this.amount = amount;
  }

  /**
   * Get the transaction amount in microTari
   */
  getAmount(): bigint {
    return this.amount;
  }

  private validateAmount(amount: bigint): void {
    if (amount <= 0n) {
      throw new TariError(
        ErrorCode.InvalidAmount,
        'Transaction amount must be positive'
      );
    }
  }
}
```

## Testing

### Test Requirements

- **Coverage**: Minimum 80% code coverage
- **Unit Tests**: All public APIs must have unit tests
- **Integration Tests**: Test cross-package interactions
- **Type Tests**: Verify TypeScript types work correctly

### Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test data';
      
      // Act
      const result = component.methodName(input);
      
      // Assert
      expect(result).toBe('expected output');
    });

    it('should throw error for invalid input', () => {
      expect(() => component.methodName(null)).toThrow('Expected error message');
    });
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Specific package
npm test --workspace=packages/core

# With coverage
npm run test:ci

# Watch mode
npm test -- --watch
```

## Pull Request Process

### Before Submitting

1. **Code Quality**
   - [ ] All tests pass
   - [ ] Code coverage meets requirements
   - [ ] No linting errors
   - [ ] TypeScript compiles without errors

2. **Documentation**
   - [ ] Public APIs are documented
   - [ ] README updated if needed
   - [ ] Breaking changes noted

3. **Testing**
   - [ ] New features have tests
   - [ ] Edge cases are covered
   - [ ] Manual testing completed

### PR Template

When creating a PR, please include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings introduced
```

### Review Process

1. **Automated Checks**: All CI checks must pass
2. **Code Review**: At least one maintainer review required
3. **Testing**: Verify tests cover new functionality
4. **Documentation**: Ensure public APIs are documented

## Commit Guidelines

### Commit Message Format

```
<type>: <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or modifications
- `build`: Build system changes
- `ci`: CI configuration changes

### Examples

```bash
feat: add transaction validation to wallet API

fix: resolve memory leak in FFI resource cleanup

docs: update README with new installation instructions

test: add comprehensive tests for TariAddress class
```

### Commit Signing

All commits must be signed:

```bash
git commit -S -m "Your commit message"
```

## Issue Reporting

### Bug Reports

Please include:

- **Environment**: Node.js version, OS, package versions
- **Steps to Reproduce**: Clear steps to reproduce the issue
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Code Sample**: Minimal example demonstrating the issue

### Feature Requests

Please include:

- **Use Case**: Why is this feature needed?
- **Proposed Solution**: How should it work?
- **Alternatives**: Other solutions considered
- **Examples**: Code examples if applicable

### Issue Labels

- `bug`: Something isn't working
- `feature`: New functionality request
- `documentation`: Documentation improvements
- `good first issue`: Suitable for newcomers
- `help wanted`: Extra attention needed

## Development Phases

The SDK is developed in phases. Current status:

- ✅ **Phase 1**: Project foundation and TypeScript setup
- 🚧 **Phase 2**: Rust FFI build system (next)
- ⏳ **Phase 3-14**: FFI bindings, wallet API, testing, etc.

See the [Architecture Overview](docs/README.md) for detailed phase information.

## Questions and Support

- **Development Questions**: Create a GitHub issue
- **General Support**: Join our Discord community
- **Security Issues**: Email security@tari.com

## License

By contributing, you agree that your contributions will be licensed under the BSD-3-Clause License.

---

Thank you for contributing to the Tari JavaScript SDK! 🚀
