/**
 * @fileoverview Process global detection utilities for cross-platform compatibility
 * 
 * Provides safe access to Node.js process global with proper type guards and fallbacks.
 * Ensures compatibility across browser, Node.js, Tauri, and Electron environments.
 */

/**
 * Process environment information
 */
export interface ProcessInfo {
  /** Whether process global is available */
  hasProcess: boolean;
  /** Node.js version if available */
  nodeVersion?: string;
  /** Process version if available */
  processVersion?: string;
  /** Whether running in Electron */
  isElectron: boolean;
  /** Whether running in Tauri */
  isTauri: boolean;
  /** Platform information */
  platform?: string;
  /** Architecture information */
  arch?: string;
}

/**
 * Safe process global access utilities
 */
export class ProcessDetection {
  private static _processInfo: ProcessInfo | null = null;

  /**
   * Check if process global is available
   */
  static hasProcess(): boolean {
    return typeof process !== 'undefined' && process !== null;
  }

  /**
   * Safely get process global
   */
  static getProcess(): NodeJS.Process | undefined {
    return this.hasProcess() ? process : undefined;
  }

  /**
   * Safely get process environment
   */
  static getProcessEnv(): NodeJS.ProcessEnv | Record<string, string> {
    if (this.hasProcess() && process.env) {
      return process.env;
    }
    return {};
  }

  /**
   * Safely get environment variable
   */
  static getEnvVar(key: string, defaultValue: string = ''): string {
    const env = this.getProcessEnv();
    return env[key] ?? defaultValue;
  }

  /**
   * Safely get process memory usage
   */
  static getMemoryUsage(): NodeJS.MemoryUsage | null {
    const proc = this.getProcess();
    if (proc && typeof proc.memoryUsage === 'function') {
      try {
        return proc.memoryUsage();
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Get comprehensive process information
   */
  static getProcessInfo(): ProcessInfo {
    if (this._processInfo) {
      return this._processInfo;
    }

    const hasProc = this.hasProcess();
    const proc = hasProc ? process : undefined;

    this._processInfo = {
      hasProcess: hasProc,
      nodeVersion: proc?.versions?.node,
      processVersion: proc?.version,
      isElectron: !!(proc?.versions?.electron),
      isTauri: !!(typeof window !== 'undefined' && (window as any).__TAURI__),
      platform: proc?.platform,
      arch: proc?.arch,
    };

    return this._processInfo;
  }

  /**
   * Reset cached process information (for testing)
   */
  static resetCache(): void {
    this._processInfo = null;
  }

  /**
   * Check if running in specific environment
   */
  static isNode(): boolean {
    return this.getProcessInfo().hasProcess && !this.isElectron() && !this.isTauri();
  }

  static isElectron(): boolean {
    return this.getProcessInfo().isElectron;
  }

  static isTauri(): boolean {
    return this.getProcessInfo().isTauri;
  }

  static isBrowser(): boolean {
    return typeof window !== 'undefined' && !this.isElectron() && !this.isTauri();
  }

  /**
   * Safe process.nextTick equivalent
   */
  static nextTick(callback: () => void): void {
    const proc = this.getProcess();
    if (proc && typeof proc.nextTick === 'function') {
      proc.nextTick(callback);
    } else if (typeof setImmediate === 'function') {
      setImmediate(callback);
    } else {
      setTimeout(callback, 0);
    }
  }

  /**
   * Safe process exit handler
   */
  static onExit(callback: () => void): () => void {
    const proc = this.getProcess();
    if (proc && typeof proc.on === 'function') {
      proc.on('exit', callback);
      proc.on('SIGINT', callback);
      proc.on('SIGTERM', callback);
      
      return () => {
        proc.removeListener('exit', callback);
        proc.removeListener('SIGINT', callback);
        proc.removeListener('SIGTERM', callback);
      };
    }

    // Fallback for non-Node.js environments
    if (typeof window !== 'undefined') {
      const handler = () => callback();
      window.addEventListener('beforeunload', handler);
      window.addEventListener('unload', handler);
      
      return () => {
        window.removeEventListener('beforeunload', handler);
        window.removeEventListener('unload', handler);
      };
    }

    // No-op for unsupported environments
    return () => {};
  }

  /**
   * Safe process.hrtime equivalent
   */
  static hrtime(start?: [number, number]): [number, number] {
    const proc = this.getProcess();
    if (proc && typeof proc.hrtime === 'function') {
      return proc.hrtime(start);
    }

    // Fallback using performance.now()
    if (typeof performance !== 'undefined' && performance.now) {
      const now = performance.now();
      if (start) {
        const elapsed = now - (start[0] * 1000 + start[1] / 1e6);
        const seconds = Math.floor(elapsed / 1000);
        const nanoseconds = Math.floor((elapsed % 1000) * 1e6);
        return [seconds, nanoseconds];
      }
      const seconds = Math.floor(now / 1000);
      const nanoseconds = Math.floor((now % 1000) * 1e6);
      return [seconds, nanoseconds];
    }

    // Basic fallback using Date
    const now = Date.now();
    if (start) {
      const elapsed = now - (start[0] * 1000 + start[1] / 1e6);
      const seconds = Math.floor(elapsed / 1000);
      const nanoseconds = Math.floor((elapsed % 1000) * 1e6);
      return [seconds, nanoseconds];
    }
    const seconds = Math.floor(now / 1000);
    const nanoseconds = 0;
    return [seconds, nanoseconds];
  }
}

/**
 * Convenience functions for common use cases
 */

/**
 * Safe process.env access with default value
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  return ProcessDetection.getEnvVar(key, defaultValue);
}

/**
 * Check if process global is available
 */
export function hasProcess(): boolean {
  return ProcessDetection.hasProcess();
}

/**
 * Get memory usage safely
 */
export function getMemoryUsage(): NodeJS.MemoryUsage | null {
  return ProcessDetection.getMemoryUsage();
}

/**
 * Check if running in Node.js environment
 */
export function isNodeEnvironment(): boolean {
  return ProcessDetection.isNode();
}

/**
 * Check if running in browser environment
 */
export function isBrowserEnvironment(): boolean {
  return ProcessDetection.isBrowser();
}

/**
 * Check if running in Electron environment
 */
export function isElectronEnvironment(): boolean {
  return ProcessDetection.isElectron();
}

/**
 * Check if running in Tauri environment
 */
export function isTauriEnvironment(): boolean {
  return ProcessDetection.isTauri();
}
