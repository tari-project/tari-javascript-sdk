/**
 * @fileoverview Build utilities and automation for Tari JavaScript SDK
 * 
 * This module provides build tooling for network-specific compilation,
 * Tari source fetching, FFI compilation, and package variant creation.
 * Used primarily during development and CI/CD processes.
 * 
 * @version 0.0.1
 * @author The Tari Community
 * @license BSD-3-Clause
 */

import { NetworkType } from '@tari-project/tarijs-core';

// Re-export build utilities
export * from './types/index';
export * from './fetch/index';
export * from './compile/index';
export * from './package/index';

// Build configuration
export interface BuildConfig {
  network: NetworkType;
  tariTag: string;
  features: string[];
  outputPath: string;
  packageName: string;
  targetTriple?: string;
  buildMode: 'debug' | 'release';
}

// Network-specific build patterns
export class NetworkBuilder {
  private static readonly TAG_PATTERNS: Record<NetworkType, (version: string, build?: number) => string> = {
    [NetworkType.Testnet]: (version: string, build: number = 0) => `${version}-pre.${build}`,
    [NetworkType.Nextnet]: (version: string, build: number = 0) => `${version}-rc.${build}`,
    [NetworkType.Mainnet]: (version: string) => version,
  };

  static resolveTariTag(baseVersion: string, network: NetworkType, buildNum?: number): string {
    const pattern = this.TAG_PATTERNS[network];
    return network === NetworkType.Mainnet 
      ? pattern(baseVersion) 
      : pattern(baseVersion, buildNum || 0);
  }

  static getPackageName(network: NetworkType): string {
    const suffix = network === NetworkType.Mainnet ? '' : `-${network}`;
    return `@tari-project/tarijs-wallet${suffix}`;
  }

  static async buildForNetwork(baseVersion: string, network: NetworkType): Promise<void> {
    // Placeholder implementation - will be implemented in Phase 2
    throw new Error('Network building not yet implemented');
  }
}

// Version information
export const BUILD_VERSION = '0.0.1';
export const BUILD_SDK_NAME = '@tari-project/tarijs-build';

// Main builder class is already exported above
