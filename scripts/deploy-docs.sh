#!/bin/bash

# Deploy documentation script for Tari JavaScript SDK
# This script deploys documentation to GitHub Pages

set -e  # Exit on any error

echo "🚀 Deploying Tari JavaScript SDK Documentation..."

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

# Parse command line arguments
DEPLOYMENT_TYPE="production"
FORCE_DEPLOY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --staging)
            DEPLOYMENT_TYPE="staging"
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        --help)
            echo "Usage: $0 [--staging] [--force] [--help]"
            echo ""
            echo "Options:"
            echo "  --staging    Deploy to staging environment"
            echo "  --force      Force deployment even with uncommitted changes"
            echo "  --help       Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "This script must be run from the project root directory"
    exit 1
fi

# Check for git repository
if [ ! -d ".git" ]; then
    print_error "This is not a git repository"
    exit 1
fi

# Check for uncommitted changes (unless force flag is used)
if [ "$FORCE_DEPLOY" = false ]; then
    if ! git diff-index --quiet HEAD --; then
        print_error "You have uncommitted changes. Commit them first or use --force flag."
        print_status "Uncommitted files:"
        git status --porcelain
        exit 1
    fi
fi

# Check if build directory exists
if [ ! -d "docs/build" ]; then
    print_status "Build directory not found. Building documentation first..."
    ./scripts/build-docs.sh
fi

# Step 1: Verify build
print_status "Verifying documentation build..."
if [ ! -f "docs/build/index.html" ]; then
    print_error "Built documentation not found. Run ./scripts/build-docs.sh first."
    exit 1
fi

# Step 2: Set deployment configuration
if [ "$DEPLOYMENT_TYPE" = "staging" ]; then
    print_status "Deploying to staging environment..."
    DEPLOY_BRANCH="gh-pages-staging"
    DEPLOY_MESSAGE="Deploy docs to staging: $(date)"
else
    print_status "Deploying to production environment..."
    DEPLOY_BRANCH="gh-pages"
    DEPLOY_MESSAGE="Deploy docs to production: $(date)"
fi

# Step 3: Get current git info
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_COMMIT=$(git rev-parse HEAD)
SHORT_COMMIT=$(git rev-parse --short HEAD)

print_status "Current branch: $CURRENT_BRANCH"
print_status "Current commit: $SHORT_COMMIT"

# Step 4: Deploy using Docusaurus
print_status "Deploying with Docusaurus deploy command..."
cd docs

# Set environment variables for deployment
export GIT_USER="${GIT_USER:-$(git config user.name)}"
export DEPLOYMENT_BRANCH="$DEPLOY_BRANCH"

if [ "$DEPLOYMENT_TYPE" = "staging" ]; then
    # For staging, we might want to use a different URL
    export USE_SSH="${USE_SSH:-true}"
fi

# Deploy using Docusaurus
npm run deploy -- --message "$DEPLOY_MESSAGE" || {
    print_error "Deployment failed"
    exit 1
}

cd ..

# Step 5: Verify deployment
print_success "Documentation deployed successfully! 🎉"
print_status ""
print_status "Deployment details:"
print_status "  • Type: $DEPLOYMENT_TYPE"
print_status "  • Branch: $DEPLOY_BRANCH"
print_status "  • Source commit: $SHORT_COMMIT"
print_status "  • Deploy time: $(date)"

if [ "$DEPLOYMENT_TYPE" = "production" ]; then
    print_status ""
    print_status "📖 Documentation available at:"
    print_status "    https://tari-project.github.io/tari-javascript-sdk/"
    print_status ""
    print_status "🔗 Direct links:"
    print_status "    • Getting Started: https://tari-project.github.io/tari-javascript-sdk/docs/getting-started/installation"
    print_status "    • API Reference: https://tari-project.github.io/tari-javascript-sdk/api/"
    print_status "    • Examples: https://tari-project.github.io/tari-javascript-sdk/examples/"
else
    print_status ""
    print_status "📖 Staging documentation available at:"
    print_status "    https://tari-project.github.io/tari-javascript-sdk/ (staging branch)"
fi

# Step 6: Optional - create deployment tag
if [ "$DEPLOYMENT_TYPE" = "production" ]; then
    read -p "Create deployment tag? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        TAG_NAME="docs-deploy-$(date +%Y%m%d-%H%M%S)"
        git tag -a "$TAG_NAME" -m "Documentation deployment: $TAG_NAME"
        print_success "Created tag: $TAG_NAME"
        
        read -p "Push tag to remote? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git push origin "$TAG_NAME"
            print_success "Tag pushed to remote"
        fi
    fi
fi

print_status ""
print_status "🎯 Next steps:"
print_status "  • Wait 2-5 minutes for GitHub Pages to update"
print_status "  • Test the deployed documentation"
print_status "  • Share the documentation URL with your team"
print_status "  • Monitor for any deployment issues"

print_success "Deployment complete! 🚀"
