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
 */
export const SUPPORTED_PLATFORMS = new Map<string, string>([
  ['darwin-x64', 'wallet-ffi.darwin-x64.node'],
  ['darwin-arm64', 'wallet-ffi.darwin-arm64.node'],
  ['linux-x64', 'wallet-ffi.linux-x64.node'],
  ['linux-arm64', 'wallet-ffi.linux-arm64.node'],
  ['win32-x64', 'wallet-ffi.win32-x64.node'],
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
  const { binaryName } = platformInfo;
  
  return {
    // Local development build
    local: `./native/target/release/${binaryName}`,
    // NPM package location
    nodeModules: `./node_modules/@tari-project/tarijs-core/native/${binaryName}`,
    // Global installation
    global: `/usr/local/lib/tari/${binaryName}`,
  };
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
