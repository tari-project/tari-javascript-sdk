/**
 * Resource diagnostics and monitoring utilities
 * Provides comprehensive resource health monitoring and leak detection tools
 */

import { getResourceTracker, type LeakInfo, type TrackingStats } from './tracker.js';
import type { ResourceType } from './resource.js';

/**
 * Diagnostic severity levels
 */
export enum DiagnosticSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical',
}

/**
 * Diagnostic message structure
 */
export interface DiagnosticMessage {
  severity: DiagnosticSeverity;
  category: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Resource health assessment
 */
export interface ResourceHealth {
  overall: 'healthy' | 'warning' | 'critical';
  score: number; // 0-100
  issues: DiagnosticMessage[];
  recommendations: string[];
}

/**
 * Resource monitoring configuration
 */
export interface MonitoringConfig {
  /** Leak detection threshold (ms) */
  leakThreshold: number;
  /** Warning threshold for resource count */
  resourceCountWarning: number;
  /** Critical threshold for resource count */
  resourceCountCritical: number;
  /** Memory usage warning threshold (MB) */
  memoryWarningMB: number;
  /** Memory usage critical threshold (MB) */
  memoryCriticalMB: number;
  /** Maximum resource age before warning (ms) */
  maxResourceAge: number;
}

/**
 * Default monitoring configuration
 */
const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  leakThreshold: 300000, // 5 minutes
  resourceCountWarning: 100,
  resourceCountCritical: 500,
  memoryWarningMB: 50,
  memoryCriticalMB: 200,
  maxResourceAge: 3600000, // 1 hour
};

/**
 * Resource diagnostics manager
 */
export class ResourceDiagnostics {
  private readonly config: MonitoringConfig;
  private readonly tracker = getResourceTracker();

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_MONITORING_CONFIG, ...config };
  }

  /**
   * Perform comprehensive resource health check
   */
  assessResourceHealth(): ResourceHealth {
    const issues: DiagnosticMessage[] = [];
    const recommendations: string[] = [];
    
    // Get current statistics
    const stats = this.tracker.getStats();
    const leaks = this.tracker.detectLeaks();
    
    // Check for memory leaks
    this.checkForLeaks(leaks, issues, recommendations);
    
    // Check resource counts
    this.checkResourceCounts(stats, issues, recommendations);
    
    // Check memory usage
    this.checkMemoryUsage(stats, issues, recommendations);
    
    // Check resource ages
    this.checkResourceAges(issues, recommendations);
    
    // Calculate overall health score
    const score = this.calculateHealthScore(issues);
    const overall = this.determineOverallHealth(score);

    return {
      overall,
      score,
      issues,
      recommendations,
    };
  }

  /**
   * Check for resource leaks
   */
  private checkForLeaks(
    leaks: LeakInfo[],
    issues: DiagnosticMessage[],
    recommendations: string[]
  ): void {
    if (leaks.length > 0) {
      const severity = leaks.length > 10 ? DiagnosticSeverity.Critical : DiagnosticSeverity.Warning;
      
      issues.push({
        severity,
        category: 'Memory Leaks',
        message: `${leaks.length} potential resource leak(s) detected`,
        details: {
          leakCount: leaks.length,
          leaks: leaks.map(leak => ({
            id: leak.metadata.id,
            type: leak.metadata.type,
            ageMs: leak.ageMs,
            handle: leak.metadata.handle,
          })),
        },
        timestamp: new Date(),
      });

      recommendations.push(
        'Use "using" keyword for automatic resource disposal',
        'Call dispose() explicitly on resources when done',
        'Check for circular references preventing garbage collection'
      );
    }
  }

  /**
   * Check resource counts against thresholds
   */
  private checkResourceCounts(
    stats: TrackingStats,
    issues: DiagnosticMessage[],
    recommendations: string[]
  ): void {
    const { currentActive } = stats;
    
    if (currentActive >= this.config.resourceCountCritical) {
      issues.push({
        severity: DiagnosticSeverity.Critical,
        category: 'Resource Count',
        message: `Critical resource count: ${currentActive} active resources`,
        details: { currentActive, threshold: this.config.resourceCountCritical },
        timestamp: new Date(),
      });
      
      recommendations.push(
        'Implement resource pooling to reuse resources',
        'Add more aggressive cleanup policies',
        'Consider breaking work into smaller batches'
      );
    } else if (currentActive >= this.config.resourceCountWarning) {
      issues.push({
        severity: DiagnosticSeverity.Warning,
        category: 'Resource Count',
        message: `High resource count: ${currentActive} active resources`,
        details: { currentActive, threshold: this.config.resourceCountWarning },
        timestamp: new Date(),
      });
      
      recommendations.push(
        'Monitor resource creation patterns',
        'Consider implementing resource limits',
        'Review resource disposal timing'
      );
    }
  }

  /**
   * Check memory usage against thresholds
   */
  private checkMemoryUsage(
    stats: TrackingStats,
    issues: DiagnosticMessage[],
    recommendations: string[]
  ): void {
    const memoryMB = stats.estimatedMemoryUsage / (1024 * 1024);
    
    if (memoryMB >= this.config.memoryCriticalMB) {
      issues.push({
        severity: DiagnosticSeverity.Critical,
        category: 'Memory Usage',
        message: `Critical memory usage: ${memoryMB.toFixed(2)} MB`,
        details: { memoryMB, threshold: this.config.memoryCriticalMB },
        timestamp: new Date(),
      });
      
      recommendations.push(
        'Force garbage collection if available',
        'Implement memory pressure handling',
        'Reduce concurrent resource usage'
      );
    } else if (memoryMB >= this.config.memoryWarningMB) {
      issues.push({
        severity: DiagnosticSeverity.Warning,
        category: 'Memory Usage',
        message: `High memory usage: ${memoryMB.toFixed(2)} MB`,
        details: { memoryMB, threshold: this.config.memoryWarningMB },
        timestamp: new Date(),
      });
      
      recommendations.push(
        'Monitor memory growth trends',
        'Consider implementing memory limits',
        'Review resource cleanup frequency'
      );
    }
  }

  /**
   * Check for long-lived resources
   */
  private checkResourceAges(
    issues: DiagnosticMessage[],
    recommendations: string[]
  ): void {
    const report = this.tracker.generateDiagnosticReport();
    const oldResources = report.oldestResources.filter(
      r => r.ageMs > this.config.maxResourceAge
    );

    if (oldResources.length > 0) {
      issues.push({
        severity: DiagnosticSeverity.Warning,
        category: 'Resource Age',
        message: `${oldResources.length} long-lived resource(s) detected`,
        details: {
          count: oldResources.length,
          oldestAgeMs: Math.max(...oldResources.map(r => r.ageMs)),
          resources: oldResources.map(r => ({
            id: r.metadata.id,
            type: r.metadata.type,
            ageMs: r.ageMs,
          })),
        },
        timestamp: new Date(),
      });

      recommendations.push(
        'Review resource lifecycle management',
        'Consider resource expiration policies',
        'Check if long-lived resources are intentional'
      );
    }
  }

  /**
   * Calculate health score based on issues
   */
  private calculateHealthScore(issues: DiagnosticMessage[]): number {
    let score = 100;
    
    for (const issue of issues) {
      switch (issue.severity) {
        case DiagnosticSeverity.Critical:
          score -= 25;
          break;
        case DiagnosticSeverity.Error:
          score -= 15;
          break;
        case DiagnosticSeverity.Warning:
          score -= 10;
          break;
        case DiagnosticSeverity.Info:
          score -= 2;
          break;
      }
    }
    
    return Math.max(0, score);
  }

  /**
   * Determine overall health status
   */
  private determineOverallHealth(score: number): 'healthy' | 'warning' | 'critical' {
    if (score >= 80) return 'healthy';
    if (score >= 50) return 'warning';
    return 'critical';
  }

  /**
   * Generate detailed diagnostic report
   */
  generateDetailedReport(): {
    health: ResourceHealth;
    stats: TrackingStats;
    leaks: LeakInfo[];
    resourcesByType: Record<ResourceType, number>;
    recommendations: string[];
  } {
    const health = this.assessResourceHealth();
    const diagnosticReport = this.tracker.generateDiagnosticReport();
    
    return {
      health,
      stats: diagnosticReport.stats,
      leaks: diagnosticReport.leaks,
      resourcesByType: diagnosticReport.resourcesByType,
      recommendations: health.recommendations,
    };
  }

  /**
   * Log diagnostic issues to console
   */
  logDiagnostics(): void {
    const health = this.assessResourceHealth();
    
    console.group(`🔍 FFI Resource Diagnostics - ${health.overall.toUpperCase()}`);
    console.log(`Health Score: ${health.score}/100`);
    
    if (health.issues.length > 0) {
      console.group('Issues Found:');
      for (const issue of health.issues) {
        const icon = this.getSeverityIcon(issue.severity);
        console.log(`${icon} [${issue.category}] ${issue.message}`);
        if (issue.details) {
          console.log('  Details:', issue.details);
        }
      }
      console.groupEnd();
    }
    
    if (health.recommendations.length > 0) {
      console.group('Recommendations:');
      for (const rec of health.recommendations) {
        console.log(`💡 ${rec}`);
      }
      console.groupEnd();
    }
    
    console.groupEnd();
  }

  /**
   * Get icon for severity level
   */
  private getSeverityIcon(severity: DiagnosticSeverity): string {
    switch (severity) {
      case DiagnosticSeverity.Critical: return '🔴';
      case DiagnosticSeverity.Error: return '❌';
      case DiagnosticSeverity.Warning: return '⚠️';
      case DiagnosticSeverity.Info: return 'ℹ️';
      default: return '📍';
    }
  }
}

/**
 * Convenience functions for diagnostics
 */

/**
 * Perform quick resource health check
 */
export function checkResourceHealth(config?: Partial<MonitoringConfig>): ResourceHealth {
  const diagnostics = new ResourceDiagnostics(config);
  return diagnostics.assessResourceHealth();
}

/**
 * Log resource diagnostics to console
 */
export function logResourceDiagnostics(config?: Partial<MonitoringConfig>): void {
  const diagnostics = new ResourceDiagnostics(config);
  diagnostics.logDiagnostics();
}

/**
 * Generate comprehensive resource report
 */
export function generateResourceReport(config?: Partial<MonitoringConfig>) {
  const diagnostics = new ResourceDiagnostics(config);
  return diagnostics.generateDetailedReport();
}

/**
 * Auto-monitoring utility that logs diagnostics at intervals
 */
export class ResourceMonitor {
  private intervalId?: NodeJS.Timeout;
  private readonly diagnostics: ResourceDiagnostics;

  constructor(config?: Partial<MonitoringConfig>) {
    this.diagnostics = new ResourceDiagnostics(config);
  }

  /**
   * Start monitoring at specified interval
   */
  start(intervalMs: number = 60000): void {
    this.stop(); // Clear any existing interval
    
    this.intervalId = setInterval(() => {
      const health = this.diagnostics.assessResourceHealth();
      
      // Only log if there are issues
      if (health.issues.length > 0) {
        this.diagnostics.logDiagnostics();
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
