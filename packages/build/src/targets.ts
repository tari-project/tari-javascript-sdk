/**
 * Build target management and selection utilities
 */

import { 
  BuildTarget, 
  Platform, 
  Architecture, 
  NetworkType,
  BuildConfig 
} from './types.js';
import { BUILD_TARGETS } from './config.js';
import { PlatformManager } from './platforms.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('targets');

/** Target selection criteria */
export interface TargetSelection {
  /** Required platforms */
  platforms?: Platform[];
  /** Required architectures */
  architectures?: Architecture[];
  /** Whether to include current platform */
  includeCurrent?: boolean;
  /** Whether to include cross-compilation targets */
  includeCross?: boolean;
  /** Maximum number of targets */
  maxTargets?: number;
}

/** Target build matrix */
export interface BuildMatrix {
  /** All targets to build */
  targets: BuildTarget[];
  /** Current platform target (if included) */
  currentTarget?: BuildTarget;
  /** Cross-compilation targets */
  crossTargets: BuildTarget[];
  /** Estimated total build time */
  estimatedDuration: number;
  /** Build order (optimized for efficiency) */
  buildOrder: BuildTarget[];
}

/** Target validation result */
export interface TargetValidation {
  /** Whether target is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Missing dependencies */
  missingDeps: string[];
}

/**
 * Build target manager for multi-platform builds
 */
export class TargetManager {
  /**
   * Get all available build targets
   */
  static getAllTargets(): BuildTarget[] {
    return Object.values(BUILD_TARGETS);
  }

  /**
   * Get target by key (platform-arch)
   */
  static getTarget(platform: Platform, arch: Architecture): BuildTarget | null {
    const key = `${platform}-${arch}`;
    return BUILD_TARGETS[key] || null;
  }

  /**
   * Get targets matching selection criteria
   */
  static selectTargets(criteria: TargetSelection = {}): BuildTarget[] {
    const {
      platforms,
      architectures,
      includeCurrent = true,
      includeCross = false,
      maxTargets
    } = criteria;

    let targets = this.getAllTargets();

    // Filter by platforms
    if (platforms && platforms.length > 0) {
      targets = targets.filter(target => platforms.includes(target.platform));
    }

    // Filter by architectures
    if (architectures && architectures.length > 0) {
      targets = targets.filter(target => architectures.includes(target.arch));
    }

    // Handle current platform preference
    const currentPlatform = PlatformManager.detectCurrent();
    
    if (!includeCross) {
      // Only include current platform targets
      targets = targets.filter(target => target.platform === currentPlatform.platform);
    }

    if (!includeCurrent) {
      // Exclude current target
      targets = targets.filter(target => 
        target.platform !== currentPlatform.platform || 
        target.arch !== currentPlatform.arch
      );
    }

    // Limit number of targets
    if (maxTargets && maxTargets > 0) {
      // Prioritize current platform first
      targets.sort((a, b) => {
        const aIsCurrent = a.platform === currentPlatform.platform;
        const bIsCurrent = b.platform === currentPlatform.platform;
        
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;
        
        // Then prioritize by common architectures
        if (a.arch === Architecture.X64 && b.arch !== Architecture.X64) return -1;
        if (a.arch !== Architecture.X64 && b.arch === Architecture.X64) return 1;
        
        return 0;
      });
      
      targets = targets.slice(0, maxTargets);
    }

    return targets;
  }

  /**
   * Create build matrix for targets
   */
  static async createBuildMatrix(
    targets: BuildTarget[],
    network: NetworkType
  ): Promise<BuildMatrix> {
    const currentPlatform = PlatformManager.detectCurrent();
    const currentTarget = targets.find(target => 
      target.platform === currentPlatform.platform && 
      target.arch === currentPlatform.arch
    );

    const crossTargets = targets.filter(target => 
      target.platform !== currentPlatform.platform || 
      target.arch !== currentPlatform.arch
    );

    // Estimate build duration (in minutes)
    const estimatedDuration = await this.estimateBuildDuration(targets, network);

    // Optimize build order
    const buildOrder = this.optimizeBuildOrder(targets);

    return {
      targets,
      currentTarget,
      crossTargets,
      estimatedDuration,
      buildOrder
    };
  }

  /**
   * Validate a target for building
   */
  static async validateTarget(target: BuildTarget): Promise<TargetValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingDeps: string[] = [];

    // Check if target exists in our configuration
    const targetKey = `${target.platform}-${target.arch}`;
    if (!BUILD_TARGETS[targetKey]) {
      errors.push(`Target ${targetKey} is not configured`);
      return { valid: false, errors, warnings, missingDeps };
    }

    // Check cross-compilation support
    const canCrossCompile = await PlatformManager.canCrossCompile(target);
    if (!canCrossCompile) {
      const currentPlatform = PlatformManager.detectCurrent();
      if (target.platform !== currentPlatform.platform) {
        errors.push(`Cross-compilation from ${currentPlatform.platform} to ${target.platform} is not supported`);
      } else {
        warnings.push(`Target ${targetKey} may require additional setup`);
      }
    }

    // Check platform-specific requirements
    const requirements = await PlatformManager.validateSystemRequirements(target.platform);
    missingDeps.push(...requirements.missing);
    warnings.push(...requirements.warnings);

    // Rust target validation
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const result = await execAsync('rustup target list --installed');
      if (!result.stdout.includes(target.rustTarget)) {
        missingDeps.push(`Rust target: ${target.rustTarget}`);
      }
    } catch {
      warnings.push('Could not verify Rust target installation');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingDeps
    };
  }

  /**
   * Prepare target for building (install dependencies, etc.)
   */
  static async prepareTarget(target: BuildTarget): Promise<void> {
    logger.info(`Preparing target: ${target.platform}-${target.arch}`);

    // Install Rust target if needed
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      logger.debug(`Installing Rust target: ${target.rustTarget}`);
      await execAsync(`rustup target add ${target.rustTarget}`);
      logger.success(`Rust target ${target.rustTarget} installed`);
    } catch (error) {
      logger.warn(`Failed to install Rust target: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Platform-specific preparation
    await this.preparePlatformSpecific(target);
  }

  /**
   * Get target-specific build configuration
   */
  static getBuildConfigForTarget(
    target: BuildTarget,
    baseConfig: Partial<BuildConfig>
  ): Partial<BuildConfig> {
    return {
      ...baseConfig,
      target,
      // Platform-specific output path
      outputPath: baseConfig.outputPath ? 
        `${baseConfig.outputPath}/${target.platform}-${target.arch}` : 
        undefined
    };
  }

  /**
   * Generate cargo configuration for target
   */
  static generateCargoConfig(target: BuildTarget): string {
    let config = `# Cargo configuration for ${target.platform}-${target.arch}\n\n`;
    
    config += `[target.${target.rustTarget}]\n`;
    
    switch (target.platform) {
      case Platform.Darwin:
        if (target.arch === Architecture.ARM64) {
          config += 'linker = "clang"\n';
          config += 'rustflags = ["-C", "link-arg=-undefined", "-C", "link-arg=dynamic_lookup"]\n';
        }
        break;
        
      case Platform.Linux:
        if (target.rustTarget.includes('musl')) {
          config += 'linker = "musl-gcc"\n';
          config += 'rustflags = ["-C", "target-feature=+crt-static"]\n';
        }
        break;
        
      case Platform.Win32:
        config += 'rustflags = ["-C", "target-feature=+crt-static"]\n';
        break;
    }

    config += '\n[build]\n';
    config += `target = "${target.rustTarget}"\n`;

    return config;
  }

  /**
   * Estimate build duration for targets
   */
  private static async estimateBuildDuration(
    targets: BuildTarget[],
    network: NetworkType
  ): Promise<number> {
    // Base build time estimates (in minutes)
    const baseTimes = {
      [Platform.Darwin]: 8,
      [Platform.Linux]: 6,
      [Platform.Win32]: 12
    };

    // Network complexity multipliers
    const networkMultipliers = {
      [NetworkType.Mainnet]: 1.0,
      [NetworkType.Testnet]: 0.9,
      [NetworkType.Nextnet]: 0.8
    };

    let totalTime = 0;
    const currentPlatform = PlatformManager.detectCurrent();

    for (const target of targets) {
      let baseTime = baseTimes[target.platform];
      
      // Cross-compilation penalty
      if (target.platform !== currentPlatform.platform) {
        baseTime *= 1.5;
      }
      
      // Architecture penalty for non-x64
      if (target.arch !== Architecture.X64) {
        baseTime *= 1.2;
      }

      totalTime += baseTime * networkMultipliers[network];
    }

    return Math.round(totalTime);
  }

  /**
   * Optimize build order for efficiency
   */
  private static optimizeBuildOrder(targets: BuildTarget[]): BuildTarget[] {
    const currentPlatform = PlatformManager.detectCurrent();
    
    return [...targets].sort((a, b) => {
      // Current platform first
      const aIsCurrent = a.platform === currentPlatform.platform;
      const bIsCurrent = b.platform === currentPlatform.platform;
      
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      
      // Then by platform (group similar platforms together)
      if (a.platform !== b.platform) {
        return a.platform.localeCompare(b.platform);
      }
      
      // Finally by architecture (x64 first)
      if (a.arch === Architecture.X64 && b.arch !== Architecture.X64) return -1;
      if (a.arch !== Architecture.X64 && b.arch === Architecture.X64) return 1;
      
      return 0;
    });
  }

  /**
   * Platform-specific preparation
   */
  private static async preparePlatformSpecific(target: BuildTarget): Promise<void> {
    // This would include platform-specific toolchain setup
    // For now, just log what would be done
    
    switch (target.platform) {
      case Platform.Darwin:
        logger.debug('macOS target preparation - ensuring Xcode tools');
        break;
        
      case Platform.Win32:
        logger.debug('Windows target preparation - checking MSVC tools');
        break;
        
      case Platform.Linux:
        if (target.rustTarget.includes('musl')) {
          logger.debug('Linux musl target preparation - checking musl-gcc');
        } else {
          logger.debug('Linux GNU target preparation - checking gcc');
        }
        break;
    }
  }
}

/**
 * Get recommended targets for a build
 */
export function getRecommendedTargets(
  network: NetworkType,
  options: {
    crossPlatform?: boolean;
    maxTargets?: number;
  } = {}
): BuildTarget[] {
  const { crossPlatform = false, maxTargets = 3 } = options;
  
  return TargetManager.selectTargets({
    includeCurrent: true,
    includeCross: crossPlatform,
    maxTargets
  });
}

/**
 * Create build matrix for common scenarios
 */
export async function createCommonBuildMatrix(
  scenario: 'current' | 'desktop' | 'all',
  network: NetworkType
): Promise<BuildMatrix> {
  let targets: BuildTarget[];
  
  switch (scenario) {
    case 'current':
      targets = TargetManager.selectTargets({
        includeCurrent: true,
        includeCross: false
      });
      break;
      
    case 'desktop':
      targets = TargetManager.selectTargets({
        platforms: [Platform.Darwin, Platform.Win32, Platform.Linux],
        architectures: [Architecture.X64, Architecture.ARM64],
        includeCross: true,
        maxTargets: 6
      });
      break;
      
    case 'all':
      targets = TargetManager.getAllTargets();
      break;
      
    default:
      throw new Error(`Unknown build scenario: ${scenario}`);
  }
  
  return await TargetManager.createBuildMatrix(targets, network);
}

/**
 * Validate all targets in a build matrix
 */
export async function validateBuildMatrix(
  matrix: BuildMatrix
): Promise<{ valid: boolean; results: Map<BuildTarget, TargetValidation> }> {
  const results = new Map<BuildTarget, TargetValidation>();
  let allValid = true;
  
  for (const target of matrix.targets) {
    const validation = await TargetManager.validateTarget(target);
    results.set(target, validation);
    
    if (!validation.valid) {
      allValid = false;
    }
  }
  
  return { valid: allValid, results };
}
