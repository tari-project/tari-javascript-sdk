#!/bin/bash
# Clean script for Tari JavaScript SDK

set -e

echo "🧹 Cleaning Tari JavaScript SDK..."

# Remove root build artifacts
echo "Cleaning root build artifacts..."
rm -rf node_modules
rm -rf coverage
rm -rf .nyc_output
rm -f *.log
rm -f *.tsbuildinfo

# Clean each package
for package_dir in packages/*/; do
  if [ -d "$package_dir" ]; then
    package_name=$(basename "$package_dir")
    echo "Cleaning package: $package_name"
    
    cd "$package_dir"
    rm -rf node_modules
    rm -rf dist
    rm -rf lib
    rm -rf build
    rm -rf coverage
    rm -f *.tsbuildinfo
    rm -f *.log
    cd - > /dev/null
  fi
done

# Clean native build artifacts if they exist
if [ -d "native" ]; then
  echo "Cleaning native build artifacts..."
  cd native
  if [ -f "Cargo.toml" ]; then
    cargo clean 2>/dev/null || true
  fi
  rm -rf target
  rm -rf tari
  cd - > /dev/null
fi

# Clean test artifacts
echo "Cleaning test artifacts..."
rm -rf test-wallets
rm -rf manual-test-wallets
rm -rf tmp

echo "✅ Clean complete!"
