#!/bin/bash

# Comprehensive build validation script
# Validates all network/platform binary combinations and build output

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
DIST_DIR="$PROJECT_ROOT/dist"
NATIVE_DIR="$DIST_DIR/native"

# Supported networks and platforms
NETWORKS=("mainnet" "testnet" "nextnet")
PLATFORMS=("linux-x64" "darwin-x64" "darwin-arm64" "win32-x64")

# Validation results
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_CHECKS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

# Check if file exists and is valid
check_file_exists() {
    local file_path="$1"
    local description="$2"
    
    ((TOTAL_CHECKS++))
    
    if [ -f "$file_path" ]; then
        log_success "$description exists: $file_path"
        return 0
    else
        log_error "$description missing: $file_path"
        return 1
    fi
}

# Check binary file properties
check_binary_properties() {
    local binary_path="$1"
    local network="$2"
    local platform="$3"
    
    if [ ! -f "$binary_path" ]; then
        return 1
    fi
    
    # Check file size (should be > 1MB for a real binary)
    local file_size=$(stat -c%s "$binary_path" 2>/dev/null || stat -f%z "$binary_path" 2>/dev/null || echo 0)
    if [ "$file_size" -lt 1048576 ]; then
        log_warning "Binary $binary_path seems too small ($file_size bytes)"
    fi
    
    # Check if it's actually a binary file (not text)
    if file "$binary_path" | grep -q "text"; then
        log_error "Binary $binary_path appears to be a text file"
        return 1
    fi
    
    # Platform-specific checks
    case "$platform" in
        linux-x64)
            if ! file "$binary_path" | grep -q "ELF.*x86-64"; then
                log_warning "Binary $binary_path may not be Linux x86-64"
            fi
            ;;
        darwin-x64)
            if ! file "$binary_path" | grep -q "Mach-O.*x86_64"; then
                log_warning "Binary $binary_path may not be macOS x86-64"
            fi
            ;;
        darwin-arm64)
            if ! file "$binary_path" | grep -q "Mach-O.*arm64"; then
                log_warning "Binary $binary_path may not be macOS ARM64"
            fi
            ;;
        win32-x64)
            if ! file "$binary_path" | grep -q "PE32+.*x86-64"; then
                log_warning "Binary $binary_path may not be Windows x86-64"
            fi
            ;;
    esac
    
    return 0
}

# Validate network directory structure
validate_network_structure() {
    local network="$1"
    local network_dir="$NATIVE_DIR/$network"
    
    log_info "Validating $network network structure..."
    
    if [ ! -d "$network_dir" ]; then
        log_error "Network directory missing: $network_dir"
        return 1
    fi
    
    local found_binaries=0
    
    for platform in "${PLATFORMS[@]}"; do
        local platform_dir="$network_dir/$platform"
        local binary_name="tari-wallet-ffi"
        
        # Determine binary extension based on platform
        case "$platform" in
            win32-*)
                binary_name="${binary_name}.node"
                ;;
            *)
                binary_name="${binary_name}.node"
                ;;
        esac
        
        local binary_path="$platform_dir/$binary_name"
        
        if check_file_exists "$binary_path" "$network/$platform binary"; then
            check_binary_properties "$binary_path" "$network" "$platform"
            ((found_binaries++))
        fi
    done
    
    if [ "$found_binaries" -eq 0 ]; then
        log_error "No binaries found for $network network"
        return 1
    elif [ "$found_binaries" -lt "${#PLATFORMS[@]}" ]; then
        log_warning "Only $found_binaries/${#PLATFORMS[@]} platform binaries found for $network"
    else
        log_success "All platform binaries found for $network network"
    fi
    
    return 0
}

# Validate package.json dependencies
validate_package_dependencies() {
    log_info "Validating package.json dependencies..."
    
    local package_json="$PROJECT_ROOT/package.json"
    check_file_exists "$package_json" "package.json"
    
    # Check for required build scripts
    local required_scripts=(
        "build:networks"
        "build:networks:mainnet"
        "build:networks:testnet"
        "build:networks:nextnet"
        "build:networks:clean"
        "setup:tari-source"
    )
    
    for script in "${required_scripts[@]}"; do
        ((TOTAL_CHECKS++))
        if jq -r ".scripts[\"$script\"]" "$package_json" | grep -q "null"; then
            log_error "Missing npm script: $script"
        else
            log_success "Found npm script: $script"
        fi
    done
}

# Validate native package structure
validate_native_package() {
    log_info "Validating native package structure..."
    
    local native_package="$PROJECT_ROOT/native"
    check_file_exists "$native_package/tari-wallet-ffi/Cargo.toml" "Native FFI Cargo.toml"
    check_file_exists "$native_package/tari-wallet-ffi/build.rs" "Native FFI build script"
    check_file_exists "$native_package/tari-wallet-ffi/src/lib.rs" "Native FFI source"
}

# Validate Tari source cache
validate_tari_source() {
    log_info "Validating Tari source cache..."
    
    local cache_dir="$PROJECT_ROOT/.tari-cache"
    
    if [ -d "$cache_dir" ]; then
        log_success "Tari cache directory exists"
        
        # Check for current symlink
        local current_link="$cache_dir/tari-current"
        if [ -L "$current_link" ]; then
            log_success "Current Tari source symlink exists"
            
            # Validate the symlink target
            local target=$(readlink "$current_link")
            if [ -d "$target" ]; then
                log_success "Tari source symlink target is valid"
                
                # Check for wallet FFI in the source
                local wallet_ffi="$target/base_layer/wallet_ffi"
                if [ -d "$wallet_ffi" ]; then
                    log_success "Wallet FFI found in Tari source"
                else
                    log_error "Wallet FFI missing in Tari source: $wallet_ffi"
                fi
            else
                log_error "Tari source symlink target is invalid: $target"
            fi
        else
            log_warning "Current Tari source symlink missing (run npm run setup:tari-source)"
        fi
    else
        log_warning "Tari cache directory missing (run npm run setup:tari-source)"
    fi
}

# Check build tools availability
validate_build_tools() {
    log_info "Validating build tools..."
    
    # Check Node.js
    ((TOTAL_CHECKS++))
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version)
        log_success "Node.js available: $node_version"
        
        # Check version is >= 18
        local major_version=$(echo "$node_version" | sed 's/v\([0-9]*\).*/\1/')
        if [ "$major_version" -ge 18 ]; then
            log_success "Node.js version is compatible (>= 18)"
        else
            log_error "Node.js version too old: $node_version (requires >= 18)"
        fi
    else
        log_error "Node.js not found"
    fi
    
    # Check Rust
    ((TOTAL_CHECKS++))
    if command -v rustc >/dev/null 2>&1; then
        local rust_version=$(rustc --version)
        log_success "Rust available: $rust_version"
    else
        log_error "Rust not found"
    fi
    
    # Check Cargo
    ((TOTAL_CHECKS++))
    if command -v cargo >/dev/null 2>&1; then
        local cargo_version=$(cargo --version)
        log_success "Cargo available: $cargo_version"
    else
        log_error "Cargo not found"
    fi
    
    # Check npm
    ((TOTAL_CHECKS++))
    if command -v npm >/dev/null 2>&1; then
        local npm_version=$(npm --version)
        log_success "npm available: $npm_version"
    else
        log_error "npm not found"
    fi
}

# Test FFI binary loading
test_ffi_loading() {
    log_info "Testing FFI binary loading..."
    
    for network in "${NETWORKS[@]}"; do
        ((TOTAL_CHECKS++))
        
        # Create a simple test script
        local test_script=$(cat << EOF
const { loadNativeModuleForNetwork, NetworkType } = require('@tari-project/tarijs-core');

async function testLoad() {
    try {
        const networkType = NetworkType.${network^}; // Capitalize first letter
        await loadNativeModuleForNetwork(networkType);
        console.log('SUCCESS');
    } catch (error) {
        console.log('ERROR:', error.message);
        process.exit(1);
    }
}

testLoad();
EOF
)
        
        # Run the test
        if echo "$test_script" | node - >/dev/null 2>&1; then
            log_success "FFI binary loads correctly for $network"
        else
            log_error "FFI binary failed to load for $network"
        fi
    done
}

# Generate validation report
generate_report() {
    log_info "Generating validation report..."
    
    local report_file="$PROJECT_ROOT/build-validation-report.txt"
    
    cat > "$report_file" << EOF
Tari JavaScript SDK Build Validation Report
==========================================

Generated: $(date)
Project: $(basename "$PROJECT_ROOT")

Summary:
- Total Checks: $TOTAL_CHECKS
- Passed: $PASSED_CHECKS
- Failed: $FAILED_CHECKS
- Warnings: $WARNINGS

Networks Validated: ${NETWORKS[*]}
Platforms Validated: ${PLATFORMS[*]}

Status: $([ "$FAILED_CHECKS" -eq 0 ] && echo "PASS" || echo "FAIL")

EOF
    
    if [ "$FAILED_CHECKS" -eq 0 ]; then
        echo "Build validation report: PASS" >> "$report_file"
        log_success "Validation report written to: $report_file"
    else
        echo "Build validation report: FAIL ($FAILED_CHECKS failures)" >> "$report_file"
        log_error "Validation report written to: $report_file"
    fi
}

# Main validation function
main() {
    log_info "Starting Tari JavaScript SDK build validation..."
    echo
    
    # Validate build tools
    validate_build_tools
    echo
    
    # Validate project structure
    validate_package_dependencies
    echo
    
    validate_native_package
    echo
    
    validate_tari_source
    echo
    
    # Validate each network
    for network in "${NETWORKS[@]}"; do
        validate_network_structure "$network"
        echo
    done
    
    # Test FFI loading if binaries exist
    if [ "$FAILED_CHECKS" -eq 0 ]; then
        test_ffi_loading
        echo
    else
        log_warning "Skipping FFI loading tests due to previous failures"
        echo
    fi
    
    # Generate report
    generate_report
    echo
    
    # Final summary
    log_info "Build Validation Summary:"
    echo "  Total Checks: $TOTAL_CHECKS"
    echo "  Passed: $PASSED_CHECKS"
    echo "  Failed: $FAILED_CHECKS"
    echo "  Warnings: $WARNINGS"
    echo
    
    if [ "$FAILED_CHECKS" -eq 0 ]; then
        log_success "All validations passed! 🎉"
        exit 0
    else
        log_error "Validation failed with $FAILED_CHECKS errors"
        echo
        log_info "To fix issues:"
        log_info "1. Run: npm run setup:tari-source"
        log_info "2. Run: npm run build:networks"
        log_info "3. Re-run: npm run validate:build"
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --quiet, -q    Reduce output verbosity"
        echo "  --report-only  Only generate report, don't run validations"
        echo
        echo "This script validates the build output of the Tari JavaScript SDK,"
        echo "checking that all network-specific FFI binaries are present and valid."
        exit 0
        ;;
    --quiet|-q)
        # Reduce verbosity (could implement this)
        log_info "Running in quiet mode..."
        ;;
    --report-only)
        generate_report
        exit 0
        ;;
esac

# Run main function
main "$@"
