/**
 * Trace logging utilities for FFI calls with timing and argument capture
 * Provides detailed operation tracing for debugging and performance analysis
 */

import { traceFFICall, endFFITrace, createDebugLogger } from './debug';
import type { FFICallTrace } from './debug';

/**
 * Trace configuration for method-specific tracing
 */
export interface TraceConfig {
  /** Enable/disable tracing for this method */
  enabled: boolean;
  /** Include arguments in trace */
  includeArgs: boolean;
  /** Include result in trace */
  includeResult: boolean;
  /** Maximum argument size to capture */
  maxArgSize: number;
  /** Trace slow calls only (threshold in ms) */
  slowCallThreshold?: number;
}

/**
 * Trace metadata for analysis
 */
export interface TraceMetadata {
  /** Method being traced */
  method: string;
  /** Trace configuration */
  config: TraceConfig;
  /** Start time */
  startTime: number;
  /** Context information */
  context?: Record<string, unknown>;
}

/**
 * Performance metrics for traced methods
 */
export interface MethodMetrics {
  /** Method name */
  method: string;
  /** Total call count */
  callCount: number;
  /** Success count */
  successCount: number;
  /** Error count */
  errorCount: number;
  /** Average duration (ms) */
  averageDuration: number;
  /** Minimum duration (ms) */
  minDuration: number;
  /** Maximum duration (ms) */
  maxDuration: number;
  /** 95th percentile duration (ms) */
  p95Duration: number;
  /** Last call timestamp */
  lastCall: Date;
}

/**
 * Trace session for grouping related operations
 */
export interface TraceSession {
  /** Session ID */
  id: string;
  /** Session name */
  name: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Duration (ms) */
  duration?: number;
  /** Traces in this session */
  traces: FFICallTrace[];
  /** Session metadata */
  metadata?: Record<string, unknown>;
}

/**
 * FFI Method tracer with performance monitoring and session management
 */
export class FFITracer {
  private static instance: FFITracer | null = null;
  
  private readonly methodConfigs = new Map<string, TraceConfig>();
  private readonly methodMetrics = new Map<string, MethodMetrics>();
  private readonly activeSessions = new Map<string, TraceSession>();
  private readonly logger = createDebugLogger('tari:ffi:trace');
  
  private defaultConfig: TraceConfig = {
    enabled: process.env.NODE_ENV === 'development',
    includeArgs: true,
    includeResult: true,
    maxArgSize: 512,
    slowCallThreshold: 1000, // 1 second
  };

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): FFITracer {
    if (!this.instance) {
      this.instance = new FFITracer();
    }
    return this.instance;
  }

  /**
   * Configure tracing for a specific method
   */
  configureMethod(method: string, config: Partial<TraceConfig>): void {
    this.methodConfigs.set(method, {
      ...this.defaultConfig,
      ...config,
    });
  }

  /**
   * Configure default tracing settings
   */
  configureDefaults(config: Partial<TraceConfig>): void {
    this.defaultConfig = {
      ...this.defaultConfig,
      ...config,
    };
  }

  /**
   * Start a trace session
   */
  startSession(name: string, metadata?: Record<string, unknown>): string {
    const id = this.generateSessionId();
    const session: TraceSession = {
      id,
      name,
      startTime: new Date(),
      traces: [],
      metadata,
    };

    this.activeSessions.set(id, session);
    this.logger.info(`Started trace session: ${name}`, { sessionId: id, metadata });

    return id;
  }

  /**
   * End a trace session
   */
  endSession(sessionId: string): TraceSession | undefined {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.endTime = new Date();
    session.duration = session.endTime.getTime() - session.startTime.getTime();

    this.activeSessions.delete(sessionId);
    this.logger.info(`Ended trace session: ${session.name}`, {
      sessionId,
      duration: session.duration,
      traceCount: session.traces.length,
    });

    return session;
  }

  /**
   * Trace an FFI method call
   */
  trace<T extends unknown[], R>(
    method: string,
    fn: (...args: T) => Promise<R> | R,
    sessionId?: string
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const config = this.getMethodConfig(method);
      
      if (!config.enabled) {
        return fn(...args);
      }

      const traceId = traceFFICall(
        method,
        config.includeArgs ? this.sanitizeArgs(args, config.maxArgSize) : [],
        this.generateTraceId()
      );

      const startTime = Date.now();
      let result: R;
      let error: Error | undefined;

      try {
        result = await fn(...args);
        return result;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        throw error;
      } finally {
        const duration = Date.now() - startTime;
        
        // End the trace
        endFFITrace(
          traceId,
          config.includeResult && !error ? this.sanitizeResult(result!, config.maxArgSize) : undefined,
          error
        );

        // Add to session if specified
        if (sessionId) {
          // Note: trace data is managed internally by debug system
        }

        // Update metrics
        this.updateMethodMetrics(method, duration, !error);

        // Log slow calls
        if (config.slowCallThreshold && duration > config.slowCallThreshold) {
          this.logger.warn(`Slow call detected: ${method}`, {
            method,
            duration,
            threshold: config.slowCallThreshold,
            traceId,
            sessionId,
          });
        }
      }
    };
  }

  /**
   * Trace a synchronous method call
   */
  traceSync<T extends unknown[], R>(
    method: string,
    fn: (...args: T) => R,
    sessionId?: string
  ): (...args: T) => R {
    return (...args: T): R => {
      const config = this.getMethodConfig(method);
      
      if (!config.enabled) {
        return fn(...args);
      }

      const traceId = traceFFICall(
        method,
        config.includeArgs ? this.sanitizeArgs(args, config.maxArgSize) : [],
        this.generateTraceId()
      );

      const startTime = Date.now();
      let result: R;
      let error: Error | undefined;

      try {
        result = fn(...args);
        return result;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        throw error;
      } finally {
        const duration = Date.now() - startTime;
        
        // End the trace
        endFFITrace(
          traceId,
          config.includeResult && !error ? this.sanitizeResult(result!, config.maxArgSize) : undefined,
          error
        );

        // Add to session if specified
        if (sessionId) {
          // Note: trace data is managed internally by debug system
        }

        // Update metrics
        this.updateMethodMetrics(method, duration, !error);

        // Log slow calls
        if (config.slowCallThreshold && duration > config.slowCallThreshold) {
          this.logger.warn(`Slow call detected: ${method}`, {
            method,
            duration,
            threshold: config.slowCallThreshold,
            traceId,
            sessionId,
          });
        }
      }
    };
  }

  /**
   * Get metrics for a specific method
   */
  getMethodMetrics(method: string): MethodMetrics | undefined {
    return this.methodMetrics.get(method);
  }

  /**
   * Get metrics for all methods
   */
  getAllMetrics(): MethodMetrics[] {
    return Array.from(this.methodMetrics.values());
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): TraceSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): TraceSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Clear all metrics and sessions
   */
  clear(): void {
    this.methodMetrics.clear();
    this.activeSessions.clear();
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): {
    summary: {
      totalMethods: number;
      totalCalls: number;
      totalErrors: number;
      averageDuration: number;
    };
    slowMethods: MethodMetrics[];
    errorProneMethods: MethodMetrics[];
    recentSessions: TraceSession[];
  } {
    const metrics = this.getAllMetrics();
    const totalCalls = metrics.reduce((sum, m) => sum + m.callCount, 0);
    const totalErrors = metrics.reduce((sum, m) => sum + m.errorCount, 0);
    const totalDuration = metrics.reduce((sum, m) => sum + (m.averageDuration * m.callCount), 0);

    const slowMethods = metrics
      .filter(m => m.averageDuration > 1000)
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 10);

    const errorProneMethods = metrics
      .filter(m => m.errorCount > 0)
      .sort((a, b) => (b.errorCount / b.callCount) - (a.errorCount / a.callCount))
      .slice(0, 10);

    const recentSessions = Array.from(this.activeSessions.values())
      .slice(-10);

    return {
      summary: {
        totalMethods: metrics.length,
        totalCalls,
        totalErrors,
        averageDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
      },
      slowMethods,
      errorProneMethods,
      recentSessions,
    };
  }

  /**
   * Get method configuration
   */
  private getMethodConfig(method: string): TraceConfig {
    return this.methodConfigs.get(method) || this.defaultConfig;
  }

  /**
   * Add trace to session
   */
  private addTraceToSession(sessionId: string, trace: FFICallTrace): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.traces.push(trace);
    }
  }

  /**
   * Update method metrics
   */
  private updateMethodMetrics(method: string, duration: number, success: boolean): void {
    let metrics = this.methodMetrics.get(method);
    
    if (!metrics) {
      metrics = {
        method,
        callCount: 0,
        successCount: 0,
        errorCount: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        p95Duration: 0,
        lastCall: new Date(),
      };
      this.methodMetrics.set(method, metrics);
    }

    // Update counts
    metrics.callCount++;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.errorCount++;
    }

    // Update duration metrics
    metrics.lastCall = new Date();
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    
    // Update average (running average)
    metrics.averageDuration = (metrics.averageDuration * (metrics.callCount - 1) + duration) / metrics.callCount;
    
    // P95 would require storing all durations - simplified for now
    metrics.p95Duration = Math.max(metrics.averageDuration * 1.5, duration);
  }

  /**
   * Sanitize arguments for tracing
   */
  private sanitizeArgs(args: unknown[], maxSize: number): unknown[] {
    return args.map(arg => this.sanitizeValue(arg, maxSize));
  }

  /**
   * Sanitize result for tracing
   */
  private sanitizeResult(result: unknown, maxSize: number): unknown {
    return this.sanitizeValue(result, maxSize);
  }

  /**
   * Sanitize a value for logging
   */
  private sanitizeValue(value: unknown, maxSize: number): unknown {
    if (typeof value === 'string' && value.length > maxSize) {
      return value.substring(0, maxSize) + '...[TRUNCATED]';
    }

    if (typeof value === 'object' && value !== null) {
      const serialized = JSON.stringify(value);
      if (serialized.length > maxSize) {
        return JSON.stringify(value, null, 0).substring(0, maxSize) + '...[TRUNCATED]';
      }
    }

    return value;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Decorator for automatic FFI method tracing
 */
export function traced(method?: string, config?: Partial<TraceConfig>) {
  return function <T extends unknown[], R>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R> | R>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      return;
    }

    const methodName = method || `${target.constructor.name}.${propertyName}`;
    const tracer = FFITracer.getInstance();
    
    if (config) {
      tracer.configureMethod(methodName, config);
    }

    descriptor.value = tracer.trace(methodName, originalMethod.bind(target));
  };
}

/**
 * Convenience functions for tracing
 */

/**
 * Get global tracer instance
 */
export function getTracer(): FFITracer {
  return FFITracer.getInstance();
}

/**
 * Trace an FFI method call
 */
export function traceMethod<T extends unknown[], R>(
  method: string,
  fn: (...args: T) => Promise<R> | R,
  sessionId?: string
): (...args: T) => Promise<R> {
  return getTracer().trace(method, fn, sessionId);
}

/**
 * Start a trace session
 */
export function startTraceSession(name: string, metadata?: Record<string, unknown>): string {
  return getTracer().startSession(name, metadata);
}

/**
 * End a trace session
 */
export function endTraceSession(sessionId: string): TraceSession | undefined {
  return getTracer().endSession(sessionId);
}

/**
 * Configure method tracing
 */
export function configureMethodTrace(method: string, config: Partial<TraceConfig>): void {
  getTracer().configureMethod(method, config);
}

/**
 * Get method performance metrics
 */
export function getMethodMetrics(method: string): MethodMetrics | undefined {
  return getTracer().getMethodMetrics(method);
}

/**
 * Generate performance report
 */
export function generatePerformanceReport() {
  return getTracer().generatePerformanceReport();
}
