#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const platform = process.platform;
const arch = process.arch;

console.log(`Building native module for ${platform}-${arch}`);

// Determine Rust target
const rustTarget = getRustTarget(platform, arch);
console.log(`Rust target: ${rustTarget}`);

// Install target if needed
try {
  execSync(`rustup target add ${rustTarget}`, { stdio: 'inherit' });
} catch (e) {
  console.warn(`Could not add target ${rustTarget}, may already be installed`);
}

// Set up cross-compilation environment
setupCrossCompileEnv(platform, arch);

// Build native module
const buildCmd = `cargo build --release --target ${rustTarget}`;
console.log(`Running: ${buildCmd}`);

try {
  execSync(buildCmd, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..', 'native'),
  });
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}

// Copy built library to expected location
copyBuiltLibrary(rustTarget, platform);

console.log('Native module built successfully');

function getRustTarget(platform, arch) {
  const targets = {
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
    'win32-x64': 'x86_64-pc-windows-msvc',
  };

  const key = `${platform}-${arch}`;
  if (!targets[key]) {
    throw new Error(`Unsupported platform: ${key}`);
  }

  return targets[key];
}

function setupCrossCompileEnv(platform, arch) {
  if (platform === 'linux' && arch === 'arm64' && process.arch === 'x64') {
    // Cross-compiling Linux ARM64 on x64
    process.env.CC = 'aarch64-linux-gnu-gcc';
    process.env.CXX = 'aarch64-linux-gnu-g++';
    process.env.AR = 'aarch64-linux-gnu-ar';
    process.env.CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER = 'aarch64-linux-gnu-gcc';
  }
}

function copyBuiltLibrary(rustTarget, platform) {
  // Neon automatically creates index.node during the build process
  // Check if index.node exists in the native directory
  const nativeDir = path.join(__dirname, '..', 'native');
  const indexNode = path.join(nativeDir, 'index.node');

  if (fs.existsSync(indexNode)) {
    console.log(`Native module built successfully: ${indexNode}`);
    return;
  }

  // Fallback: check if we need to copy from target directory
  const srcDir = path.join(__dirname, '..', 'native', 'target', rustTarget, 'release');
  
  let srcFile;
  switch (platform) {
    case 'darwin':
      srcFile = 'libtari_core_native.dylib';
      break;
    case 'linux':
      srcFile = 'libtari_core_native.so';
      break;
    case 'win32':
      srcFile = 'tari_core_native.dll';
      break;
  }

  const src = path.join(srcDir, srcFile);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, indexNode);
    console.log(`Copied ${src} to ${indexNode}`);
  } else {
    throw new Error(`Built library not found: ${src} and index.node was not created automatically`);
  }
}
