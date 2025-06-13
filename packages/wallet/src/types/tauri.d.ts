/**
 * @fileoverview TypeScript definitions for Tauri runtime globals
 * 
 * Provides type definitions for the Tauri global object and IPC invoke system.
 */

declare global {
  interface Window {
    __TAURI__?: {
      version?: string;
      __version?: string;
      invoke: <T = any>(cmd: string, args?: Record<string, any>) => Promise<T>;
      transformCallback: (callback: (payload: any) => void, once?: boolean) => number;
      // Core APIs
      app?: {
        getName(): Promise<string>;
        getVersion(): Promise<string>;
        getTauriVersion(): Promise<string>;
      };
      // File System APIs
      fs?: {
        readTextFile(path: string): Promise<string>;
        writeTextFile(path: string, contents: string): Promise<void>;
        exists(path: string): Promise<boolean>;
        createDir(path: string, options?: { recursive?: boolean }): Promise<void>;
        removeFile(path: string): Promise<void>;
      };
      // Path APIs
      path?: {
        configDir(): Promise<string>;
        dataDir(): Promise<string>;
        localDataDir(): Promise<string>;
        appDir(): Promise<string>;
        appDataDir(): Promise<string>;
        appLogDir(): Promise<string>;
        appConfigDir(): Promise<string>;
        appCacheDir(): Promise<string>;
      };
      // OS APIs
      os?: {
        platform(): Promise<string>;
        version(): Promise<string>;
        type(): Promise<string>;
        arch(): Promise<string>;
      };
      // Event APIs  
      event?: {
        listen<T>(
          event: string,
          handler: (event: { payload: T }) => void
        ): Promise<() => void>;
        once<T>(
          event: string,
          handler: (event: { payload: T }) => void
        ): Promise<() => void>;
        emit(event: string, payload?: any): Promise<void>;
      };
    };
  }
}

/**
 * Tauri storage command types
 */
export interface TauriStorageCommand {
  operation: 'store' | 'retrieve' | 'remove' | 'exists' | 'list' | 'clear' | 'get_info' | 'test';
  key?: string;
  value?: number[]; // Tauri serializes Buffer as number array
  options?: Record<string, any>;
}

/**
 * Tauri storage response types
 */
export interface TauriStorageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Tauri platform information
 */
export interface TauriPlatformInfo {
  platform: string;
  version: string;
  arch: string;
  app_name: string;
  app_version: string;
  tauri_version: string;
}

export {};
