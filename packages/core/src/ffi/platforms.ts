/**
 * Platform detection and binary path resolution for Tari wallet FFI
 */

import { platform, arch } from 'process';

export interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  binaryName: string;
  isSupported: boolean;
}

export interface BinaryPaths {
  local: string;
  nodeModules: string;
  global: string;
}

/**
 * Supported platform matrix for Tari wallet FFI binaries
 * Maps platform keys to the NAPI .node file names
 */
export const SUPPORTED_PLATFORMS = new Map<string, string>([
  ['darwin-x64', 'tari-wallet-ffi.darwin-x64.node'],
  ['darwin-arm64', 'tari-wallet-ffi.darwin-arm64.node'],
  ['linux-x64', 'tari-wallet-ffi.linux-x64.node'],
  ['linux-arm64', 'tari-wallet-ffi.linux-arm64.node'],
  ['win32-x64', 'tari-wallet-ffi.win32-x64.node'],
]);

/**
 * Get current platform information
 */
export function getCurrentPlatform(): PlatformInfo {
  const currentPlatform = platform;
  const currentArch = arch;
  const platformKey = `${currentPlatform}-${currentArch}`;
  const binaryName = SUPPORTED_PLATFORMS.get(platformKey);
  
  return {
    platform: currentPlatform,
    arch: currentArch,
    binaryName: binaryName || '',
    isSupported: !!binaryName,
  };
}

/**
 * Generate all possible binary paths for the current platform
 */
export function getBinaryPaths(platformInfo: PlatformInfo): BinaryPaths {
  const { platform, arch, binaryName } = platformInfo;
  
  // Map Node.js arch names to Rust target names
  const rustArch = arch === 'x64' ? 'x86_64' : (arch === 'arm64' ? 'aarch64' : arch);
  const rustTarget = `${rustArch}-${getPlatformTarget(platform)}`;
  
  return {
    // Local development build (in dist/native/{target}/ from build script)
    local: `./dist/native/${rustTarget}/${binaryName}`,
    // NPM package location
    nodeModules: `./node_modules/@tari-project/tarijs-core/native/${rustTarget}/${binaryName}`,
    // Global installation
    global: `/usr/local/lib/tari/${binaryName}`,
  };
}

/**
 * Get Rust target platform name from Node.js platform
 */
function getPlatformTarget(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin':
      return 'apple-darwin';
    case 'linux':
      return 'unknown-linux-gnu';
    case 'win32':
      return 'pc-windows-msvc';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Normalize path separators for cross-platform compatibility
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Get platform-specific error message for unsupported platforms
 */
export function getUnsupportedPlatformMessage(platformInfo: PlatformInfo): string {
  return `Unsupported platform: ${platformInfo.platform}-${platformInfo.arch}. ` +
    `Supported platforms: ${Array.from(SUPPORTED_PLATFORMS.keys()).join(', ')}`;
}
