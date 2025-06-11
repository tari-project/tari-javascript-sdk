/**
 * Binary resolution system with fallback chains and path validation
 */

import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { getCurrentPlatform, getBinaryPaths, normalizePath, getUnsupportedPlatformMessage } from './platforms.js';

export interface BinaryResolverOptions {
  searchPaths?: string[];
  enableDevelopmentPath?: boolean;
  customBinaryName?: string;
}

export interface ResolvedBinary {
  path: string;
  source: 'local' | 'node_modules' | 'global' | 'custom' | 'environment';
  exists: boolean;
}

/**
 * Resolves the correct native binary for the current platform
 */
export class BinaryResolver {
  private readonly platformInfo = getCurrentPlatform();
  private readonly options: Required<BinaryResolverOptions>;

  constructor(options: BinaryResolverOptions = {}) {
    this.options = {
      searchPaths: [],
      enableDevelopmentPath: true,
      customBinaryName: '',
      ...options,
    };

    if (!this.platformInfo.isSupported) {
      throw new Error(getUnsupportedPlatformMessage(this.platformInfo));
    }
  }

  /**
   * Resolve binary with comprehensive fallback chain
   */
  public resolveBinary(): ResolvedBinary {
    // 1. Check environment variable override
    const envPath = process.env.TARI_WALLET_FFI_BINARY;
    if (envPath) {
      return {
        path: normalizePath(resolve(envPath)),
        source: 'environment',
        exists: existsSync(envPath),
      };
    }

    // 2. Try custom search paths first
    for (const searchPath of this.options.searchPaths) {
      const binaryPath = this.findBinaryInPath(searchPath);
      if (binaryPath && existsSync(binaryPath)) {
        return {
          path: normalizePath(binaryPath),
          source: 'custom',
          exists: true,
        };
      }
    }

    // 3. Standard fallback chain
    const binaryPaths = getBinaryPaths(this.platformInfo);
    
    const candidates: Array<{ path: string; source: ResolvedBinary['source'] }> = [
      // Local development build (if enabled)
      ...(this.options.enableDevelopmentPath ? [{ path: binaryPaths.local, source: 'local' as const }] : []),
      // NPM package location
      { path: binaryPaths.nodeModules, source: 'node_modules' as const },
      // Global installation
      { path: binaryPaths.global, source: 'global' as const },
    ];

    for (const { path, source } of candidates) {
      const resolvedPath = normalizePath(resolve(path));
      if (existsSync(resolvedPath)) {
        return {
          path: resolvedPath,
          source,
          exists: true,
        };
      }
    }

    // Return first candidate with exists: false if nothing found
    const firstCandidate = candidates[0];
    return {
      path: normalizePath(resolve(firstCandidate?.path || binaryPaths.nodeModules)),
      source: firstCandidate?.source || 'node_modules',
      exists: false,
    };
  }

  /**
   * Find binary in a specific directory path
   */
  private findBinaryInPath(searchPath: string): string | null {
    const binaryName = this.options.customBinaryName || this.platformInfo.binaryName;
    
    // Try exact path first
    if (searchPath.endsWith('.node')) {
      return searchPath;
    }
    
    // Try path as directory with platform-specific binary
    const directPath = join(searchPath, binaryName);
    if (existsSync(directPath)) {
      return directPath;
    }
    
    // Try platform subdirectory
    const platformDir = join(searchPath, `${this.platformInfo.platform}-${this.platformInfo.arch}`);
    const platformPath = join(platformDir, binaryName);
    if (existsSync(platformPath)) {
      return platformPath;
    }
    
    return null;
  }

  /**
   * Validate that resolved binary is loadable
   */
  public validateBinary(resolvedBinary: ResolvedBinary): void {
    if (!resolvedBinary.exists) {
      throw new Error(
        `Tari wallet FFI binary not found at: ${resolvedBinary.path}. ` +
        `Please install the binary or set TARI_WALLET_FFI_BINARY environment variable.`
      );
    }

    // Additional validation could include:
    // - File permissions check
    // - Binary signature verification
    // - Version compatibility check
  }

  /**
   * Get installation instructions for missing binary
   */
  public getInstallationInstructions(): string {
    const platform = this.platformInfo.platform;
    
    switch (platform) {
      case 'darwin':
        return 'Install via: npm install @tari-project/tarijs-core or brew install tari-wallet-ffi';
      case 'linux':
        return 'Install via: npm install @tari-project/tarijs-core or apt-get install tari-wallet-ffi';
      case 'win32':
        return 'Install via: npm install @tari-project/tarijs-core or download from GitHub releases';
      default:
        return 'Install via: npm install @tari-project/tarijs-core';
    }
  }
}
