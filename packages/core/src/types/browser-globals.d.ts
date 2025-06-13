/**
 * @fileoverview Browser global type definitions for cross-platform compatibility
 * 
 * Provides type definitions for browser-specific globals that may not be 
 * available in Node.js environments. Used by platform detection utilities
 * and cross-platform compatibility layers.
 */

/**
 * Browser global objects type definitions
 */
export interface BrowserGlobals {
  /** Window object from DOM API */
  window?: Window & typeof globalThis;
  /** Navigator object from DOM API */
  navigator?: Navigator;
  /** Document object from DOM API */
  document?: Document;
  /** Performance API */
  performance?: Performance;
  /** Worker constructor for web workers */
  Worker?: typeof Worker;
  /** XMLHttpRequest constructor */
  XMLHttpRequest?: typeof XMLHttpRequest;
  /** EventListener type for DOM events */
  EventListener?: EventListener;
  /** AddEventListenerOptions for DOM event configuration */
  AddEventListenerOptions?: AddEventListenerOptions;
  /** Transferable type for worker message passing */
  Transferable?: Transferable;
}

/**
 * Extended Performance interface with Chrome-specific memory API
 */
export interface PerformanceWithMemory extends Performance {
  memory?: {
    /** Used heap size in bytes */
    usedJSHeapSize: number;
    /** Total heap size in bytes */
    totalJSHeapSize: number;
    /** Heap size limit in bytes */
    jsHeapSizeLimit: number;
  };
}

/**
 * Window interface with Tauri-specific extensions
 */
export interface WindowWithTauri extends Window {
  __TAURI__?: {
    invoke: (cmd: string, args?: any) => Promise<any>;
    convertFileSrc: (filePath: string, protocol?: string) => string;
    path: any;
    fs: any;
    shell: any;
    app: any;
    os: any;
    cli: any;
    dialog: any;
    event: any;
    globalShortcut: any;
    http: any;
    notification: any;
    process: any;
    updater: any;
    window: any;
  };
  __TAURI_INVOKE__?: (cmd: string, args?: any) => Promise<any>;
}

/**
 * Navigator interface with Chrome-specific extensions
 */
export interface NavigatorWithExtensions {
  /** Standard navigator properties */
  userAgent?: string;
  platform?: string;
  /** Chrome/Chromium-specific user agent data */
  userAgentData?: {
    brands: Array<{ brand: string; version: string }>;
    mobile: boolean;
    platform: string;
  };
  /** Memory information (Chrome extension) */
  deviceMemory?: number;
  /** Hardware concurrency information */
  hardwareConcurrency?: number;
  /** Connection information */
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
}

/**
 * Process interface with Node.js-specific extensions
 */
export interface ProcessWithExtensions {
  /** Platform information */
  platform?: string;
  /** Process versions */
  versions?: {
    node?: string;
    electron?: string;
    [key: string]: string | undefined;
  };
  /** Internal Node.js method for active handles */
  _getActiveHandles?: () => any[];
  /** Internal Node.js method for active requests */
  _getActiveRequests?: () => any[];
}

/**
 * Global object type that may contain browser or Node.js globals
 */
export interface GlobalWithExtensions {
  window?: WindowWithTauri;
  navigator?: NavigatorWithExtensions;
  document?: any;
  performance?: PerformanceWithMemory;
  Worker?: any;
  XMLHttpRequest?: any;
  EventListener?: any;
  AddEventListenerOptions?: any;
  Transferable?: any;
  process?: ProcessWithExtensions;
}

/**
 * Type guard for checking if we're in a browser environment
 */
export type BrowserEnvironmentCheck = {
  isBrowser: boolean;
  isNode: boolean;
  hasWindow: boolean;
  hasNavigator: boolean;
  hasDocument: boolean;
  hasPerformance: boolean;
  hasWorker: boolean;
  hasTauri: boolean;
  hasElectron: boolean;
};

// Remove global declarations to avoid conflicts
