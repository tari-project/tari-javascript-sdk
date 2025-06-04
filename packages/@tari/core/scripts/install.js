#!/usr/bin/env node
const { existsSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

// Check if prebuilds exist
const platform = process.platform;
const arch = process.arch;
const prebuildPath = join(__dirname, '..', 'prebuilds', `${platform}-${arch}`, 'index.node');

if (existsSync(prebuildPath)) {
  console.log(`Using prebuild for ${platform}-${arch}`);
  process.exit(0);
}

// Check if we should build from source
if (process.env.npm_config_build_from_source) {
  console.log('Building from source as requested...');
  try {
    execSync('npm run build:native', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to build from source:', error.message);
    process.exit(1);
  }
} else {
  // Try to download prebuild
  console.log('Attempting to download prebuild...');
  try {
    execSync('prebuild-install', { stdio: 'inherit' });
  } catch (error) {
    console.warn('Prebuild download failed, building from source...');
    try {
      execSync('npm run build:native', { stdio: 'inherit' });
    } catch (buildError) {
      console.error('Failed to build from source:', buildError.message);
      process.exit(1);
    }
  }
}
