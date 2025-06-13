/**
 * Debug utilities for FFI development and production troubleshooting
 * Provides comprehensive debugging visibility with environment-controlled logging
 */

import { TariError, ErrorCode } from '../errors/index';
import { getResourceTracker } from './tracker';
import { getCallManager } from './call-manager';
import { getMemoryMonitor } from './memory';
import { getPlatformManager } from './platform-utils';

/**
 * Debug namespace configuration
 */
export interface DebugConfig {
  /** Enable/disable debug logging */
  enabled: boolean;
  /** Namespace filter (e.g., 'tari:ffi:*') */
  namespace: string;
  /** Log level threshold */
  level: DebugLevel;
  /** Output destination */
  output: DebugOutput;
  /** Include stack traces in logs */
  includeStack: boolean;
  /** Maximum argument size to log (bytes) */
  maxArgSize: number;
  /** Sanitize sensitive data */
  sanitizeData: boolean;
}

/**
 * Debug logging levels
 */
export enum DebugLevel {
  Error = 0,
  Warn = 1,
  Info = 2,
  Debug = 3,
  Trace = 4,
}

/**
 * Debug output destinations
 */
export enum DebugOutput {
  Console = 'console',
  File = 'file',
  Memory = 'memory',
  Custom = 'custom',
}

/**
 * Debug log entry
 */
export interface DebugLogEntry {
  /** Timestamp */
  timestamp: Date;
  /** Log level */
  level: DebugLevel;
  /** Namespace */
  namespace: string;
  /** Log message */
  message: string;
  /** Additional data */
  data?: unknown;
  /** Stack trace (if enabled) */
  stack?: string;
  /** Request/operation ID */
  requestId?: string;
  /** Duration (for timed operations) */
  duration?: number;
}

/**
 * FFI call trace information
 */
export interface FFICallTrace {
  /** Call identifier */
  id: string;
  /** Method name */
  method: string;
  /** Arguments (sanitized) */
  args: unknown[];
  /** Start timestamp */
  startTime: Date;
  /** End timestamp */
  endTime?: Date;
  /** Duration in milliseconds */
  duration?: number;
  /** Result (sanitized) */
  result?: unknown;
  /** Error (if any) */
  error?: Error;
  /** Retry attempt number */
  attempt?: number;
  /** Stack trace at call site */
  callStack?: string;
}

/**
 * Debug namespace manager with environment variable support
 */
class DebugNamespace {
  private readonly pattern: RegExp | null;
  
  constructor(private readonly namespace: string) {
    this.pattern = this.createPattern(namespace);
  }

  /**
   * Check if a namespace matches this pattern
   */
  matches(namespace: string): boolean {
    if (!this.pattern) {
      return false;
    }
    return this.pattern.test(namespace);
  }

  /**
   * Create regex pattern from namespace string
   */
  private createPattern(namespace: string): RegExp | null {
    if (!namespace) {
      return null;
    }

    // Convert glob pattern to regex
    const pattern = namespace
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/:/g, ':');

    try {
      return new RegExp(`^${pattern}$`);
    } catch {
      return null;
    }
  }
}

/**
 * FFI Debug utilities with trace logging and diagnostics
 */
export class FFIDebug {
  private static instance: FFIDebug | null = null;
  
  private readonly config: DebugConfig;
  private readonly namespaces: DebugNamespace[] = [];
  private readonly logs: DebugLogEntry[] = [];
  private readonly traces: Map<string, FFICallTrace> = new Map();
  private readonly customOutput?: (entry: DebugLogEntry) => void;

  private constructor(config?: Partial<DebugConfig>) {
    this.config = {
      enabled: this.parseDebugEnv(),
      namespace: process.env.DEBUG || '',
      level: this.parseLogLevel(),
      output: DebugOutput.Console,
      includeStack: process.env.NODE_ENV === 'development',
      maxArgSize: 1024,
      sanitizeData: true,
      ...config,
    };

    this.initializeNamespaces();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<DebugConfig>): FFIDebug {
    if (!this.instance) {
      this.instance = new FFIDebug(config);
    }
    return this.instance;
  }

  /**
   * Create a debug logger for a specific namespace
   */
  createLogger(namespace: string): DebugLogger {
    return new DebugLogger(this, namespace);
  }

  /**
   * Log a debug message
   */
  log(
    level: DebugLevel,
    namespace: string,
    message: string,
    data?: unknown,
    requestId?: string
  ): void {
    if (!this.shouldLog(level, namespace)) {
      return;
    }

    const entry: DebugLogEntry = {
      timestamp: new Date(),
      level,
      namespace,
      message,
      data: this.config.sanitizeData ? this.sanitizeData(data) : data,
      stack: this.config.includeStack ? this.captureStack() : undefined,
      requestId,
    };

    this.outputLog(entry);
    this.storeLog(entry);
  }

  /**
   * Start tracing an FFI call
   */
  traceStart(
    method: string,
    args: unknown[],
    requestId?: string
  ): string {
    const id = requestId || this.generateTraceId();
    
    const trace: FFICallTrace = {
      id,
      method,
      args: this.config.sanitizeData ? this.sanitizeArgs(args) : args,
      startTime: new Date(),
      callStack: this.config.includeStack ? this.captureStack() : undefined,
    };

    this.traces.set(id, trace);
    
    this.log(
      DebugLevel.Trace,
      'tari:ffi:call:start',
      `Starting ${method}`,
      { id, method, args: trace.args },
      id
    );

    return id;
  }

  /**
   * End tracing an FFI call
   */
  traceEnd(
    id: string,
    result?: unknown,
    error?: Error,
    attempt?: number
  ): FFICallTrace | undefined {
    const trace = this.traces.get(id);
    if (!trace) {
      return undefined;
    }

    trace.endTime = new Date();
    trace.duration = trace.endTime.getTime() - trace.startTime.getTime();
    trace.result = this.config.sanitizeData ? this.sanitizeData(result) : result;
    trace.error = error;
    trace.attempt = attempt;

    const level = error ? DebugLevel.Error : DebugLevel.Trace;
    const message = error 
      ? `${trace.method} failed: ${error.message}`
      : `${trace.method} completed in ${trace.duration}ms`;

    this.log(
      level,
      'tari:ffi:call:end',
      message,
      {
        id,
        method: trace.method,
        duration: trace.duration,
        success: !error,
        attempt,
        result: error ? undefined : trace.result,
        error: error?.message,
      },
      id
    );

    return trace;
  }

  /**
   * Get all traces for analysis
   */
  getTraces(): FFICallTrace[] {
    return Array.from(this.traces.values());
  }

  /**
   * Get traces for a specific method
   */
  getMethodTraces(method: string): FFICallTrace[] {
    return this.getTraces().filter(trace => trace.method === method);
  }

  /**
   * Get recent logs
   */
  getLogs(count = 100): DebugLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Clear logs and traces
   */
  clear(): void {
    this.logs.length = 0;
    this.traces.clear();
  }

  /**
   * Generate comprehensive debug report
   */
  generateDebugReport(): {
    config: DebugConfig;
    stats: {
      totalLogs: number;
      totalTraces: number;
      errorCount: number;
      averageCallDuration: number;
    };
    recentErrors: DebugLogEntry[];
    slowCalls: FFICallTrace[];
    systemInfo: {
      platform: string;
      memory: any;
      resources: any;
      calls: any;
    };
  } {
    const traces = this.getTraces();
    const errorLogs = this.logs.filter(log => log.level === DebugLevel.Error);
    const completedTraces = traces.filter(trace => trace.duration !== undefined);
    const averageDuration = completedTraces.length > 0
      ? completedTraces.reduce((sum, trace) => sum + (trace.duration || 0), 0) / completedTraces.length
      : 0;

    const slowCalls = traces
      .filter(trace => (trace.duration || 0) > 1000)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    return {
      config: this.config,
      stats: {
        totalLogs: this.logs.length,
        totalTraces: traces.length,
        errorCount: errorLogs.length,
        averageCallDuration: averageDuration,
      },
      recentErrors: errorLogs.slice(-10),
      slowCalls,
      systemInfo: {
        platform: getPlatformManager().getConfig().platform,
        memory: getMemoryMonitor().getStats(),
        resources: getResourceTracker().getStats(),
        calls: getCallManager().getStats(),
      },
    };
  }

  /**
   * Check if logging is enabled for level and namespace
   */
  private shouldLog(level: DebugLevel, namespace: string): boolean {
    if (!this.config.enabled || level > this.config.level) {
      return false;
    }

    if (this.namespaces.length === 0) {
      return true;
    }

    return this.namespaces.some(ns => ns.matches(namespace));
  }

  /**
   * Output log entry based on configuration
   */
  private outputLog(entry: DebugLogEntry): void {
    switch (this.config.output) {
      case DebugOutput.Console:
        this.outputToConsole(entry);
        break;
      case DebugOutput.Custom:
        if (this.customOutput) {
          this.customOutput(entry);
        }
        break;
      // File and Memory outputs would be implemented here
    }
  }

  /**
   * Output to console with formatting
   */
  private outputToConsole(entry: DebugLogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = DebugLevel[entry.level].toUpperCase();
    const prefix = `[${timestamp}] ${level} ${entry.namespace}:`;
    
    const message = entry.requestId 
      ? `${prefix} [${entry.requestId}] ${entry.message}`
      : `${prefix} ${entry.message}`;

    switch (entry.level) {
      case DebugLevel.Error:
        console.error(message, entry.data);
        break;
      case DebugLevel.Warn:
        console.warn(message, entry.data);
        break;
      case DebugLevel.Info:
        console.info(message, entry.data);
        break;
      default:
        console.debug(message, entry.data);
        break;
    }

    if (entry.stack && entry.level <= DebugLevel.Warn) {
      console.debug('Stack trace:', entry.stack);
    }
  }

  /**
   * Store log entry in memory
   */
  private storeLog(entry: DebugLogEntry): void {
    this.logs.push(entry);
    
    // Keep only recent logs to prevent memory issues
    if (this.logs.length > 1000) {
      this.logs.splice(0, this.logs.length - 1000);
    }
  }

  /**
   * Parse DEBUG environment variable
   */
  private parseDebugEnv(): boolean {
    const debug = process.env.DEBUG;
    return !!(debug && (debug.includes('tari') || debug.includes('*')));
  }

  /**
   * Parse log level from environment
   */
  private parseLogLevel(): DebugLevel {
    const level = process.env.DEBUG_LEVEL?.toLowerCase();
    switch (level) {
      case 'error': return DebugLevel.Error;
      case 'warn': return DebugLevel.Warn;
      case 'info': return DebugLevel.Info;
      case 'debug': return DebugLevel.Debug;
      case 'trace': return DebugLevel.Trace;
      default: return DebugLevel.Info;
    }
  }

  /**
   * Initialize debug namespaces from configuration
   */
  private initializeNamespaces(): void {
    if (!this.config.namespace) {
      return;
    }

    const namespaces = this.config.namespace.split(',');
    for (const namespace of namespaces) {
      this.namespaces.push(new DebugNamespace(namespace.trim()));
    }
  }

  /**
   * Sanitize data for logging
   */
  private sanitizeData(data: unknown): unknown {
    if (!data) {
      return data;
    }

    const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
      // Sanitize sensitive fields
      if (typeof key === 'string' && (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('passphrase') ||
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token')
      )) {
        return '[REDACTED]';
      }

      // Truncate large values
      if (typeof value === 'string' && value.length > this.config.maxArgSize) {
        return value.substring(0, this.config.maxArgSize) + '...[TRUNCATED]';
      }

      return value;
    }));

    return sanitized;
  }

  /**
   * Sanitize arguments for tracing
   */
  private sanitizeArgs(args: unknown[]): unknown[] {
    return args.map(arg => this.sanitizeData(arg));
  }

  /**
   * Capture stack trace
   */
  private captureStack(): string {
    const stack = new Error().stack;
    return stack ? stack.split('\n').slice(3, 10).join('\n') : 'Stack trace unavailable';
  }

  /**
   * Generate unique trace ID
   */
  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Debug logger for specific namespaces
 */
export class DebugLogger {
  constructor(
    private readonly debugInstance: FFIDebug,
    private readonly namespace: string
  ) {}

  error(message: string, data?: unknown, requestId?: string): void {
    this.debugInstance.log(DebugLevel.Error, this.namespace, message, data, requestId);
  }

  warn(message: string, data?: unknown, requestId?: string): void {
    this.debugInstance.log(DebugLevel.Warn, this.namespace, message, data, requestId);
  }

  info(message: string, data?: unknown, requestId?: string): void {
    this.debugInstance.log(DebugLevel.Info, this.namespace, message, data, requestId);
  }

  debug(message: string, data?: unknown, requestId?: string): void {
    this.debugInstance.log(DebugLevel.Debug, this.namespace, message, data, requestId);
  }

  trace(message: string, data?: unknown, requestId?: string): void {
    this.debugInstance.log(DebugLevel.Trace, this.namespace, message, data, requestId);
  }

  /**
   * Create a child logger with extended namespace
   */
  child(suffix: string): DebugLogger {
    return new DebugLogger(this.debugInstance, `${this.namespace}:${suffix}`);
  }
}

/**
 * Convenience functions for debug logging
 */

/**
 * Get global debug instance
 */
export function getDebug(): FFIDebug {
  return FFIDebug.getInstance();
}

/**
 * Create debug logger for namespace
 */
export function createDebugLogger(namespace: string): DebugLogger {
  return getDebug().createLogger(namespace);
}

/**
 * Start FFI call tracing
 */
export function traceFFICall(method: string, args: unknown[], requestId?: string): string {
  return getDebug().traceStart(method, args, requestId);
}

/**
 * End FFI call tracing
 */
export function endFFITrace(id: string, result?: unknown, error?: Error, attempt?: number): void {
  getDebug().traceEnd(id, result, error, attempt);
}

/**
 * Log debug information
 */
export function debugLog(
  level: DebugLevel,
  namespace: string,
  message: string,
  data?: unknown
): void {
  getDebug().log(level, namespace, message, data);
}

/**
 * Generate debug report
 */
export function generateDebugReport() {
  return getDebug().generateDebugReport();
}

/**
 * Clear debug logs and traces
 */
export function clearDebugData(): void {
  getDebug().clear();
}

// Pre-configured loggers for common namespaces
export const ffiLogger = createDebugLogger('tari:ffi');
export const resourceLogger = createDebugLogger('tari:ffi:resource');
export const callLogger = createDebugLogger('tari:ffi:call');
export const memoryLogger = createDebugLogger('tari:ffi:memory');
export const platformLogger = createDebugLogger('tari:ffi:platform');
