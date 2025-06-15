#!/bin/bash

# Automated ESLint cleanup script for Tari JavaScript SDK
# Fixes safe, automatic issues

echo "🔧 Starting automated ESLint cleanup..."

# Remove development console.log statements (but keep console.error, console.warn)
echo "📝 Removing development console.log statements..."

# Find and remove console.log statements in library code (not examples or scripts)
find packages/wallet/src -name "*.ts" -not -path "*/tests/*" -not -path "*/__tests__/*" -not -path "*/examples/*" -not -path "*/scripts/*" | \
xargs sed -i.bak '/console\.log(/d'

find packages/core/src -name "*.ts" -not -path "*/tests/*" -not -path "*/__tests__/*" -not -path "*/examples/*" -not -path "*/scripts/*" | \
xargs sed -i.bak '/console\.log(/d'

# Remove backup files created by sed
find . -name "*.bak" -delete

echo "🧹 Running eslint --fix for automatic fixes..."
npm run lint:fix

echo "📊 Checking remaining issues..."
npm run lint | tail -20

echo "✅ Automated cleanup complete!"
echo "ℹ️  Manual review still needed for:"
echo "   - TypeScript 'any' types"
echo "   - Unused variables that may be intentional"
echo "   - Complex console statements that need manual review"
