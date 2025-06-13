/**
 * @fileoverview Platform detection and runtime environment identification
 * 
 * Provides comprehensive platform detection beyond process.platform, including
 * runtime environment detection (Node.js, Electron main/renderer, browser) and
 * platform-specific capability identification.
 */

// Use type assertions for browser globals to avoid compilation errors

/**
 * Operating system types
 */
export type OperatingSystem = 'darwin' | 'win32' | 'linux' | 'unknown';

/**
 * Runtime environment types
 */
export type RuntimeEnvironment = 
  | 'node'              // Pure Node.js
  | 'electron-main'     // Electron main process
  | 'electron-renderer' // Electron renderer process
  | 'tauri'             // Tauri application
  | 'browser'           // Web browser
  | 'unknown';          // Unable to determine

/**
 * CPU architecture types
 */
export type Architecture = 'x64' | 'arm64' | 'x86' | 'unknown';

/**
 * Platform capabilities flags
 */
export interface PlatformCapabilities {
  /** Native secure storage available (keychain, credential store, etc.) */
  secureStorage: boolean;
  /** Worker threads support */
  workerThreads: boolean;
  /** Native modules can be loaded */
  nativeModules: boolean;
  /** Shared memory support */
  sharedMemory: boolean;
  /** File system access */
  fileSystem: boolean;
  /** Network access */
  networkAccess: boolean;
  /** IPC communication available */
  ipcCommunication: boolean;
  /** Crypto APIs available */
  cryptoApis: boolean;
}

/**
 * Complete platform information
 */
export interface PlatformInfo {
  /** Operating system */
  os: OperatingSystem;
  /** Runtime environment */
  runtime: RuntimeEnvironment;
  /** CPU architecture */
  arch: Architecture;
  /** OS version string */
  version: string;
  /** Available capabilities */
  capabilities: PlatformCapabilities;
  /** Node.js version (if applicable) */
  nodeVersion?: string;
  /** Electron version (if applicable) */
  electronVersion?: string;
  /** Tauri version (if applicable) */
  tauriVersion?: string;
}

/**
 * Platform detector implementation
 */
export class PlatformDetector {
  private static cachedInfo?: PlatformInfo;

  /**
   * Detect current platform information
   */
  static detect(): PlatformInfo {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const info: PlatformInfo = {
      os: this.detectOperatingSystem(),
      runtime: this.detectRuntimeEnvironment(),
      arch: this.detectArchitecture(),
      version: this.detectVersion(),
      capabilities: this.detectCapabilities(),
    };

    // Add version information if available
    if (this.hasNodeProcess()) {
      info.nodeVersion = process.version;
    }

    if (info.runtime.startsWith('electron')) {
      info.electronVersion = this.detectElectronVersion();
    }

    if (info.runtime === 'tauri') {
      info.tauriVersion = this.detectTauriVersion();
    }

    this.cachedInfo = info;
    return info;
  }

  /**
   * Clear cached platform information (for testing)
   */
  static clearCache(): void {
    this.cachedInfo = undefined;
  }

  /**
   * Check if running in specific environment
   */
  static isNode(): boolean {
    return this.detect().runtime === 'node';
  }

  static isElectronMain(): boolean {
    return this.detect().runtime === 'electron-main';
  }

  static isElectronRenderer(): boolean {
    return this.detect().runtime === 'electron-renderer';
  }

  static isBrowser(): boolean {
    return this.detect().runtime === 'browser';
  }

  static isElectron(): boolean {
    const runtime = this.detect().runtime;
    return runtime === 'electron-main' || runtime === 'electron-renderer';
  }

  static isTauri(): boolean {
    return this.detect().runtime === 'tauri';
  }

  /**
   * Check platform capabilities
   */
  static hasCapability(capability: keyof PlatformCapabilities): boolean {
    return this.detect().capabilities[capability];
  }

  static getCapabilities(): PlatformCapabilities {
    return this.detect().capabilities;
  }

  /**
   * Get platform-specific storage directory
   */
  static getDefaultStorageDir(appName: string = 'Tari'): string {
    const { os } = this.detect();
    
    if (!this.hasNodeProcess()) {
      return './storage'; // Fallback for non-Node environments
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    
    switch (os) {
      case 'win32':
        return `${process.env.APPDATA || homeDir}\\${appName}`;
      case 'darwin':
        return `${homeDir}/Library/Application Support/${appName}`;
      case 'linux':
        return `${homeDir}/.${appName.toLowerCase()}`;
      default:
        return `${homeDir}/.${appName.toLowerCase()}`;
    }
  }

  /**
   * Get platform-specific temp directory
   */
  static getTempDir(): string {
    if (!this.hasNodeProcess()) {
      return './tmp';
    }

    return process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp';
  }

  /**
   * Detect operating system
   */
  private static detectOperatingSystem(): OperatingSystem {
    if (this.hasNodeProcess()) {
      const platform = process.platform;
      if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
        return platform;
      }
    }

    // Browser detection
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('mac')) return 'darwin';
      if (userAgent.includes('win')) return 'win32';
      if (userAgent.includes('linux')) return 'linux';
    }

    return 'unknown';
  }

  /**
   * Detect runtime environment
   */
  private static detectRuntimeEnvironment(): RuntimeEnvironment {
    // Check for Tauri first (has priority over other frameworks for security)
    if (this.isTauriEnvironment()) {
      return 'tauri';
    }

    // Check for Node.js process
    if (!this.hasNodeProcess()) {
      return typeof window !== 'undefined' ? 'browser' : 'unknown';
    }

    // Check for Electron
    if (this.isElectronEnvironment()) {
      // Main process has no window object
      if (typeof window === 'undefined') {
        return 'electron-main';
      }
      // Renderer process has window object
      return 'electron-renderer';
    }

    // Pure Node.js
    return 'node';
  }

  /**
   * Detect CPU architecture
   */
  private static detectArchitecture(): Architecture {
    if (this.hasNodeProcess()) {
      const arch = process.arch;
      if (arch === 'x64' || arch === 'arm64' || arch === 'ia32') {
        return arch === 'ia32' ? 'x86' : arch as Architecture;
      }
    }

    return 'unknown';
  }

  /**
   * Detect OS version
   */
  private static detectVersion(): string {
    if (this.hasNodeProcess()) {
      try {
        const os = require('os');
        return os.release();
      } catch {
        // os module not available
      }
    }

    if (typeof navigator !== 'undefined') {
      return navigator.userAgent;
    }

    return 'unknown';
  }

  /**
   * Detect Electron version
   */
  private static detectElectronVersion(): string | undefined {
    if (this.hasNodeProcess()) {
      try {
        return process.versions.electron;
      } catch {
        // Not in Electron
      }
    }

    return undefined;
  }

  /**
   * Detect Tauri version
   */
  private static detectTauriVersion(): string | undefined {
    try {
      // Access Tauri version from window.__TAURI__
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        return (window as any).__TAURI__.version || (window as any).__TAURI__.__version;
      }
      
      // Alternative: try to get version from app API
      if (typeof window !== 'undefined' && (window as any).__TAURI__?.app?.getTauriVersion) {
        // This is async, but we'll try to return synchronously for now
        // In practice, version info should be available in the main object
        return undefined;
      }
    } catch {
      // Not in Tauri or error accessing version
    }

    return undefined;
  }

  /**
   * Detect platform capabilities
   */
  private static detectCapabilities(): PlatformCapabilities {
    const runtime = this.detectRuntimeEnvironment();
    const os = this.detectOperatingSystem();
    
    return {
      secureStorage: this.detectSecureStorageCapability(os, runtime),
      workerThreads: this.detectWorkerThreadsCapability(runtime),
      nativeModules: this.detectNativeModulesCapability(runtime),
      sharedMemory: this.detectSharedMemoryCapability(runtime),
      fileSystem: this.detectFileSystemCapability(runtime),
      networkAccess: this.detectNetworkCapability(runtime),
      ipcCommunication: this.detectIpcCapability(runtime),
      cryptoApis: this.detectCryptoCapability(),
    };
  }

  /**
   * Check for secure storage capability
   */
  private static detectSecureStorageCapability(
    os: OperatingSystem, 
    runtime: RuntimeEnvironment
  ): boolean {
    // Available in Node.js, Electron main process, or Tauri
    if (runtime !== 'node' && runtime !== 'electron-main' && runtime !== 'tauri') {
      return false;
    }

    // Platform-specific secure storage
    return os === 'darwin' || os === 'win32' || os === 'linux';
  }

  /**
   * Check for worker threads capability
   */
  private static detectWorkerThreadsCapability(runtime: RuntimeEnvironment): boolean {
    if (runtime === 'browser') {
      return typeof Worker !== 'undefined';
    }

    if (runtime === 'node' || runtime.startsWith('electron')) {
      try {
        require.resolve('worker_threads');
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Check for native modules capability
   */
  private static detectNativeModulesCapability(runtime: RuntimeEnvironment): boolean {
    // Only available in Node.js environments
    if (runtime === 'browser') {
      return false;
    }

    // Check if we can require native modules
    try {
      require.resolve('fs');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for shared memory capability
   */
  private static detectSharedMemoryCapability(runtime: RuntimeEnvironment): boolean {
    if (runtime === 'browser') {
      return typeof SharedArrayBuffer !== 'undefined';
    }

    // Node.js environments typically support shared memory
    return runtime !== 'unknown';
  }

  /**
   * Check for file system capability
   */
  private static detectFileSystemCapability(runtime: RuntimeEnvironment): boolean {
    if (runtime === 'browser') {
      return false; // Limited file system access in browsers
    }

    try {
      require.resolve('fs');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for network capability
   */
  private static detectNetworkCapability(runtime: RuntimeEnvironment): boolean {
    if (runtime === 'browser') {
      return typeof fetch !== 'undefined' || typeof XMLHttpRequest !== 'undefined';
    }

    try {
      require.resolve('https');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for IPC capability
   */
  private static detectIpcCapability(runtime: RuntimeEnvironment): boolean {
    if (runtime.startsWith('electron')) {
      try {
        require.resolve('electron');
        return true;
      } catch {
        return false;
      }
    }

    // Tauri has IPC via invoke system
    if (runtime === 'tauri') {
      return typeof window !== 'undefined' && 
             (window as any).__TAURI__ !== undefined &&
             typeof (window as any).__TAURI__.invoke === 'function';
    }

    return false;
  }

  /**
   * Check for crypto APIs capability
   */
  private static detectCryptoCapability(): boolean {
    // Check for Web Crypto API
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      return true;
    }

    // Check for Node.js crypto module
    try {
      require.resolve('crypto');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if process object exists and looks like Node.js
   */
  private static hasNodeProcess(): boolean {
    return typeof process !== 'undefined' && 
           process.versions !== undefined && 
           process.versions.node !== undefined;
  }

  /**
   * Check if running in Electron environment
   */
  private static isElectronEnvironment(): boolean {
    return this.hasNodeProcess() && 
           (process.versions.electron !== undefined || 
            process.env.ELECTRON_RUN_AS_NODE !== undefined);
  }

  /**
   * Check if running in Tauri environment
   */
  private static isTauriEnvironment(): boolean {
    // Check for Tauri global object
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      return true;
    }

    // Check for Tauri-specific environment variables (for debugging)
    if (typeof process !== 'undefined' && process.env) {
      return process.env.TAURI_ENV !== undefined || 
             process.env.TAURI_PLATFORM !== undefined;
    }

    return false;
  }
}

/**
 * Cached platform information for quick access
 */
let platformInfo: PlatformInfo | undefined;

/**
 * Get platform information (cached)
 */
export function getPlatformInfo(): PlatformInfo {
  if (!platformInfo) {
    platformInfo = PlatformDetector.detect();
  }
  return platformInfo;
}

/**
 * Convenience exports
 */
export const isNode = () => PlatformDetector.isNode();
export const isElectronMain = () => PlatformDetector.isElectronMain();
export const isElectronRenderer = () => PlatformDetector.isElectronRenderer();
export const isBrowser = () => PlatformDetector.isBrowser();
export const isElectron = () => PlatformDetector.isElectron();
export const isTauri = () => PlatformDetector.isTauri();
export const hasCapability = (cap: keyof PlatformCapabilities) => PlatformDetector.hasCapability(cap);
export const getCapabilities = () => PlatformDetector.getCapabilities();
