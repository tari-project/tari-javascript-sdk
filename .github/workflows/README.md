# GitHub Actions Workflows

This directory contains CI/CD workflows for the Tari JavaScript SDK.

## Planned Workflows

The following workflows will be implemented in Phase 14 (CI/CD and Publishing):

### Primary Workflows

#### `ci.yml` - Continuous Integration
- **Triggers**: Push to main, pull requests
- **Matrix**: Node.js 18, 20, 22 on Ubuntu, macOS, Windows
- **Steps**:
  - Checkout code
  - Setup Node.js and cache
  - Install dependencies
  - Run linting and type checking
  - Run tests with coverage
  - Upload coverage reports

#### `build.yml` - Multi-Platform Builds
- **Triggers**: Push to main, release tags
- **Matrix**: All supported platforms and architectures
- **Steps**:
  - Setup Rust toolchain
  - Fetch Tari source code
  - Compile FFI bindings
  - Build TypeScript packages
  - Create platform-specific artifacts

#### `test.yml` - Extended Testing
- **Triggers**: Push to main, scheduled daily
- **Features**:
  - Integration tests with real Tari networks
  - Performance benchmarks
  - Memory leak detection
  - Cross-platform compatibility

#### `release.yml` - Automated Releases
- **Triggers**: Release tags (v*.*.*)
- **Features**:
  - Build all platform variants
  - Run comprehensive test suite
  - Publish to NPM with network-specific tags
  - Create GitHub releases with artifacts
  - Update documentation

### Utility Workflows

#### `dependabot-auto-merge.yml`
- Auto-merge Dependabot PRs for patch updates
- Require manual review for minor/major updates

#### `docs.yml`
- Build and deploy documentation
- Validate documentation links
- Generate API reference

#### `security.yml`
- Security vulnerability scanning
- Dependency auditing
- CodeQL analysis

## Current Implementation Status

**Phase 1 (Current)**: CI infrastructure planning and placeholder setup
**Phase 14 (Future)**: Full CI/CD implementation with:
- Multi-platform native builds
- Network-specific package publishing
- Automated testing across Tari networks
- Performance regression detection

## Workflow Configuration

### Node.js Matrix
```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
    os: [ubuntu-latest, macos-latest, windows-latest]
```

### Rust Targets
```yaml
targets:
  - x86_64-pc-windows-msvc
  - x86_64-apple-darwin
  - aarch64-apple-darwin
  - x86_64-unknown-linux-gnu
  - aarch64-unknown-linux-gnu
  - x86_64-unknown-linux-musl
```

### NPM Publishing Strategy
- **Mainnet**: `@tari-project/tarijs-wallet@latest`
- **Testnet**: `@tari-project/tarijs-wallet-testnet@testnet`
- **Nextnet**: `@tari-project/tarijs-wallet-nextnet@nextnet`

## Development

When implementing workflows in Phase 14:

1. **Start with Basic CI**: Linting, testing, TypeScript compilation
2. **Add Platform Matrix**: Multi-OS testing
3. **Implement Native Builds**: Rust FFI compilation
4. **Add Network Testing**: Integration with Tari networks
5. **Implement Publishing**: Automated NPM releases
6. **Add Security**: Vulnerability scanning and dependency auditing

## Local Testing

Test workflow logic locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Test CI workflow
act pull_request

# Test with specific event
act -e .github/workflows/test-event.json
```

## Security Considerations

- **Secrets Management**: Use GitHub secrets for NPM tokens, signing keys
- **Environment Isolation**: Separate workflows for different environments
- **Artifact Security**: Sign releases and verify checksums
- **Network Access**: Limit network access in build environments

---

**Note**: This is placeholder documentation. Actual workflows will be implemented in Phase 14 after FFI bindings and core functionality are complete.
