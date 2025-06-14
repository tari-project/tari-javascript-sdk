#!/bin/bash
# Ordered build script that handles package dependencies correctly
# Builds packages in dependency order: core → build → wallet

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BUILD_MODE="${BUILD_MODE:-build}"
VERBOSE="${VERBOSE:-false}"
FORCE_REBUILD="${FORCE_REBUILD:-false}"

# Package build order (respects dependencies)
PACKAGES=(
    "core"
    "build"  
    "wallet"
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

log_build() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

check_package_exists() {
    local package="$1"
    if [ ! -d "packages/$package" ]; then
        log_error "Package not found: packages/$package"
        return 1
    fi
    return 0
}

check_package_json() {
    local package="$1"
    if [ ! -f "packages/$package/package.json" ]; then
        log_error "package.json not found for: $package"
        return 1
    fi
    return 0
}

package_needs_build() {
    local package="$1"
    local package_dir="packages/$package"
    local dist_dir="$package_dir/dist"
    local src_dir="$package_dir/src"
    
    # Force rebuild if requested
    if [ "$FORCE_REBUILD" = "true" ]; then
        return 0
    fi
    
    # Need build if dist doesn't exist
    if [ ! -d "$dist_dir" ]; then
        return 0
    fi
    
    # Need build if any source file is newer than dist
    if [ -d "$src_dir" ]; then
        local newest_src=$(find "$src_dir" -name "*.ts" -type f -exec stat -f "%m" {} \; 2>/dev/null | sort -nr | head -1)
        local newest_dist=$(find "$dist_dir" -name "*.js" -type f -exec stat -f "%m" {} \; 2>/dev/null | sort -nr | head -1)
        
        if [ -n "$newest_src" ] && [ -n "$newest_dist" ]; then
            if [ "$newest_src" -gt "$newest_dist" ]; then
                return 0
            fi
        elif [ -n "$newest_src" ]; then
            # Has source but no dist files
            return 0
        fi
    fi
    
    # Check if package.json is newer than dist
    local package_json_time=$(stat -f "%m" "$package_dir/package.json" 2>/dev/null || echo "0")
    local newest_dist=$(find "$dist_dir" -name "*.js" -type f -exec stat -f "%m" {} \; 2>/dev/null | sort -nr | head -1)
    
    if [ -n "$newest_dist" ] && [ "$package_json_time" -gt "$newest_dist" ]; then
        return 0
    fi
    
    # No build needed
    return 1
}

build_package() {
    local package="$1"
    local package_dir="packages/$package"
    
    log_build "Building package: $package"
    
    if ! check_package_exists "$package"; then
        return 1
    fi
    
    if ! check_package_json "$package"; then
        return 1
    fi
    
    # Check if build is needed
    if ! package_needs_build "$package"; then
        log_info "Package $package is up to date, skipping"
        return 0
    fi
    
    cd "$package_dir"
    
    # Clean if requested or if this is a forced rebuild
    if [ "$FORCE_REBUILD" = "true" ]; then
        log_info "Cleaning package: $package"
        npm run clean 2>/dev/null || log_warn "Clean script not found for $package"
    fi
    
    # Run the build
    log_info "Running build for: $package"
    if [ "$VERBOSE" = "true" ]; then
        npm run "$BUILD_MODE"
    else
        npm run "$BUILD_MODE" > /dev/null 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        log_info "Successfully built: $package"
    else
        log_error "Failed to build: $package"
        cd - > /dev/null
        return 1
    fi
    
    cd - > /dev/null
    return 0
}

validate_build() {
    local package="$1"
    local package_dir="packages/$package"
    local dist_dir="$package_dir/dist"
    
    # Check if dist directory exists
    if [ ! -d "$dist_dir" ]; then
        log_error "Build validation failed for $package: dist directory not found"
        return 1
    fi
    
    # Check if main files exist
    local main_js="$dist_dir/index.js"
    local main_dts="$dist_dir/index.d.ts"
    
    if [ ! -f "$main_js" ]; then
        log_error "Build validation failed for $package: index.js not found"
        return 1
    fi
    
    if [ ! -f "$main_dts" ]; then
        log_error "Build validation failed for $package: index.d.ts not found"
        return 1
    fi
    
    log_info "Build validation passed for: $package"
    return 0
}

check_circular_dependencies() {
    log_info "Checking for circular dependencies..."
    
    # This is a simple check - for a full solution you'd want to use a tool like madge
    # For now, we just verify our known dependency order is correct
    
    local core_deps=$(cd packages/core && npm list --depth=0 --json 2>/dev/null | grep -o '"@tari-project/tarijs-[^"]*"' || echo "")
    local build_deps=$(cd packages/build && npm list --depth=0 --json 2>/dev/null | grep -o '"@tari-project/tarijs-[^"]*"' || echo "")
    local wallet_deps=$(cd packages/wallet && npm list --depth=0 --json 2>/dev/null | grep -o '"@tari-project/tarijs-[^"]*"' || echo "")
    
    # Core should have no internal dependencies (excluding itself)
    if echo "$core_deps" | grep -q "tarijs-" | grep -v "tarijs-core"; then
        log_warn "Core package has unexpected internal dependencies"
    fi
    
    # Build should only depend on core
    if echo "$build_deps" | grep -q "tarijs-wallet"; then
        log_error "Circular dependency detected: build depends on wallet"
        return 1
    fi
    
    # Wallet should not depend on build
    if echo "$wallet_deps" | grep -q "tarijs-build"; then
        log_error "Circular dependency detected: wallet depends on build"
        return 1
    fi
    
    log_info "Circular dependency check passed"
    return 0
}

build_all_packages() {
    local failed_packages=()
    local built_packages=()
    
    log_info "Starting ordered build of all packages..."
    log_info "Build order: ${PACKAGES[*]}"
    
    # Check for circular dependencies first
    if ! check_circular_dependencies; then
        log_error "Circular dependency check failed"
        return 1
    fi
    
    # Build packages in dependency order
    for package in "${PACKAGES[@]}"; do
        if build_package "$package"; then
            if validate_build "$package"; then
                built_packages+=("$package")
                log_info "✓ Package $package built and validated successfully"
            else
                failed_packages+=("$package")
                log_error "✗ Package $package build validation failed"
            fi
        else
            failed_packages+=("$package")
            log_error "✗ Package $package build failed"
            
            # Stop on first failure to avoid cascade failures
            break
        fi
    done
    
    # Report results
    echo ""
    log_info "Build Summary:"
    log_info "Successfully built: ${built_packages[*]:-none}"
    
    if [ ${#failed_packages[@]} -eq 0 ]; then
        log_info "🎉 All packages built successfully!"
        return 0
    else
        log_error "❌ Failed packages: ${failed_packages[*]}"
        return 1
    fi
}

build_single_package() {
    local package="$1"
    
    log_info "Building single package: $package"
    
    if build_package "$package"; then
        if validate_build "$package"; then
            log_info "✓ Package $package built and validated successfully"
            return 0
        else
            log_error "✗ Package $package build validation failed"
            return 1
        fi
    else
        log_error "✗ Package $package build failed"
        return 1
    fi
}

show_help() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  all              Build all packages in dependency order"
    echo "  <package-name>   Build specific package (core|build|wallet)"
    echo "  check            Check for circular dependencies"
    echo "  list             List packages in build order"
    echo "  help             Show this help message"
    echo ""
    echo "Options:"
    echo "  BUILD_MODE       Build mode (default: build)"
    echo "  VERBOSE          Enable verbose output (true|false, default: false)"
    echo "  FORCE_REBUILD    Force rebuild even if up to date (true|false, default: false)"
    echo ""
    echo "Examples:"
    echo "  $0 all                           # Build all packages"
    echo "  $0 core                          # Build only core package"
    echo "  VERBOSE=true $0 all              # Build with verbose output"
    echo "  FORCE_REBUILD=true $0 all        # Force rebuild all packages"
    echo "  BUILD_MODE=dev $0 all            # Build in dev mode"
}

list_packages() {
    echo "Build order:"
    for i in "${!PACKAGES[@]}"; do
        echo "  $((i+1)). ${PACKAGES[i]}"
    done
}

# Main script
main() {
    local command="${1:-all}"
    
    # Ensure we're in the project root
    if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
        log_error "This script must be run from the project root directory"
        exit 1
    fi
    
    case "$command" in
        all)
            build_all_packages
            ;;
        core|build|wallet)
            build_single_package "$command"
            ;;
        check)
            check_circular_dependencies
            ;;
        list)
            list_packages
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
