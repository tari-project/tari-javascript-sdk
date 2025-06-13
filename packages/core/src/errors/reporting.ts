/**
 * @fileoverview Error reporting and telemetry system
 * 
 * Provides privacy-first error reporting and telemetry collection for
 * monitoring wallet health and debugging production issues.
 */

import { WalletError, ErrorSeverity } from './wallet-error';
import { WalletErrorCode, ErrorCategory } from './codes';

/**
 * Error report structure for telemetry
 */
export interface ErrorReport {
  /** Unique identifier for this error report */
  id: string;
  /** Error code */
  code: WalletErrorCode;
  /** Error category */
  category: ErrorCategory;
  /** Error severity */
  severity: ErrorSeverity;
  /** Non-sensitive error message */
  message: string;
  /** Timestamp when error occurred */
  timestamp: Date;
  /** Number of times this error has occurred */
  count: number;
  /** First time this error was seen */
  firstSeen: Date;
  /** Last time this error was seen */
  lastSeen: Date;
  /** Whether error was recovered from */
  recovered?: boolean;
  /** Recovery action taken if any */
  recoveryAction?: string;
  /** SDK version */
  sdkVersion?: string;
  /** Platform information */
  platform?: PlatformInfo;
  /** Sanitized context */
  context?: Record<string, unknown>;
}

/**
 * Platform information for error reports
 */
export interface PlatformInfo {
  /** Operating system */
  os: string;
  /** OS version */
  osVersion?: string;
  /** Architecture */
  arch: string;
  /** Node.js version */
  nodeVersion: string;
  /** Network type */
  network?: string;
}

/**
 * Error aggregation statistics
 */
export interface ErrorStats {
  /** Total number of errors */
  totalErrors: number;
  /** Errors by category */
  byCategory: Record<ErrorCategory, number>;
  /** Errors by severity */
  bySeverity: Record<ErrorSeverity, number>;
  /** Most common errors */
  topErrors: Array<{
    code: WalletErrorCode;
    count: number;
    percentage: number;
  }>;
  /** Time period for these stats */
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** Maximum number of error reports to store locally */
  maxReports: number;
  /** How long to retain reports locally (ms) */
  retentionPeriod: number;
  /** Sampling rate (0-1) for error reporting */
  samplingRate: number;
  /** Whether to include stack traces */
  includeStackTraces: boolean;
  /** Whether to include context metadata */
  includeContext: boolean;
  /** Endpoint URL for sending reports (if any) */
  endpoint?: string;
  /** API key for telemetry service */
  apiKey?: string;
  /** Custom fields to include in reports */
  customFields?: Record<string, unknown>;
}

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: false, // Opt-in only
  maxReports: 1000,
  retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
  samplingRate: 0.1, // 10% sampling
  includeStackTraces: false, // Privacy by default
  includeContext: true,
};

/**
 * Error reporter interface
 */
export interface ErrorReporter {
  /** Report an error */
  report(error: WalletError): Promise<void>;
  /** Get error statistics */
  getStats(period?: { start: Date; end: Date }): Promise<ErrorStats>;
  /** Get all reports */
  getReports(): Promise<ErrorReport[]>;
  /** Clear old reports */
  cleanup(): Promise<number>;
  /** Export reports for analysis */
  export(): Promise<string>;
}

/**
 * Local error reporter that stores reports in memory
 */
export class LocalErrorReporter implements ErrorReporter {
  private reports: Map<string, ErrorReport> = new Map();
  protected config: TelemetryConfig;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };
  }

  /**
   * Report an error
   */
  async report(error: WalletError): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Apply sampling
    if (Math.random() > this.config.samplingRate) {
      return;
    }

    const reportId = this.generateReportId(error);
    const existingReport = this.reports.get(reportId);
    
    if (existingReport) {
      // Update existing report
      existingReport.count++;
      existingReport.lastSeen = new Date();
      existingReport.context = this.mergeContext(existingReport.context, error);
    } else {
      // Create new report
      const report = this.createErrorReport(error, reportId);
      this.reports.set(reportId, report);
    }

    // Cleanup old reports if we exceed the limit
    await this.enforceMaxReports();
  }

  /**
   * Get error statistics for a time period
   */
  async getStats(period?: { start: Date; end: Date }): Promise<ErrorStats> {
    const reports = Array.from(this.reports.values());
    
    // Filter by time period if specified
    const filteredReports = period
      ? reports.filter(report => 
          report.timestamp >= period.start && report.timestamp <= period.end
        )
      : reports;

    const totalErrors = filteredReports.reduce((sum, report) => sum + report.count, 0);
    
    // Count by category
    const byCategory: Record<ErrorCategory, number> = {} as any;
    for (const category of Object.values(ErrorCategory)) {
      byCategory[category] = 0;
    }
    
    // Count by severity
    const bySeverity: Record<ErrorSeverity, number> = {} as any;
    for (const severity of Object.values(ErrorSeverity)) {
      bySeverity[severity] = 0;
    }

    // Count errors by code for top errors
    const errorCounts = new Map<WalletErrorCode, number>();

    for (const report of filteredReports) {
      byCategory[report.category] += report.count;
      bySeverity[report.severity] += report.count;
      
      const currentCount = errorCounts.get(report.code) || 0;
      errorCounts.set(report.code, currentCount + report.count);
    }

    // Get top errors
    const topErrors = Array.from(errorCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([code, count]) => ({
        code,
        count,
        percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0,
      }));

    return {
      totalErrors,
      byCategory,
      bySeverity,
      topErrors,
      period: period || {
        start: new Date(Math.min(...reports.map(r => r.firstSeen.getTime()))),
        end: new Date(Math.max(...reports.map(r => r.lastSeen.getTime()))),
      },
    };
  }

  /**
   * Get all error reports
   */
  async getReports(): Promise<ErrorReport[]> {
    return Array.from(this.reports.values()).sort(
      (a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()
    );
  }

  /**
   * Clean up old reports
   */
  async cleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.retentionPeriod);
    let cleanedCount = 0;

    for (const [id, report] of this.reports.entries()) {
      if (report.lastSeen < cutoff) {
        this.reports.delete(id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Export reports as JSON
   */
  async export(): Promise<string> {
    const reports = await this.getReports();
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      sdkVersion: this.getPlatformInfo().nodeVersion,
      reportCount: reports.length,
      reports: reports.map(report => ({
        ...report,
        timestamp: report.timestamp.toISOString(),
        firstSeen: report.firstSeen.toISOString(),
        lastSeen: report.lastSeen.toISOString(),
      })),
    }, null, 2);
  }

  /**
   * Generate a unique ID for an error report
   */
  private generateReportId(error: WalletError): string {
    // Create ID based on error code and key context elements
    const keyContext = [
      error.code,
      error.context?.operation,
      error.context?.component,
    ].filter(Boolean).join('|');
    
    return `${error.code}_${this.hashString(keyContext)}`;
  }

  /**
   * Create an error report from a WalletError
   */
  private createErrorReport(error: WalletError, id: string): ErrorReport {
    const now = new Date();
    
    return {
      id,
      code: error.code,
      category: error.category,
      severity: error.severity,
      message: this.sanitizeMessage(error.message),
      timestamp: now,
      count: 1,
      firstSeen: now,
      lastSeen: now,
      sdkVersion: this.getSDKVersion(),
      platform: this.getPlatformInfo(),
      context: this.sanitizeContext(error.getSanitizedContext()),
    };
  }

  /**
   * Merge context from multiple error reports
   */
  private mergeContext(
    existing?: Record<string, unknown>,
    error?: WalletError
  ): Record<string, unknown> | undefined {
    const newContext = error?.getSanitizedContext();
    if (!existing && !newContext) return undefined;
    if (!existing) return newContext;
    if (!newContext) return existing;
    
    return { ...existing, ...newContext };
  }

  /**
   * Sanitize error message to remove sensitive data
   */
  protected sanitizeMessage(message: string): string {
    // Remove potential addresses, keys, or other sensitive data
    return message
      .replace(/\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g, '[ADDRESS]') // Bitcoin-style addresses
      .replace(/\b0x[a-fA-F0-9]{40}\b/g, '[ADDRESS]') // Ethereum-style addresses
      .replace(/\b[a-fA-F0-9]{64}\b/g, '[HASH]') // 64-char hashes
      .replace(/\bseed\s*:?\s*\S+/gi, 'seed: [REDACTED]')
      .replace(/\bpassword\s*:?\s*\S+/gi, 'password: [REDACTED]')
      .replace(/\bkey\s*:?\s*\S+/gi, 'key: [REDACTED]');
  }

  /**
   * Sanitize context data
   */
  protected sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context || !this.config.includeContext) return undefined;
    
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Skip potentially sensitive keys
      if (this.isSensitiveField(key)) {
        continue;
      }
      
      // Limit string values to prevent large dumps
      if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  /**
   * Check if a field name indicates sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitivePatterns = [
      /password/i, /secret/i, /key/i, /token/i, /seed/i,
      /mnemonic/i, /private/i, /auth/i, /credential/i,
      /address/i, /signature/i, /wallet/i
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(fieldName));
  }

  /**
   * Enforce maximum number of reports
   */
  private async enforceMaxReports(): Promise<void> {
    if (this.reports.size <= this.config.maxReports) {
      return;
    }

    // Remove oldest reports
    const reports = Array.from(this.reports.entries())
      .sort(([, a], [, b]) => a.lastSeen.getTime() - b.lastSeen.getTime());
    
    const toRemove = reports.slice(0, this.reports.size - this.config.maxReports);
    for (const [id] of toRemove) {
      this.reports.delete(id);
    }
  }

  /**
   * Get platform information
   */
  protected getPlatformInfo(): PlatformInfo {
    return {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      osVersion: process.env.OS_VERSION,
    };
  }

  /**
   * Get SDK version
   */
  protected getSDKVersion(): string {
    // This would be set from package.json in real implementation
    return '1.0.0';
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * Remote error reporter that sends reports to a telemetry service
 */
export class RemoteErrorReporter extends LocalErrorReporter {
  constructor(config: Partial<TelemetryConfig> = {}) {
    super(config);
  }

  /**
   * Report an error (also sends to remote service)
   */
  async report(error: WalletError): Promise<void> {
    // Store locally first
    await super.report(error);
    
    // Send to remote service if configured
    if (this.config.endpoint && this.config.apiKey) {
      try {
        await this.sendToRemote(error);
      } catch (sendError) {
        // Silently fail - don't want telemetry to break the app
        console.warn('Failed to send error report to remote service:', sendError);
      }
    }
  }

  /**
   * Send error report to remote telemetry service
   */
  private async sendToRemote(error: WalletError): Promise<void> {
    const report = this.createRemoteReport(error);
    
    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'User-Agent': `TariSDK/${this.getSDKVersion()}`,
      },
      body: JSON.stringify(report),
    });
    
    if (!response.ok) {
      throw new Error(`Remote reporting failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Create a report suitable for remote transmission
   */
  private createRemoteReport(error: WalletError): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      code: error.code,
      category: error.category,
      severity: error.severity,
      message: this.sanitizeMessage(error.message),
      context: this.sanitizeContext(error.getSanitizedContext()),
      platform: this.getPlatformInfo(),
      sdkVersion: this.getSDKVersion(),
      ...this.config.customFields,
    };
  }
}

/**
 * Global error reporter instance
 */
let globalReporter: ErrorReporter = new LocalErrorReporter();

/**
 * Configure global error reporting
 */
export function configureErrorReporting(config: Partial<TelemetryConfig>): void {
  if (config.endpoint) {
    globalReporter = new RemoteErrorReporter(config);
  } else {
    globalReporter = new LocalErrorReporter(config);
  }
}

/**
 * Report an error to the global reporter
 */
export async function reportError(error: WalletError): Promise<void> {
  try {
    await globalReporter.report(error);
  } catch (reportingError) {
    // Don't let reporting errors affect the application
    console.warn('Error reporting failed:', reportingError);
  }
}

/**
 * Get error statistics from the global reporter
 */
export async function getErrorStats(period?: { start: Date; end: Date }): Promise<ErrorStats> {
  return globalReporter.getStats(period);
}

/**
 * Get all error reports from the global reporter
 */
export async function getErrorReports(): Promise<ErrorReport[]> {
  return globalReporter.getReports();
}

/**
 * Clean up old error reports
 */
export async function cleanupErrorReports(): Promise<number> {
  return globalReporter.cleanup();
}

/**
 * Export error reports
 */
export async function exportErrorReports(): Promise<string> {
  return globalReporter.export();
}

/**
 * Auto-reporting middleware for error handlers
 */
export function withErrorReporting<T extends any[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof WalletError) {
        await reportError(error);
      }
      throw error;
    }
  };
}

/**
 * Decorator for automatic error reporting
 */
export function reportErrors() {
  return function <T extends any[], R>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return;

    descriptor.value = withErrorReporting(originalMethod) as (...args: T) => Promise<R>;
    
    return descriptor;
  };
}
