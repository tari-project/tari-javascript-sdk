#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node prepare-release.js <version>');
  process.exit(1);
}

console.log(`Preparing release ${version}...`);

// Update all package versions
const packages = ['@tari/core', '@tari/wallet', '@tari/full'];
for (const pkg of packages) {
  const packagePath = path.join(__dirname, '..', 'packages', pkg, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  packageJson.version = version;
  
  // Update dependencies
  if (packageJson.dependencies) {
    for (const dep of packages) {
      if (packageJson.dependencies[dep]) {
        packageJson.dependencies[dep] = `^${version}`;
      }
    }
  }
  
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated ${pkg} to version ${version}`);
}

// Update root package.json
const rootPackagePath = path.join(__dirname, '..', 'package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
rootPackage.version = version;
fs.writeFileSync(rootPackagePath, JSON.stringify(rootPackage, null, 2) + '\n');

// Create git commit and tag
try {
  execSync('git add -A', { stdio: 'inherit' });
  execSync(`git commit -m "Release v${version}"`, { stdio: 'inherit' });
  execSync(`git tag v${version}`, { stdio: 'inherit' });
  console.log(`Created release commit and tag v${version}`);
} catch (error) {
  console.error('Failed to create git commit:', error.message);
}

console.log('\nRelease prepared successfully!');
console.log('To publish:');
console.log('1. Push changes: git push origin main --tags');
console.log('2. CI will automatically build and publish to NPM');
