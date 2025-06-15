#!/bin/bash

# Tari Source Setup Script
# This script sets up the Tari source code for FFI compilation

set -euo pipefail

# Configuration
DEFAULT_VERSION="4.3.1"
DEFAULT_NETWORK="mainnet"
CACHE_DIR=".tari-cache"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Tari Source Setup Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -v, --version VERSION    Tari version to fetch (default: $DEFAULT_VERSION)
    -n, --network NETWORK    Network type: mainnet, testnet, nextnet (default: $DEFAULT_NETWORK)
    -f, --force             Force re-fetch even if cached
    -c, --cache-dir DIR     Cache directory (default: $CACHE_DIR)
    -h, --help              Show this help message

EXAMPLES:
    $0                                    # Fetch mainnet v$DEFAULT_VERSION
    $0 -v 4.3.0 -n testnet              # Fetch testnet v4.3.0-pre.0
    $0 --force                           # Force re-fetch current version
    $0 -v 4.2.1 -n nextnet -f          # Force fetch nextnet v4.2.1-rc.0

ENVIRONMENT VARIABLES:
    TARI_VERSION        Override default version
    NETWORK_TYPE        Override default network
    TARI_CACHE_DIR      Override default cache directory
    FORCE_REFETCH       Set to any value to force re-fetch

EOF
}

# Parse command line arguments
TARI_VERSION="${TARI_VERSION:-$DEFAULT_VERSION}"
NETWORK_TYPE="${NETWORK_TYPE:-$DEFAULT_NETWORK}"
CACHE_DIR="${TARI_CACHE_DIR:-$CACHE_DIR}"
FORCE_REFETCH="${FORCE_REFETCH:-}"

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            TARI_VERSION="$2"
            shift 2
            ;;
        -n|--network)
            NETWORK_TYPE="$2"
            shift 2
            ;;
        -f|--force)
            FORCE_REFETCH="true"
            shift
            ;;
        -c|--cache-dir)
            CACHE_DIR="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate network type
case "$NETWORK_TYPE" in
    mainnet|testnet|nextnet)
        ;;
    *)
        print_error "Invalid network type: $NETWORK_TYPE"
        print_error "Valid options: mainnet, testnet, nextnet"
        exit 1
        ;;
esac

# Validate version format
if ! [[ "$TARI_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format: $TARI_VERSION"
    print_error "Expected format: X.Y.Z (e.g., 4.3.1)"
    exit 1
fi

print_info "Setting up Tari source code"
print_info "Version: $TARI_VERSION"
print_info "Network: $NETWORK_TYPE"
print_info "Cache directory: $CACHE_DIR"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    print_error "Node.js is required but not found"
    print_error "Please install Node.js 21.6.0+ and try again"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm is required but not found"
    exit 1
fi

# Change to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

print_info "Project root: $PROJECT_ROOT"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "packages/build/node_modules" ]; then
    print_info "Installing dependencies..."
    npm install
fi

# Set environment variables for the build system
export TARI_VERSION="$TARI_VERSION"
export NETWORK_TYPE="$NETWORK_TYPE"
export TARI_CACHE_DIR="$CACHE_DIR"

if [ -n "$FORCE_REFETCH" ]; then
    export FORCE_REBUILD="true"
    print_info "Force refetch enabled"
fi

# Call the TypeScript build system to fetch Tari source
print_info "Fetching Tari source using build system..."

# Run the Tari source fetcher
node --loader ts-node/esm << 'EOF'
import { fetchTariSource, NetworkType } from './packages/build/src/fetch-tari.js';
import { resolve } from 'path';

const version = process.env.TARI_VERSION || '4.3.1';
const networkStr = process.env.NETWORK_TYPE || 'mainnet';
const cacheDir = process.env.TARI_CACHE_DIR || '.tari-cache';
const force = process.env.FORCE_REBUILD === 'true';

// Map network string to enum
const networkMap = {
  mainnet: NetworkType.Mainnet,
  testnet: NetworkType.Testnet,
  nextnet: NetworkType.Nextnet
};

const network = networkMap[networkStr];
if (!network) {
  throw new Error(`Invalid network: ${networkStr}`);
}

console.log(`Fetching Tari ${version} for ${networkStr} network`);

try {
  const result = await fetchTariSource(version, network, {
    cacheDir: resolve(cacheDir),
    force
  });
  
  console.log('✅ Tari source fetched successfully');
  console.log(`   Source path: ${result.sourcePath}`);
  console.log(`   Git tag: ${result.tag}`);
  console.log(`   Commit: ${result.commit}`);
  console.log(`   From cache: ${result.fromCache}`);
  console.log(`   Size: ${(result.size / 1024 / 1024).toFixed(1)} MB`);
  
  // Create symlink for 'current' version
  const fs = await import('fs');
  const currentPath = resolve(cacheDir, 'tari-current');
  
  try {
    if (fs.existsSync(currentPath)) {
      fs.unlinkSync(currentPath);
    }
    fs.symlinkSync(result.sourcePath, currentPath, 'dir');
    console.log(`   Symlink created: ${currentPath} -> ${result.sourcePath}`);
  } catch (err) {
    console.warn(`   Warning: Could not create symlink: ${err.message}`);
  }
  
} catch (error) {
  console.error('❌ Failed to fetch Tari source:', error.message);
  process.exit(1);
}
EOF

print_success "Tari source setup completed!"

# Verify the setup
EXPECTED_PATH="$CACHE_DIR/tari-current/base_layer/wallet_ffi"
if [ -d "$EXPECTED_PATH" ]; then
    print_success "Wallet FFI found at: $EXPECTED_PATH"
    
    # Set environment variable for the build
    export TARI_SOURCE_PATH="$(realpath "$CACHE_DIR/tari-current")"
    print_info "Set TARI_SOURCE_PATH=$TARI_SOURCE_PATH"
    
    # Verify the Cargo.toml exists
    if [ -f "$EXPECTED_PATH/Cargo.toml" ]; then
        print_success "Wallet FFI Cargo.toml verified"
    else
        print_warning "Wallet FFI Cargo.toml not found"
    fi
else
    print_error "Wallet FFI not found at expected path: $EXPECTED_PATH"
    exit 1
fi

print_success "Setup complete! You can now build the native FFI module."
print_info "To build: npm run build:native"
print_info "To test: npm run test:native"
