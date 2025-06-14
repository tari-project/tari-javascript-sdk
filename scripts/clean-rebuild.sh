#!/bin/bash
# Clean rebuild script that handles package dependencies correctly
# Cleans all packages first, then rebuilds in dependency order

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BUILD_MODE="${BUILD_MODE:-build}"
CLEAN_NODE_MODULES="${CLEAN_NODE_MODULES:-false}"
CLEAN_CACHE="${CLEAN_CACHE:-true}"

# Package order for cleaning (reverse dependency order)
CLEAN_ORDER=(
    "wallet"
    "build"
    "core"
)

# Package order for building (dependency order)
BUILD_ORDER=(
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

log_clean() {
    echo -e "${BLUE}[CLEAN]${NC} $1"
}

log_build() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

clean_package() {
    local package="$1"
    local package_dir="packages/$package"
    
    if [ ! -d "$package_dir" ]; then
        log_warn "Package directory not found: $package_dir"
        return 0
    fi
    
    log_clean "Cleaning package: $package"
    
    cd "$package_dir"
    
    # Run package-specific clean script
    if npm run clean 2>/dev/null; then
        log_info "Package clean script completed for: $package"
    else
        log_warn "No clean script found for $package, performing manual cleanup"
        
        # Manual cleanup
        rm -rf dist/
        rm -rf *.tsbuildinfo
        rm -rf .nyc_output/
        rm -rf coverage/
        
        log_info "Manual cleanup completed for: $package"
    fi
    
    # Clean node_modules if requested
    if [ "$CLEAN_NODE_MODULES" = "true" ]; then
        log_clean "Removing node_modules for: $package"
        rm -rf node_modules/
    fi
    
    cd - > /dev/null
    return 0
}

clean_root() {
    log_clean "Cleaning root directory"
    
    # Clean root build artifacts
    rm -rf dist/
    rm -rf *.tsbuildinfo
    rm -rf .nyc_output/
    rm -rf coverage/
    rm -rf test-results/
    
    # Clean cache directories if requested
    if [ "$CLEAN_CACHE" = "true" ]; then
        log_clean "Cleaning cache directories"
        rm -rf node_modules/.cache/
        rm -rf .npm/
        rm -rf .tsbuildinfo
    fi
    
    # Clean node_modules if requested
    if [ "$CLEAN_NODE_MODULES" = "true" ]; then
        log_clean "Removing root node_modules"
        rm -rf node_modules/
    fi
    
    log_info "Root cleanup completed"
}

clean_all_packages() {
    log_info "Starting clean of all packages..."
    log_info "Clean order: ${CLEAN_ORDER[*]}"
    
    # Clean packages in reverse dependency order
    for package in "${CLEAN_ORDER[@]}"; do
        clean_package "$package"
    done
    
    # Clean root directory
    clean_root
    
    log_info "✓ All packages cleaned successfully"
}

install_dependencies() {
    if [ "$CLEAN_NODE_MODULES" = "true" ]; then
        log_info "Reinstalling dependencies..."
        
        # Install root dependencies first
        log_info "Installing root dependencies"
        npm install
        
        # Install workspace dependencies
        log_info "Installing workspace dependencies"
        npm run install --workspaces
        
        log_info "✓ Dependencies reinstalled successfully"
    else
        log_info "Skipping dependency installation (node_modules preserved)"
    fi
}

rebuild_all_packages() {
    log_info "Starting rebuild of all packages..."
    
    # Use the ordered build script
    if [ -x "./scripts/build-ordered.sh" ]; then
        log_info "Using build-ordered.sh for rebuild"
        FORCE_REBUILD=true ./scripts/build-ordered.sh all
    else
        log_warn "build-ordered.sh not found, using fallback build"
        
        # Fallback: build packages in dependency order
        local failed_packages=()
        
        for package in "${BUILD_ORDER[@]}"; do
            log_build "Building package: $package"
            
            if [ -d "packages/$package" ]; then
                cd "packages/$package"
                
                if npm run "$BUILD_MODE"; then
                    log_info "✓ Successfully built: $package"
                else
                    log_error "✗ Failed to build: $package"
                    failed_packages+=("$package")
                    cd - > /dev/null
                    break
                fi
                
                cd - > /dev/null
            else
                log_warn "Package not found: $package"
            fi
        done
        
        if [ ${#failed_packages[@]} -eq 0 ]; then
            log_info "✓ All packages rebuilt successfully"
            return 0
        else
            log_error "❌ Failed to rebuild packages: ${failed_packages[*]}"
            return 1
        fi
    fi
}

verify_rebuild() {
    log_info "Verifying rebuild..."
    
    local missing_packages=()
    
    # Check that all packages have dist directories
    for package in "${BUILD_ORDER[@]}"; do
        local package_dir="packages/$package"
        local dist_dir="$package_dir/dist"
        
        if [ ! -d "$dist_dir" ]; then
            missing_packages+=("$package")
            log_error "Missing dist directory for: $package"
        elif [ ! -f "$dist_dir/index.js" ] || [ ! -f "$dist_dir/index.d.ts" ]; then
            missing_packages+=("$package")
            log_error "Missing build artifacts for: $package"
        else
            log_info "✓ Build artifacts verified for: $package"
        fi
    done
    
    if [ ${#missing_packages[@]} -eq 0 ]; then
        log_info "🎉 Rebuild verification completed successfully!"
        return 0
    else
        log_error "❌ Rebuild verification failed for: ${missing_packages[*]}"
        return 1
    fi
}

show_status() {
    log_info "Current build status:"
    
    for package in "${BUILD_ORDER[@]}"; do
        local package_dir="packages/$package"
        local dist_dir="$package_dir/dist"
        
        if [ -d "$dist_dir" ] && [ -f "$dist_dir/index.js" ]; then
            local build_time=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$dist_dir/index.js" 2>/dev/null || echo "unknown")
            log_info "✓ $package: built ($build_time)"
        else
            log_warn "✗ $package: not built"
        fi
    done
}

show_help() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  rebuild          Clean all packages and rebuild in dependency order (default)"
    echo "  clean            Clean all packages without rebuilding"
    echo "  verify           Verify that all packages are properly built"
    echo "  status           Show current build status"
    echo "  help             Show this help message"
    echo ""
    echo "Options:"
    echo "  BUILD_MODE           Build mode (default: build)"
    echo "  CLEAN_NODE_MODULES   Remove node_modules (true|false, default: false)"
    echo "  CLEAN_CACHE          Clean cache directories (true|false, default: true)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Clean and rebuild all packages"
    echo "  $0 clean                              # Clean without rebuilding"
    echo "  CLEAN_NODE_MODULES=true $0            # Clean including node_modules"
    echo "  BUILD_MODE=dev $0                     # Rebuild in dev mode"
    echo "  $0 verify                             # Verify builds without rebuilding"
}

# Main script
main() {
    local command="${1:-rebuild}"
    
    # Ensure we're in the project root
    if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
        log_error "This script must be run from the project root directory"
        exit 1
    fi
    
    case "$command" in
        rebuild)
            clean_all_packages
            install_dependencies
            rebuild_all_packages
            verify_rebuild
            ;;
        clean)
            clean_all_packages
            if [ "$CLEAN_NODE_MODULES" = "true" ]; then
                install_dependencies
            fi
            ;;
        verify)
            verify_rebuild
            ;;
        status)
            show_status
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
