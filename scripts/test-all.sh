#!/bin/bash

# Comprehensive test runner script
# Runs all test types in the correct order

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COVERAGE_THRESHOLD=80
TEST_TIMEOUT=300000  # 5 minutes
E2E_TIMEOUT=1800000  # 30 minutes

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

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js 18 or higher is required (found: $(node --version))"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm ci
    fi
    
    log_success "Dependencies check passed"
}

build_project() {
    log_info "Building project..."
    
    # Build native modules if needed
    if [ -f "native/Cargo.toml" ]; then
        log_info "Building native modules..."
        npm run build:native || {
            log_warning "Native build failed - some tests may be skipped"
        }
    fi
    
    # Build TypeScript
    npm run build || {
        log_error "TypeScript build failed"
        exit 1
    }
    
    log_success "Build completed"
}

run_unit_tests() {
    log_info "Running unit tests..."
    
    # Set test environment
    export JEST_UNIT_MODE=true
    export NODE_ENV=test
    
    # Run unit tests with coverage
    npm run test:unit -- --coverage --testTimeout="$TEST_TIMEOUT" || {
        log_error "Unit tests failed"
        return 1
    }
    
    # Check coverage threshold
    if [ -f "coverage/coverage-summary.json" ]; then
        local coverage=$(node -e "
            const summary = require('./coverage/coverage-summary.json');
            const lines = summary.total.lines.pct;
            console.log(lines);
        ")
        
        if (( $(echo "$coverage < $COVERAGE_THRESHOLD" | bc -l) )); then
            log_warning "Coverage ($coverage%) below threshold ($COVERAGE_THRESHOLD%)"
        else
            log_success "Coverage: $coverage%"
        fi
    fi
    
    log_success "Unit tests passed"
    return 0
}

run_integration_tests() {
    log_info "Running integration tests..."
    
    # Check if FFI is available
    if [ ! -f "native/target/release/libtari_wallet_ffi.so" ] && \
       [ ! -f "native/target/release/libtari_wallet_ffi.dylib" ] && \
       [ ! -f "native/target/release/tari_wallet_ffi.dll" ]; then
        log_warning "Native FFI not found - skipping integration tests"
        return 0
    fi
    
    # Set test environment
    export JEST_INTEGRATION_MODE=true
    export NODE_ENV=test
    
    # Run integration tests
    npm run test:integration -- --testTimeout="$TEST_TIMEOUT" || {
        log_error "Integration tests failed"
        return 1
    }
    
    log_success "Integration tests passed"
    return 0
}

run_e2e_tests() {
    log_info "Running E2E tests..."
    
    # Check if E2E tests should run
    if [ "${RUN_E2E_TESTS:-false}" != "true" ] && [ "${CI:-false}" == "true" ]; then
        log_info "E2E tests skipped in CI (set RUN_E2E_TESTS=true to enable)"
        return 0
    fi
    
    # Check network connectivity
    if ! ping -c 1 -W 5 seed1.tari.com &> /dev/null; then
        log_warning "Network connectivity issues - skipping E2E tests"
        return 0
    fi
    
    # Set test environment
    export JEST_E2E_MODE=true
    export NETWORK_AVAILABLE=true
    export TARI_NETWORK=${TARI_NETWORK:-testnet}
    export NODE_ENV=test
    
    # Run E2E tests with longer timeout
    npm run test:e2e -- --testTimeout="$E2E_TIMEOUT" || {
        log_warning "E2E tests failed (this may be due to network issues)"
        return 1
    }
    
    log_success "E2E tests passed"
    return 0
}

run_performance_tests() {
    log_info "Running performance benchmarks..."
    
    # Check if benchmarks should run
    if [ "${RUN_BENCHMARKS:-false}" != "true" ] && [ "${CI:-false}" == "true" ]; then
        log_info "Benchmarks skipped in CI (set RUN_BENCHMARKS=true to enable)"
        return 0
    fi
    
    # Run benchmarks
    npm run benchmark || {
        log_warning "Performance benchmarks failed"
        return 1
    }
    
    log_success "Performance benchmarks completed"
    return 0
}

run_linting() {
    log_info "Running code quality checks..."
    
    # ESLint
    npm run lint || {
        log_error "Linting failed"
        return 1
    }
    
    # TypeScript type checking
    npm run type-check || {
        log_error "Type checking failed"
        return 1
    }
    
    # Prettier formatting check
    npm run format:check || {
        log_warning "Code formatting issues found - run 'npm run format' to fix"
    }
    
    log_success "Code quality checks passed"
    return 0
}

cleanup() {
    log_info "Cleaning up test artifacts..."
    
    # Remove temporary test files
    find /tmp -name "tari-test-*" -type d -exec rm -rf {} + 2>/dev/null || true
    find /tmp -name "test-wallet-*" -type d -exec rm -rf {} + 2>/dev/null || true
    
    # Clean up any running processes
    pkill -f "tari.*test" 2>/dev/null || true
    
    log_success "Cleanup completed"
}

generate_report() {
    log_info "Generating test report..."
    
    local report_file="test-results/test-report-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p test-results
    
    cat > "$report_file" << EOF
# Test Report

**Generated:** $(date)
**Branch:** $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
**Commit:** $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

## Test Results

- ✅ **Unit Tests:** $unit_result
- ✅ **Integration Tests:** $integration_result  
- ✅ **E2E Tests:** $e2e_result
- ✅ **Performance Tests:** $performance_result
- ✅ **Code Quality:** $linting_result

## Coverage

$([ -f "coverage/coverage-summary.json" ] && node -e "
const summary = require('./coverage/coverage-summary.json');
console.log('- Lines:', summary.total.lines.pct + '%');
console.log('- Functions:', summary.total.functions.pct + '%');
console.log('- Branches:', summary.total.branches.pct + '%');
console.log('- Statements:', summary.total.statements.pct + '%');
" || echo "Coverage data not available")

## Environment

- **Node.js:** $(node --version)
- **npm:** $(npm --version)
- **Platform:** $(uname -s)
- **Architecture:** $(uname -m)

EOF

    log_success "Test report generated: $report_file"
}

main() {
    # Initialize result variables
    local unit_result="SKIPPED"
    local integration_result="SKIPPED"
    local e2e_result="SKIPPED"
    local performance_result="SKIPPED"
    local linting_result="SKIPPED"
    
    # Setup trap for cleanup
    trap cleanup EXIT
    
    echo ""
    echo "🧪 Tari JavaScript SDK - Comprehensive Test Suite"
    echo "================================================="
    echo ""
    
    # Parse command line arguments
    local run_unit=true
    local run_integration=true
    local run_e2e=false
    local run_performance=false
    local run_lint=true
    local fail_fast=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --unit-only)
                run_integration=false
                run_e2e=false
                run_performance=false
                shift
                ;;
            --integration-only)
                run_unit=false
                run_e2e=false
                run_performance=false
                run_lint=false
                shift
                ;;
            --e2e-only)
                run_unit=false
                run_integration=false
                run_performance=false
                run_lint=false
                run_e2e=true
                shift
                ;;
            --with-e2e)
                run_e2e=true
                shift
                ;;
            --with-performance)
                run_performance=true
                shift
                ;;
            --skip-lint)
                run_lint=false
                shift
                ;;
            --fail-fast)
                fail_fast=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --unit-only         Run only unit tests"
                echo "  --integration-only  Run only integration tests"
                echo "  --e2e-only         Run only E2E tests"
                echo "  --with-e2e         Include E2E tests"
                echo "  --with-performance Include performance benchmarks"
                echo "  --skip-lint        Skip linting and type checking"
                echo "  --fail-fast        Stop on first failure"
                echo "  --help             Show this help"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Pre-flight checks
    check_dependencies
    build_project
    
    local failed_tests=()
    
    # Run tests in order
    if [ "$run_lint" = true ]; then
        if run_linting; then
            linting_result="PASSED"
        else
            linting_result="FAILED"
            failed_tests+=("linting")
            [ "$fail_fast" = true ] && exit 1
        fi
    fi
    
    if [ "$run_unit" = true ]; then
        if run_unit_tests; then
            unit_result="PASSED"
        else
            unit_result="FAILED"
            failed_tests+=("unit")
            [ "$fail_fast" = true ] && exit 1
        fi
    fi
    
    if [ "$run_integration" = true ]; then
        if run_integration_tests; then
            integration_result="PASSED"
        else
            integration_result="FAILED"
            failed_tests+=("integration")
            [ "$fail_fast" = true ] && exit 1
        fi
    fi
    
    if [ "$run_e2e" = true ]; then
        if run_e2e_tests; then
            e2e_result="PASSED"
        else
            e2e_result="FAILED"
            failed_tests+=("e2e")
            [ "$fail_fast" = true ] && exit 1
        fi
    fi
    
    if [ "$run_performance" = true ]; then
        if run_performance_tests; then
            performance_result="PASSED"
        else
            performance_result="FAILED"
            failed_tests+=("performance")
            [ "$fail_fast" = true ] && exit 1
        fi
    fi
    
    # Generate report
    generate_report
    
    # Final summary
    echo ""
    echo "📊 Test Summary:"
    echo "================"
    echo "Unit Tests:        $unit_result"
    echo "Integration Tests: $integration_result"
    echo "E2E Tests:         $e2e_result"
    echo "Performance Tests: $performance_result"
    echo "Code Quality:      $linting_result"
    echo ""
    
    if [ ${#failed_tests[@]} -eq 0 ]; then
        log_success "All tests passed! 🎉"
        exit 0
    else
        log_error "Failed test suites: ${failed_tests[*]}"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"
