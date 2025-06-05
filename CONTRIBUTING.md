# Contributing Guidelines

Thank you for your interest in contributing to the Tari JavaScript SDK! We're excited to have you join our community and help make Tari more accessible to JavaScript developers.

This SDK provides Node.js bindings for the Tari wallet FFI, enabling cryptocurrency exchanges and applications to integrate Tari without running full node infrastructure. As financial software, we must maintain high standards for security, reliability, and code quality.

These guidelines help us achieve four key goals:

1. **Maintain a secure and reliable codebase** - This is paramount for financial software
2. **Deliver high-quality code** with excellent developer experience, comprehensive documentation, and thorough testing
3. **Keep the code open** (as in free/libre software)
4. **Foster an encouraging environment** where contributing is enjoyable and rewarding

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)
- [Testing Requirements](#testing-requirements)
- [Documentation Standards](#documentation-standards)
- [Release Process](#release-process)

## Getting Started

Before contributing, please:

1. Join our [Discord](https://discord.gg/tari) and introduce yourself in the #dev channel
2. Check existing [issues](https://github.com/tari-project/tari-javascript-sdk/issues) to avoid duplicating work
3. For substantial changes, discuss your ideas with the community first
4. Review our [Code of Conduct](CODE_OF_CONDUCT.md)

## Development Setup

### Prerequisites

Ensure you have the following installed:

- Node.js 16+ (we recommend using [nvm](https://github.com/nvm-sh/nvm))
- [pnpm](https://pnpm.io/) 8+ for package management
- Rust toolchain (for native module development)
- C++ build tools for your platform

### Initial Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/tari-javascript-sdk.git
cd tari-javascript-sdk

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests to ensure everything works
pnpm test
```

### Development Workflow

This project uses a monorepo structure with three main packages:

- `@tari-project/core` - Low-level FFI bindings (Rust/Neon)
- `@tari-project/wallet` - High-level wallet API for exchanges
- `@tari-project/full` - Full protocol access including mining and P2P

When developing:

```bash
# Watch mode for TypeScript changes
pnpm dev

# Run tests for specific package
pnpm --filter @tari-project/wallet test

# Build native module
pnpm --filter @tari-project/core build:native

# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix
```

## Pull Request Process

### PR Guidelines

#### 1. PRs Do One Thing

Each PR should address a single concern:
- ✅ Fix a specific bug
- ✅ Add a single feature
- ✅ Refactor one module
- ❌ Fix multiple unrelated issues
- ❌ Add features while refactoring

If your PR does multiple things, please split it into separate PRs.

#### 2. Keep PRs Small

Aim for PRs under 400 lines of code (excluding tests and documentation):
- Easier to review thoroughly
- Faster to get merged
- Less likely to introduce bugs

For larger changes, use multiple commits to break up the work logically.

#### 3. Write Descriptive Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(wallet): add transaction retry logic

- Implements exponential backoff for failed transactions
- Adds configurable retry limits
- Includes circuit breaker pattern to prevent endless retries

This addresses issue #123 where transactions would fail silently
in poor network conditions.
```

Bad example:
```
fix stuff
```

#### 4. Update Tests and Documentation

- Add tests for new functionality
- Update existing tests if behavior changes
- Update TypeScript types
- Add/update JSDoc comments
- Update README if adding new features

### Submitting Your PR

1. **Create a feature branch**
   ```bash
   git checkout -b feat/my-awesome-feature
   ```

2. **Make your changes**
   - Follow our coding standards
   - Add comprehensive tests
   - Update documentation

3. **Run quality checks**
   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```

4. **Submit the PR**
   - Use a descriptive title following Conventional Commits
   - Fill out the PR template completely
   - Link any related issues
   - Add appropriate labels

## Code Review Guidelines

### For Contributors

Expect feedback on your PR. Our review process helps maintain code quality and security. Common feedback areas:

- **Security concerns** - Especially important for wallet operations
- **API design** - We strive for intuitive, TypeScript-first APIs
- **Performance** - Native module calls should be efficient
- **Error handling** - Financial software needs robust error handling
- **Test coverage** - Aim for >90% coverage on critical paths

### For Reviewers

When reviewing PRs:

1. **Pull and test locally** - Don't just review on GitHub
2. **Check for security issues** - This is financial software
3. **Verify test coverage** - Run `pnpm test:coverage`
4. **Review TypeScript types** - Ensure proper type safety
5. **Check documentation** - All public APIs need JSDoc

Use these labels when reviewing:
- `needs-changes` - Requires updates before merging
- `security` - Has security implications
- `breaking-change` - Changes public API
- `needs-tests` - Requires additional tests
- `needs-docs` - Requires documentation updates

## Testing Requirements

We maintain comprehensive test coverage across all packages. For detailed testing documentation, see our [Testing Guide](TESTING.md).

### Test Structure

```typescript
describe('TariWallet', () => {
  describe('sendTransaction', () => {
    it('should send transaction successfully', async () => {
      // Arrange
      const wallet = createTestWallet();
      
      // Act
      const tx = await wallet.sendTransaction({...});
      
      // Assert
      expect(tx.id).toBeDefined();
    });

    it('should handle insufficient balance', async () => {
      // Test error cases
    });
  });
});
```

### Testing Guidelines

1. **Unit Tests** - Test individual functions/methods
2. **Integration Tests** - Test package interactions
3. **Mock Native Modules** - Use mocks for FFI calls in unit tests
4. **Real Integration Tests** - Test against local Tari network when possible

### Coverage Requirements

- Overall coverage should be >80%
- Critical paths (transactions, key management) should have >95% coverage
- New code should not decrease overall coverage

### Quick Testing Commands

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch

# Test specific package
pnpm --filter @tari-project/wallet test
```

### Testing Standards

- Write tests for all new functionality
- Maintain >90% coverage on critical paths
- Include both unit and integration tests
- Test error conditions thoroughly
- See [TESTING.md](TESTING.md) for comprehensive testing guidelines

## Documentation Standards

### Code Documentation

All public APIs must have JSDoc comments:

```typescript
/**
 * Sends a transaction to the specified address
 * 
 * @param params - Transaction parameters
 * @param params.destination - Recipient's Tari address
 * @param params.amount - Amount to send in microTari
 * @param params.feePerGram - Fee per gram (optional, defaults to 5)
 * @param params.message - Optional message to include
 * 
 * @returns Promise resolving to the transaction object
 * 
 * @throws {InsufficientBalanceError} If wallet balance is too low
 * @throws {InvalidAddressError} If destination address is invalid
 * 
 * @example
 * ```typescript
 * const tx = await wallet.sendTransaction({
 *   destination: 'f2CU9ZH7cRAP...',
 *   amount: 1000000n,
 *   message: 'Payment for services'
 * });
 * ```
 */
async sendTransaction(params: SendTransactionParams): Promise<Transaction> {
  // Implementation
}
```

### Documentation Updates

When adding features, update:
1. API documentation in code
2. README.md if adding user-facing features
3. Examples if demonstrating new functionality
4. Migration guide if making breaking changes

## Release Process

We follow semantic versioning and coordinate releases with the main Tari project:

### Version Numbers

- **MAJOR**: Breaking API changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Release Branches

- `main` - Stable releases
- `develop` - Active development
- `release/x.y.z` - Release candidates

### Release Checklist

1. Update version numbers in all `package.json` files
2. Update CHANGELOG.md
3. Run full test suite
4. Build native modules for all platforms
5. Test on all supported Node.js versions
6. Create GitHub release with prebuilt binaries
7. Publish to npm

## Native Module Development

When working on the Rust/Neon code in `@tari-project/core`:

### Guidelines

1. **Memory Safety** - Let Rust handle memory management
2. **Error Handling** - Convert Rust errors to JavaScript exceptions properly
3. **Thread Safety** - Be careful with async operations
4. **Performance** - Minimize FFI boundary crossings

### Building Native Modules

```bash
# Build for current platform
pnpm --filter @tari-project/core build:native

# Build for all platforms (CI only)
pnpm --filter @tari-project/core prebuild
```

### Debugging Native Code

1. Use `console.error` in Rust for debugging
2. Enable debug symbols in `Cargo.toml`
3. Use Node.js debugging tools with native module support

## Getting Help

If you need help:

1. Check existing documentation
2. Search closed issues for similar problems
3. Ask in Discord #dev channel
4. Create an issue with:
   - Clear problem description
   - Steps to reproduce
   - Expected vs actual behavior
   - System information

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- Be respectful and constructive
- Welcome newcomers and help them get started
- Focus on what's best for the community
- Show empathy towards other community members

## Recognition

Contributors who make significant improvements will be:
- Added to the AUTHORS file
- Mentioned in release notes
- Given credit in relevant documentation

Thank you for contributing to the Tari JavaScript SDK! Your efforts help make Tari accessible to millions of JavaScript developers worldwide. 🚀