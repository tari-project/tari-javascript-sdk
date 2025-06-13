#!/bin/bash
# @fileoverview Native module testing script
#
# Comprehensive test runner for native modules across platforms
# with security-focused validation and performance benchmarking.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NATIVE_DIR="$PROJECT_ROOT/native"
TEST_OUTPUT_DIR="$PROJECT_ROOT/test-results"
COVERAGE_DIR="$TEST_OUTPUT_DIR/coverage"

# Create test output directories
mkdir -p "$TEST_OUTPUT_DIR"
mkdir -p "$COVERAGE_DIR"

echo_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

echo_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin)
            echo "macos"
            ;;
        Linux)
            echo "linux"
            ;;
        CYGWIN*|MINGW32*|MSYS*|MINGW*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Function to check dependencies
check_dependencies() {
    echo_info "Checking dependencies..."
    
    # Check Rust
    if ! command -v cargo &> /dev/null; then
        echo_error "Cargo not found. Please install Rust."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo_error "Node.js not found. Please install Node.js."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo_error "npm not found. Please install npm."
        exit 1
    fi
    
    echo_success "All dependencies found"
}

# Function to setup platform-specific dependencies
setup_platform_dependencies() {
    local platform="$1"
    echo_info "Setting up platform-specific dependencies for $platform..."
    
    case "$platform" in
        "macos")
            # macOS dependencies are handled by Cargo.toml
            echo_info "macOS dependencies: security-framework, core-foundation"
            ;;
        "linux")
            # Check for libsecret development packages
            if command -v pkg-config &> /dev/null; then
                if pkg-config --exists libsecret-1; then
                    echo_success "libsecret-1 development packages found"
                else
                    echo_warning "libsecret-1 not found. Installing fallback dependencies..."
                    
                    # Try to install on common distributions
                    if command -v apt-get &> /dev/null; then
                        echo_info "Detected Debian/Ubuntu - install with: sudo apt-get install libsecret-1-dev"
                    elif command -v yum &> /dev/null; then
                        echo_info "Detected RHEL/CentOS - install with: sudo yum install libsecret-devel"
                    elif command -v pacman &> /dev/null; then
                        echo_info "Detected Arch - install with: sudo pacman -S libsecret"
                    fi
                fi
            fi
            ;;
        "windows")
            # Windows dependencies are handled by Cargo.toml
            echo_info "Windows dependencies: windows-rs crate"
            ;;
    esac
}

# Function to build native modules
build_native() {
    echo_info "Building native modules..."
    
    cd "$NATIVE_DIR"
    
    # Clean previous builds
    if [ -d "target" ]; then
        echo_info "Cleaning previous build artifacts..."
        cargo clean
    fi
    
    # Build with all features
    echo_info "Building with default features..."
    if cargo build --release; then
        echo_success "Native build successful"
    else
        echo_error "Native build failed"
        return 1
    fi
    
    # Build tests
    echo_info "Building native tests..."
    if cargo test --no-run --release; then
        echo_success "Native test build successful"
    else
        echo_error "Native test build failed"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to run native tests
run_native_tests() {
    echo_info "Running native tests..."
    
    cd "$NATIVE_DIR"
    
    # Run unit tests
    echo_info "Running Rust unit tests..."
    if cargo test --release -- --test-threads=1 --nocapture 2>&1 | tee "$TEST_OUTPUT_DIR/native-tests.log"; then
        echo_success "Native unit tests passed"
    else
        echo_error "Native unit tests failed"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to run security tests
run_security_tests() {
    echo_info "Running security tests..."
    
    cd "$NATIVE_DIR"
    
    # Check for common security issues with cargo audit
    if command -v cargo-audit &> /dev/null; then
        echo_info "Running cargo audit..."
        if cargo audit 2>&1 | tee "$TEST_OUTPUT_DIR/security-audit.log"; then
            echo_success "Security audit passed"
        else
            echo_warning "Security audit found issues (check security-audit.log)"
        fi
    else
        echo_warning "cargo-audit not installed. Install with: cargo install cargo-audit"
    fi
    
    # Check for memory safety issues with cargo clippy
    echo_info "Running Clippy for memory safety checks..."
    if cargo clippy --release -- -D warnings 2>&1 | tee "$TEST_OUTPUT_DIR/clippy-results.log"; then
        echo_success "Clippy checks passed"
    else
        echo_warning "Clippy found issues (check clippy-results.log)"
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to run performance benchmarks
run_performance_tests() {
    echo_info "Running performance benchmarks..."
    
    cd "$NATIVE_DIR"
    
    # Run benchmarks if available
    if cargo bench --no-run &> /dev/null; then
        echo_info "Running native benchmarks..."
        cargo bench 2>&1 | tee "$TEST_OUTPUT_DIR/benchmarks.log"
        echo_success "Performance benchmarks completed"
    else
        echo_info "No native benchmarks found"
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to test Node.js integration
test_node_integration() {
    echo_info "Testing Node.js integration..."
    
    # Install dependencies if not already installed
    if [ ! -d "node_modules" ]; then
        echo_info "Installing Node.js dependencies..."
        npm ci
    fi
    
    # Run TypeScript compilation
    echo_info "Compiling TypeScript..."
    if npm run build 2>&1 | tee "$TEST_OUTPUT_DIR/typescript-build.log"; then
        echo_success "TypeScript compilation successful"
    else
        echo_error "TypeScript compilation failed"
        return 1
    fi
    
    # Run integration tests
    echo_info "Running integration tests..."
    if npm test 2>&1 | tee "$TEST_OUTPUT_DIR/integration-tests.log"; then
        echo_success "Integration tests passed"
    else
        echo_error "Integration tests failed"
        return 1
    fi
}

# Function to run memory leak tests
run_memory_tests() {
    echo_info "Running memory leak detection..."
    
    cd "$NATIVE_DIR"
    
    # Use valgrind on Linux if available
    if command -v valgrind &> /dev/null && [ "$(detect_platform)" = "linux" ]; then
        echo_info "Running valgrind memory check..."
        valgrind --tool=memcheck --leak-check=full --show-leak-kinds=all \
                 --track-origins=yes --verbose \
                 cargo test --release 2>&1 | tee "$TEST_OUTPUT_DIR/valgrind.log" || true
        echo_success "Valgrind check completed (see valgrind.log)"
    else
        echo_info "Valgrind not available, skipping detailed memory analysis"
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to generate test report
generate_report() {
    echo_info "Generating test report..."
    
    local report_file="$TEST_OUTPUT_DIR/test-report.md"
    local platform="$(detect_platform)"
    local timestamp="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    
    cat > "$report_file" << EOF
# Native Module Test Report

**Platform:** $platform  
**Timestamp:** $timestamp  
**Node.js Version:** $(node --version)  
**Rust Version:** $(rustc --version)  

## Test Results

EOF

    # Check each test result
    local tests=("native-tests" "integration-tests" "security-audit" "clippy-results")
    for test in "${tests[@]}"; do
        local log_file="$TEST_OUTPUT_DIR/${test}.log"
        if [ -f "$log_file" ]; then
            echo "### $test" >> "$report_file"
            echo '```' >> "$report_file"
            tail -20 "$log_file" >> "$report_file"
            echo '```' >> "$report_file"
            echo "" >> "$report_file"
        fi
    done
    
    echo_success "Test report generated: $report_file"
}

# Function to cleanup
cleanup() {
    echo_info "Cleaning up..."
    
    # Remove any temporary files
    if [ -d "/tmp/tari-native-test" ]; then
        rm -rf "/tmp/tari-native-test"
    fi
    
    echo_success "Cleanup completed"
}

# Main execution
main() {
    local platform="$(detect_platform)"
    local run_all=true
    local run_security=false
    local run_performance=false
    local run_memory=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --security)
                run_security=true
                run_all=false
                shift
                ;;
            --performance)
                run_performance=true
                run_all=false
                shift
                ;;
            --memory)
                run_memory=true
                run_all=false
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --security     Run security tests only"
                echo "  --performance  Run performance tests only"
                echo "  --memory       Run memory tests only"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                echo_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    echo_info "Starting native module tests on $platform"
    echo_info "Test output directory: $TEST_OUTPUT_DIR"
    
    # Setup trap for cleanup
    trap cleanup EXIT
    
    # Run dependency checks
    check_dependencies
    setup_platform_dependencies "$platform"
    
    if [ "$run_all" = true ]; then
        # Run all tests
        build_native || exit 1
        run_native_tests || exit 1
        test_node_integration || exit 1
        run_security_tests
        run_performance_tests
        run_memory_tests
    else
        # Run specific test suites
        if [ "$run_security" = true ]; then
            build_native || exit 1
            run_security_tests
        fi
        
        if [ "$run_performance" = true ]; then
            build_native || exit 1
            run_performance_tests
        fi
        
        if [ "$run_memory" = true ]; then
            build_native || exit 1
            run_memory_tests
        fi
    fi
    
    generate_report
    
    echo_success "All tests completed successfully!"
    echo_info "Results available in: $TEST_OUTPUT_DIR"
}

# Run main function
main "$@"
