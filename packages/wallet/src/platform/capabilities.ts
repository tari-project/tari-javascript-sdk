/**
 * @fileoverview Platform capabilities manager and feature detection
 * 
 * Provides centralized capability management with runtime feature detection
 * and platform-specific optimization recommendations.
 */

import { PlatformDetector, type PlatformCapabilities, type PlatformInfo } from './detector.js';

/**
 * Feature availability levels
 */
export type FeatureLevel = 
  | 'native'     // Native platform implementation available
  | 'polyfill'   // Polyfill/fallback implementation available
  | 'limited'    // Limited functionality available
  | 'unavailable'; // Feature not available

/**
 * Security levels for storage
 */
export type SecurityLevel =
  | 'hardware'   // Hardware-backed security
  | 'os'         // OS-level security
  | 'encrypted'  // Software encryption
  | 'plaintext'; // No encryption

/**
 * Detailed capability information
 */
export interface CapabilityInfo {
  /** Whether the capability is available */
  available: boolean;
  /** Feature availability level */
  level: FeatureLevel;
  /** Security level (for storage features) */
  securityLevel?: SecurityLevel;
  /** Additional implementation details */
  details: string;
  /** Recommended usage */
  recommendation: string;
}

/**
 * Capability assessment results
 */
export interface CapabilityAssessment {
  secureStorage: CapabilityInfo;
  workerThreads: CapabilityInfo;
  nativeModules: CapabilityInfo;
  sharedMemory: CapabilityInfo;
  fileSystem: CapabilityInfo;
  networkAccess: CapabilityInfo;
  ipcCommunication: CapabilityInfo;
  cryptoApis: CapabilityInfo;
}

/**
 * Platform optimization recommendations
 */
export interface OptimizationRecommendations {
  /** Recommended concurrency level */
  concurrency: number;
  /** Suggested memory allocation strategy */
  memoryStrategy: 'conservative' | 'balanced' | 'aggressive';
  /** Recommended storage backend */
  storageBackend: 'native' | 'encrypted-file' | 'memory';
  /** Suggested worker pool size */
  workerPoolSize: number;
  /** Platform-specific optimizations to enable */
  optimizations: string[];
}

/**
 * Platform capabilities manager
 */
export class CapabilitiesManager {
  private readonly platform: PlatformInfo;
  private cachedAssessment?: CapabilityAssessment;
  private cachedRecommendations?: OptimizationRecommendations;

  constructor() {
    this.platform = PlatformDetector.detect();
  }

  /**
   * Initialize capabilities manager (for backward compatibility)
   * This method is a no-op since initialization happens in constructor
   */
  async initialize(): Promise<void> {
    // Force assessment to run and cache results
    this.getCapabilityAssessment();
    this.getOptimizationRecommendations();
  }

  /**
   * Get detailed capability assessment
   */
  getCapabilityAssessment(): CapabilityAssessment {
    if (this.cachedAssessment) {
      return this.cachedAssessment;
    }

    this.cachedAssessment = {
      secureStorage: this.assessSecureStorage(),
      workerThreads: this.assessWorkerThreads(),
      nativeModules: this.assessNativeModules(),
      sharedMemory: this.assessSharedMemory(),
      fileSystem: this.assessFileSystem(),
      networkAccess: this.assessNetworkAccess(),
      ipcCommunication: this.assessIpcCommunication(),
      cryptoApis: this.assessCryptoApis(),
    };

    return this.cachedAssessment;
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): OptimizationRecommendations {
    if (this.cachedRecommendations) {
      return this.cachedRecommendations;
    }

    const assessment = this.getCapabilityAssessment();
    
    this.cachedRecommendations = {
      concurrency: this.recommendConcurrency(),
      memoryStrategy: this.recommendMemoryStrategy(),
      storageBackend: this.recommendStorageBackend(assessment.secureStorage),
      workerPoolSize: this.recommendWorkerPoolSize(),
      optimizations: this.recommendOptimizations(),
    };

    return this.cachedRecommendations;
  }

  /**
   * Check if a specific feature configuration is supported
   */
  isConfigurationSupported(config: {
    secureStorage?: boolean;
    workerThreads?: boolean;
    nativeModules?: boolean;
    concurrency?: number;
  }): boolean {
    const assessment = this.getCapabilityAssessment();

    if (config.secureStorage && !assessment.secureStorage.available) {
      return false;
    }

    if (config.workerThreads && !assessment.workerThreads.available) {
      return false;
    }

    if (config.nativeModules && !assessment.nativeModules.available) {
      return false;
    }

    if (config.concurrency) {
      const maxConcurrency = this.getMaxConcurrency();
      if (config.concurrency > maxConcurrency) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get maximum recommended concurrency
   */
  getMaxConcurrency(): number {
    const assessment = this.getCapabilityAssessment();
    
    if (!assessment.workerThreads.available) {
      return 1; // Single-threaded
    }

    // Estimate based on platform and runtime
    switch (this.platform.runtime) {
      case 'node':
        return this.getCpuCoreCount() * 2; // Node.js can handle more threads
      case 'electron-main':
        return Math.max(2, this.getCpuCoreCount());
      case 'electron-renderer':
        return Math.min(4, this.getCpuCoreCount()); // Limited in renderer
      case 'tauri':
        return Math.max(2, this.getCpuCoreCount()); // Tauri can handle multiple threads efficiently
      case 'browser':
        return Math.min(4, this.getCpuCoreCount()); // Browser limitations
      default:
        return 2; // Conservative default
    }
  }

  /**
   * Assess secure storage capability
   */
  private assessSecureStorage(): CapabilityInfo {
    if (!this.platform.capabilities.secureStorage) {
      return {
        available: false,
        level: 'unavailable',
        details: 'Platform does not support secure storage',
        recommendation: 'Use encrypted file storage as fallback'
      };
    }

    const { os, runtime } = this.platform;

    // Tauri provides enhanced security across all platforms
    if (runtime === 'tauri') {
      switch (os) {
        case 'darwin':
          return {
            available: true,
            level: 'native',
            securityLevel: 'os',
            details: 'Tauri-enhanced macOS Keychain with Rust security boundary and permission system',
            recommendation: 'Preferred for sensitive data with better security isolation than Electron'
          };

        case 'win32':
          return {
            available: true,
            level: 'native',
            securityLevel: 'os',
            details: 'Tauri-enhanced Windows Credential Store with strict permission allowlist',
            recommendation: 'Enhanced security with explicit permission model and DPAPI integration'
          };

        case 'linux':
          return {
            available: true,
            level: 'native',
            securityLevel: 'os',
            details: 'Tauri-enhanced Linux Secret Service with secure D-Bus communication',
            recommendation: 'Superior to Electron with memory-safe Rust implementation'
          };

        default:
          return {
            available: false,
            level: 'unavailable',
            details: 'Unknown platform in Tauri environment',
            recommendation: 'Use Tauri store plugin with encryption'
          };
      }
    }

    switch (os) {
      case 'darwin':
        return {
          available: true,
          level: 'native',
          securityLevel: 'os',
          details: 'macOS Keychain available with 4KB size limit',
          recommendation: 'Use for small sensitive data, chunk larger data'
        };

      case 'win32':
        return {
          available: true,
          level: 'native',
          securityLevel: 'os',
          details: 'Windows Credential Store available with 2.5KB size limit',
          recommendation: 'Use for small sensitive data, requires DPAPI for larger data'
        };

      case 'linux':
        return {
          available: true,
          level: 'polyfill',
          securityLevel: 'os',
          details: 'Linux Secret Service via D-Bus, may not be available on all distros',
          recommendation: 'Check for service availability, fallback to encrypted file'
        };

      default:
        return {
          available: false,
          level: 'unavailable',
          details: 'Unknown platform',
          recommendation: 'Use encrypted file storage'
        };
    }
  }

  /**
   * Assess worker threads capability
   */
  private assessWorkerThreads(): CapabilityInfo {
    if (!this.platform.capabilities.workerThreads) {
      return {
        available: false,
        level: 'unavailable',
        details: 'Worker threads not supported in this environment',
        recommendation: 'Use single-threaded operations'
      };
    }

    const { runtime } = this.platform;

    switch (runtime) {
      case 'node':
        return {
          available: true,
          level: 'native',
          details: 'Node.js worker_threads module available',
          recommendation: 'Use for CPU-intensive tasks'
        };

      case 'electron-main':
        return {
          available: true,
          level: 'native',
          details: 'Node.js worker_threads in Electron main process',
          recommendation: 'Use for background processing'
        };

      case 'electron-renderer':
        return {
          available: true,
          level: 'limited',
          details: 'Worker threads available but limited by renderer context',
          recommendation: 'Use sparingly, prefer main process for heavy work'
        };

      case 'tauri':
        return {
          available: true,
          level: 'native',
          details: 'Rust-based async runtime with Web Workers in frontend',
          recommendation: 'Excellent for CPU-intensive tasks with memory safety guarantees'
        };

      case 'browser':
        return {
          available: true,
          level: 'native',
          details: 'Web Workers available',
          recommendation: 'Use for offloading computation from main thread'
        };

      default:
        return {
          available: false,
          level: 'unavailable',
          details: 'Unknown runtime environment',
          recommendation: 'Use single-threaded operations'
        };
    }
  }

  /**
   * Assess native modules capability
   */
  private assessNativeModules(): CapabilityInfo {
    if (!this.platform.capabilities.nativeModules) {
      return {
        available: false,
        level: 'unavailable',
        details: 'Native modules not supported (browser environment)',
        recommendation: 'Use WebAssembly or pure JavaScript implementations'
      };
    }

    return {
      available: true,
      level: 'native',
      details: 'Node.js native modules supported',
      recommendation: 'Use for performance-critical operations'
    };
  }

  /**
   * Assess shared memory capability
   */
  private assessSharedMemory(): CapabilityInfo {
    if (!this.platform.capabilities.sharedMemory) {
      return {
        available: false,
        level: 'unavailable',
        details: 'Shared memory not available',
        recommendation: 'Use message passing for worker communication'
      };
    }

    const { runtime } = this.platform;

    if (runtime === 'browser') {
      return {
        available: true,
        level: 'limited',
        details: 'SharedArrayBuffer available (requires secure context)',
        recommendation: 'Use for high-performance worker communication'
      };
    }

    return {
      available: true,
      level: 'native',
      details: 'Node.js shared memory available',
      recommendation: 'Use for zero-copy data sharing between workers'
    };
  }

  /**
   * Assess file system capability
   */
  private assessFileSystem(): CapabilityInfo {
    if (!this.platform.capabilities.fileSystem) {
      return {
        available: false,
        level: 'unavailable',
        details: 'File system access not available (browser environment)',
        recommendation: 'Use IndexedDB or localStorage for data persistence'
      };
    }

    return {
      available: true,
      level: 'native',
      details: 'Full file system access available',
      recommendation: 'Use for wallet storage and logging'
    };
  }

  /**
   * Assess network access capability
   */
  private assessNetworkAccess(): CapabilityInfo {
    if (!this.platform.capabilities.networkAccess) {
      return {
        available: false,
        level: 'unavailable',
        details: 'Network access not available',
        recommendation: 'Check environment configuration'
      };
    }

    const { runtime } = this.platform;

    if (runtime === 'browser') {
      return {
        available: true,
        level: 'limited',
        details: 'Browser network access with CORS restrictions',
        recommendation: 'Configure appropriate CORS headers for API access'
      };
    }

    return {
      available: true,
      level: 'native',
      details: 'Full network access available',
      recommendation: 'Use for blockchain communication'
    };
  }

  /**
   * Assess IPC communication capability
   */
  private assessIpcCommunication(): CapabilityInfo {
    if (!this.platform.capabilities.ipcCommunication) {
      return {
        available: false,
        level: 'unavailable',
        details: 'IPC not available (not in framework environment)',
        recommendation: 'Use direct API calls'
      };
    }

    const { runtime } = this.platform;

    if (runtime === 'tauri') {
      return {
        available: true,
        level: 'native',
        securityLevel: 'os',
        details: 'Tauri invoke system with type-safe Rust commands and explicit permission allowlist',
        recommendation: 'Preferred for security-critical operations with minimal attack surface'
      };
    }

    if (runtime.startsWith('electron')) {
      return {
        available: true,
        level: 'native',
        details: 'Electron IPC available',
        recommendation: 'Use for secure communication between main and renderer'
      };
    }

    return {
      available: true,
      level: 'native',
      details: 'IPC communication available',
      recommendation: 'Use for inter-process communication'
    };
  }

  /**
   * Assess crypto APIs capability
   */
  private assessCryptoApis(): CapabilityInfo {
    if (!this.platform.capabilities.cryptoApis) {
      return {
        available: false,
        level: 'unavailable',
        details: 'No crypto APIs available',
        recommendation: 'Install crypto polyfills'
      };
    }

    const { runtime } = this.platform;

    if (runtime === 'tauri') {
      return {
        available: true,
        level: 'native',
        securityLevel: 'os',
        details: 'Rust crypto libraries with hardware acceleration and memory safety',
        recommendation: 'Preferred for crypto operations with superior security guarantees'
      };
    }

    if (runtime === 'browser') {
      return {
        available: true,
        level: 'native',
        details: 'Web Crypto API available',
        recommendation: 'Use for cryptographic operations'
      };
    }

    return {
      available: true,
      level: 'native',
      details: 'Node.js crypto module available',
      recommendation: 'Use for all cryptographic operations'
    };
  }

  /**
   * Recommend concurrency level
   */
  private recommendConcurrency(): number {
    const maxConcurrency = this.getMaxConcurrency();
    
    // Conservative recommendation is 75% of max
    return Math.max(1, Math.floor(maxConcurrency * 0.75));
  }

  /**
   * Recommend memory strategy
   */
  private recommendMemoryStrategy(): 'conservative' | 'balanced' | 'aggressive' {
    const { runtime, arch } = this.platform;

    if (runtime === 'tauri') {
      // Tauri has lower memory overhead, can be more aggressive
      return arch === 'x64' ? 'balanced' : 'conservative';
    }

    if (runtime === 'electron-renderer' || runtime === 'browser') {
      return 'conservative'; // Limited memory in renderer processes
    }

    if (arch === 'x64') {
      return 'balanced'; // 64-bit can handle more memory
    }

    return 'conservative'; // Safe default
  }

  /**
   * Recommend storage backend
   */
  private recommendStorageBackend(
    secureStorageInfo: CapabilityInfo
  ): 'native' | 'encrypted-file' | 'memory' {
    if (secureStorageInfo.level === 'native') {
      return 'native';
    }

    if (this.platform.capabilities.fileSystem) {
      return 'encrypted-file';
    }

    return 'memory'; // Last resort
  }

  /**
   * Recommend worker pool size
   */
  private recommendWorkerPoolSize(): number {
    const assessment = this.getCapabilityAssessment();
    
    if (!assessment.workerThreads.available) {
      return 0; // No workers
    }

    return Math.max(2, Math.min(4, this.getCpuCoreCount()));
  }

  /**
   * Recommend platform-specific optimizations
   */
  private recommendOptimizations(): string[] {
    const optimizations: string[] = [];
    const { os, runtime, arch } = this.platform;

    // Platform-specific optimizations
    if (os === 'darwin') {
      optimizations.push('use-metal-performance-shaders');
      optimizations.push('use-grand-central-dispatch');
    }

    if (os === 'win32') {
      optimizations.push('use-windows-thread-pool');
      optimizations.push('use-io-completion-ports');
    }

    if (os === 'linux') {
      optimizations.push('use-epoll');
      optimizations.push('use-linux-io-uring');
    }

    // Architecture-specific optimizations
    if (arch === 'arm64') {
      optimizations.push('use-neon-instructions');
    }

    if (arch === 'x64') {
      optimizations.push('use-avx-instructions');
    }

    // Runtime-specific optimizations
    if (runtime === 'tauri') {
      optimizations.push('use-rust-async-runtime');
      optimizations.push('enable-zero-copy-serialization');
      optimizations.push('use-tauri-invoke-batching');
      optimizations.push('enable-hardware-crypto-acceleration');
      optimizations.push('use-memory-safe-buffers');
    }

    if (runtime === 'electron-main') {
      optimizations.push('use-v8-snapshots');
      optimizations.push('optimize-ipc-serialization');
    }

    return optimizations;
  }

  /**
   * Get CPU core count estimate
   */
  private getCpuCoreCount(): number {
    if (this.platform.capabilities.nativeModules) {
      try {
        const os = require('os');
        return os.cpus().length;
      } catch {
        // Fall through to estimation
      }
    }

    // Estimate based on navigator.hardwareConcurrency in browser
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return navigator.hardwareConcurrency;
    }

    // Conservative default
    return 4;
  }
}

/**
 * Global capabilities manager instance
 */
let globalCapabilitiesManager: CapabilitiesManager | undefined;

/**
 * Get global capabilities manager
 */
export function getCapabilitiesManager(): CapabilitiesManager {
  if (!globalCapabilitiesManager) {
    globalCapabilitiesManager = new CapabilitiesManager();
  }
  return globalCapabilitiesManager;
}

/**
 * Get capability assessment for current platform
 */
export function getCapabilityAssessment(): CapabilityAssessment {
  return getCapabilitiesManager().getCapabilityAssessment();
}

/**
 * Get optimization recommendations for current platform
 */
export function getOptimizationRecommendations(): OptimizationRecommendations {
  return getCapabilitiesManager().getOptimizationRecommendations();
}
