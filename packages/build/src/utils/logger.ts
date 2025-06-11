/**
 * Logging utilities for the build system
 */

import { LogLevel } from '../types.js';

/** ANSI color codes for console output */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/** Log level hierarchy for filtering */
const LOG_LEVELS = {
  [LogLevel.Error]: 0,
  [LogLevel.Warn]: 1,
  [LogLevel.Info]: 2,
  [LogLevel.Debug]: 3,
  [LogLevel.Trace]: 4
};

/** Logger configuration */
interface LoggerConfig {
  /** Current log level */
  level: LogLevel;
  /** Whether to use colors in output */
  colors: boolean;
  /** Whether to include timestamps */
  timestamps: boolean;
  /** Custom prefix for all messages */
  prefix?: string;
  /** Output stream for logs */
  output: NodeJS.WriteStream;
}

/** Default logger configuration */
const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  level: LogLevel.Info,
  colors: process.stdout.isTTY && process.env.NODE_ENV !== 'test',
  timestamps: true,
  output: process.stdout
};

/**
 * Build system logger with level-based filtering and colored output
 */
export class Logger {
  private config: LoggerConfig;
  private startTime: number;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Set whether to use colors
   */
  setColors(enabled: boolean): void {
    this.config.colors = enabled;
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    this.log(LogLevel.Error, message, ...args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.Warn, message, ...args);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    this.log(LogLevel.Info, message, ...args);
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.Debug, message, ...args);
  }

  /**
   * Log a trace message
   */
  trace(message: string, ...args: any[]): void {
    this.log(LogLevel.Trace, message, ...args);
  }

  /**
   * Log a success message (info level with green color)
   */
  success(message: string, ...args: any[]): void {
    this.logColored(LogLevel.Info, 'green', '✅', message, ...args);
  }

  /**
   * Log a failure message (error level with red color)
   */
  failure(message: string, ...args: any[]): void {
    this.logColored(LogLevel.Error, 'red', '❌', message, ...args);
  }

  /**
   * Log a progress message (info level with blue color)
   */
  progress(message: string, ...args: any[]): void {
    this.logColored(LogLevel.Info, 'blue', '🔄', message, ...args);
  }

  /**
   * Log a step message (info level with cyan color)
   */
  step(message: string, ...args: any[]): void {
    this.logColored(LogLevel.Info, 'cyan', '➡️', message, ...args);
  }

  /**
   * Log timing information
   */
  timing(label: string, startTime: number): void {
    const duration = Date.now() - startTime;
    this.logColored(LogLevel.Debug, 'magenta', '⏱️', `${label}: ${duration}ms`);
  }

  /**
   * Create a child logger with additional prefix
   */
  child(prefix: string): Logger {
    const childPrefix = this.config.prefix 
      ? `${this.config.prefix}:${prefix}`
      : prefix;
    
    return new Logger({
      ...this.config,
      prefix: childPrefix
    });
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const color = this.getLevelColor(level);
    const symbol = this.getLevelSymbol(level);
    
    this.logColored(level, color, symbol, message, ...args);
  }

  /**
   * Log with specific color and symbol
   */
  private logColored(
    level: LogLevel, 
    color: keyof typeof COLORS, 
    symbol: string, 
    message: string, 
    ...args: any[]
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = this.config.timestamps ? this.getTimestamp() : '';
    const prefix = this.config.prefix ? `[${this.config.prefix}] ` : '';
    const levelStr = level.toUpperCase().padEnd(5);
    
    let formattedMessage = `${timestamp}${prefix}${symbol} ${levelStr} ${message}`;
    
    if (args.length > 0) {
      // Handle object formatting
      const formattedArgs = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      );
      formattedMessage += ' ' + formattedArgs.join(' ');
    }

    if (this.config.colors) {
      formattedMessage = this.colorize(formattedMessage, color);
    }

    this.config.output.write(formattedMessage + '\n');
  }

  /**
   * Check if message should be logged based on level
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.config.level];
  }

  /**
   * Get color for log level
   */
  private getLevelColor(level: LogLevel): keyof typeof COLORS {
    switch (level) {
      case LogLevel.Error:
        return 'red';
      case LogLevel.Warn:
        return 'yellow';
      case LogLevel.Info:
        return 'white';
      case LogLevel.Debug:
        return 'blue';
      case LogLevel.Trace:
        return 'dim';
    }
  }

  /**
   * Get symbol for log level
   */
  private getLevelSymbol(level: LogLevel): string {
    switch (level) {
      case LogLevel.Error:
        return '🚨';
      case LogLevel.Warn:
        return '⚠️';
      case LogLevel.Info:
        return 'ℹ️';
      case LogLevel.Debug:
        return '🔍';
      case LogLevel.Trace:
        return '🔬';
    }
  }

  /**
   * Get formatted timestamp
   */
  private getTimestamp(): string {
    const now = new Date();
    const elapsed = now.getTime() - this.startTime;
    const elapsedSeconds = (elapsed / 1000).toFixed(3);
    
    return `[${now.toISOString()}] [+${elapsedSeconds}s] `;
  }

  /**
   * Apply color to text
   */
  private colorize(text: string, color: keyof typeof COLORS): string {
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }
}

/** Global logger instance */
export const logger = new Logger();

/**
 * Configure the global logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  Object.assign(logger['config'], config);
}

/**
 * Create a scoped logger for a specific module
 */
export function createLogger(scope: string): Logger {
  return logger.child(scope);
}

/**
 * Progress reporter for long-running operations
 */
export class ProgressReporter {
  private logger: Logger;
  private total: number;
  private current: number = 0;
  private startTime: number;
  private lastUpdate: number = 0;

  constructor(
    private operation: string,
    total: number,
    logger: Logger = createLogger('progress')
  ) {
    this.logger = logger;
    this.total = total;
    this.startTime = Date.now();
    
    this.logger.progress(`Starting ${operation} (${total} steps)`);
  }

  /**
   * Update progress
   */
  update(increment: number = 1, message?: string): void {
    this.current += increment;
    const now = Date.now();
    
    // Throttle updates to avoid spam
    if (now - this.lastUpdate < 1000) {
      return;
    }
    
    this.lastUpdate = now;
    
    const percentage = Math.round((this.current / this.total) * 100);
    const elapsed = now - this.startTime;
    const eta = this.current > 0 
      ? Math.round((elapsed / this.current) * (this.total - this.current))
      : 0;
    
    const progressBar = this.createProgressBar(percentage);
    const etaStr = eta > 0 ? ` ETA: ${this.formatDuration(eta)}` : '';
    const msgStr = message ? ` - ${message}` : '';
    
    this.logger.progress(
      `${this.operation}: ${progressBar} ${percentage}%${etaStr}${msgStr}`
    );
  }

  /**
   * Complete the operation
   */
  complete(message?: string): void {
    const elapsed = Date.now() - this.startTime;
    const msgStr = message ? ` - ${message}` : '';
    
    this.logger.success(
      `${this.operation} completed in ${this.formatDuration(elapsed)}${msgStr}`
    );
  }

  /**
   * Fail the operation
   */
  fail(error: string): void {
    const elapsed = Date.now() - this.startTime;
    
    this.logger.failure(
      `${this.operation} failed after ${this.formatDuration(elapsed)}: ${error}`
    );
  }

  /**
   * Create ASCII progress bar
   */
  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }

  /**
   * Format duration in milliseconds to human readable
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}

/**
 * Spinner for operations without known progress
 */
export class Spinner {
  private logger: Logger;
  private interval: NodeJS.Timeout | null = null;
  private frame = 0;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  constructor(
    private message: string,
    logger: Logger = createLogger('spinner')
  ) {
    this.logger = logger;
  }

  /**
   * Start the spinner
   */
  start(): void {
    this.interval = setInterval(() => {
      const spinner = this.frames[this.frame % this.frames.length];
      process.stdout.write(`\r${spinner} ${this.message}`);
      this.frame++;
    }, 100);
  }

  /**
   * Stop the spinner with success
   */
  succeed(message?: string): void {
    this.stop();
    this.logger.success(message || this.message);
  }

  /**
   * Stop the spinner with failure
   */
  fail(message?: string): void {
    this.stop();
    this.logger.failure(message || this.message);
  }

  /**
   * Stop the spinner
   */
  private stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r');
    }
  }
}
