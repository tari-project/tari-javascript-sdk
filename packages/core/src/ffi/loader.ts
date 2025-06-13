/**
 * Native module loader with lazy loading and error handling
 */

import { BinaryResolver } from './binary-resolver';

// Native require function for loading native modules
declare function require(id: string): any;

interface NodeRequire {
  (id: string): any;
  cache?: Record<string, any>;
}

export interface LoaderOptions {
  enableLazyLoading?: boolean;
  validateOnLoad?: boolean;
  customResolver?: BinaryResolver;
}

/**
 * Singleton loader for Tari wallet FFI native module
 */
export class NativeModuleLoader {
  private static instance: NativeModuleLoader | null = null;
  private nativeModule: any = null;
  private loaded = false;
  private loading = false;
  private readonly options: Required<LoaderOptions>;
  private readonly resolver: BinaryResolver;

  private constructor(options: LoaderOptions = {}) {
    this.options = {
      enableLazyLoading: true,
      validateOnLoad: true,
      customResolver: new BinaryResolver(),
      ...options,
    };
    
    this.resolver = this.options.customResolver;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(options?: LoaderOptions): NativeModuleLoader {
    if (!this.instance) {
      this.instance = new NativeModuleLoader(options);
    }
    return this.instance;
  }

  /**
   * Load the native module (with lazy loading support)
   */
  public async loadModule(): Promise<any> {
    if (this.loaded) {
      return this.nativeModule;
    }

    if (this.loading) {
      // Wait for existing load operation
      return this.waitForLoad();
    }

    this.loading = true;

    try {
      const resolvedBinary = this.resolver.resolveBinary();
      
      if (this.options.validateOnLoad) {
        this.resolver.validateBinary(resolvedBinary);
      }

      // Load the native module
      this.nativeModule = require(resolvedBinary.path);
      
      // Verify the module has expected exports
      this.validateModuleExports();
      
      this.loaded = true;
      this.loading = false;
      
      return this.nativeModule;
    } catch (error) {
      this.loading = false;
      throw this.enrichLoadError(error);
    }
  }

  /**
   * Get module (loads if not already loaded and lazy loading is enabled)
   */
  public getModule(): any {
    if (!this.loaded) {
      if (this.options.enableLazyLoading) {
        // Trigger async load but return synchronously
        this.loadModule().catch(() => {
          // Errors will be thrown on next access
        });
        throw new Error('Native module not loaded yet - call loadModule() first');
      } else {
        throw new Error('Native module not loaded - call loadModule() first');
      }
    }
    
    return this.nativeModule;
  }

  /**
   * Check if module is loaded
   */
  public isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Reload the module (useful for development)
   */
  public async reloadModule(): Promise<any> {
    this.loaded = false;
    this.loading = false;
    this.nativeModule = null;
    
    // Clear require cache if available
    const resolvedBinary = this.resolver.resolveBinary();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeRequire = require as NodeRequire;
      if (nodeRequire.cache && nodeRequire.cache[resolvedBinary.path]) {
        delete nodeRequire.cache[resolvedBinary.path];
      }
    } catch {
      // Ignore cache clearing errors
    }
    
    return this.loadModule();
  }

  /**
   * Wait for ongoing load operation to complete
   */
  private async waitForLoad(): Promise<any> {
    const maxWait = 10000; // 10 seconds
    const interval = 100;
    let waited = 0;

    while (this.loading && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, interval));
      waited += interval;
    }

    if (this.loading) {
      throw new Error('Timeout waiting for native module to load');
    }

    if (!this.loaded) {
      throw new Error('Native module failed to load');
    }

    return this.nativeModule;
  }

  /**
   * Validate that the loaded module has expected exports
   */
  private validateModuleExports(): void {
    if (!this.nativeModule) {
      throw new Error('Native module is null after loading');
    }

    // Check for essential wallet functions (these will be implemented in Task 2)
    const requiredExports = ['walletCreate', 'walletDestroy'];
    const missingExports = requiredExports.filter(
      exportName => typeof this.nativeModule[exportName] !== 'function'
    );

    if (missingExports.length > 0) {
      throw new Error(
        `Native module missing required exports: ${missingExports.join(', ')}`
      );
    }
  }

  /**
   * Enrich load errors with helpful information
   */
  private enrichLoadError(error: unknown): Error {
    if (error instanceof Error) {
      const resolvedBinary = this.resolver.resolveBinary();
      const instructions = this.resolver.getInstallationInstructions();
      
      const enrichedMessage = [
        `Failed to load Tari wallet FFI native module: ${error.message}`,
        `Binary path: ${resolvedBinary.path}`,
        `Binary exists: ${resolvedBinary.exists}`,
        `Source: ${resolvedBinary.source}`,
        '',
        'Installation instructions:',
        instructions,
      ].join('\n');

      const enrichedError = new Error(enrichedMessage);
      enrichedError.stack = error.stack;
      enrichedError.cause = error;
      
      return enrichedError;
    }
    
    return new Error(`Unknown error loading native module: ${String(error)}`);
  }
}

/**
 * Convenience function to get native module
 */
export async function loadNativeModule(options?: LoaderOptions): Promise<any> {
  const loader = NativeModuleLoader.getInstance(options);
  return loader.loadModule();
}

/**
 * Convenience function to get loaded module (throws if not loaded)
 */
export function getNativeModule(): any {
  const loader = NativeModuleLoader.getInstance();
  return loader.getModule();
}
