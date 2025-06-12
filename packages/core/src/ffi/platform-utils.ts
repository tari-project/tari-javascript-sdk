/**
 * Platform detection and management utilities for cross-platform builds
 * Provides runtime platform optimization and cross-platform compatibility
 */

import { join, normalize, resolve, sep, delimiter } from 'node:path';
import { platform, arch, release, cpus } from 'node:os';
import { TariError, ErrorCode } from '../errors/index.js';

/**
 * Supported platform types
 */
export enum SupportedPlatform {
  Windows = 'win32',
  MacOS = 'darwin',
  Linux = 'linux',
}

/**
 * Supported architectures
 */
export enum SupportedArchitecture {
  X64 = 'x64',
  ARM64 = 'arm64',
  IA32 = 'ia32',
}

/**
 * Platform-specific configuration
 */
export interface PlatformConfig {
  /** Platform identifier */
  platform: SupportedPlatform;
  /** Architecture identifier */
  architecture: SupportedArchitecture;
  /** OS release version */
  release: string;
  /** Number of CPU cores */
  cpuCount: number;
  /** Platform-specific optimizations */
  optimizations: PlatformOptimizations;
  /** Path configuration */
  paths: PlatformPaths;
}

/**
 * Platform-specific optimization settings
 */
export interface PlatformOptimizations {
  /** Recommended memory pressure threshold (MB) */
  memoryPressureThreshold: number;
  /** Recommended garbage collection frequency (ms) */
  gcInterval: number;
  /** File system operation batch size */
  fileSystemBatchSize: number;
  /** Network connection pool size */
  connectionPoolSize: number;
  /** Concurrent operation limit */
  concurrencyLimit: number;
  /** Path normalization strategy */
  pathStrategy: 'preserve' | 'normalize' | 'lowercase';
  /** Performance tuning flags */
  performanceFlags: string[];
}

/**
 * Platform-specific path configuration
 */
export interface PlatformPaths {
  /** Path separator for this platform */
  separator: string;
  /** Environment path delimiter */
  pathDelimiter: string;
  /** Default temporary directory */
  tempDir: string;
  /** Default cache directory */
  cacheDir: string;
  /** Default config directory */
  configDir: string;
  /** Case sensitivity */
  caseSensitive: boolean;
}

/**
 * Platform manager for runtime optimization and compatibility
 */
export class PlatformManager {
  private static instance: PlatformManager | null = null;
  private readonly config: PlatformConfig;

  private constructor() {
    this.config = this.detectPlatformConfig();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PlatformManager {
    if (!this.instance) {
      this.instance = new PlatformManager();
    }
    return this.instance;
  }

  /**
   * Get current platform configuration
   */
  getConfig(): PlatformConfig {
    return { ...this.config };
  }

  /**
   * Check if current platform is supported
   */
  isSupported(): boolean {
    return Object.values(SupportedPlatform).includes(this.config.platform as SupportedPlatform) &&
           Object.values(SupportedArchitecture).includes(this.config.architecture as SupportedArchitecture);
  }

  /**
   * Get platform-specific binary name
   */
  getBinaryName(baseName: string): string {
    const extension = this.config.platform === SupportedPlatform.Windows ? '.exe' : '';
    return `${baseName}${extension}`;
  }

  /**
   * Get platform-specific library name
   */
  getLibraryName(baseName: string): string {
    switch (this.config.platform) {
      case SupportedPlatform.Windows:
        return `${baseName}.dll`;
      case SupportedPlatform.MacOS:
        return `lib${baseName}.dylib`;
      case SupportedPlatform.Linux:
        return `lib${baseName}.so`;
      default:
        return baseName;
    }
  }

  /**
   * Normalize path for current platform
   */
  normalizePath(inputPath: string): string {
    const normalized = normalize(inputPath);
    
    switch (this.config.optimizations.pathStrategy) {
      case 'lowercase':
        return this.config.paths.caseSensitive ? normalized : normalized.toLowerCase();
      case 'preserve':
        return inputPath;
      case 'normalize':
      default:
        return normalized;
    }
  }

  /**
   * Join paths with platform-specific separator
   */
  joinPaths(...paths: string[]): string {
    return join(...paths);
  }

  /**
   * Resolve absolute path for current platform
   */
  resolvePath(...paths: string[]): string {
    return resolve(...paths);
  }

  /**
   * Check if path exists and handle platform-specific issues
   */
  async pathExists(path: string): Promise<boolean> {
    try {
      const fs = await import('node:fs/promises');
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get platform-specific temporary directory
   */
  getTempDir(): string {
    return this.config.paths.tempDir;
  }

  /**
   * Get platform-specific cache directory
   */
  getCacheDir(): string {
    return this.config.paths.cacheDir;
  }

  /**
   * Get platform-specific config directory
   */
  getConfigDir(): string {
    return this.config.paths.configDir;
  }

  /**
   * Get recommended settings for current platform
   */
  getOptimizations(): PlatformOptimizations {
    return { ...this.config.optimizations };
  }

  /**
   * Validate system requirements for current platform
   */
  validateSystemRequirements(): {
    valid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if platform is supported
    if (!this.isSupported()) {
      issues.push(`Unsupported platform: ${this.config.platform} ${this.config.architecture}`);
    }

    // Check CPU count
    if (this.config.cpuCount < 2) {
      issues.push('Insufficient CPU cores - at least 2 cores recommended');
      recommendations.push('Consider upgrading hardware or reducing concurrency');
    }

    // Platform-specific checks
    switch (this.config.platform) {
      case SupportedPlatform.Windows:
        this.validateWindowsRequirements(issues, recommendations);
        break;
      case SupportedPlatform.MacOS:
        this.validateMacOSRequirements(issues, recommendations);
        break;
      case SupportedPlatform.Linux:
        this.validateLinuxRequirements(issues, recommendations);
        break;
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * Get platform-specific performance recommendations
   */
  getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    const opts = this.config.optimizations;

    recommendations.push(`Set memory pressure threshold to ${opts.memoryPressureThreshold}MB`);
    recommendations.push(`Configure GC interval to ${opts.gcInterval}ms`);
    recommendations.push(`Use concurrency limit of ${opts.concurrencyLimit}`);

    // Platform-specific recommendations
    switch (this.config.platform) {
      case SupportedPlatform.Windows:
        recommendations.push('Configure Windows Defender exclusions for workspace directories');
        recommendations.push('Use long path support for deeply nested projects');
        recommendations.push('Consider Windows subsystem for Linux (WSL) for better performance');
        break;
      
      case SupportedPlatform.MacOS:
        recommendations.push('Enable full disk access for development tools');
        recommendations.push('Consider Rosetta 2 performance implications on Apple Silicon');
        recommendations.push('Use Activity Monitor to track resource usage');
        break;
      
      case SupportedPlatform.Linux:
        recommendations.push('Adjust ulimits for file descriptors and memory');
        recommendations.push('Use systemd for process management in production');
        recommendations.push('Monitor with htop or similar system tools');
        break;
    }

    return recommendations;
  }

  /**
   * Detect current platform configuration
   */
  private detectPlatformConfig(): PlatformConfig {
    const currentPlatform = platform() as SupportedPlatform;
    const currentArch = arch() as SupportedArchitecture;
    const currentRelease = release();
    const currentCpuCount = cpus().length;

    return {
      platform: currentPlatform,
      architecture: currentArch,
      release: currentRelease,
      cpuCount: currentCpuCount,
      optimizations: this.getOptimizationsForPlatform(currentPlatform, currentArch),
      paths: this.getPathConfigForPlatform(currentPlatform),
    };
  }

  /**
   * Get optimizations for specific platform
   */
  private getOptimizationsForPlatform(
    platform: SupportedPlatform,
    architecture: SupportedArchitecture
  ): PlatformOptimizations {
    const base: PlatformOptimizations = {
      memoryPressureThreshold: 512,
      gcInterval: 30000,
      fileSystemBatchSize: 100,
      connectionPoolSize: 10,
      concurrencyLimit: 4,
      pathStrategy: 'normalize',
      performanceFlags: [],
    };

    switch (platform) {
      case SupportedPlatform.Windows:
        return {
          ...base,
          memoryPressureThreshold: 768, // Windows tends to use more memory
          fileSystemBatchSize: 50, // Smaller batches for NTFS
          pathStrategy: 'normalize', // Important for Windows paths
          performanceFlags: ['--max-old-space-size=4096'],
        };

      case SupportedPlatform.MacOS:
        return {
          ...base,
          memoryPressureThreshold: architecture === SupportedArchitecture.ARM64 ? 1024 : 512,
          concurrencyLimit: 6, // macOS handles concurrency well
          pathStrategy: 'preserve', // macOS preserves case
          performanceFlags: ['--max-old-space-size=6144'],
        };

      case SupportedPlatform.Linux:
        return {
          ...base,
          memoryPressureThreshold: 384, // Linux is more memory efficient
          fileSystemBatchSize: 200, // ext4/xfs handle larger batches well
          concurrencyLimit: 8, // Linux excels at concurrency
          pathStrategy: 'preserve', // Case sensitive
          performanceFlags: ['--max-old-space-size=8192'],
        };

      default:
        return base;
    }
  }

  /**
   * Get path configuration for specific platform
   */
  private getPathConfigForPlatform(platform: SupportedPlatform): PlatformPaths {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';

    switch (platform) {
      case SupportedPlatform.Windows:
        return {
          separator: '\\',
          pathDelimiter: ';',
          tempDir: process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp',
          cacheDir: join(process.env.LOCALAPPDATA || join(homeDir, 'AppData', 'Local'), 'Tari'),
          configDir: join(process.env.APPDATA || join(homeDir, 'AppData', 'Roaming'), 'Tari'),
          caseSensitive: false,
        };

      case SupportedPlatform.MacOS:
        return {
          separator: '/',
          pathDelimiter: ':',
          tempDir: '/tmp',
          cacheDir: join(homeDir, 'Library', 'Caches', 'Tari'),
          configDir: join(homeDir, 'Library', 'Application Support', 'Tari'),
          caseSensitive: false, // HFS+ default, APFS can be either
        };

      case SupportedPlatform.Linux:
        return {
          separator: '/',
          pathDelimiter: ':',
          tempDir: '/tmp',
          cacheDir: process.env.XDG_CACHE_HOME || join(homeDir, '.cache', 'tari'),
          configDir: process.env.XDG_CONFIG_HOME || join(homeDir, '.config', 'tari'),
          caseSensitive: true,
        };

      default:
        throw new TariError(
          ErrorCode.Unknown,
          `Unsupported platform: ${platform}`,
          {
            recoverable: false,
            context: { platform }
          }
        );
    }
  }

  /**
   * Validate Windows-specific requirements
   */
  private validateWindowsRequirements(issues: string[], recommendations: string[]): void {
    // Check Windows version (Windows 10+ recommended)
    const releaseNumber = parseFloat(this.config.release);
    if (releaseNumber < 10) {
      issues.push('Windows 10 or later required');
      recommendations.push('Upgrade to Windows 10 or later for best compatibility');
    }

    // Check for long path support
    try {
      // This is a heuristic - actual registry check would be more accurate
      const longPath = 'C:\\' + 'a'.repeat(300);
      recommendations.push('Enable long path support via Group Policy or Registry');
    } catch {
      // Ignore - just a recommendation
    }
  }

  /**
   * Validate macOS-specific requirements
   */
  private validateMacOSRequirements(issues: string[], recommendations: string[]): void {
    // Check macOS version (10.15+ recommended)
    const versionMatch = this.config.release.match(/^(\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1], 10);
      if (major < 19) { // macOS 10.15 is Darwin 19
        recommendations.push('macOS 10.15 (Catalina) or later recommended');
      }
    }

    // Apple Silicon specific checks
    if (this.config.architecture === SupportedArchitecture.ARM64) {
      recommendations.push('Ensure native ARM64 binaries are available');
      recommendations.push('Consider Rosetta 2 for x64 compatibility if needed');
    }
  }

  /**
   * Validate Linux-specific requirements
   */
  private validateLinuxRequirements(issues: string[], recommendations: string[]): void {
    // Check for common dependencies
    recommendations.push('Ensure glibc 2.17+ is available');
    recommendations.push('Install build-essential for native module compilation');
    
    // Check ulimits
    recommendations.push('Configure appropriate ulimits for file descriptors');
    recommendations.push('Consider using systemd for process management');
  }
}

/**
 * Convenience functions for platform utilities
 */

/**
 * Get current platform manager instance
 */
export function getPlatformManager(): PlatformManager {
  return PlatformManager.getInstance();
}

/**
 * Get current platform configuration
 */
export function getCurrentPlatform(): PlatformConfig {
  return getPlatformManager().getConfig();
}

/**
 * Check if current platform is supported
 */
export function isPlatformSupported(): boolean {
  return getPlatformManager().isSupported();
}

/**
 * Normalize path for current platform
 */
export function normalizePlatformPath(path: string): string {
  return getPlatformManager().normalizePath(path);
}

/**
 * Join paths with platform-specific handling
 */
export function joinPlatformPaths(...paths: string[]): string {
  return getPlatformManager().joinPaths(...paths);
}

/**
 * Get platform-specific optimizations
 */
export function getPlatformOptimizations(): PlatformOptimizations {
  return getPlatformManager().getOptimizations();
}

/**
 * Get platform-specific performance recommendations
 */
export function getPlatformRecommendations(): string[] {
  return getPlatformManager().getPerformanceRecommendations();
}

/**
 * Validate system requirements
 */
export function validateSystemRequirements() {
  return getPlatformManager().validateSystemRequirements();
}
