/**
 * Build configuration management and constants
 */

import { 
  NetworkType, 
  Platform, 
  Architecture, 
  BuildTarget, 
  SystemRequirements,
  LogLevel 
} from './types.js';

/** Default configuration values */
export const DEFAULT_CONFIG = {
  /** Default Tari version */
  TARI_VERSION: '4.3.1',
  
  /** Cache directory name */
  CACHE_DIR: '.tari-cache',
  
  /** Build artifacts directory */
  BUILD_DIR: 'dist',
  
  /** Default log level */
  LOG_LEVEL: LogLevel.Info,
  
  /** Maximum parallel build jobs */
  MAX_JOBS: 4,
  
  /** Git clone timeout in milliseconds */
  CLONE_TIMEOUT: 300000, // 5 minutes
  
  /** Build timeout in milliseconds */
  BUILD_TIMEOUT: 1800000, // 30 minutes
  
  /** Default features to enable */
  DEFAULT_FEATURES: ['wallet'],
  
  /** Retry attempts for network operations */
  NETWORK_RETRIES: 3,
  
  /** Retry delay in milliseconds */
  RETRY_DELAY: 1000
};

/** Tari repository configuration */
export const TARI_REPO = {
  /** Main Tari repository URL */
  URL: 'https://github.com/tari-project/tari.git',
  
  /** Default branch */
  DEFAULT_BRANCH: 'development',
  
  /** Wallet FFI subdirectory */
  WALLET_FFI_PATH: 'base_layer/wallet_ffi'
};

/** Tag resolution patterns for different networks */
export const TAG_PATTERNS = {
  [NetworkType.Mainnet]: (version: string) => `v${version}`,
  [NetworkType.Testnet]: (version: string, build: number = 0) => `v${version}-pre.${build}`,
  [NetworkType.Nextnet]: (version: string, build: number = 0) => `v${version}-rc.${build}`
};

/** Build target configurations */
export const BUILD_TARGETS: Record<string, BuildTarget> = {
  'darwin-x64': {
    platform: Platform.Darwin,
    arch: Architecture.X64,
    rustTarget: 'x86_64-apple-darwin',
    nodeArch: 'x64',
    extension: '.node'
  },
  'darwin-arm64': {
    platform: Platform.Darwin,
    arch: Architecture.ARM64,
    rustTarget: 'aarch64-apple-darwin',
    nodeArch: 'arm64',
    extension: '.node'
  },
  'win32-x64': {
    platform: Platform.Win32,
    arch: Architecture.X64,
    rustTarget: 'x86_64-pc-windows-msvc',
    nodeArch: 'x64',
    extension: '.node'
  },
  'linux-x64': {
    platform: Platform.Linux,
    arch: Architecture.X64,
    rustTarget: 'x86_64-unknown-linux-gnu',
    nodeArch: 'x64',
    extension: '.node'
  },
  'linux-arm64': {
    platform: Platform.Linux,
    arch: Architecture.ARM64,
    rustTarget: 'aarch64-unknown-linux-gnu',
    nodeArch: 'arm64',
    extension: '.node'
  },
  'linux-musl-x64': {
    platform: Platform.Linux,
    arch: Architecture.X64,
    rustTarget: 'x86_64-unknown-linux-musl',
    nodeArch: 'x64',
    extension: '.node'
  }
};

/** Package naming patterns */
export const PACKAGE_NAMING = {
  /** Base package name */
  BASE_NAME: '@tari-project/tarijs-wallet',
  
  /** Network-specific suffixes */
  SUFFIXES: {
    [NetworkType.Mainnet]: '',
    [NetworkType.Testnet]: '-testnet',
    [NetworkType.Nextnet]: '-nextnet'
  },
  
  /** Get package name for network */
  getPackageName: (network: NetworkType): string => {
    const suffix = PACKAGE_NAMING.SUFFIXES[network];
    return `${PACKAGE_NAMING.BASE_NAME}${suffix}`;
  }
};

/** System requirements by platform */
export const SYSTEM_REQUIREMENTS: SystemRequirements = {
  nodeVersion: '18.0.0',
  rustVersion: '1.70.0',
  tools: ['git', 'cargo', 'rustc'],
  diskSpace: 2 * 1024 * 1024 * 1024, // 2GB
  platformSpecific: {
    [Platform.Darwin]: ['xcode-select'],
    [Platform.Win32]: ['microsoft-c-build-tools'],
    [Platform.Linux]: ['build-essential', 'pkg-config', 'libssl-dev']
  }
};

/** Environment variable names */
export const ENV_VARS = {
  /** Tari source path */
  TARI_SOURCE_PATH: 'TARI_SOURCE_PATH',
  
  /** Build target */
  BUILD_TARGET: 'BUILD_TARGET',
  
  /** Network type */
  NETWORK_TYPE: 'NETWORK_TYPE',
  
  /** Log level */
  LOG_LEVEL: 'LOG_LEVEL',
  
  /** Cache directory */
  CACHE_DIR: 'TARI_CACHE_DIR',
  
  /** Force rebuild */
  FORCE_REBUILD: 'FORCE_REBUILD',
  
  /** Parallel jobs */
  JOBS: 'JOBS'
};

/** Default file paths */
export const PATHS = {
  /** Native workspace root */
  NATIVE_ROOT: 'native',
  
  /** FFI package directory */
  FFI_PACKAGE: 'native/tari-wallet-ffi',
  
  /** Build scripts directory */
  BUILD_SCRIPTS: 'packages/build/src',
  
  /** Cargo configuration */
  CARGO_CONFIG: 'native/.cargo',
  
  /** Target directory for Rust builds */
  RUST_TARGET: 'native/target',
  
  /** Package output directory */
  PACKAGE_OUTPUT: 'packages/build/dist'
};

/** Build feature flags */
export const FEATURES = {
  /** Available Cargo features */
  AVAILABLE: [
    'wallet',
    'metrics',
    'json-rpc',
    'grpc'
  ],
  
  /** Default features for wallet builds */
  WALLET_DEFAULT: ['wallet'],
  
  /** Development features */
  DEVELOPMENT: ['metrics'],
  
  /** Production features */
  PRODUCTION: ['wallet', 'json-rpc']
};

/** Network-specific configuration */
export const NETWORK_CONFIG = {
  [NetworkType.Mainnet]: {
    description: 'Tari Mainnet Wallet SDK',
    defaultPort: 18142,
    peers: [
      '/onion3/bsmuof2cn4y2ysz253gzsvg3s72fcgh4f3qcm3hdlxdtcwe6al2dicyd:18141'
    ]
  },
  [NetworkType.Testnet]: {
    description: 'Tari Testnet Wallet SDK',
    defaultPort: 18143,
    peers: [
      '/onion3/2m2xnylrsqbaozsndkbmfisxxbwh2vgvs6oyfak2qah4snnxykrf7zad:18141'
    ]
  },
  [NetworkType.Nextnet]: {
    description: 'Tari Nextnet Wallet SDK',
    defaultPort: 18144,
    peers: [
      '/onion3/33drw6b73w7x7nf3h6k7k5zr6j7mzprrgz7z7z7z7z7z7z7z7z7:18141'
    ]
  }
};

/** Validation patterns */
export const VALIDATION = {
  /** Version pattern (semantic versioning) */
  VERSION_PATTERN: /^\d+\.\d+\.\d+$/,
  
  /** Git tag pattern */
  TAG_PATTERN: /^v?\d+\.\d+\.\d+(-\w+\.\d+)?$/,
  
  /** Package name pattern */
  PACKAGE_NAME_PATTERN: /^@[\w-]+\/[\w-]+$/,
  
  /** Commit hash pattern */
  COMMIT_PATTERN: /^[a-f0-9]{40}$/,
  
  /** Path validation */
  PATH_PATTERN: /^[a-zA-Z0-9._/-]+$/
};

/**
 * Get current platform information
 */
export function getCurrentPlatform(): Platform {
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
 * Get current architecture information
 */
export function getCurrentArchitecture(): Architecture {
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
 * Get current build target
 */
export function getCurrentTarget(): BuildTarget {
  const platform = getCurrentPlatform();
  const arch = getCurrentArchitecture();
  const targetKey = `${platform}-${arch}`;
  
  const target = BUILD_TARGETS[targetKey];
  if (!target) {
    throw new Error(`No build target found for ${targetKey}`);
  }
  
  return target;
}

/**
 * Resolve Tari git tag for network and version
 */
export function resolveTariTag(
  version: string, 
  network: NetworkType, 
  buildNumber?: number
): string {
  const pattern = TAG_PATTERNS[network];
  
  if (network === NetworkType.Mainnet) {
    return pattern(version);
  } else {
    return pattern(version, buildNumber || 0);
  }
}

/**
 * Validate build configuration
 */
export function validateConfig(config: any): string[] {
  const errors: string[] = [];
  
  // Validate version
  if (config.version && !VALIDATION.VERSION_PATTERN.test(config.version)) {
    errors.push(`Invalid version format: ${config.version}`);
  }
  
  // Validate network
  if (config.network && !Object.values(NetworkType).includes(config.network)) {
    errors.push(`Invalid network type: ${config.network}`);
  }
  
  // Validate platform
  if (config.platform && !Object.values(Platform).includes(config.platform)) {
    errors.push(`Invalid platform: ${config.platform}`);
  }
  
  // Validate architecture
  if (config.arch && !Object.values(Architecture).includes(config.arch)) {
    errors.push(`Invalid architecture: ${config.arch}`);
  }
  
  return errors;
}
