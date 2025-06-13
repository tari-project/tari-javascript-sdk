/**
 * @fileoverview Environment detection utilities with feature detection
 * 
 * Provides comprehensive environment detection for browser/Node.js/Tauri/Electron
 * compatibility. Uses feature detection patterns for reliable cross-platform operation.
 */

import type { 
  BrowserEnvironmentCheck, 
  WindowWithTauri, 
  NavigatorWithExtensions,
  PerformanceWithMemory,
  ProcessWithExtensions
} from '../types/browser-globals';

/**
 * Detailed environment information
 */
export interface EnvironmentInfo extends BrowserEnvironmentCheck {
  /** Runtime environment type */
  runtime: 'browser' | 'node' | 'tauri' | 'electron' | 'unknown';
  /** Platform information */
  platform: string;
  /** User agent string (if available) */
  userAgent?: string;
  /** Node.js version (if available) */
  nodeVersion?: string;
  /** Electron version (if available) */
  electronVersion?: string;
  /** Tauri version (if available) */
  tauriVersion?: string;
  /** Available APIs */
  apis: {
    webWorkers: boolean;
    serviceWorkers: boolean;
    indexedDB: boolean;
    localStorage: boolean;
    sessionStorage: boolean;
    webCrypto: boolean;
    fileSystem: boolean;
    clipboard: boolean;
  };
}

/**
 * Safe getter for global objects with fallbacks
 */
export class SafeGlobals {
  /**
   * Safely get window object
   */
  static getWindow(): WindowWithTauri | undefined {
    try {
      return typeof window !== 'undefined' ? window : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Safely get navigator object
   */
  static getNavigator(): NavigatorWithExtensions | undefined {
    try {
      return typeof navigator !== 'undefined' ? navigator : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Safely get document object
   */
  static getDocument(): any | undefined {
    try {
      return typeof document !== 'undefined' ? document : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Safely get performance object
   */
  static getPerformance(): PerformanceWithMemory | undefined {
    try {
      return typeof performance !== 'undefined' ? performance : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Safely get process object
   */
  static getProcess(): ProcessWithExtensions | undefined {
    try {
      return typeof process !== 'undefined' ? process : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Safely check for Worker constructor
   */
  static hasWorker(): boolean {
    try {
      return typeof Worker !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Safely check for XMLHttpRequest constructor
   */
  static hasXMLHttpRequest(): boolean {
    try {
      return typeof XMLHttpRequest !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Safely check for Transferable type
   */
  static hasTransferable(): boolean {
    try {
      // Transferable is a type, not a runtime value, so check for Worker instead
      return typeof Worker !== 'undefined';
    } catch {
      return false;
    }
  }
}

/**
 * Environment detection utility class
 */
export class EnvironmentDetector {
  private static _cached: EnvironmentInfo | null = null;

  /**
   * Detect current environment with caching
   */
  static detect(): EnvironmentInfo {
    if (this._cached) {
      return this._cached;
    }

    this._cached = this._performDetection();
    return this._cached;
  }

  /**
   * Force re-detection (clears cache)
   */
  static forceRedetect(): EnvironmentInfo {
    this._cached = null;
    return this.detect();
  }

  /**
   * Check if running in browser environment
   */
  static isBrowser(): boolean {
    return this.detect().isBrowser;
  }

  /**
   * Check if running in Node.js environment
   */
  static isNode(): boolean {
    return this.detect().isNode;
  }

  /**
   * Check if running in Tauri environment
   */
  static isTauri(): boolean {
    return this.detect().hasTauri;
  }

  /**
   * Check if running in Electron environment
   */
  static isElectron(): boolean {
    return this.detect().hasElectron;
  }

  /**
   * Get safe window reference
   */
  static getWindow(): WindowWithTauri | undefined {
    return SafeGlobals.getWindow();
  }

  /**
   * Get safe navigator reference
   */
  static getNavigator(): NavigatorWithExtensions | undefined {
    return SafeGlobals.getNavigator();
  }

  /**
   * Get safe document reference
   */
  static getDocument(): any | undefined {
    return SafeGlobals.getDocument();
  }

  /**
   * Get safe performance reference
   */
  static getPerformance(): PerformanceWithMemory | undefined {
    return SafeGlobals.getPerformance();
  }

  /**
   * Get safe process reference
   */
  static getProcess(): ProcessWithExtensions | undefined {
    return SafeGlobals.getProcess();
  }

  /**
   * Perform the actual environment detection
   */
  private static _performDetection(): EnvironmentInfo {
    const window = SafeGlobals.getWindow();
    const navigator = SafeGlobals.getNavigator();
    const document = SafeGlobals.getDocument();
    const performance = SafeGlobals.getPerformance();
    const process = SafeGlobals.getProcess();

    // Basic environment checks
    const hasWindow = !!window;
    const hasNavigator = !!navigator;
    const hasDocument = !!document;
    const hasPerformance = !!performance;
    const hasProcess = !!process;

    // Browser detection
    const isBrowser = hasWindow && hasNavigator && hasDocument;
    
    // Node.js detection
    const isNode = hasProcess && 
                   typeof process?.versions?.node === 'string' &&
                   !hasWindow;

    // Tauri detection
    const hasTauri = hasWindow && 
                     typeof window.__TAURI__ === 'object' &&
                     typeof window.__TAURI__?.invoke === 'function';

    // Electron detection
    const hasElectron = hasProcess &&
                        typeof process?.versions?.electron === 'string';

    // Runtime determination
    let runtime: EnvironmentInfo['runtime'] = 'unknown';
    if (hasTauri) {
      runtime = 'tauri';
    } else if (hasElectron) {
      runtime = 'electron';
    } else if (isBrowser) {
      runtime = 'browser';
    } else if (isNode) {
      runtime = 'node';
    }

    // Platform detection
    let platform = 'unknown';
    if (hasProcess && process.platform) {
      platform = process.platform;
    } else if (hasNavigator && (navigator as any).platform) {
      platform = (navigator as any).platform;
    } else if (hasNavigator && (navigator as any).userAgentData?.platform) {
      platform = (navigator as any).userAgentData.platform;
    }

    // Version information
    const nodeVersion = process?.versions?.node;
    const electronVersion = process?.versions?.electron;
    const tauriVersion = (window as any)?.__TAURI_METADATA__?.version;

    // User agent
    const userAgent = (navigator as any)?.userAgent;

    // API availability detection
    const apis = {
      webWorkers: SafeGlobals.hasWorker(),
      serviceWorkers: isBrowser && 'serviceWorker' in navigator,
      indexedDB: isBrowser && 'indexedDB' in window,
      localStorage: this._hasStorage('localStorage'),
      sessionStorage: this._hasStorage('sessionStorage'),
      webCrypto: isBrowser && 'crypto' in window && 'subtle' in (window as any).crypto,
      fileSystem: this._hasFileSystemAPI(),
      clipboard: this._hasClipboardAPI()
    };

    return {
      isBrowser,
      isNode,
      hasWindow,
      hasNavigator,
      hasDocument,
      hasPerformance,
      hasWorker: SafeGlobals.hasWorker(),
      hasTauri,
      hasElectron,
      runtime,
      platform,
      userAgent,
      nodeVersion,
      electronVersion,
      tauriVersion,
      apis
    };
  }

  /**
   * Check if storage API is available
   */
  private static _hasStorage(type: 'localStorage' | 'sessionStorage'): boolean {
    try {
      const window = SafeGlobals.getWindow();
      if (!window) return false;
      
      const storage = (window as any)[type];
      if (!storage) return false;

      const testKey = '__test_storage__';
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if File System Access API is available
   */
  private static _hasFileSystemAPI(): boolean {
    try {
      const window = SafeGlobals.getWindow();
      return !!(window && 'showOpenFilePicker' in window);
    } catch {
      return false;
    }
  }

  /**
   * Check if Clipboard API is available
   */
  private static _hasClipboardAPI(): boolean {
    try {
      const navigator = SafeGlobals.getNavigator();
      return !!(navigator && 'clipboard' in navigator);
    } catch {
      return false;
    }
  }
}

/**
 * Simple feature detection functions for common use cases
 */
export const isSupported = {
  /**
   * Check if in browser environment
   */
  browser: () => EnvironmentDetector.isBrowser(),

  /**
   * Check if in Node.js environment
   */
  node: () => EnvironmentDetector.isNode(),

  /**
   * Check if in Tauri environment
   */
  tauri: () => EnvironmentDetector.isTauri(),

  /**
   * Check if in Electron environment
   */
  electron: () => EnvironmentDetector.isElectron(),

  /**
   * Check if Web Workers are supported
   */
  workers: () => EnvironmentDetector.detect().apis.webWorkers,

  /**
   * Check if localStorage is supported
   */
  localStorage: () => EnvironmentDetector.detect().apis.localStorage,

  /**
   * Check if Web Crypto API is supported
   */
  webCrypto: () => EnvironmentDetector.detect().apis.webCrypto,

  /**
   * Check if File System Access API is supported
   */
  fileSystem: () => EnvironmentDetector.detect().apis.fileSystem,

  /**
   * Check if performance.memory is available
   */
  performanceMemory: () => {
    const perf = SafeGlobals.getPerformance();
    return !!(perf && 'memory' in perf);
  }
};

/**
 * Create fallback implementations for missing browser APIs
 */
export const createFallbacks = {
  /**
   * Create a console fallback for environments without console
   */
  console: () => ({
    log: (...args: any[]) => {},
    warn: (...args: any[]) => {},
    error: (...args: any[]) => {},
    info: (...args: any[]) => {},
    debug: (...args: any[]) => {}
  }),

  /**
   * Create a performance fallback for environments without performance API
   */
  performance: () => ({
    now: () => Date.now(),
    mark: (name: string) => {},
    measure: (name: string, startMark?: string, endMark?: string) => {},
    getEntriesByName: (name: string) => [],
    getEntriesByType: (type: string) => []
  }),

  /**
   * Create a storage fallback for environments without localStorage
   */
  storage: () => {
    const storage = new Map<string, string>();
    return {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      get length() { return storage.size; },
      key: (index: number) => Array.from(storage.keys())[index] || null
    };
  }
};

/**
 * Export the main detection function as default
 */
export default EnvironmentDetector;
