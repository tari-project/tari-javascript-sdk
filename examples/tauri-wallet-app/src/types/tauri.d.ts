/**
 * TypeScript definitions for Tauri runtime globals
 */

interface TauriNotificationOptions {
  title: string;
  body: string;
  icon?: string;
}

interface TauriNotification {
  sendNotification(options: TauriNotificationOptions): Promise<void>;
}

interface TauriApp {
  show(): Promise<void>;
  hide(): Promise<void>;
  exit(exitCode?: number): Promise<void>;
}

interface TauriDialog {
  message(message: string, options?: { title?: string; type?: string }): Promise<void>;
  ask(message: string, options?: { title?: string; type?: string }): Promise<boolean>;
  confirm(message: string, options?: { title?: string; type?: string }): Promise<boolean>;
  open(options?: {
    multiple?: boolean;
    directory?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | string[] | null>;
  save(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }): Promise<string | null>;
}

interface TauriInvoke {
  <T = any>(cmd: string, args?: Record<string, any>): Promise<T>;
}

interface TauriWindow {
  close(): Promise<void>;
  hide(): Promise<void>;
  show(): Promise<void>;
  maximize(): Promise<void>;
  minimize(): Promise<void>;
  unmaximize(): Promise<void>;
  unminimize(): Promise<void>;
}

interface TauriGlobal {
  invoke: TauriInvoke;
  notification: TauriNotification;
  app: TauriApp;
  dialog: TauriDialog;
  window: TauriWindow;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export {};
