/**
 * @fileoverview Backend health monitoring and automatic failover
 * 
 * Provides comprehensive health monitoring for storage backends with
 * automatic failover, performance metrics, and recovery strategies.
 */

import type { SecureStorage, StorageResult } from './secure-storage.js';

export interface BackendHealth {
  available: boolean;
  lastCheck: Date;
  errorCount: number;
  successCount: number;
  performance: {
    averageResponseTime: number;
    lastResponseTime: number;
    successRate: number;
  };
  errors: BackendError[];
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface BackendError {
  timestamp: Date;
  operation: string;
  error: string;
  recoverable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface HealthCheckConfig {
  checkInterval: number; // milliseconds
  maxErrors: number;
  degradedThreshold: number; // error rate threshold for degraded status
  unhealthyThreshold: number; // error rate threshold for unhealthy status
  responseTimeThreshold: number; // milliseconds
  maxHistorySize: number;
  enableAutoRecovery: boolean;
  recoveryDelay: number; // milliseconds before retry
}

/**
 * Monitors and tracks health of storage backends
 */
export class BackendHealthMonitor {
  private health = new Map<string, BackendHealth>();
  private config: HealthCheckConfig;
  private checkTimers = new Map<string, NodeJS.Timeout>();
  private backends = new Map<string, SecureStorage>();
  private listeners = new Set<(backendId: string, health: BackendHealth) => void>();

  constructor(config: Partial<HealthCheckConfig> = {}) {
    this.config = {
      checkInterval: 30000, // 30 seconds
      maxErrors: 10,
      degradedThreshold: 0.1, // 10% error rate
      unhealthyThreshold: 0.3, // 30% error rate
      responseTimeThreshold: 5000, // 5 seconds
      maxHistorySize: 100,
      enableAutoRecovery: true,
      recoveryDelay: 60000, // 1 minute
      ...config,
    };
  }

  /**
   * Register a backend for health monitoring
   */
  registerBackend(id: string, backend: SecureStorage): void {
    this.backends.set(id, backend);
    
    // Initialize health record
    this.health.set(id, {
      available: true,
      lastCheck: new Date(),
      errorCount: 0,
      successCount: 0,
      performance: {
        averageResponseTime: 0,
        lastResponseTime: 0,
        successRate: 1.0,
      },
      errors: [],
      status: 'unknown',
    });

    // Start health checks
    this.startHealthChecks(id);
  }

  /**
   * Unregister a backend from monitoring
   */
  unregisterBackend(id: string): void {
    const timer = this.checkTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.checkTimers.delete(id);
    }
    
    this.backends.delete(id);
    this.health.delete(id);
  }

  /**
   * Get health status for a backend
   */
  getHealth(id: string): BackendHealth | undefined {
    return this.health.get(id);
  }

  /**
   * Get health status for all backends
   */
  getAllHealth(): Map<string, BackendHealth> {
    return new Map(this.health);
  }

  /**
   * Get list of healthy backends
   */
  getHealthyBackends(): string[] {
    const healthy: string[] = [];
    
    for (const [id, health] of this.health) {
      if (health.status === 'healthy') {
        healthy.push(id);
      }
    }
    
    return healthy;
  }

  /**
   * Get the best available backend based on health metrics
   */
  getBestBackend(): string | undefined {
    let bestId: string | undefined;
    let bestScore = -1;
    
    for (const [id, health] of this.health) {
      if (health.status === 'unhealthy') {
        continue;
      }
      
      // Calculate health score (higher is better)
      const responseScore = Math.max(0, 1000 - health.performance.averageResponseTime) / 1000;
      const successScore = health.performance.successRate;
      const availabilityBonus = health.available ? 0.5 : 0;
      const statusBonus = health.status === 'healthy' ? 0.5 : 
                         health.status === 'degraded' ? 0.2 : 0;
      
      const score = (responseScore * 0.3) + (successScore * 0.4) + availabilityBonus + statusBonus;
      
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    
    return bestId;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(id: string, responseTime: number): void {
    const health = this.health.get(id);
    if (!health) return;

    health.successCount++;
    health.performance.lastResponseTime = responseTime;
    
    // Update average response time
    const totalOps = health.successCount + health.errorCount;
    health.performance.averageResponseTime = 
      (health.performance.averageResponseTime * (totalOps - 1) + responseTime) / totalOps;
    
    // Update success rate
    health.performance.successRate = health.successCount / totalOps;
    
    // Update status
    this.updateStatus(id);
    this.notifyListeners(id, health);
  }

  /**
   * Record a failed operation
   */
  recordError(id: string, operation: string, error: string, responseTime?: number): void {
    const health = this.health.get(id);
    if (!health) return;

    health.errorCount++;
    
    if (responseTime !== undefined) {
      health.performance.lastResponseTime = responseTime;
      
      // Update average response time
      const totalOps = health.successCount + health.errorCount;
      health.performance.averageResponseTime = 
        (health.performance.averageResponseTime * (totalOps - 1) + responseTime) / totalOps;
    }

    // Add error to history
    const backendError: BackendError = {
      timestamp: new Date(),
      operation,
      error,
      recoverable: this.isRecoverableError(error),
      severity: this.getErrorSeverity(error),
    };
    
    health.errors.push(backendError);
    
    // Limit error history size
    if (health.errors.length > this.config.maxHistorySize) {
      health.errors = health.errors.slice(-this.config.maxHistorySize);
    }
    
    // Update success rate
    const totalOps = health.successCount + health.errorCount;
    health.performance.successRate = health.successCount / totalOps;
    
    // Update status
    this.updateStatus(id);
    this.notifyListeners(id, health);
  }

  /**
   * Force a health check for a specific backend
   */
  async checkHealth(id: string): Promise<BackendHealth | undefined> {
    const backend = this.backends.get(id);
    const health = this.health.get(id);
    
    if (!backend || !health) {
      return undefined;
    }

    health.lastCheck = new Date();
    
    try {
      const start = Date.now();
      const result = await backend.test();
      const responseTime = Date.now() - start;
      
      if (result.success) {
        health.available = true;
        this.recordSuccess(id, responseTime);
      } else {
        health.available = false;
        this.recordError(id, 'health-check', result.error || 'Health check failed', responseTime);
      }
    } catch (error) {
      health.available = false;
      this.recordError(id, 'health-check', error instanceof Error ? error.message : 'Unknown error');
    }
    
    return health;
  }

  /**
   * Add a health change listener
   */
  addListener(listener: (backendId: string, health: BackendHealth) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a health change listener
   */
  removeListener(listener: (backendId: string, health: BackendHealth) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Stop all health monitoring
   */
  shutdown(): void {
    for (const timer of this.checkTimers.values()) {
      clearInterval(timer);
    }
    
    this.checkTimers.clear();
    this.backends.clear();
    this.health.clear();
    this.listeners.clear();
  }

  /**
   * Get health monitoring statistics
   */
  getStatistics(): {
    totalBackends: number;
    healthyBackends: number;
    degradedBackends: number;
    unhealthyBackends: number;
    averageResponseTime: number;
    overallSuccessRate: number;
  } {
    const healths = Array.from(this.health.values());
    
    const totalBackends = healths.length;
    const healthyBackends = healths.filter(h => h.status === 'healthy').length;
    const degradedBackends = healths.filter(h => h.status === 'degraded').length;
    const unhealthyBackends = healths.filter(h => h.status === 'unhealthy').length;
    
    const averageResponseTime = healths.length > 0 
      ? healths.reduce((sum, h) => sum + h.performance.averageResponseTime, 0) / healths.length
      : 0;
    
    const totalOps = healths.reduce((sum, h) => sum + h.successCount + h.errorCount, 0);
    const totalSuccess = healths.reduce((sum, h) => sum + h.successCount, 0);
    const overallSuccessRate = totalOps > 0 ? totalSuccess / totalOps : 0;
    
    return {
      totalBackends,
      healthyBackends,
      degradedBackends,
      unhealthyBackends,
      averageResponseTime,
      overallSuccessRate,
    };
  }

  /**
   * Start periodic health checks for a backend
   */
  private startHealthChecks(id: string): void {
    const timer = setInterval(async () => {
      await this.checkHealth(id);
    }, this.config.checkInterval);
    
    this.checkTimers.set(id, timer);
    
    // Perform initial health check
    this.checkHealth(id).catch(error => {
      console.warn(`Initial health check failed for backend ${id}:`, error);
    });
  }

  /**
   * Update the status of a backend based on health metrics
   */
  private updateStatus(id: string): void {
    const health = this.health.get(id);
    if (!health) return;

    const totalOps = health.successCount + health.errorCount;
    const errorRate = totalOps > 0 ? health.errorCount / totalOps : 0;
    
    // Check recent errors (last 10 operations or 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentErrors = health.errors.filter(e => e.timestamp > fiveMinutesAgo);
    const recentCriticalErrors = recentErrors.filter(e => e.severity === 'critical');
    
    // Determine status
    if (!health.available || recentCriticalErrors.length > 0) {
      health.status = 'unhealthy';
    } else if (errorRate >= this.config.unhealthyThreshold) {
      health.status = 'unhealthy';
    } else if (errorRate >= this.config.degradedThreshold || 
               health.performance.averageResponseTime > this.config.responseTimeThreshold) {
      health.status = 'degraded';
    } else if (totalOps > 0) {
      health.status = 'healthy';
    } else {
      health.status = 'unknown';
    }
  }

  /**
   * Determine if an error is recoverable
   */
  private isRecoverableError(error: string): boolean {
    const recoverablePatterns = [
      /network/i,
      /timeout/i,
      /connection/i,
      /temporary/i,
      /rate limit/i,
    ];
    
    return recoverablePatterns.some(pattern => pattern.test(error));
  }

  /**
   * Get error severity based on error message
   */
  private getErrorSeverity(error: string): BackendError['severity'] {
    const criticalPatterns = [
      /authentication failed/i,
      /access denied/i,
      /permission/i,
      /unauthorized/i,
      /corrupted/i,
    ];
    
    const highPatterns = [
      /storage full/i,
      /quota exceeded/i,
      /service unavailable/i,
    ];
    
    const mediumPatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
    ];
    
    if (criticalPatterns.some(pattern => pattern.test(error))) {
      return 'critical';
    } else if (highPatterns.some(pattern => pattern.test(error))) {
      return 'high';
    } else if (mediumPatterns.some(pattern => pattern.test(error))) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Notify all listeners of health changes
   */
  private notifyListeners(id: string, health: BackendHealth): void {
    for (const listener of this.listeners) {
      try {
        listener(id, health);
      } catch (error) {
        console.warn('Health listener error:', error);
      }
    }
  }
}

/**
 * Utility functions for health monitoring
 */
export class HealthUtils {
  /**
   * Create a health report summary
   */
  static createHealthReport(monitor: BackendHealthMonitor): string {
    const stats = monitor.getStatistics();
    const allHealth = monitor.getAllHealth();
    
    let report = `Storage Backend Health Report\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    report += `Summary:\n`;
    report += `- Total Backends: ${stats.totalBackends}\n`;
    report += `- Healthy: ${stats.healthyBackends}\n`;
    report += `- Degraded: ${stats.degradedBackends}\n`;
    report += `- Unhealthy: ${stats.unhealthyBackends}\n`;
    report += `- Average Response Time: ${stats.averageResponseTime.toFixed(2)}ms\n`;
    report += `- Overall Success Rate: ${(stats.overallSuccessRate * 100).toFixed(2)}%\n\n`;
    
    report += `Backend Details:\n`;
    for (const [id, health] of allHealth) {
      report += `- ${id}: ${health.status.toUpperCase()}\n`;
      report += `  Success Rate: ${(health.performance.successRate * 100).toFixed(2)}%\n`;
      report += `  Avg Response: ${health.performance.averageResponseTime.toFixed(2)}ms\n`;
      report += `  Last Check: ${health.lastCheck.toISOString()}\n`;
      
      if (health.errors.length > 0) {
        const recentErrors = health.errors.slice(-3);
        report += `  Recent Errors:\n`;
        for (const error of recentErrors) {
          report += `    - ${error.timestamp.toISOString()}: ${error.error}\n`;
        }
      }
      report += `\n`;
    }
    
    return report;
  }

  /**
   * Check if any backend needs immediate attention
   */
  static needsAttention(monitor: BackendHealthMonitor): {
    critical: string[];
    warnings: string[];
  } {
    const critical: string[] = [];
    const warnings: string[] = [];
    const allHealth = monitor.getAllHealth();
    
    for (const [id, health] of allHealth) {
      if (health.status === 'unhealthy') {
        critical.push(id);
      } else if (health.status === 'degraded') {
        warnings.push(id);
      }
    }
    
    return { critical, warnings };
  }

  /**
   * Suggest actions based on health status
   */
  static suggestActions(monitor: BackendHealthMonitor): string[] {
    const suggestions: string[] = [];
    const stats = monitor.getStatistics();
    const allHealth = monitor.getAllHealth();
    
    if (stats.healthyBackends === 0) {
      suggestions.push('CRITICAL: No healthy backends available. Check system connectivity and permissions.');
    }
    
    if (stats.unhealthyBackends > 0) {
      suggestions.push(`${stats.unhealthyBackends} backend(s) are unhealthy. Review error logs and restart if necessary.`);
    }
    
    if (stats.averageResponseTime > 5000) {
      suggestions.push('Average response time is high. Consider optimizing backend configuration or hardware.');
    }
    
    if (stats.overallSuccessRate < 0.95) {
      suggestions.push('Overall success rate is below 95%. Investigate recurring errors.');
    }
    
    // Check for specific backend issues
    for (const [id, health] of allHealth) {
      if (health.errors.length > 0) {
        const criticalErrors = health.errors.filter(e => e.severity === 'critical');
        if (criticalErrors.length > 0) {
          suggestions.push(`Backend ${id} has critical errors. Immediate attention required.`);
        }
      }
    }
    
    return suggestions;
  }
}
