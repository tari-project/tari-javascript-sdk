#!/bin/bash

# Build documentation script for Tari JavaScript SDK
# This script builds both TypeDoc API documentation and Docusaurus site

set -e  # Exit on any error

echo "🏗️  Building Tari JavaScript SDK Documentation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "This script must be run from the project root directory"
    exit 1
fi

# Check if docs directory exists
if [ ! -d "docs" ]; then
    print_error "docs directory not found. Make sure you're in the correct project directory."
    exit 1
fi

# Step 1: Install documentation dependencies
print_status "Installing documentation dependencies..."
cd docs
if [ ! -d "node_modules" ]; then
    npm install
else
    print_status "Dependencies already installed, skipping..."
fi
cd ..

# Step 2: Build TypeScript packages first
print_status "Building TypeScript packages..."
npm run build || {
    print_error "Failed to build TypeScript packages"
    exit 1
}

# Step 3: Generate TypeDoc API documentation
print_status "Generating TypeDoc API documentation..."
if command -v typedoc >/dev/null 2>&1; then
    typedoc
    print_success "TypeDoc API documentation generated"
else
    print_warning "TypeDoc not found globally, installing locally..."
    npx typedoc
    print_success "TypeDoc API documentation generated with npx"
fi

# Step 4: Check if API docs were generated
if [ ! -d "docs/static/api" ]; then
    print_warning "API documentation directory not found, but continuing..."
fi

# Step 5: Build Docusaurus site
print_status "Building Docusaurus documentation site..."
cd docs
npm run build || {
    print_error "Failed to build Docusaurus site"
    exit 1
}
cd ..

# Step 6: Verify build output
if [ -d "docs/build" ]; then
    print_success "Documentation site built successfully!"
    print_status "Build output location: docs/build/"
    
    # Show build statistics
    if command -v du >/dev/null 2>&1; then
        BUILD_SIZE=$(du -sh docs/build | cut -f1)
        print_status "Total build size: $BUILD_SIZE"
    fi
    
    # List main files
    print_status "Main files generated:"
    if [ -f "docs/build/index.html" ]; then
        echo "  ✅ docs/build/index.html"
    fi
    if [ -d "docs/build/docs" ]; then
        echo "  ✅ docs/build/docs/ (documentation pages)"
    fi
    if [ -d "docs/build/api" ]; then
        echo "  ✅ docs/build/api/ (API reference)"
    fi
    if [ -d "docs/static/api" ]; then
        echo "  ✅ docs/static/api/ (TypeDoc output)"
    fi
    
else
    print_error "Build directory not found!"
    exit 1
fi

# Step 7: Generate deployment info
print_status "Generating deployment information..."
cat > docs/build/deploy-info.json << EOF
{
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "nodeVersion": "$(node --version)",
  "npmVersion": "$(npm --version)"
}
EOF

print_success "Documentation build complete! 🎉"
print_status ""
print_status "Next steps:"
print_status "  • Test locally: cd docs && npm run serve"
print_status "  • Deploy: ./scripts/deploy-docs.sh"
print_status "  • View API docs: open docs/static/api/index.html"
print_status ""
print_status "Build artifacts:"
print_status "  • Static site: docs/build/"
print_status "  • API reference: docs/static/api/"
print_status "  • Deployment info: docs/build/deploy-info.json"
