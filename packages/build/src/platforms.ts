/**
 * Platform-specific build configuration and utilities
 */

import { Platform, Architecture, BuildTarget, SystemRequirements } from './types.js';
import { BUILD_TARGETS, SYSTEM_REQUIREMENTS } from './config.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('platforms');

/** Platform detection result */
export interface PlatformInfo {
  /** Current platform */
  platform: Platform;
  /** Current architecture */
  arch: Architecture;
  /** Build target for current platform */
  target: BuildTarget;
  /** Whether platform is supported */
  isSupported: boolean;
  /** Platform-specific notes or warnings */
  notes?: string[];
}

/** Cross-compilation requirements */
export interface CrossCompileRequirements {
  /** Additional tools needed */
  tools: string[];
  /** Environment variables to set */
  environment: Record<string, string>;
  /** Rust target installation command */
  targetInstall: string[];
  /** Verification commands */
  verify: string[];
}

/**
 * Platform management and detection utilities
 */
export class PlatformManager {
  /**
   * Detect current platform and architecture
   */
  static detectCurrent(): PlatformInfo {
    const platform = this.detectPlatform();
    const arch = this.detectArchitecture();
    const targetKey = `${platform}-${arch}`;
    const target = BUILD_TARGETS[targetKey];
    
    const notes: string[] = [];
    let isSupported = true;

    if (!target) {
      isSupported = false;
      notes.push(`No build target configured for ${targetKey}`);
    }

    // Platform-specific notes
    switch (platform) {
      case Platform.Darwin:
        if (arch === Architecture.ARM64) {
          notes.push('Apple Silicon detected - ensure Rosetta 2 is available for x64 compatibility');
        }
        break;
        
      case Platform.Win32:
        notes.push('Windows build requires Visual Studio Build Tools or Visual Studio');
        break;
        
      case Platform.Linux:
        notes.push('Linux build may require additional system libraries');
        break;
    }

    return {
      platform,
      arch,
      target: target!,
      isSupported,
      notes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Get all supported build targets
   */
  static getSupportedTargets(): BuildTarget[] {
    return Object.values(BUILD_TARGETS);
  }

  /**
   * Get build targets for a specific platform
   */
  static getTargetsForPlatform(platform: Platform): BuildTarget[] {
    return Object.values(BUILD_TARGETS).filter(target => target.platform === platform);
  }

  /**
   * Check if a target is available for cross-compilation
   */
  static async canCrossCompile(target: BuildTarget): Promise<boolean> {
    const current = this.detectCurrent();
    
    // Same platform compilation is always possible
    if (current.platform === target.platform) {
      return true;
    }

    // Cross-platform compilation depends on available tools
    return await this.checkCrossCompileSupport(current.platform, target);
  }

  /**
   * Get cross-compilation requirements for a target
   */
  static getCrossCompileRequirements(
    from: Platform,
    target: BuildTarget
  ): CrossCompileRequirements {
    const requirements: CrossCompileRequirements = {
      tools: [],
      environment: {},
      targetInstall: ['rustup', 'target', 'add', target.rustTarget],
      verify: ['rustup', 'target', 'list', '--installed']
    };

    // Cross-compilation requirements by source and target platform
    if (from === Platform.Darwin && target.platform === Platform.Linux) {
      if (target.rustTarget.includes('musl')) {
        requirements.tools.push('musl-cross');
        requirements.environment.CC = 'musl-gcc';
      } else {
        requirements.tools.push('cross');
      }
    } else if (from === Platform.Darwin && target.platform === Platform.Win32) {
      requirements.tools.push('mingw-w64');
      requirements.environment.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = 'x86_64-w64-mingw32-gcc';
    } else if (from === Platform.Linux && target.platform === Platform.Win32) {
      requirements.tools.push('mingw-w64');
      requirements.environment.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = 'x86_64-w64-mingw32-gcc';
    } else if (from === Platform.Linux && target.platform === Platform.Darwin) {
      requirements.tools.push('osxcross');
    }

    return requirements;
  }

  /**
   * Validate system requirements for a platform
   */
  static async validateSystemRequirements(
    platform: Platform
  ): Promise<{ 
    valid: boolean; 
    missing: string[]; 
    warnings: string[] 
  }> {
    const missing: string[] = [];
    const warnings: string[] = [];

    // Check Node.js version
    const nodeVersion = process.version.slice(1); // Remove 'v' prefix
    if (!this.isVersionSatisfied(nodeVersion, SYSTEM_REQUIREMENTS.nodeVersion)) {
      missing.push(`Node.js ${SYSTEM_REQUIREMENTS.nodeVersion}+ (current: ${nodeVersion})`);
    }

    // Check Rust toolchain
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const rustResult = await execAsync('rustc --version');
      const rustVersion = this.extractVersion(rustResult.stdout);
      
      if (!this.isVersionSatisfied(rustVersion, SYSTEM_REQUIREMENTS.rustVersion)) {
        missing.push(`Rust ${SYSTEM_REQUIREMENTS.rustVersion}+ (current: ${rustVersion})`);
      }
    } catch {
      missing.push(`Rust ${SYSTEM_REQUIREMENTS.rustVersion}+`);
    }

    // Check platform-specific requirements
    const platformRequirements = SYSTEM_REQUIREMENTS.platformSpecific[platform] || [];
    
    for (const tool of platformRequirements) {
      const available = await this.checkToolAvailable(tool);
      if (!available) {
        missing.push(tool);
      }
    }

    // Check disk space
    try {
      const freeSpace = await this.getAvailableDiskSpace();
      if (freeSpace < SYSTEM_REQUIREMENTS.diskSpace) {
        warnings.push(
          `Low disk space: ${this.formatBytes(freeSpace)} available, ` +
          `${this.formatBytes(SYSTEM_REQUIREMENTS.diskSpace)} recommended`
        );
      }
    } catch {
      warnings.push('Could not check disk space');
    }

    return {
      valid: missing.length === 0,
      missing,
      warnings
    };
  }

  /**
   * Get platform-specific build recommendations
   */
  static getBuildRecommendations(platform: Platform): {
    parallelJobs: number;
    memoryUsage: string;
    recommendations: string[];
  } {
    const cpuCount = require('os').cpus().length;
    
    const recommendations: string[] = [];
    let parallelJobs = Math.max(1, cpuCount - 1); // Leave one core free
    
    switch (platform) {
      case Platform.Darwin:
        recommendations.push('Use Xcode command line tools for best performance');
        recommendations.push('Consider using ccache for faster incremental builds');
        break;
        
      case Platform.Win32:
        parallelJobs = Math.min(parallelJobs, 4); // Windows can be memory intensive
        recommendations.push('Use Visual Studio Build Tools 2019 or later');
        recommendations.push('Enable Windows Defender exclusions for build directories');
        break;
        
      case Platform.Linux:
        recommendations.push('Install build-essential and pkg-config');
        recommendations.push('Use mold or lld linker for faster linking');
        break;
    }

    return {
      parallelJobs,
      memoryUsage: '2-4GB per parallel job',
      recommendations
    };
  }

  /**
   * Detect current platform
   */
  private static detectPlatform(): Platform {
    switch (process.platform) {
      case 'darwin':
        return Platform.Darwin;
      case 'win32':
        return Platform.Win32;
      case 'linux':
        return Platform.Linux;
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  /**
   * Detect current architecture
   */
  private static detectArchitecture(): Architecture {
    switch (process.arch) {
      case 'x64':
        return Architecture.X64;
      case 'arm64':
        return Architecture.ARM64;
      default:
        throw new Error(`Unsupported architecture: ${process.arch}`);
    }
  }

  /**
   * Check if cross-compilation is supported
   */
  private static async checkCrossCompileSupport(
    from: Platform,
    target: BuildTarget
  ): Promise<boolean> {
    const requirements = this.getCrossCompileRequirements(from, target);
    
    // Check if required tools are available
    for (const tool of requirements.tools) {
      const available = await this.checkToolAvailable(tool);
      if (!available) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a tool is available in PATH
   */
  private static async checkToolAvailable(tool: string): Promise<boolean> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync(`${tool} --version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract version from command output
   */
  private static extractVersion(output: string): string {
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : '0.0.0';
  }

  /**
   * Check if version satisfies requirement
   */
  private static isVersionSatisfied(current: string, required: string): boolean {
    const currentParts = current.split('.').map(Number);
    const requiredParts = required.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const currentPart = currentParts[i] || 0;
      const requiredPart = requiredParts[i] || 0;

      if (currentPart > requiredPart) return true;
      if (currentPart < requiredPart) return false;
    }

    return true; // Equal versions
  }

  /**
   * Get available disk space
   */
  private static async getAvailableDiskSpace(): Promise<number> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      if (process.platform === 'win32') {
        const result = await execAsync('dir /-c');
        const match = result.stdout.match(/(\d+) bytes free/);
        return match ? parseInt(match[1], 10) : 0;
      } else {
        const result = await execAsync('df -k .');
        const lines = result.stdout.split('\n');
        const dataLine = lines[1] || lines[0];
        const parts = dataLine.split(/\s+/);
        const availableKB = parseInt(parts[3] || parts[2], 10);
        return availableKB * 1024; // Convert to bytes
      }
    } catch {
      return 0;
    }
  }

  /**
   * Format bytes to human readable string
   */
  private static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

/**
 * Get current platform information
 */
export function getCurrentPlatformInfo(): PlatformInfo {
  return PlatformManager.detectCurrent();
}

/**
 * Check if current platform can build for target
 */
export async function canBuildTarget(target: BuildTarget): Promise<boolean> {
  return await PlatformManager.canCrossCompile(target);
}

/**
 * Validate current system for building
 */
export async function validateCurrentSystem(): Promise<{
  platform: PlatformInfo;
  requirements: Awaited<ReturnType<typeof PlatformManager.validateSystemRequirements>>;
  recommendations: ReturnType<typeof PlatformManager.getBuildRecommendations>;
}> {
  const platform = PlatformManager.detectCurrent();
  const requirements = await PlatformManager.validateSystemRequirements(platform.platform);
  const recommendations = PlatformManager.getBuildRecommendations(platform.platform);

  return {
    platform,
    requirements,
    recommendations
  };
}
