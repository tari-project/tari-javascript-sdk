#!/bin/bash

# Enhanced TypeScript and ESLint cleanup script for Tari JavaScript SDK
# Systematically eliminates TypeScript 'any' types and fixes common ESLint issues

set -e

echo "🔧 Starting comprehensive TypeScript and ESLint cleanup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}🔍 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Step 1: Fix unused variables with underscore prefix
print_status "Fixing unused variables with underscore prefix..."

# Find unused variables and parameters, prefix with underscore
find packages -name "*.ts" -not -path "*/node_modules/*" | while read -r file; do
    # Skip already processed files or generated files
    if [[ "$file" == *".d.ts" ]] || [[ "$file" == *"/dist/"* ]]; then
        continue
    fi
    
    # Use sed to prefix unused parameters with underscore (simple cases)
    # This handles function parameters that are clearly unused
    if grep -q "is defined but never used" <(npm run lint 2>&1 | grep "$file" || true); then
        print_warning "Found unused variables in $file - manual review needed"
    fi
done

# Step 2: Replace simple 'any' types with 'unknown'
print_status "Replacing simple 'any' types with 'unknown'..."

find packages -name "*.ts" -not -path "*/node_modules/*" -not -path "*/.d.ts" | while read -r file; do
    # Replace function parameters typed as 'any' with 'unknown'
    sed -i.bak 's/: any\(\[\]\)\?)/: unknown$1)/g' "$file"
    
    # Replace variable declarations typed as 'any' with 'unknown'
    sed -i.bak 's/: any\(\[\]\)\?\s*=/: unknown$1 =/g' "$file"
    
    # Replace generic any with unknown in simple cases
    sed -i.bak 's/<any>/<unknown>/g' "$file"
done

# Step 3: Fix console statement issues
print_status "Removing development console.log statements..."

# Remove console.log in production code (but keep in tests and examples)
find packages -name "*.ts" \
    -not -path "*/tests/*" \
    -not -path "*/__tests__/*" \
    -not -path "*/examples/*" \
    -not -path "*/scripts/*" \
    -not -path "*/*.test.ts" \
    -not -path "*/*.spec.ts" | while read -r file; do
    
    # Remove simple console.log statements but preserve console.error, console.warn
    sed -i.bak '/^\s*console\.log(/d' "$file"
    
    # Comment out more complex console.log statements for manual review
    sed -i.bak 's/^\(\s*\)console\.log(/\1\/\/ console.log(/g' "$file"
done

# Step 4: Fix require() imports to use ES modules
print_status "Converting require() statements to ES imports..."

find packages -name "*.ts" -not -path "*/node_modules/*" | while read -r file; do
    # Simple require to import conversion for common patterns
    sed -i.bak "s/const \([a-zA-Z0-9_]*\) = require('\([^']*\)')/import \1 from '\2'/g" "$file"
    sed -i.bak "s/const { \([^}]*\) } = require('\([^']*\)')/import { \1 } from '\2'/g" "$file"
done

# Step 5: Remove backup files
print_status "Cleaning up backup files..."
find . -name "*.bak" -delete

# Step 6: Run ESLint auto-fix
print_status "Running ESLint automatic fixes..."
npm run lint:fix || print_warning "Some ESLint fixes failed - continuing..."

# Step 7: Type checking
print_status "Running TypeScript type check..."
if npm run type-check; then
    print_success "TypeScript compilation successful"
else
    print_warning "TypeScript compilation has errors - manual review needed"
fi

# Step 8: Generate report
print_status "Generating cleanup report..."

# Count remaining issues
ANY_COUNT=$(npm run lint 2>&1 | grep -c "no-explicit-any" || echo "0")
UNUSED_COUNT=$(npm run lint 2>&1 | grep -c "no-unused-vars" || echo "0")
CONSOLE_COUNT=$(npm run lint 2>&1 | grep -c "no-console" || echo "0")
TOTAL_ISSUES=$(npm run lint 2>&1 | grep -E "error|warning" | wc -l | tr -d ' ')

echo ""
echo "📊 Cleanup Summary:"
echo "==================="
echo "Remaining 'any' types: $ANY_COUNT"
echo "Remaining unused variables: $UNUSED_COUNT"  
echo "Remaining console statements: $CONSOLE_COUNT"
echo "Total remaining issues: $TOTAL_ISSUES"
echo ""

if [ "$TOTAL_ISSUES" -lt 500 ]; then
    print_success "Significant improvement! Issues reduced below 500."
elif [ "$TOTAL_ISSUES" -lt 1000 ]; then
    print_warning "Good progress! Issues reduced below 1000."
else
    print_warning "More work needed. Consider running the script again or manual review."
fi

echo ""
echo "🔧 Next steps for manual review:"
echo "================================"
echo "1. Review remaining 'any' types and replace with specific types"
echo "2. Check unused variables that may be intentional (add _ prefix)"
echo "3. Review commented console statements"
echo "4. Fix any TypeScript compilation errors"
echo "5. Test the application to ensure no functionality was broken"

print_success "Cleanup script completed!"
