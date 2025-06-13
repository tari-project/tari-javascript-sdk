/**
 * @fileoverview Electron type fallbacks for environments where Electron is not available
 * 
 * Provides conditional imports and type fallbacks for missing Electron exports,
 * allowing the codebase to compile in non-Electron environments.
 */

/**
 * Conditional Electron imports with fallbacks
 */
let contextBridge: any;
let ipcRenderer: any;
let ipcMain: any;
let webContents: any;

try {
  const electron = require('electron');
  contextBridge = electron.contextBridge;
  ipcRenderer = electron.ipcRenderer;
  ipcMain = electron.ipcMain;
  webContents = electron.webContents;
} catch (error) {
  // Electron not available - provide fallback types
}

/**
 * Fallback type definitions for Electron when not available
 */
export interface IpcRendererEventFallback {
  sender: {
    send(channel: string, ...args: any[]): void;
  };
}

export interface IpcRendererFallback {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, listener: (event: IpcRendererEventFallback, ...args: any[]) => void): void;
  removeAllListeners(channel: string): void;
}

export interface ContextBridgeFallback {
  exposeInMainWorld(apiKey: string, api: any): void;
}

export interface ProcessFallback {
  contextIsolated?: boolean;
  versions?: {
    electron?: string;
    node?: string;
  };
}

/**
 * Type-safe Electron exports with fallbacks
 */
export const ElectronSafe = {
  contextBridge: contextBridge as ContextBridgeFallback | undefined,
  ipcRenderer: ipcRenderer as IpcRendererFallback | undefined,
  ipcMain: ipcMain as any | undefined,
  webContents: webContents as any | undefined,
  
  // Type guards
  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof require !== 'undefined';
  },
  
  hasContextBridge(): boolean {
    return this.contextBridge !== undefined;
  },
  
  hasIpcRenderer(): boolean {
    return this.ipcRenderer !== undefined;
  },
  
  // Safe accessors
  getContextBridge(): ContextBridgeFallback {
    if (!this.contextBridge) {
      throw new Error('contextBridge not available');
    }
    return this.contextBridge;
  },
  
  getIpcRenderer(): IpcRendererFallback {
    if (!this.ipcRenderer) {
      throw new Error('ipcRenderer not available');
    }
    return this.ipcRenderer;
  },
};

/**
 * Process with fallback properties
 */
export const ProcessSafe = {
  get contextIsolated(): boolean {
    if (typeof process !== 'undefined' && 'contextIsolated' in process) {
      return (process as any).contextIsolated === true;
    }
    return false;
  },
  
  get isElectron(): boolean {
    return typeof process !== 'undefined' && 
           process.versions !== undefined && 
           'electron' in process.versions;
  },
  
  get isNode(): boolean {
    return typeof process !== 'undefined' && 
           process.versions !== undefined && 
           'node' in process.versions;
  },
};

/**
 * Export types for compatibility
 */
export type IpcRendererEvent = IpcRendererEventFallback;
export type ContextBridge = ContextBridgeFallback;
export type SafeIpcRenderer = IpcRendererFallback;

/**
 * Default exports for fallback usage
 */
export default ElectronSafe;
