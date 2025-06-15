#!/bin/bash

# Multi-network build orchestration script
# Builds FFI binaries for all supported networks with validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Supported networks
NETWORKS=("mainnet" "testnet" "nextnet")

# Build options
PARALLEL_BUILD=false
CLEAN_BEFORE=false
VALIDATE_AFTER=true
FORCE_REBUILD=false
BUILD_TIMEOUT=1800  # 30 minutes per network

# Build statistics
BUILD_START_TIME=0
TOTAL_BUILDS=0
SUCCESSFUL_BUILDS=0
FAILED_BUILDS=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_section() {
    echo -e "${CYAN}[SECTION]${NC} $1"
    echo "=================================================================================="
}

# Check prerequisites
check_prerequisites() {
    log_section "Checking Prerequisites"
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js is required but not found"
        exit 1
    fi
    
    local node_version=$(node --version | sed 's/v\([0-9]*\).*/\1/')
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js version 18+ required, found: $(node --version)"
        exit 1
    fi
    log_success "Node.js version: $(node --version)"
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        log_error "npm is required but not found"
        exit 1
    fi
    log_success "npm version: $(npm --version)"
    
    # Check Rust
    if ! command -v rustc >/dev/null 2>&1; then
        log_error "Rust is required but not found"
        echo "Install Rust from: https://rustup.rs/"
        exit 1
    fi
    log_success "Rust version: $(rustc --version)"
    
    # Check Cargo
    if ! command -v cargo >/dev/null 2>&1; then
        log_error "Cargo is required but not found"
        exit 1
    fi
    log_success "Cargo version: $(cargo --version)"
    
    # Check for Tari source
    if [ ! -d "$PROJECT_ROOT/.tari-cache/tari-current" ]; then
        log_warning "Tari source not found, will attempt to fetch it"
        setup_tari_source
    else
        log_success "Tari source available"
    fi
    
    echo
}

# Setup Tari source if needed
setup_tari_source() {
    log_section "Setting up Tari Source"
    
    cd "$PROJECT_ROOT"
    
    if ! npm run setup:tari-source; then
        log_error "Failed to setup Tari source"
        exit 1
    fi
    
    log_success "Tari source setup complete"
    echo
}

# Clean previous builds
clean_builds() {
    log_section "Cleaning Previous Builds"
    
    cd "$PROJECT_ROOT"
    
    # Clean npm builds
    if [ "$CLEAN_BEFORE" = true ]; then
        log_info "Cleaning npm build cache..."
        if npm run build:networks:clean >/dev/null 2>&1; then
            log_success "npm build cache cleaned"
        else
            log_warning "Failed to clean npm build cache (continuing anyway)"
        fi
        
        # Clean dist directory
        if [ -d "dist/native" ]; then
            log_info "Removing previous native builds..."
            rm -rf dist/native
            log_success "Previous native builds removed"
        fi
        
        # Clean Cargo cache
        log_info "Cleaning Cargo cache..."
        cd native/tari-wallet-ffi
        if cargo clean >/dev/null 2>&1; then
            log_success "Cargo cache cleaned"
        else
            log_warning "Failed to clean Cargo cache (continuing anyway)"
        fi
        cd "$PROJECT_ROOT"
    else
        log_info "Skipping clean (use --clean to enable)"
    fi
    
    echo
}

# Build single network
build_network() {
    local network="$1"
    local build_start=$(date +%s)
    
    log_section "Building $network Network"
    
    cd "$PROJECT_ROOT"
    
    # Set network environment
    export TARI_NETWORK="$network"
    export NETWORK_TYPE="$network"  # Backup for compatibility
    
    log_info "Building FFI binary for $network network..."
    log_info "Environment: TARI_NETWORK=$network"
    
    # Create a timeout wrapper
    local timeout_cmd=""
    if command -v timeout >/dev/null 2>&1; then
        timeout_cmd="timeout $BUILD_TIMEOUT"
    elif command -v gtimeout >/dev/null 2>&1; then
        timeout_cmd="gtimeout $BUILD_TIMEOUT"
    fi
    
    # Build the network
    local build_log="$PROJECT_ROOT/build-$network.log"
    
    if [ -n "$timeout_cmd" ]; then
        log_info "Building with $BUILD_TIMEOUT second timeout..."
        if $timeout_cmd npm run "build:networks:$network" > "$build_log" 2>&1; then
            local build_end=$(date +%s)
            local build_duration=$((build_end - build_start))
            log_success "$network build completed in ${build_duration}s"
            ((SUCCESSFUL_BUILDS++))
            rm -f "$build_log"  # Remove log on success
            return 0
        else
            log_error "$network build failed (see $build_log for details)"
            log_error "Last 10 lines of build log:"
            tail -n 10 "$build_log" || true
            ((FAILED_BUILDS++))
            return 1
        fi
    else
        log_warning "No timeout command available, building without timeout..."
        if npm run "build:networks:$network" > "$build_log" 2>&1; then
            local build_end=$(date +%s)
            local build_duration=$((build_end - build_start))
            log_success "$network build completed in ${build_duration}s"
            ((SUCCESSFUL_BUILDS++))
            rm -f "$build_log"  # Remove log on success
            return 0
        else
            log_error "$network build failed (see $build_log for details)"
            log_error "Last 10 lines of build log:"
            tail -n 10 "$build_log" || true
            ((FAILED_BUILDS++))
            return 1
        fi
    fi
}

# Build all networks sequentially
build_sequential() {
    log_section "Building Networks Sequentially"
    
    for network in "${NETWORKS[@]}"; do
        ((TOTAL_BUILDS++))
        
        if build_network "$network"; then
            log_success "✅ $network network build successful"
        else
            log_error "❌ $network network build failed"
            
            if [ "$FORCE_REBUILD" = false ]; then
                log_error "Stopping due to build failure (use --force to continue)"
                return 1
            else
                log_warning "Continuing despite failure (--force enabled)"
            fi
        fi
        
        echo
    done
    
    return 0
}

# Build all networks in parallel
build_parallel() {
    log_section "Building Networks in Parallel"
    
    local pids=()
    local build_logs=()
    
    # Start builds
    for network in "${NETWORKS[@]}"; do
        ((TOTAL_BUILDS++))
        
        log_info "Starting $network build in background..."
        
        # Create individual build script
        local build_script="$PROJECT_ROOT/build-$network.sh"
        cat > "$build_script" << EOF
#!/bin/bash
cd "$PROJECT_ROOT"
export TARI_NETWORK="$network"
export NETWORK_TYPE="$network"
npm run "build:networks:$network"
EOF
        chmod +x "$build_script"
        
        # Start build in background
        local build_log="$PROJECT_ROOT/build-$network.log"
        build_logs+=("$build_log")
        
        "$build_script" > "$build_log" 2>&1 &
        local pid=$!
        pids+=($pid)
        
        log_info "$network build started (PID: $pid)"
    done
    
    # Wait for builds to complete
    log_info "Waiting for parallel builds to complete..."
    
    local all_success=true
    for i in "${!pids[@]}"; do
        local pid=${pids[$i]}
        local network=${NETWORKS[$i]}
        local build_log=${build_logs[$i]}
        
        if wait $pid; then
            log_success "✅ $network build completed successfully"
            ((SUCCESSFUL_BUILDS++))
            rm -f "$build_log"  # Remove log on success
            rm -f "$PROJECT_ROOT/build-$network.sh"  # Remove script
        else
            log_error "❌ $network build failed"
            log_error "Build log for $network:"
            if [ -f "$build_log" ]; then
                tail -n 20 "$build_log" || true
            fi
            ((FAILED_BUILDS++))
            all_success=false
        fi
    done
    
    if [ "$all_success" = true ]; then
        return 0
    else
        return 1
    fi
}

# Validate builds
validate_builds() {
    if [ "$VALIDATE_AFTER" = true ]; then
        log_section "Validating Builds"
        
        if [ -x "$SCRIPT_DIR/validate-build.sh" ]; then
            if "$SCRIPT_DIR/validate-build.sh"; then
                log_success "Build validation passed"
                return 0
            else
                log_error "Build validation failed"
                return 1
            fi
        else
            log_warning "Build validation script not found or not executable"
            return 0
        fi
    else
        log_info "Skipping build validation (disabled)"
        return 0
    fi
}

# Generate build summary
generate_summary() {
    local build_end_time=$(date +%s)
    local total_duration=$((build_end_time - BUILD_START_TIME))
    
    log_section "Build Summary"
    
    echo "Build Statistics:"
    echo "  Total Networks: ${#NETWORKS[@]}"
    echo "  Total Builds: $TOTAL_BUILDS"
    echo "  Successful: $SUCCESSFUL_BUILDS"
    echo "  Failed: $FAILED_BUILDS"
    echo "  Total Duration: ${total_duration}s"
    echo "  Build Mode: $([ "$PARALLEL_BUILD" = true ] && echo "Parallel" || echo "Sequential")"
    echo
    
    if [ "$SUCCESSFUL_BUILDS" -eq "${#NETWORKS[@]}" ]; then
        log_success "🎉 All network builds completed successfully!"
        echo
        log_info "Next steps:"
        log_info "1. Run integration tests: npm run test:integration"
        log_info "2. Test examples: npm run example:console -- --network testnet"
        log_info "3. Validate manually: npm run validate:build"
        return 0
    else
        log_error "⚠️  Some network builds failed"
        echo
        log_info "To retry failed builds:"
        for network in "${NETWORKS[@]}"; do
            log_info "  npm run build:networks:$network"
        done
        return 1
    fi
}

# Show help
show_help() {
    cat << EOF
Usage: $0 [options]

Build FFI binaries for all supported Tari networks.

Options:
  --parallel, -p         Build networks in parallel (faster but uses more resources)
  --sequential, -s       Build networks sequentially (default, safer)
  --clean, -c            Clean previous builds before starting
  --no-validate          Skip build validation after completion
  --force, -f            Continue building even if a network fails
  --timeout SECONDS      Set build timeout per network (default: 1800)
  --help, -h             Show this help message

Networks built: ${NETWORKS[*]}

Examples:
  $0                     Build all networks sequentially
  $0 --parallel --clean  Clean and build all networks in parallel
  $0 --force             Build all networks, continuing on failures

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --parallel|-p)
            PARALLEL_BUILD=true
            shift
            ;;
        --sequential|-s)
            PARALLEL_BUILD=false
            shift
            ;;
        --clean|-c)
            CLEAN_BEFORE=true
            shift
            ;;
        --no-validate)
            VALIDATE_AFTER=false
            shift
            ;;
        --force|-f)
            FORCE_REBUILD=true
            shift
            ;;
        --timeout)
            BUILD_TIMEOUT="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    BUILD_START_TIME=$(date +%s)
    
    log_info "Starting multi-network build process..."
    log_info "Networks to build: ${NETWORKS[*]}"
    log_info "Build mode: $([ "$PARALLEL_BUILD" = true ] && echo "Parallel" || echo "Sequential")"
    log_info "Clean before: $CLEAN_BEFORE"
    log_info "Validate after: $VALIDATE_AFTER"
    log_info "Force rebuild: $FORCE_REBUILD"
    echo
    
    # Check prerequisites
    check_prerequisites
    
    # Clean if requested
    if [ "$CLEAN_BEFORE" = true ]; then
        clean_builds
    fi
    
    # Build networks
    if [ "$PARALLEL_BUILD" = true ]; then
        if ! build_parallel; then
            generate_summary
            exit 1
        fi
    else
        if ! build_sequential; then
            generate_summary
            exit 1
        fi
    fi
    
    # Validate builds
    if ! validate_builds; then
        generate_summary
        exit 1
    fi
    
    # Generate summary
    generate_summary
}

# Handle signals for cleanup
cleanup() {
    log_warning "Build interrupted, cleaning up..."
    
    # Kill any background processes
    for job in $(jobs -p); do
        kill $job 2>/dev/null || true
    done
    
    # Remove temporary scripts
    rm -f "$PROJECT_ROOT"/build-*.sh
    
    exit 130
}

trap cleanup SIGINT SIGTERM

# Run main function
main "$@"
