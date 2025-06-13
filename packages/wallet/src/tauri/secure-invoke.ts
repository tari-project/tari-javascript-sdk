/**
 * @fileoverview Secure IPC wrapper for Tauri invoke with validation
 * 
 * Provides security-first wrapper around Tauri's invoke system with
 * rate limiting, payload validation, error sanitization, and logging.
 */

import type { TauriStorageResponse } from '../types/tauri.js';

/**
 * Security configuration for Tauri invoke operations
 */
export interface SecureInvokeConfig {
  /** Maximum operations per second */
  maxOperationsPerSecond?: number;
  /** Command timeout in milliseconds */
  commandTimeout?: number;
  /** Enable request/response logging */
  enableLogging?: boolean;
  /** Enable payload validation */
  enableValidation?: boolean;
  /** Maximum payload size in bytes */
  maxPayloadSize?: number;
  /** Allowed commands whitelist */
  allowedCommands?: string[];
  /** Enable error sanitization */
  sanitizeErrors?: boolean;
  /** Enable operation metrics */
  enableMetrics?: boolean;
}

/**
 * Rate limiting state
 */
interface RateLimitState {
  operationCount: number;
  windowStart: number;
  blocked: boolean;
  blockUntil?: number;
}

/**
 * Operation metrics
 */
interface OperationMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  rateLimitViolations: number;
  validationFailures: number;
  timeoutErrors: number;
}

/**
 * Secure invoke operation result
 */
export interface SecureInvokeResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    operationId: string;
    responseTime: number;
    cached?: boolean;
    retryCount?: number;
  };
}

/**
 * Command validation result
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedPayload?: any;
}

/**
 * Secure wrapper for Tauri invoke operations
 */
export class SecureInvoke {
  private readonly config: Required<SecureInvokeConfig>;
  private readonly rateLimitState: RateLimitState;
  private readonly metrics: OperationMetrics;
  private operationCounter = 0;

  constructor(config: SecureInvokeConfig = {}) {
    this.config = {
      maxOperationsPerSecond: 10,
      commandTimeout: 5000,
      enableLogging: false,
      enableValidation: true,
      maxPayloadSize: 1024 * 1024, // 1MB
      allowedCommands: [
        'secure_storage_store',
        'secure_storage_retrieve',
        'secure_storage_remove',
        'secure_storage_exists',
        'secure_storage_list',
        'secure_storage_get_metadata',
        'secure_storage_clear',
        'secure_storage_get_info',
        'secure_storage_test',
        'secure_storage_command',
        'get_platform_info',
        'get_tauri_platform_info_command',
      ],
      sanitizeErrors: true,
      enableMetrics: true,
      ...config,
    };

    this.rateLimitState = {
      operationCount: 0,
      windowStart: Date.now(),
      blocked: false,
    };

    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      rateLimitViolations: 0,
      validationFailures: 0,
      timeoutErrors: 0,
    };

    if (this.config.enableLogging) {
      console.log('SecureInvoke initialized with config:', this.config);
    }
  }

  /**
   * Invoke Tauri command with security checks
   */
  async invoke<T = any>(command: string, payload?: any): Promise<SecureInvokeResult<T>> {
    const operationId = this.generateOperationId();
    const startTime = Date.now();

    try {
      if (this.config.enableLogging) {
        console.log(`SecureInvoke[${operationId}]: Invoking command "${command}"`);
      }

      // Update metrics
      this.metrics.totalOperations++;

      // Check rate limiting
      const rateLimitCheck = this.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        this.metrics.rateLimitViolations++;
        throw new Error(rateLimitCheck.error || 'Rate limit exceeded');
      }

      // Validate command and payload
      const validation = this.validateRequest(command, payload);
      if (!validation.valid) {
        this.metrics.validationFailures++;
        throw new Error(validation.error || 'Validation failed');
      }

      // Check Tauri availability
      if (!this.isTauriAvailable()) {
        throw new Error('Tauri runtime not available');
      }

      // Execute command with timeout
      const response = await this.executeWithTimeout<T>(
        command,
        validation.sanitizedPayload || payload
      );

      // Update rate limit state
      this.updateRateLimit();

      // Process response
      const result = this.processResponse<T>(response, operationId, startTime);
      
      if (result.success) {
        this.metrics.successfulOperations++;
      } else {
        this.metrics.failedOperations++;
      }

      return result;

    } catch (error) {
      this.metrics.failedOperations++;
      
      if (error instanceof Error && error.message.includes('timeout')) {
        this.metrics.timeoutErrors++;
      }

      return this.handleError(error, operationId, startTime);
    }
  }

  /**
   * Check if operation is allowed by rate limiting
   */
  private checkRateLimit(): { allowed: boolean; error?: string } {
    const now = Date.now();
    const windowDuration = 1000; // 1 second window

    // Check if we're currently blocked
    if (this.rateLimitState.blocked && this.rateLimitState.blockUntil) {
      if (now < this.rateLimitState.blockUntil) {
        return {
          allowed: false,
          error: `Rate limited until ${new Date(this.rateLimitState.blockUntil).toISOString()}`,
        };
      } else {
        // Unblock
        this.rateLimitState.blocked = false;
        this.rateLimitState.blockUntil = undefined;
      }
    }

    // Reset counter if window has passed
    if (now - this.rateLimitState.windowStart >= windowDuration) {
      this.rateLimitState.operationCount = 0;
      this.rateLimitState.windowStart = now;
    }

    // Check if we would exceed the limit
    if (this.rateLimitState.operationCount >= this.config.maxOperationsPerSecond) {
      // Block for remaining window time plus penalty
      const blockDuration = windowDuration - (now - this.rateLimitState.windowStart) + 1000;
      this.rateLimitState.blocked = true;
      this.rateLimitState.blockUntil = now + blockDuration;

      return {
        allowed: false,
        error: `Rate limit exceeded: max ${this.config.maxOperationsPerSecond} operations per second`,
      };
    }

    return { allowed: true };
  }

  /**
   * Update rate limiting state after successful operation
   */
  private updateRateLimit(): void {
    this.rateLimitState.operationCount++;
  }

  /**
   * Validate command and payload
   */
  private validateRequest(command: string, payload?: any): ValidationResult {
    if (!this.config.enableValidation) {
      return { valid: true };
    }

    // Check if command is allowed
    if (!this.config.allowedCommands.includes(command)) {
      return {
        valid: false,
        error: `Command "${command}" not in allowlist`,
      };
    }

    // Validate payload size
    if (payload !== undefined) {
      const payloadSize = this.estimatePayloadSize(payload);
      if (payloadSize > this.config.maxPayloadSize) {
        return {
          valid: false,
          error: `Payload size ${payloadSize} exceeds maximum ${this.config.maxPayloadSize} bytes`,
        };
      }
    }

    // Sanitize payload
    const sanitizedPayload = this.sanitizePayload(payload);

    return {
      valid: true,
      sanitizedPayload,
    };
  }

  /**
   * Estimate payload size in bytes
   */
  private estimatePayloadSize(payload: any): number {
    try {
      return new Blob([JSON.stringify(payload)]).size;
    } catch {
      // Fallback estimation
      return JSON.stringify(payload).length * 2; // Rough estimate for UTF-16
    }
  }

  /**
   * Sanitize payload to prevent injection attacks
   */
  private sanitizePayload(payload: any): any {
    if (payload === null || payload === undefined) {
      return payload;
    }

    if (typeof payload === 'string') {
      // Remove potentially dangerous characters
      return payload.replace(/[<>\"'&]/g, '');
    }

    if (Array.isArray(payload)) {
      return payload.map(item => this.sanitizePayload(item));
    }

    if (typeof payload === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(payload)) {
        // Sanitize key
        const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '');
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizePayload(value);
        }
      }
      return sanitized;
    }

    return payload;
  }

  /**
   * Execute command with timeout
   */
  private async executeWithTimeout<T>(command: string, payload?: any): Promise<TauriStorageResponse<T>> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Command "${command}" timed out after ${this.config.commandTimeout}ms`));
      }, this.config.commandTimeout);
    });

    const commandPromise = window.__TAURI__!.invoke<TauriStorageResponse<T>>(command, payload);

    return Promise.race([commandPromise, timeoutPromise]);
  }

  /**
   * Process successful response
   */
  private processResponse<T>(
    response: TauriStorageResponse<T>,
    operationId: string,
    startTime: number
  ): SecureInvokeResult<T> {
    const responseTime = Date.now() - startTime;
    this.updateAverageResponseTime(responseTime);

    if (this.config.enableLogging) {
      console.log(`SecureInvoke[${operationId}]: Response in ${responseTime}ms:`, {
        success: response.success,
        hasData: response.data !== undefined,
        hasError: !!response.error,
      });
    }

    return {
      success: response.success,
      data: response.data,
      error: this.config.sanitizeErrors ? this.sanitizeError(response.error) : response.error,
      metadata: {
        operationId,
        responseTime,
      },
    };
  }

  /**
   * Handle operation errors
   */
  private handleError(error: unknown, operationId: string, startTime: number): SecureInvokeResult {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.config.enableLogging) {
      console.error(`SecureInvoke[${operationId}]: Error after ${responseTime}ms:`, errorMessage);
    }

    return {
      success: false,
      error: this.config.sanitizeErrors ? this.sanitizeError(errorMessage) : errorMessage,
      metadata: {
        operationId,
        responseTime,
      },
    };
  }

  /**
   * Sanitize error messages to prevent information leakage
   */
  private sanitizeError(error?: string): string | undefined {
    if (!error) return undefined;

    // Remove potentially sensitive information
    const sanitized = error
      .replace(/\/[^\/\s]+/g, '/[path]') // Remove file paths
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]') // Remove IP addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]') // Remove email addresses
      .replace(/[A-Za-z0-9+/]{20,}={0,2}/g, '[encoded]'); // Remove base64-like strings

    return sanitized;
  }

  /**
   * Update average response time metric
   */
  private updateAverageResponseTime(responseTime: number): void {
    const total = this.metrics.totalOperations;
    const prevAvg = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime = (prevAvg * (total - 1) + responseTime) / total;
  }

  /**
   * Check if Tauri is available
   */
  private isTauriAvailable(): boolean {
    return typeof window !== 'undefined' &&
           window.__TAURI__ !== undefined &&
           typeof window.__TAURI__.invoke === 'function';
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `secure-${Date.now()}-${++this.operationCounter}`;
  }

  /**
   * Get current security metrics
   */
  getMetrics(): OperationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    operationsInWindow: number;
    windowStart: number;
    blocked: boolean;
    blockUntil?: number;
  } {
    return {
      operationsInWindow: this.rateLimitState.operationCount,
      windowStart: this.rateLimitState.windowStart,
      blocked: this.rateLimitState.blocked,
      blockUntil: this.rateLimitState.blockUntil,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SecureInvokeConfig>): void {
    Object.assign(this.config, updates);
    
    if (this.config.enableLogging) {
      console.log('SecureInvoke: Configuration updated:', this.config);
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    Object.assign(this.metrics, {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      rateLimitViolations: 0,
      validationFailures: 0,
      timeoutErrors: 0,
    });
  }

  /**
   * Reset rate limiting state
   */
  resetRateLimit(): void {
    Object.assign(this.rateLimitState, {
      operationCount: 0,
      windowStart: Date.now(),
      blocked: false,
      blockUntil: undefined,
    });
  }
}

/**
 * Create a new secure invoke instance
 */
export function createSecureInvoke(config?: SecureInvokeConfig): SecureInvoke {
  return new SecureInvoke(config);
}

/**
 * Global secure invoke instance (singleton)
 */
let globalSecureInvoke: SecureInvoke | undefined;

/**
 * Get or create global secure invoke instance
 */
export function getSecureInvoke(config?: SecureInvokeConfig): SecureInvoke {
  if (!globalSecureInvoke) {
    globalSecureInvoke = new SecureInvoke(config);
  }
  return globalSecureInvoke;
}

/**
 * Security policy for Tauri commands
 */
export const TAURI_SECURITY_POLICY = {
  ALLOWED_COMMANDS: [
    'secure_storage_store',
    'secure_storage_retrieve',
    'secure_storage_remove',
    'secure_storage_exists',
    'secure_storage_list',
    'secure_storage_get_metadata',
    'secure_storage_clear',
    'secure_storage_get_info',
    'secure_storage_test',
    'secure_storage_command',
    'get_platform_info',
    'get_tauri_platform_info_command',
  ],
  MAX_PAYLOAD_SIZE: 1024 * 1024, // 1MB
  DEFAULT_TIMEOUT: 5000, // 5 seconds
  DEFAULT_RATE_LIMIT: 10, // operations per second
} as const;
