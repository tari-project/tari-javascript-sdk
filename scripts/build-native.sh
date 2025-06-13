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
    
    log_info "Building for target: $target"
    
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
    
    # Build the native module
    if cargo build --target "$target" $build_flag; then
        log_info "Successfully built for $target"
        
        # Copy the built library to output directory
        local lib_name="libtari_secure_storage"
        local lib_ext=""
        local target_dir="target/$target"
        
        case "$target" in
            *windows*)
                lib_name="tari_secure_storage"
                lib_ext=".dll"
                ;;
            *apple*)
                lib_ext=".dylib"
                ;;
            *linux*)
                lib_ext=".so"
                ;;
        esac
        
        local source_dir="$target_dir/$BUILD_TYPE"
        local output_subdir="../$OUTPUT_DIR/$target"
        
        mkdir -p "$output_subdir"
        
        if [ -f "$source_dir/$lib_name$lib_ext" ]; then
            cp "$source_dir/$lib_name$lib_ext" "$output_subdir/"
            log_info "Copied library to $output_subdir/"
        else
            log_warn "Library not found at expected path: $source_dir/$lib_name$lib_ext"
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
    echo ""
    echo "Examples:"
    echo "  $0 all                    # Build for all targets in release mode"
    echo "  BUILD_TYPE=debug $0 all   # Build for all targets in debug mode"
    echo "  $0 current                # Build for current platform only"
    echo "  $0 clean                  # Clean all build artifacts"
}

# Main script
main() {
    local command="${1:-current}"
    
    case "$command" in
        all)
            check_dependencies
            setup_targets
            clean_build
            build_all_targets
            ;;
        current)
            check_dependencies
            build_current_platform
            ;;
        clean)
            clean_build
            ;;
        check)
            check_dependencies
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
