#!/bin/bash
# Cross-platform native module build automation
#
# Builds native modules for all supported platforms using NAPI-RS
# with proper dependency management and error handling.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NATIVE_DIR="native"
OUTPUT_DIR="dist/native"
BUILD_TYPE="${BUILD_TYPE:-release}"
NETWORK="${NETWORK:-mainnet}"

# Supported targets
TARGETS=(
    "x86_64-apple-darwin"
    "aarch64-apple-darwin"
    "x86_64-pc-windows-msvc"
    "x86_64-unknown-linux-gnu"
    "aarch64-unknown-linux-gnu"
)

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check for Rust
    if ! command -v rustc &> /dev/null; then
        log_error "Rust is not installed. Please install Rust from https://rustup.rs/"
        exit 1
    fi
    
    # Check for cargo
    if ! command -v cargo &> /dev/null; then
        log_error "Cargo is not installed. Please install Rust from https://rustup.rs/"
        exit 1
    fi
    
    # Check for Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js >= 18.0.0"
        exit 1
    fi
    
    log_info "Dependencies check passed"
}

setup_tari_source() {
    log_info "Setting up Tari source dependencies..."
    
    # Run the Tari setup script using Node.js
    if node scripts/setup-tari.mjs; then
        log_info "Tari source setup completed successfully"
    else
        log_error "Failed to set up Tari source dependencies"
        log_error "Please ensure you have internet connectivity and sufficient disk space"
        exit 1
    fi
}

setup_targets() {
    log_info "Setting up Rust targets..."
    
    for target in "${TARGETS[@]}"; do
        log_info "Adding target: $target"
        rustup target add "$target" || log_warn "Failed to add target $target"
    done
}

build_native() {
    local target="$1"
    local build_flag=""
    
    if [ "$BUILD_TYPE" = "release" ]; then
        build_flag="--release"
    fi
    
    log_info "Building for target: $target (network: $NETWORK)"
    
    cd "$NATIVE_DIR"
    
    # Set environment variables for cross-compilation
    case "$target" in
        *windows*)
            export CC_x86_64_pc_windows_msvc="cl"
            export CXX_x86_64_pc_windows_msvc="cl"
            ;;
        *linux*)
            if [ "$target" = "aarch64-unknown-linux-gnu" ]; then
                export CC_aarch64_unknown_linux_gnu="aarch64-linux-gnu-gcc"
                export CXX_aarch64_unknown_linux_gnu="aarch64-linux-gnu-g++"
            fi
            ;;
    esac
    
    # Set network for compile-time configuration
    export TARI_NETWORK="$NETWORK"
    
    # Build using NAPI-RS with Cargo for Node.js FFI module
    if TARI_NETWORK="$NETWORK" cargo build --target "$target" $build_flag --package tari-wallet-ffi; then
        log_info "Successfully built wallet FFI for $target"
        
        # NAPI-RS generates .node files, but we need to rename from .dylib/.so/.dll
        local lib_name=""
        local lib_ext=""
        local node_file=""
        
        case "$target" in
            x86_64-apple-darwin)
                lib_name="libtari_wallet_ffi"
                lib_ext=".dylib"
                node_file="tari-wallet-ffi.darwin-x64.node"
                ;;
            aarch64-apple-darwin)
                lib_name="libtari_wallet_ffi"
                lib_ext=".dylib"
                node_file="tari-wallet-ffi.darwin-arm64.node"
                ;;
            x86_64-pc-windows-msvc)
                lib_name="tari_wallet_ffi"
                lib_ext=".dll"
                node_file="tari-wallet-ffi.win32-x64.node"
                ;;
            x86_64-unknown-linux-gnu)
                lib_name="libtari_wallet_ffi"
                lib_ext=".so"
                node_file="tari-wallet-ffi.linux-x64.node"
                ;;
            aarch64-unknown-linux-gnu)
                lib_name="libtari_wallet_ffi"
                lib_ext=".so"
                node_file="tari-wallet-ffi.linux-arm64.node"
                ;;
            *)
                log_error "Unsupported target: $target"
                return 1
                ;;
        esac
        
        local target_dir="target/$target"
        local source_dir="$target_dir/$BUILD_TYPE"
        local source_file="$source_dir/$lib_name$lib_ext"
        local output_subdir="../$OUTPUT_DIR/$NETWORK/$target"
        
        mkdir -p "$output_subdir"
        
        if [ -f "$source_file" ]; then
            # Copy and rename to .node extension for NAPI compatibility
            cp "$source_file" "$output_subdir/$node_file"
            log_info "Copied NAPI module to $output_subdir/$node_file"
        else
            log_warn "NAPI module not found at expected path: $source_file"
        fi
        
        return 0
    else
        log_error "Failed to build for $target"
        return 1
    fi
    
    cd ..
}

build_all_targets() {
    local failed_targets=()
    
    for target in "${TARGETS[@]}"; do
        if ! build_native "$target"; then
            failed_targets+=("$target")
        fi
    done
    
    if [ ${#failed_targets[@]} -eq 0 ]; then
        log_info "All targets built successfully"
        return 0
    else
        log_error "Failed to build targets: ${failed_targets[*]}"
        return 1
    fi
}

build_current_platform() {
    local current_target=""
    
    case "$(uname -s)" in
        Darwin)
            if [ "$(uname -m)" = "arm64" ]; then
                current_target="aarch64-apple-darwin"
            else
                current_target="x86_64-apple-darwin"
            fi
            ;;
        Linux)
            if [ "$(uname -m)" = "aarch64" ]; then
                current_target="aarch64-unknown-linux-gnu"
            else
                current_target="x86_64-unknown-linux-gnu"
            fi
            ;;
        MINGW*|MSYS*|CYGWIN*)
            current_target="x86_64-pc-windows-msvc"
            ;;
        *)
            log_error "Unsupported platform: $(uname -s)"
            exit 1
            ;;
    esac
    
    log_info "Building for current platform: $current_target"
    build_native "$current_target"
}

clean_build() {
    log_info "Cleaning build artifacts..."
    
    cd "$NATIVE_DIR"
    cargo clean
    cd ..
    
    rm -rf "$OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
    
    log_info "Clean completed"
}

show_help() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  all          Build for all supported targets"
    echo "  current      Build for current platform only"
    echo "  clean        Clean build artifacts"
    echo "  check        Check dependencies"
    echo "  help         Show this help message"
    echo ""
    echo "Options:"
    echo "  BUILD_TYPE   Set to 'debug' or 'release' (default: release)"
    echo "  NETWORK      Set to 'mainnet', 'testnet', or 'nextnet' (default: mainnet)"
    echo ""
    echo "Examples:"
    echo "  $0 all                              # Build mainnet for all targets"
    echo "  NETWORK=testnet $0 all              # Build testnet for all targets"
    echo "  BUILD_TYPE=debug NETWORK=nextnet $0 current  # Build nextnet debug for current platform"
    echo "  $0 clean                            # Clean all build artifacts"
}

# Main script
main() {
    local command="${1:-current}"
    
    case "$command" in
        all)
            check_dependencies
            setup_tari_source
            setup_targets
            clean_build
            build_all_targets
            ;;
        current)
            check_dependencies
            setup_tari_source
            build_current_platform
            ;;
        clean)
            clean_build
            ;;
        check)
            check_dependencies
            setup_tari_source
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
