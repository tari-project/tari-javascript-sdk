#!/bin/bash
# Build script for Tari JavaScript SDK
# Builds FFI bindings for all networks and current platform

set -e

echo "🚀 Starting Tari SDK build process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TARI_VERSION=${TARI_VERSION:-"4.3.1"}
BUILD_DEBUG=${BUILD_DEBUG:-false}
FORCE_REBUILD=${FORCE_REBUILD:-false}
OUTPUT_DIR=${OUTPUT_DIR:-"./dist"}

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check Rust
    if ! command -v rustc &> /dev/null; then
        log_error "Rust is not installed"
        exit 1
    fi
    
    # Check Cargo
    if ! command -v cargo &> /dev/null; then
        log_error "Cargo is not installed"
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    npm install
    log_success "Dependencies installed"
}

# Build TypeScript
build_typescript() {
    log_info "Building TypeScript..."
    npm run build:ts
    log_success "TypeScript build completed"
}

# Build FFI for network
build_ffi_network() {
    local network=$1
    log_info "Building FFI for $network network..."
    
    local build_args="--network $network --version $TARI_VERSION --output $OUTPUT_DIR"
    
    if [ "$BUILD_DEBUG" = "true" ]; then
        build_args="$build_args --debug"
    fi
    
    if [ "$FORCE_REBUILD" = "true" ]; then
        build_args="$build_args --force"
    fi
    
    npx build-ffi build $build_args
    
    if [ $? -eq 0 ]; then
        log_success "FFI build completed for $network"
    else
        log_error "FFI build failed for $network"
        return 1
    fi
}

# Main execution
main() {
    log_info "Tari JavaScript SDK Build Script"
    log_info "Version: $TARI_VERSION"
    log_info "Debug: $BUILD_DEBUG"
    log_info "Force rebuild: $FORCE_REBUILD"
    log_info "Output directory: $OUTPUT_DIR"
    echo ""
    
    # Step 1: Prerequisites
    check_prerequisites
    
    # Step 2: Dependencies
    install_dependencies
    
    # Step 3: TypeScript
    build_typescript
    
    # Step 4: FFI builds
    log_info "Building FFI bindings for all networks..."
    
    # Build for each network
    for network in "mainnet" "testnet" "nextnet"; do
        if build_ffi_network "$network"; then
            log_success "✓ $network build completed"
        else
            log_error "✗ $network build failed"
            # Continue with other networks instead of exiting
        fi
    done
    
    # Step 5: Summary
    echo ""
    log_success "🎉 Build process completed!"
    log_info "Built packages:"
    
    if [ -d "$OUTPUT_DIR" ]; then
        for network_dir in "$OUTPUT_DIR"/*; do
            if [ -d "$network_dir" ]; then
                network=$(basename "$network_dir")
                log_info "  - @tari-project/tarijs-wallet-$network"
            fi
        done
    fi
    
    echo ""
    log_info "To test the build:"
    log_info "  npm test"
    echo ""
    log_info "To run type checking:"
    log_info "  npm run typecheck"
    echo ""
}

# Handle script arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            BUILD_DEBUG=true
            shift
            ;;
        --force)
            FORCE_REBUILD=true
            shift
            ;;
        --version)
            TARI_VERSION="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --debug         Build in debug mode"
            echo "  --force         Force rebuild even if cached"
            echo "  --version VER   Tari version to build (default: 4.3.1)"
            echo "  --output DIR    Output directory (default: ./dist)"
            echo "  -h, --help      Show this help"
            echo ""
            echo "Environment variables:"
            echo "  TARI_VERSION    Override Tari version"
            echo "  BUILD_DEBUG     Set to 'true' for debug builds"
            echo "  FORCE_REBUILD   Set to 'true' to force rebuild"
            echo "  OUTPUT_DIR      Override output directory"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"
