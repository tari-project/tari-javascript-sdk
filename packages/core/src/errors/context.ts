/**
 * @fileoverview Error context system for enhanced debugging and telemetry
 * 
 * Provides thread-local error context collection that automatically enriches
 * errors with contextual information for better debugging and monitoring.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { ErrorContext } from './wallet-error.js';

/**
 * Context storage for tracking error context across async operations
 */
const errorContextStorage = new AsyncLocalStorage<Map<string, unknown>>();

/**
 * Contextual information for error enrichment
 */
export interface ContextualInfo {
  /** Current operation being performed */
  operation?: string;
  /** Network type (mainnet, testnet, nextnet) */
  network?: string;
  /** Wallet identifier (non-sensitive) */
  walletId?: string;
  /** Transaction ID if applicable */
  transactionId?: string;
  /** Component or module where operation is occurring */
  component?: string;
  /** Request/correlation ID for tracing */
  requestId?: string;
  /** User session ID (non-sensitive) */
  sessionId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error context manager for collecting and enriching error context
 */
export class ErrorContextManager {
  private static instance: ErrorContextManager;
  private globalContext: Map<string, unknown> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance of ErrorContextManager
   */
  static getInstance(): ErrorContextManager {
    if (!ErrorContextManager.instance) {
      ErrorContextManager.instance = new ErrorContextManager();
    }
    return ErrorContextManager.instance;
  }

  /**
   * Set global context that will be included in all errors
   */
  setGlobalContext(key: string, value: unknown): void {
    this.globalContext.set(key, value);
  }

  /**
   * Remove global context
   */
  removeGlobalContext(key: string): void {
    this.globalContext.delete(key);
  }

  /**
   * Get current global context
   */
  getGlobalContext(): Record<string, unknown> {
    return Object.fromEntries(this.globalContext);
  }

  /**
   * Clear all global context
   */
  clearGlobalContext(): void {
    this.globalContext.clear();
  }

  /**
   * Get current async local context
   */
  getCurrentContext(): Map<string, unknown> {
    return errorContextStorage.getStore() || new Map();
  }

  /**
   * Add context to current async local storage
   */
  addContext(key: string, value: unknown): void {
    const context = this.getCurrentContext();
    context.set(key, value);
  }

  /**
   * Add multiple context values
   */
  addContextValues(values: Record<string, unknown>): void {
    const context = this.getCurrentContext();
    for (const [key, value] of Object.entries(values)) {
      context.set(key, value);
    }
  }

  /**
   * Remove context from current storage
   */
  removeContext(key: string): void {
    const context = this.getCurrentContext();
    context.delete(key);
  }

  /**
   * Get combined context (global + local)
   */
  getCombinedContext(): Record<string, unknown> {
    const globalContext = this.getGlobalContext();
    const localContext = Object.fromEntries(this.getCurrentContext());
    return { ...globalContext, ...localContext };
  }

  /**
   * Create error context from current state
   */
  createErrorContext(): ErrorContext {
    const combinedContext = this.getCombinedContext();
    
    const errorContext: ErrorContext = {
      timestamp: new Date(),
    };

    // Extract standard fields
    if (combinedContext.operation) {
      errorContext.operation = String(combinedContext.operation);
    }
    if (combinedContext.network) {
      errorContext.network = String(combinedContext.network);
    }
    if (combinedContext.walletId) {
      errorContext.walletId = String(combinedContext.walletId);
    }
    if (combinedContext.transactionId) {
      errorContext.transactionId = String(combinedContext.transactionId);
    }
    if (combinedContext.component) {
      errorContext.component = String(combinedContext.component);
    }
    if (combinedContext.requestId) {
      errorContext.requestId = String(combinedContext.requestId);
    }

    // Collect remaining fields as metadata
    const metadata: Record<string, unknown> = {};
    const standardFields = new Set([
      'operation', 'network', 'walletId', 'transactionId', 
      'component', 'requestId', 'timestamp'
    ]);

    for (const [key, value] of Object.entries(combinedContext)) {
      if (!standardFields.has(key)) {
        metadata[key] = value;
      }
    }

    if (Object.keys(metadata).length > 0) {
      errorContext.metadata = metadata;
    }

    return errorContext;
  }

  /**
   * Run a function with error context
   */
  runWithContext<T>(
    context: Record<string, unknown>,
    fn: () => T
  ): T {
    const contextMap = new Map(Object.entries(context));
    return errorContextStorage.run(contextMap, fn);
  }

  /**
   * Run an async function with error context
   */
  async runWithContextAsync<T>(
    context: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const contextMap = new Map(Object.entries(context));
    return errorContextStorage.run(contextMap, fn);
  }

  /**
   * Enhance existing context with additional values
   */
  enhanceContext<T>(
    additionalContext: Record<string, unknown>,
    fn: () => T
  ): T {
    const currentContext = this.getCurrentContext();
    const enhancedContext = new Map([...currentContext, ...Object.entries(additionalContext)]);
    return errorContextStorage.run(enhancedContext, fn);
  }

  /**
   * Enhance existing context with additional values (async)
   */
  async enhanceContextAsync<T>(
    additionalContext: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const currentContext = this.getCurrentContext();
    const enhancedContext = new Map([...currentContext, ...Object.entries(additionalContext)]);
    return errorContextStorage.run(enhancedContext, fn);
  }
}

/**
 * Global instance of error context manager
 */
export const ErrorContext = ErrorContextManager.getInstance();

/**
 * Decorator for automatically adding operation context
 */
export function withErrorContext(operation: string, component?: string) {
  return function <T extends any[], R>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => R>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;

    descriptor.value = function (...args: T): R {
      const context: Record<string, unknown> = { operation };
      if (component) {
        context.component = component;
      }

      return ErrorContext.enhanceContext(context, () =>
        originalMethod.apply(this, args)
      );
    } as (...args: T) => R;

    return descriptor;
  };
}

/**
 * Decorator for automatically adding operation context (async)
 */
export function withAsyncErrorContext(operation: string, component?: string) {
  return function <T extends any[], R>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;

    descriptor.value = async function (...args: T): Promise<R> {
      const context: Record<string, unknown> = { operation };
      if (component) {
        context.component = component;
      }

      return ErrorContext.enhanceContextAsync(context, () =>
        originalMethod.apply(this, args)
      );
    } as (...args: T) => Promise<R>;

    return descriptor;
  };
}

/**
 * Utility function to add operation context
 */
export function addOperationContext(operation: string, component?: string): void {
  ErrorContext.addContext('operation', operation);
  if (component) {
    ErrorContext.addContext('component', component);
  }
}

/**
 * Utility function to add transaction context
 */
export function addTransactionContext(transactionId: string): void {
  ErrorContext.addContext('transactionId', transactionId);
}

/**
 * Utility function to add wallet context
 */
export function addWalletContext(walletId: string, network?: string): void {
  ErrorContext.addContext('walletId', walletId);
  if (network) {
    ErrorContext.addContext('network', network);
  }
}

/**
 * Utility function to add request context
 */
export function addRequestContext(requestId: string): void {
  ErrorContext.addContext('requestId', requestId);
}

/**
 * Utility function to add session context
 */
export function addSessionContext(sessionId: string): void {
  ErrorContext.addContext('sessionId', sessionId);
}

/**
 * Utility function to generate a correlation ID
 */
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Context enrichment configuration
 */
export interface ContextEnrichmentConfig {
  /** Whether to include timestamp in context */
  includeTimestamp: boolean;
  /** Whether to include request ID in context */
  includeRequestId: boolean;
  /** Whether to include session ID in context */
  includeSessionId: boolean;
  /** Maximum metadata size in bytes */
  maxMetadataSize: number;
  /** Fields to exclude from context */
  excludeFields: string[];
  /** Fields to include despite being in exclude list */
  includeFields: string[];
}

/**
 * Default context enrichment configuration
 */
export const DEFAULT_CONTEXT_CONFIG: ContextEnrichmentConfig = {
  includeTimestamp: true,
  includeRequestId: true,
  includeSessionId: false,
  maxMetadataSize: 4096, // 4KB limit
  excludeFields: [
    'password', 'secret', 'key', 'token', 'seed', 'mnemonic',
    'private', 'auth', 'credential', 'signature'
  ],
  includeFields: [],
};

/**
 * Context enricher for sanitizing and filtering context data
 */
export class ContextEnricher {
  constructor(private config: ContextEnrichmentConfig = DEFAULT_CONTEXT_CONFIG) {}

  /**
   * Enrich context with additional information
   */
  enrichContext(context: ErrorContext): ErrorContext {
    const enriched = { ...context };

    // Add timestamp if not present and enabled
    if (this.config.includeTimestamp && !enriched.timestamp) {
      enriched.timestamp = new Date();
    }

    // Add request ID if enabled and not present
    if (this.config.includeRequestId && !enriched.requestId) {
      enriched.requestId = generateCorrelationId();
    }

    // Sanitize metadata
    if (enriched.metadata) {
      enriched.metadata = this.sanitizeMetadata(enriched.metadata);
    }

    return enriched;
  }

  /**
   * Sanitize metadata by removing sensitive fields and enforcing size limits
   */
  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    let totalSize = 0;

    for (const [key, value] of Object.entries(metadata)) {
      // Check if field should be excluded
      if (this.shouldExcludeField(key)) {
        continue;
      }

      // Convert value to string for size calculation
      const stringValue = JSON.stringify(value);
      const fieldSize = key.length + stringValue.length;

      // Check size limit
      if (totalSize + fieldSize > this.config.maxMetadataSize) {
        break;
      }

      sanitized[key] = value;
      totalSize += fieldSize;
    }

    return sanitized;
  }

  /**
   * Check if a field should be excluded from context
   */
  private shouldExcludeField(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();

    // Check if explicitly included
    if (this.config.includeFields.some(field => 
      lowerFieldName.includes(field.toLowerCase())
    )) {
      return false;
    }

    // Check if should be excluded
    return this.config.excludeFields.some(excludePattern =>
      lowerFieldName.includes(excludePattern.toLowerCase())
    );
  }
}

/**
 * Global context enricher instance
 */
export const contextEnricher = new ContextEnricher();

/**
 * Helper function to create enriched error context
 */
export function createEnrichedErrorContext(
  baseContext?: Partial<ErrorContext>
): ErrorContext {
  const currentContext = ErrorContext.createErrorContext();
  const mergedContext = { ...currentContext, ...baseContext };
  return contextEnricher.enrichContext(mergedContext);
}
