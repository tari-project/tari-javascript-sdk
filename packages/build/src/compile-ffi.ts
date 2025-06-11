/**
 * FFI compilation orchestrator using NAPI-RS and Cargo
 */

import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { 
  BuildConfig, 
  CompileOptions, 
  BuildError, 
  BuildErrorCode, 
  BuildPhase 
} from './types.js';
import { 
  PATHS, 
  FEATURES, 
  getCurrentPlatform, 
  getCurrentArchitecture 
} from './config.js';
import { createLogger, ProgressReporter } from './utils/logger.js';

const logger = createLogger('ffi-compile');

/** Cargo build result */
export interface CargoBuildResult {
  /** Path to compiled binary */
  binaryPath: string;
  /** Build target used */
  target: string;
  /** Build profile used */
  profile: string;
  /** Build duration in milliseconds */
  duration: number;
  /** Whether build used cache */
  fromCache: boolean;
}

/** Compilation environment */
export interface CompileEnvironment {
  /** Environment variables for build process */
  env: Record<string, string>;
  /** Working directory */
  workingDir: string;
  /** Cargo arguments */
  cargoArgs: string[];
  /** Rust target */
  rustTarget: string;
}

/**
 * FFI compiler for Tari wallet bindings using NAPI-RS
 */
export class FFICompiler {
  private workspaceRoot: string;
  private ffiPackageDir: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
    this.ffiPackageDir = join(workspaceRoot, PATHS.FFI_PACKAGE);
  }

  /**
   * Compile FFI bindings for the specified configuration
   */
  async compile(config: BuildConfig): Promise<CargoBuildResult> {
    logger.info(`Compiling FFI for ${config.network} network, target: ${config.target.rustTarget}`);

    // Validate configuration
    this.validateConfig(config);

    // Prepare compilation environment
    const env = await this.prepareEnvironment(config);

    // Create progress reporter
    const progress = new ProgressReporter('FFI Compilation', 4, logger);

    const startTime = Date.now();

    try {
      // Step 1: Prepare build environment
      progress.update(1, 'Preparing build environment');
      await this.prepareBuildEnvironment(config, env);

      // Step 2: Install Rust target if needed
      progress.update(1, 'Checking Rust toolchain');
      await this.ensureRustTarget(config.target.rustTarget);

      // Step 3: Run cargo build
      progress.update(1, 'Running cargo build');
      const binaryPath = await this.runCargoBuild(config, env);

      // Step 4: Verify build output
      progress.update(1, 'Verifying build output');
      await this.verifyBuildOutput(binaryPath);

      const duration = Date.now() - startTime;
      progress.complete(`FFI compiled successfully in ${duration}ms`);

      return {
        binaryPath,
        target: config.target.rustTarget,
        profile: config.debug ? 'debug' : 'release',
        duration,
        fromCache: false // TODO: Implement build caching
      };
    } catch (error) {
      progress.fail('FFI compilation failed');
      
      if (error instanceof BuildError) {
        throw error;
      }

      throw new BuildError(
        BuildErrorCode.CargoFailed,
        `FFI compilation failed: ${error instanceof Error ? error.message : String(error)}`,
        BuildPhase.Compile,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clean build artifacts
   */
  async clean(): Promise<void> {
    logger.info('Cleaning FFI build artifacts');

    try {
      await this.runCargoCommand(['clean'], {
        cwd: this.ffiPackageDir
      });
      logger.success('Build artifacts cleaned');
    } catch (error) {
      logger.warn(`Failed to clean build artifacts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if Rust toolchain is available
   */
  async checkRustToolchain(): Promise<{
    rustVersion: string;
    cargoVersion: string;
    targets: string[];
  }> {
    try {
      // Get Rust version
      const rustVersionResult = await this.runCommand('rustc', ['--version']);
      const rustVersion = rustVersionResult.stdout.trim();

      // Get Cargo version
      const cargoVersionResult = await this.runCommand('cargo', ['--version']);
      const cargoVersion = cargoVersionResult.stdout.trim();

      // Get installed targets
      const targetsResult = await this.runCommand('rustup', ['target', 'list', '--installed']);
      const targets = targetsResult.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      return {
        rustVersion,
        cargoVersion,
        targets
      };
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.RustcNotFound,
        `Rust toolchain not available: ${error instanceof Error ? error.message : String(error)}`,
        BuildPhase.Initialize,
        false,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate build configuration
   */
  private validateConfig(config: BuildConfig): void {
    if (!config.sourcePath || !existsSync(config.sourcePath)) {
      throw new BuildError(
        BuildErrorCode.InvalidConfig,
        `Tari source path does not exist: ${config.sourcePath}`
      );
    }

    if (!config.target) {
      throw new BuildError(
        BuildErrorCode.InvalidConfig,
        'Build target is required'
      );
    }

    if (!existsSync(this.ffiPackageDir)) {
      throw new BuildError(
        BuildErrorCode.InvalidConfig,
        `FFI package directory does not exist: ${this.ffiPackageDir}`
      );
    }

    // Verify Tari wallet FFI exists in source
    const walletFfiPath = join(config.sourcePath, 'base_layer', 'wallet_ffi');
    if (!existsSync(walletFfiPath)) {
      throw new BuildError(
        BuildErrorCode.SourceCorrupted,
        `Tari wallet FFI not found in source: ${walletFfiPath}`
      );
    }
  }

  /**
   * Prepare compilation environment
   */
  private async prepareEnvironment(config: BuildConfig): Promise<CompileEnvironment> {
    const env: Record<string, string> = {
      // Preserve existing environment
      ...process.env,
      
      // Tari source configuration
      TARI_SOURCE_PATH: config.sourcePath,
      NETWORK_TYPE: config.network,
      BUILD_TARGET: config.target.rustTarget,
      
      // Build configuration
      CARGO_BUILD_TARGET: config.target.rustTarget,
      
      // Features
      ...(config.features.length > 0 && {
        CARGO_FEATURES: config.features.join(',')
      }),
      
      // Debug/Release
      ...(config.debug && {
        CARGO_PROFILE: 'debug'
      }),
      
      // Platform-specific environment
      ...await this.getPlatformEnvironment(config)
    };

    // Remove undefined values
    Object.keys(env).forEach(key => {
      if (env[key] === undefined) {
        delete env[key];
      }
    });

    const cargoArgs = this.buildCargoArgs(config);

    return {
      env,
      workingDir: this.ffiPackageDir,
      cargoArgs,
      rustTarget: config.target.rustTarget
    };
  }

  /**
   * Get platform-specific environment variables
   */
  private async getPlatformEnvironment(config: BuildConfig): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    const platform = getCurrentPlatform();
    
    switch (platform) {
      case 'darwin':
        // macOS specific environment
        env.MACOSX_DEPLOYMENT_TARGET = '10.9';
        if (config.target.arch === 'arm64') {
          env.CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER = 'clang';
        }
        break;
        
      case 'win32':
        // Windows specific environment
        env.CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = 'link.exe';
        break;
        
      case 'linux':
        // Linux specific environment
        if (config.target.rustTarget.includes('musl')) {
          env.CC = 'musl-gcc';
          env.CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER = 'musl-gcc';
        }
        break;
    }

    return env;
  }

  /**
   * Build cargo command arguments
   */
  private buildCargoArgs(config: BuildConfig): string[] {
    const args = ['build'];

    // Add target
    args.push('--target', config.target.rustTarget);

    // Add features
    if (config.features.length > 0) {
      args.push('--features', config.features.join(','));
    }

    // Add profile
    if (!config.debug) {
      args.push('--release');
    }

    // Add verbose flag if debug mode
    if (config.debug) {
      args.push('--verbose');
    }

    return args;
  }

  /**
   * Prepare build environment (create necessary directories, etc.)
   */
  private async prepareBuildEnvironment(
    config: BuildConfig, 
    env: CompileEnvironment
  ): Promise<void> {
    // Ensure output directory exists
    await mkdir(config.outputPath, { recursive: true });

    // Create .cargo/config.toml for target-specific configuration
    const cargoConfigDir = join(this.workspaceRoot, PATHS.CARGO_CONFIG);
    await mkdir(cargoConfigDir, { recursive: true });

    const cargoConfig = this.generateCargoConfig(config);
    const cargoConfigPath = join(cargoConfigDir, 'config.toml');
    
    await writeFile(cargoConfigPath, cargoConfig);
    logger.debug(`Created cargo config: ${cargoConfigPath}`);
  }

  /**
   * Generate cargo configuration for target
   */
  private generateCargoConfig(config: BuildConfig): string {
    const target = config.target.rustTarget;
    
    let cargoConfig = `# Auto-generated cargo configuration for ${target}\n\n`;
    
    // Target-specific configuration
    cargoConfig += `[target.${target}]\n`;
    
    switch (config.target.platform) {
      case 'darwin':
        if (config.target.arch === 'arm64') {
          cargoConfig += 'linker = "clang"\n';
          cargoConfig += 'rustflags = ["-C", "link-arg=-undefined", "-C", "link-arg=dynamic_lookup"]\n';
        }
        break;
        
      case 'linux':
        if (target.includes('musl')) {
          cargoConfig += 'linker = "musl-gcc"\n';
          cargoConfig += 'rustflags = ["-C", "target-feature=+crt-static"]\n';
        }
        break;
        
      case 'win32':
        cargoConfig += 'rustflags = ["-C", "target-feature=+crt-static"]\n';
        break;
    }

    // Global configuration
    cargoConfig += '\n[build]\n';
    cargoConfig += `target = "${target}"\n`;
    
    // NAPI-RS specific configuration
    cargoConfig += '\n[env]\n';
    cargoConfig += 'NAPI_RS_CLI_VERSION = "2.16.0"\n';
    
    return cargoConfig;
  }

  /**
   * Ensure Rust target is installed
   */
  private async ensureRustTarget(target: string): Promise<void> {
    try {
      // Check if target is already installed
      const result = await this.runCommand('rustup', ['target', 'list', '--installed']);
      
      if (result.stdout.includes(target)) {
        logger.debug(`Rust target ${target} already installed`);
        return;
      }

      // Install target
      logger.info(`Installing Rust target: ${target}`);
      await this.runCommand('rustup', ['target', 'add', target]);
      logger.success(`Rust target ${target} installed`);
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.MissingDependency,
        `Failed to install Rust target ${target}: ${error instanceof Error ? error.message : String(error)}`,
        BuildPhase.Configure,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Run cargo build command
   */
  private async runCargoBuild(
    config: BuildConfig, 
    env: CompileEnvironment
  ): Promise<string> {
    try {
      const result = await this.runCargoCommand(env.cargoArgs, {
        cwd: env.workingDir,
        env: env.env
      });

      // Determine binary path
      const profile = config.debug ? 'debug' : 'release';
      const binaryName = `tari_wallet_ffi${config.target.extension}`;
      const binaryPath = join(
        this.workspaceRoot,
        PATHS.RUST_TARGET,
        config.target.rustTarget,
        profile,
        binaryName
      );

      return binaryPath;
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.CargoFailed,
        `Cargo build failed: ${error instanceof Error ? error.message : String(error)}`,
        BuildPhase.Compile,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Verify build output exists and is valid
   */
  private async verifyBuildOutput(binaryPath: string): Promise<void> {
    if (!existsSync(binaryPath)) {
      throw new BuildError(
        BuildErrorCode.InvalidBinary,
        `Build output not found: ${binaryPath}`,
        BuildPhase.Validate
      );
    }

    // Additional validation could be added here
    // e.g., checking binary format, symbols, etc.
    
    logger.debug(`Build output verified: ${binaryPath}`);
  }

  /**
   * Run a cargo command with proper error handling
   */
  private async runCargoCommand(
    args: string[], 
    options: { cwd?: string; env?: Record<string, string> } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    return this.runCommand('cargo', args, options);
  }

  /**
   * Run a command with timeout and proper error handling
   */
  private async runCommand(
    command: string,
    args: string[],
    options: { 
      cwd?: string; 
      env?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const { cwd = process.cwd(), env = process.env, timeout = 300000 } = options;

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        // Log cargo output in debug mode
        if (logger['config']?.level === 'debug') {
          process.stdout.write(output);
        }
      });

      child.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // Log cargo errors
        process.stderr.write(output);
      });

      child.on('error', reject);

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command ${command} failed with code ${code}: ${stderr || 'Unknown error'}`));
        }
      });

      // Set timeout
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command ${command} timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timer);
      });
    });
  }
}

/**
 * Create a default FFI compiler instance
 */
export function createFFICompiler(workspaceRoot?: string): FFICompiler {
  return new FFICompiler(workspaceRoot);
}

/**
 * Convenience function to compile FFI for current platform
 */
export async function compileFFI(
  sourcePath: string,
  network: string,
  options: {
    debug?: boolean;
    features?: string[];
    outputPath?: string;
  } = {}
): Promise<CargoBuildResult> {
  const compiler = createFFICompiler();

  // Import required types and functions
  const { BUILD_TARGETS } = await import('./config.js');
  const { NetworkType } = await import('./types.js');

  const platform = getCurrentPlatform();
  const arch = getCurrentArchitecture();
  const targetKey = `${platform}-${arch}`;
  const target = BUILD_TARGETS[targetKey];

  if (!target) {
    throw new BuildError(
      BuildErrorCode.InvalidTarget,
      `No build target found for ${targetKey}`
    );
  }

  const config: BuildConfig = {
    network: NetworkType[network as keyof typeof NetworkType],
    tariTag: `v4.3.1`, // This should be determined dynamically
    features: options.features || FEATURES.WALLET_DEFAULT,
    outputPath: options.outputPath || join(process.cwd(), 'dist'),
    packageName: `@tari-project/tarijs-wallet-${network}`,
    target,
    sourcePath,
    debug: options.debug || false
  };

  return await compiler.compile(config);
}
