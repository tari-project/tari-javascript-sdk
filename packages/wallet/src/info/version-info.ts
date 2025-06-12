/**
 * @fileoverview Version information and compatibility checking service
 * 
 * Provides version compatibility validation between SDK, core wallet, FFI,
 * and protocol versions with warnings and upgrade recommendations.
 */

import {
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  getFFIBindings
} from '@tari-project/tarijs-core';
import type {
  VersionInfo,
  VersionWarning,
  VersionCompatibility
} from './types.js';

/**
 * Version parsing and comparison utilities
 */
class VersionUtils {
  /**
   * Parse semantic version string
   */
  static parseVersion(version: string): { major: number; minor: number; patch: number; pre?: string } {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+))?/);
    if (!match) {
      throw new Error(`Invalid version format: ${version}`);
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      pre: match[4]
    };
  }

  /**
   * Compare two version strings
   * @returns -1 if a < b, 0 if a === b, 1 if a > b
   */
  static compareVersions(a: string, b: string): number {
    const versionA = this.parseVersion(a);
    const versionB = this.parseVersion(b);

    // Compare major
    if (versionA.major !== versionB.major) {
      return versionA.major < versionB.major ? -1 : 1;
    }

    // Compare minor
    if (versionA.minor !== versionB.minor) {
      return versionA.minor < versionB.minor ? -1 : 1;
    }

    // Compare patch
    if (versionA.patch !== versionB.patch) {
      return versionA.patch < versionB.patch ? -1 : 1;
    }

    // Compare pre-release
    if (versionA.pre && versionB.pre) {
      return versionA.pre < versionB.pre ? -1 : versionA.pre > versionB.pre ? 1 : 0;
    }
    if (versionA.pre && !versionB.pre) return -1; // Pre-release < release
    if (!versionA.pre && versionB.pre) return 1;  // Release > pre-release

    return 0;
  }

  /**
   * Check if version is in range
   */
  static isVersionInRange(version: string, min: string, max: string): boolean {
    return this.compareVersions(version, min) >= 0 && this.compareVersions(version, max) <= 0;
  }
}

/**
 * Version information service for compatibility checking
 */
export class VersionInfoService {
  private static readonly SDK_VERSION = '0.0.1';
  private static readonly MIN_CORE_VERSION = '1.0.0';
  private static readonly MAX_CORE_VERSION = '2.0.0';
  private static readonly PROTOCOL_VERSION = '1.0';

  private isDestroyed = false;

  /**
   * Get comprehensive version information
   */
  async getVersionInfo(options: VersionCompatibility = {}): Promise<VersionInfo> {
    this.ensureNotDestroyed();

    try {
      const [coreVersion, ffiVersion] = await Promise.all([
        this.getCoreVersion(),
        this.getFFIVersion()
      ]);

      const targetCoreVersion = options.targetCoreVersion || coreVersion;
      const warnings = this.generateWarnings(coreVersion, ffiVersion, options);
      const isCompatible = this.checkCompatibility(targetCoreVersion, options);

      return {
        sdkVersion: VersionInfoService.SDK_VERSION,
        coreVersion,
        ffiVersion,
        protocolVersion: VersionInfoService.PROTOCOL_VERSION,
        minCoreVersion: VersionInfoService.MIN_CORE_VERSION,
        maxCoreVersion: VersionInfoService.MAX_CORE_VERSION,
        isCompatible,
        warnings,
        upgradeRequired: this.isUpgradeRequired(coreVersion, options)
      };
    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.InternalError,
        'Failed to retrieve version information',
        {
          severity: ErrorSeverity.Error,
          cause: error as Error,
          context: {
            operation: 'getVersionInfo',
            component: 'VersionInfoService'
          }
        }
      );
    }
  }

  /**
   * Check if current versions are compatible
   */
  async isCompatible(options: VersionCompatibility = {}): Promise<boolean> {
    this.ensureNotDestroyed();

    try {
      const versionInfo = await this.getVersionInfo(options);
      return versionInfo.isCompatible;
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Get version compatibility warnings
   */
  async getCompatibilityWarnings(options: VersionCompatibility = {}): Promise<VersionWarning[]> {
    this.ensureNotDestroyed();

    try {
      const versionInfo = await this.getVersionInfo(options);
      return versionInfo.warnings;
    } catch (error: unknown) {
      return [{
        type: 'incompatible',
        message: 'Unable to determine version compatibility',
        component: 'version_check',
        severity: 'high',
        action: 'Check network connection and wallet status'
      }];
    }
  }

  /**
   * Check if an upgrade is required
   */
  async requiresUpgrade(options: VersionCompatibility = {}): Promise<boolean> {
    this.ensureNotDestroyed();

    try {
      const versionInfo = await this.getVersionInfo(options);
      return versionInfo.upgradeRequired;
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Get recommended upgrade version
   */
  getRecommendedUpgradeVersion(): string {
    return VersionInfoService.MAX_CORE_VERSION;
  }

  /**
   * Validate version format
   */
  validateVersionFormat(version: string): boolean {
    try {
      VersionUtils.parseVersion(version);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compare two version strings
   */
  compareVersions(a: string, b: string): number {
    return VersionUtils.compareVersions(a, b);
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this.isDestroyed = true;
  }

  /**
   * Check if the service has been destroyed
   */
  get destroyed(): boolean {
    return this.isDestroyed;
  }

  // Private helper methods

  private async getCoreVersion(): Promise<string> {
    try {
      const bindings = getFFIBindings();
      // Mock implementation - would need actual FFI support
      return '1.0.0';
    } catch {
      return 'unknown';
    }
  }

  private async getFFIVersion(): Promise<string> {
    try {
      const bindings = getFFIBindings();
      // Mock implementation - would need actual FFI support  
      return '1.0.0';
    } catch {
      return 'unknown';
    }
  }

  private checkCompatibility(coreVersion: string, options: VersionCompatibility): boolean {
    if (coreVersion === 'unknown') {
      return false;
    }

    try {
      const isInRange = VersionUtils.isVersionInRange(
        coreVersion,
        VersionInfoService.MIN_CORE_VERSION,
        VersionInfoService.MAX_CORE_VERSION
      );

      if (options.strict) {
        // In strict mode, require exact version match
        return VersionUtils.compareVersions(coreVersion, VersionInfoService.SDK_VERSION) === 0;
      }

      return isInRange;
    } catch {
      return false;
    }
  }

  private generateWarnings(
    coreVersion: string,
    ffiVersion: string,
    options: VersionCompatibility
  ): VersionWarning[] {
    const warnings: VersionWarning[] = [];

    // Check for unknown versions
    if (coreVersion === 'unknown') {
      warnings.push({
        type: 'incompatible',
        message: 'Unable to determine core wallet version',
        component: 'core',
        severity: 'high',
        action: 'Verify wallet installation and connectivity'
      });
    }

    if (ffiVersion === 'unknown') {
      warnings.push({
        type: 'incompatible',
        message: 'Unable to determine FFI bindings version',
        component: 'ffi',
        severity: 'medium',
        action: 'Check FFI bindings installation'
      });
    }

    // Check for version mismatches
    if (coreVersion !== 'unknown' && ffiVersion !== 'unknown') {
      const coreComparison = VersionUtils.compareVersions(coreVersion, ffiVersion);
      if (coreComparison !== 0) {
        warnings.push({
          type: 'incompatible',
          message: `Core version (${coreVersion}) and FFI version (${ffiVersion}) mismatch`,
          component: 'version_mismatch',
          severity: 'medium',
          action: 'Update to matching versions'
        });
      }
    }

    // Check for deprecated versions
    if (coreVersion !== 'unknown') {
      const isOldVersion = VersionUtils.compareVersions(
        coreVersion,
        VersionInfoService.MIN_CORE_VERSION
      ) < 0;

      if (isOldVersion) {
        warnings.push({
          type: 'deprecated',
          message: `Core version ${coreVersion} is deprecated`,
          component: 'core',
          severity: 'high',
          action: `Upgrade to version ${VersionInfoService.MIN_CORE_VERSION} or later`
        });
      }
    }

    // Check for experimental features
    if (options.includeExperimental) {
      warnings.push({
        type: 'experimental',
        message: 'Experimental features are enabled',
        component: 'features',
        severity: 'low',
        action: 'Use with caution in production environments'
      });
    }

    return warnings;
  }

  private isUpgradeRequired(coreVersion: string, options: VersionCompatibility): boolean {
    if (coreVersion === 'unknown') {
      return true;
    }

    try {
      // Upgrade required if below minimum version
      const belowMinimum = VersionUtils.compareVersions(
        coreVersion,
        VersionInfoService.MIN_CORE_VERSION
      ) < 0;

      // Or if above maximum version (incompatible future version)
      const aboveMaximum = VersionUtils.compareVersions(
        coreVersion,
        VersionInfoService.MAX_CORE_VERSION
      ) > 0;

      return belowMinimum || aboveMaximum;
    } catch {
      return true;
    }
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new WalletError(
        WalletErrorCode.UseAfterFree,
        'Version info service has been destroyed',
        {
          severity: ErrorSeverity.Error,
          context: {
            operation: 'versionInfoService',
            component: 'VersionInfoService'
          }
        }
      );
    }
  }
}

export type { VersionCompatibility };
