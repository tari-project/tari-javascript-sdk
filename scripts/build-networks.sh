#!/bin/bash
# Multi-network build orchestration script
# Builds FFI binaries for all supported networks sequentially

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_TYPE="${BUILD_TYPE:-release}"
CLEAN_BETWEEN_BUILDS="${CLEAN_BETWEEN_BUILDS:-true}"

# Supported networks
NETWORKS=("mainnet" "testnet" "nextnet")

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  all          Build for all networks (default)"
    echo "  mainnet      Build mainnet only"
    echo "  testnet      Build testnet only"
    echo "  nextnet      Build nextnet only"
    echo "  current      Build for current platform only"
    echo "  clean        Clean all network builds"
    echo "  help         Show this help message"
    echo ""
    echo "Options:"
    echo "  --debug      Build in debug mode (default: release)"
    echo "  --no-clean   Don't clean between network builds"
    echo "  --target T   Build for specific target only"
    echo ""
    echo "Environment Variables:"
    echo "  BUILD_TYPE           Set to 'debug' or 'release' (default: release)"
    echo "  CLEAN_BETWEEN_BUILDS Set to 'false' to skip cleaning (default: true)"
    echo ""
    echo "Examples:"
    echo "  $0                   # Build all networks for all targets"
    echo "  $0 testnet           # Build testnet only"
    echo "  $0 --debug all       # Build all networks in debug mode"
    echo "  $0 current --no-clean # Build current platform without cleaning"
}

build_network() {
    local network="$1"
    local target_filter="$2"
    
    log_info "Building network: $network"
    
    # Set network environment variable
    export NETWORK="$network"
    export TARI_NETWORK="$network"
    
    # Clean between builds if enabled
    if [ "$CLEAN_BETWEEN_BUILDS" = "true" ]; then
        log_info "Cleaning previous build artifacts..."
        cd "$PROJECT_ROOT/native"
        cargo clean || log_warning "Failed to clean cargo artifacts"
        cd "$PROJECT_ROOT"
    fi
    
    # Build for this network
    if [ -n "$target_filter" ]; then
        log_info "Building $network for target: $target_filter"
        # We would need to modify build-native.sh to support target filtering
        # For now, we'll build all targets
        "$SCRIPT_DIR/build-native.sh"
    else
        log_info "Building $network for all targets"
        "$SCRIPT_DIR/build-native.sh"
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Successfully built $network"
    else
        log_error "Failed to build $network"
        return 1
    fi
}

build_all_networks() {
    local target_filter="$1"
    local failed_networks=()
    
    log_info "Starting multi-network build..."
    log_info "Networks: ${NETWORKS[*]}"
    log_info "Build type: $BUILD_TYPE"
    log_info "Clean between builds: $CLEAN_BETWEEN_BUILDS"
    
    local start_time=$(date +%s)
    
    for network in "${NETWORKS[@]}"; do
        log_info "=== Building $network ==="
        
        if build_network "$network" "$target_filter"; then
            log_success "✓ $network build completed"
        else
            log_error "✗ $network build failed"
            failed_networks+=("$network")
        fi
        
        echo ""
    done
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "=== Build Summary ==="
    log_info "Total build time: ${duration}s"
    
    if [ ${#failed_networks[@]} -eq 0 ]; then
        log_success "All networks built successfully!"
        log_info "Build artifacts available in: dist/native/{network}/{target}/"
        return 0
    else
        log_error "Failed networks: ${failed_networks[*]}"
        return 1
    fi
}

clean_all_networks() {
    log_info "Cleaning all network build artifacts..."
    
    # Clean cargo build directory
    cd "$PROJECT_ROOT/native"
    cargo clean
    cd "$PROJECT_ROOT"
    
    # Clean output directories
    if [ -d "$PROJECT_ROOT/dist/native" ]; then
        rm -rf "$PROJECT_ROOT/dist/native"
        log_info "Removed dist/native directory"
    fi
    
    log_success "All network builds cleaned"
}

validate_setup() {
    log_info "Validating build setup..."
    
    # Check if build-native.sh exists
    if [ ! -f "$SCRIPT_DIR/build-native.sh" ]; then
        log_error "build-native.sh not found at: $SCRIPT_DIR/build-native.sh"
        return 1
    fi
    
    # Check if build-native.sh is executable
    if [ ! -x "$SCRIPT_DIR/build-native.sh" ]; then
        log_warning "Making build-native.sh executable..."
        chmod +x "$SCRIPT_DIR/build-native.sh"
    fi
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_error "Not in a valid project directory (package.json not found)"
        return 1
    fi
    
    # Check if native directory exists
    if [ ! -d "$PROJECT_ROOT/native" ]; then
        log_error "Native directory not found at: $PROJECT_ROOT/native"
        return 1
    fi
    
    log_success "Build setup validation passed"
    return 0
}

# Main script
main() {
    local command="${1:-all}"
    local target_filter=""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --debug)
                BUILD_TYPE="debug"
                shift
                ;;
            --no-clean)
                CLEAN_BETWEEN_BUILDS="false"
                shift
                ;;
            --target)
                target_filter="$2"
                shift 2
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            all|mainnet|testnet|nextnet|current|clean|help)
                command="$1"
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Validate setup
    if ! validate_setup; then
        exit 1
    fi
    
    log_info "Multi-network build orchestrator"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Command: $command"
    
    case "$command" in
        all)
            build_all_networks "$target_filter"
            ;;
        mainnet|testnet|nextnet)
            build_network "$command" "$target_filter"
            ;;
        current)
            log_info "Building current platform for all networks..."
            for network in "${NETWORKS[@]}"; do
                export NETWORK="$network"
                export TARI_NETWORK="$network"
                log_info "Building $network for current platform..."
                "$SCRIPT_DIR/build-native.sh" current
            done
            ;;
        clean)
            clean_all_networks
            ;;
        help)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Handle script interruption
trap 'log_warning "Build interrupted by user"; exit 130' INT
trap 'log_error "Build terminated"; exit 143' TERM

# Run main function
main "$@"
