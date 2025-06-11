/**
 * Core type definitions for the Tari SDK build system
 */

/** Supported Tari network types */
export enum NetworkType {
  Mainnet = 'mainnet',
  Testnet = 'testnet', 
  Nextnet = 'nextnet'
}

/** Supported target platforms */
export enum Platform {
  Darwin = 'darwin',
  Win32 = 'win32',
  Linux = 'linux'
}

/** Supported CPU architectures */
export enum Architecture {
  X64 = 'x64',
  ARM64 = 'arm64'
}

/** Log levels for build process */
export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace'
}

/** Build target configuration */
export interface BuildTarget {
  /** Target platform */
  platform: Platform;
  /** Target architecture */
  arch: Architecture;
  /** Rust target triple */
  rustTarget: string;
  /** Node.js architecture string */
  nodeArch: string;
  /** Platform-specific file extension for binaries */
  extension: string;
}

/** Configuration for Tari source fetching */
export interface TariSourceConfig {
  /** Base repository URL */
  baseUrl: string;
  /** Tari version to fetch */
  version: string;
  /** Target network type */
  network: NetworkType;
  /** Optional build number for pre-release versions */
  buildNumber?: number;
  /** Cache directory for source code */
  cacheDir: string;
  /** Whether to force re-fetch even if cached */
  force?: boolean;
}

/** Build configuration for a specific variant */
export interface BuildConfig {
  /** Network type being built */
  network: NetworkType;
  /** Resolved Tari git tag */
  tariTag: string;
  /** Rust features to enable */
  features: string[];
  /** Output directory for build artifacts */
  outputPath: string;
  /** NPM package name for this variant */
  packageName: string;
  /** Build target configuration */
  target: BuildTarget;
  /** Path to Tari source code */
  sourcePath: string;
  /** Whether this is a debug build */
  debug?: boolean;
}

/** Compilation options */
export interface CompileOptions {
  /** Rust target triple */
  target: string;
  /** Build profile (debug or release) */
  profile: 'debug' | 'release';
  /** Additional cargo features */
  features: string[];
  /** Environment variables for build */
  env: Record<string, string>;
  /** Working directory for compilation */
  workingDir: string;
  /** Whether to enable verbose output */
  verbose?: boolean;
}

/** Package variant configuration */
export interface PackageVariant {
  /** Network type */
  network: NetworkType;
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Description */
  description: string;
  /** Package tags for NPM */
  tags: string[];
  /** Binary artifacts to include */
  binaries: BinaryArtifact[];
}

/** Binary artifact information */
export interface BinaryArtifact {
  /** Source path of compiled binary */
  sourcePath: string;
  /** Target path in package */
  targetPath: string;
  /** Target platform */
  platform: Platform;
  /** Target architecture */
  arch: Architecture;
  /** File checksum */
  checksum: string;
}

/** Build cache metadata */
export interface CacheMetadata {
  /** Unique cache key */
  key: string;
  /** Timestamp when cache was created */
  createdAt: number;
  /** Tari source commit hash */
  tariCommit: string;
  /** Build configuration used */
  buildConfig: Partial<BuildConfig>;
  /** File checksums */
  checksums: Record<string, string>;
}

/** Build progress information */
export interface BuildProgress {
  /** Current phase */
  phase: BuildPhase;
  /** Current step within phase */
  step: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Detailed message */
  message: string;
  /** Start time */
  startTime: number;
  /** Estimated completion time */
  estimatedCompletion?: number;
}

/** Build phases */
export enum BuildPhase {
  Initialize = 'initialize',
  FetchSource = 'fetch-source',
  Configure = 'configure',
  Compile = 'compile',
  Package = 'package',
  Validate = 'validate',
  Complete = 'complete'
}

/** Build error types */
export enum BuildErrorCode {
  // Configuration errors (1000-1099)
  InvalidConfig = 1000,
  MissingDependency = 1001,
  InvalidTarget = 1002,
  
  // Source fetching errors (2000-2099)
  GitCloneFailed = 2000,
  TagNotFound = 2001,
  SourceCorrupted = 2002,
  NetworkError = 2003,
  
  // Compilation errors (3000-3099)
  RustcNotFound = 3000,
  CargoFailed = 3001,
  LinkingFailed = 3002,
  MissingFeatures = 3003,
  
  // Packaging errors (4000-4099)
  PackagingFailed = 4000,
  InvalidBinary = 4001,
  ChecksumMismatch = 4002,
  
  // System errors (5000-5099)
  InsufficientDiskSpace = 5000,
  PermissionDenied = 5001,
  ProcessFailed = 5002,
  
  // Cache errors (6000-6099)
  CacheCorrupted = 6000,
  CacheWriteFailed = 6001,
  CacheReadFailed = 6002
}

/** Build error class */
export class BuildError extends Error {
  constructor(
    public readonly code: BuildErrorCode,
    public readonly details: string,
    public readonly phase?: BuildPhase,
    public readonly recoverable: boolean = false,
    public readonly cause?: Error
  ) {
    super(`${BuildError.getMessageForCode(code)}: ${details}`);
    this.name = 'BuildError';
  }

  static getMessageForCode(code: BuildErrorCode): string {
    const messages: Record<BuildErrorCode, string> = {
      [BuildErrorCode.InvalidConfig]: 'Invalid build configuration',
      [BuildErrorCode.MissingDependency]: 'Missing required dependency',
      [BuildErrorCode.InvalidTarget]: 'Invalid build target',
      [BuildErrorCode.GitCloneFailed]: 'Git clone operation failed',
      [BuildErrorCode.TagNotFound]: 'Git tag not found',
      [BuildErrorCode.SourceCorrupted]: 'Source code is corrupted',
      [BuildErrorCode.NetworkError]: 'Network operation failed',
      [BuildErrorCode.RustcNotFound]: 'Rust compiler not found',
      [BuildErrorCode.CargoFailed]: 'Cargo build failed',
      [BuildErrorCode.LinkingFailed]: 'Binary linking failed',
      [BuildErrorCode.MissingFeatures]: 'Required Rust features not available',
      [BuildErrorCode.PackagingFailed]: 'Package creation failed',
      [BuildErrorCode.InvalidBinary]: 'Invalid binary artifact',
      [BuildErrorCode.ChecksumMismatch]: 'File checksum mismatch',
      [BuildErrorCode.InsufficientDiskSpace]: 'Insufficient disk space',
      [BuildErrorCode.PermissionDenied]: 'Permission denied',
      [BuildErrorCode.ProcessFailed]: 'External process failed',
      [BuildErrorCode.CacheCorrupted]: 'Build cache is corrupted',
      [BuildErrorCode.CacheWriteFailed]: 'Failed to write to cache',
      [BuildErrorCode.CacheReadFailed]: 'Failed to read from cache'
    };
    
    return messages[code] || 'Unknown build error';
  }

  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      phase: this.phase,
      recoverable: this.recoverable,
      stack: this.stack
    };
  }
}

/** CLI command options */
export interface CliOptions {
  /** Network to build for */
  network?: NetworkType;
  /** Target platform */
  platform?: Platform;
  /** Target architecture */
  arch?: Architecture;
  /** Tari version to use */
  version?: string;
  /** Build all networks */
  all?: boolean;
  /** Force rebuild */
  force?: boolean;
  /** Enable verbose output */
  verbose?: boolean;
  /** Enable debug mode */
  debug?: boolean;
  /** Output directory */
  output?: string;
  /** Number of parallel jobs */
  jobs?: number;
}

/** System requirements */
export interface SystemRequirements {
  /** Minimum Node.js version */
  nodeVersion: string;
  /** Required Rust version */
  rustVersion: string;
  /** Required system tools */
  tools: string[];
  /** Minimum disk space in bytes */
  diskSpace: number;
  /** Platform-specific requirements */
  platformSpecific: Record<Platform, string[]>;
}
