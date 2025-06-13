/**
 * @fileoverview Security policies for Electron applications
 * 
 * Provides comprehensive security policies, CSP headers, and
 * runtime security controls for Tari wallet Electron apps.
 */

import { URL } from 'url';

// Conditional Electron imports for environments where Electron might not be available
let session: any, BrowserWindow: any, app: any, shell: any;
try {
  const electron = require('electron');
  ({ session, BrowserWindow, app, shell } = electron);
} catch (error) {
  // Electron not available - this is fine for non-Electron environments
}

export interface SecurityPolicyConfig {
  /** Enable Content Security Policy */
  enableCSP?: boolean;
  /** Custom CSP directives */
  customCSP?: Record<string, string>;
  /** Allowed external domains */
  allowedDomains?: string[];
  /** Enable node integration in renderer */
  enableNodeIntegration?: boolean;
  /** Enable context isolation */
  enableContextIsolation?: boolean;
  /** Allow running insecure content */
  allowInsecureContent?: boolean;
  /** Enable web security */
  enableWebSecurity?: boolean;
  /** Allowed file protocols */
  allowedProtocols?: string[];
  /** Enable sandboxing */
  enableSandbox?: boolean;
  /** Custom permissions */
  customPermissions?: Record<string, boolean>;
}

export interface SecurityEvent {
  type: 'csp-violation' | 'permission-denied' | 'protocol-violation' | 'navigation-blocked' | 'download-blocked';
  timestamp: Date;
  origin?: string;
  details: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Content Security Policy manager
 */
export class CSPManager {
  private config: SecurityPolicyConfig;
  private violations: SecurityEvent[] = [];

  constructor(config: SecurityPolicyConfig) {
    this.config = config;
  }

  /**
   * Generate CSP header based on configuration
   */
  generateCSP(): string {
    const defaultDirectives = {
      'default-src': "'self'",
      'script-src': "'self' 'unsafe-inline'",
      'style-src': "'self' 'unsafe-inline'",
      'img-src': "'self' data: https:",
      'font-src': "'self' data:",
      'connect-src': "'self'",
      'object-src': "'none'",
      'base-uri': "'self'",
      'form-action': "'self'",
      'frame-ancestors': "'none'",
      'block-all-mixed-content': '',
      'upgrade-insecure-requests': '',
    };

    // Add allowed domains to connect-src
    if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
      const allowedSources = this.config.allowedDomains.join(' ');
      defaultDirectives['connect-src'] = `'self' ${allowedSources}`;
    }

    // Merge with custom CSP directives
    const directives = { ...defaultDirectives, ...this.config.customCSP };

    // Convert to CSP string
    return Object.entries(directives)
      .map(([key, value]) => `${key} ${value}`)
      .join('; ');
  }

  /**
   * Record CSP violation
   */
  recordViolation(violation: any): void {
    const event: SecurityEvent = {
      type: 'csp-violation',
      timestamp: new Date(),
      origin: violation.sourceFile || violation.documentURI,
      details: violation,
      severity: this.assessViolationSeverity(violation),
    };

    this.violations.push(event);
    this.limitViolationHistory();

    console.warn('CSP Violation:', violation);
  }

  /**
   * Get recent violations
   */
  getViolations(limit: number = 50): SecurityEvent[] {
    return this.violations.slice(-limit);
  }

  /**
   * Assess violation severity
   */
  private assessViolationSeverity(violation: any): SecurityEvent['severity'] {
    if (violation.violatedDirective?.includes('script-src')) {
      return 'high';
    }
    if (violation.violatedDirective?.includes('connect-src')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Limit violation history size
   */
  private limitViolationHistory(): void {
    if (this.violations.length > 1000) {
      this.violations = this.violations.slice(-500);
    }
  }
}

/**
 * Permission manager for Electron apps
 */
export class PermissionManager {
  private config: SecurityPolicyConfig;
  private permissionLog: SecurityEvent[] = [];

  constructor(config: SecurityPolicyConfig) {
    this.config = config;
  }

  /**
   * Check if permission should be granted
   */
  checkPermission(permission: string, requestingOrigin: string, details?: any): boolean {
    const allowed = this.isPermissionAllowed(permission, requestingOrigin);

    // Log permission request
    const event: SecurityEvent = {
      type: 'permission-denied',
      timestamp: new Date(),
      origin: requestingOrigin,
      details: { permission, details },
      severity: this.getPermissionSeverity(permission),
    };

    if (!allowed) {
      this.permissionLog.push(event);
      this.limitPermissionLog();
    }

    return allowed;
  }

  /**
   * Check if specific permission is allowed
   */
  private isPermissionAllowed(permission: string, origin: string): boolean {
    // Default denied permissions
    const deniedByDefault = [
      'microphone',
      'camera',
      'geolocation',
      'notifications',
      'midi',
      'background-sync',
      'push',
      'payment-handler',
    ];

    // Check custom permissions first
    if (this.config.customPermissions && permission in this.config.customPermissions) {
      return this.config.customPermissions[permission];
    }

    // Check if permission is denied by default
    if (deniedByDefault.includes(permission)) {
      return false;
    }

    // Check origin-based permissions
    if (this.config.allowedDomains) {
      try {
        const url = new URL(origin);
        return this.config.allowedDomains.some(domain => url.hostname.endsWith(domain));
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Get permission severity level
   */
  private getPermissionSeverity(permission: string): SecurityEvent['severity'] {
    const highRisk = ['camera', 'microphone', 'geolocation'];
    const mediumRisk = ['notifications', 'clipboard-read', 'clipboard-write'];

    if (highRisk.includes(permission)) {
      return 'high';
    } else if (mediumRisk.includes(permission)) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get recent permission events
   */
  getPermissionLog(limit: number = 100): SecurityEvent[] {
    return this.permissionLog.slice(-limit);
  }

  /**
   * Limit permission log size
   */
  private limitPermissionLog(): void {
    if (this.permissionLog.length > 1000) {
      this.permissionLog = this.permissionLog.slice(-500);
    }
  }
}

/**
 * Navigation security manager
 */
export class NavigationSecurityManager {
  private config: SecurityPolicyConfig;
  private blockedAttempts: SecurityEvent[] = [];

  constructor(config: SecurityPolicyConfig) {
    this.config = config;
  }

  /**
   * Check if navigation should be allowed
   */
  shouldAllowNavigation(navigationUrl: string, origin?: string): boolean {
    try {
      const url = new URL(navigationUrl);
      
      // Allow file protocol for local app
      if (url.protocol === 'file:') {
        return true;
      }

      // Allow app protocol
      if (url.protocol === 'app:') {
        return true;
      }

      // Check allowed protocols
      if (this.config.allowedProtocols && !this.config.allowedProtocols.includes(url.protocol)) {
        this.recordBlockedNavigation(navigationUrl, origin, 'protocol-not-allowed');
        return false;
      }

      // Check allowed domains
      if (this.config.allowedDomains) {
        const allowed = this.config.allowedDomains.some(domain => {
          return url.hostname === domain || url.hostname.endsWith('.' + domain);
        });

        if (!allowed) {
          this.recordBlockedNavigation(navigationUrl, origin, 'domain-not-allowed');
          return false;
        }
      }

      return true;

    } catch (error) {
      this.recordBlockedNavigation(navigationUrl, origin, 'invalid-url');
      return false;
    }
  }

  /**
   * Check if external URL should be opened
   */
  shouldOpenExternal(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Allow common safe protocols
      const safeProtocols = ['https:', 'mailto:', 'tel:'];
      if (safeProtocols.includes(urlObj.protocol)) {
        return true;
      }

      // Block javascript: and data: URLs
      const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
      if (dangerousProtocols.includes(urlObj.protocol)) {
        this.recordBlockedNavigation(url, undefined, 'dangerous-protocol');
        return false;
      }

      return false;

    } catch (error) {
      this.recordBlockedNavigation(url, undefined, 'invalid-external-url');
      return false;
    }
  }

  /**
   * Record blocked navigation attempt
   */
  private recordBlockedNavigation(url: string, origin?: string, reason?: string): void {
    const event: SecurityEvent = {
      type: 'navigation-blocked',
      timestamp: new Date(),
      origin,
      details: { url, reason },
      severity: 'medium',
    };

    this.blockedAttempts.push(event);
    this.limitBlockedAttempts();

    console.warn('Blocked navigation attempt:', { url, origin, reason });
  }

  /**
   * Get blocked navigation attempts
   */
  getBlockedAttempts(limit: number = 100): SecurityEvent[] {
    return this.blockedAttempts.slice(-limit);
  }

  /**
   * Limit blocked attempts history
   */
  private limitBlockedAttempts(): void {
    if (this.blockedAttempts.length > 1000) {
      this.blockedAttempts = this.blockedAttempts.slice(-500);
    }
  }
}

/**
 * Main security policy manager
 */
export class ElectronSecurityManager {
  private config: SecurityPolicyConfig;
  private cspManager: CSPManager;
  private permissionManager: PermissionManager;
  private navigationManager: NavigationSecurityManager;
  private isInitialized = false;

  constructor(config: SecurityPolicyConfig = {}) {
    this.config = {
      enableCSP: true,
      enableContextIsolation: true,
      enableNodeIntegration: false,
      allowInsecureContent: false,
      enableWebSecurity: true,
      enableSandbox: true,
      allowedProtocols: ['https:', 'file:', 'app:'],
      allowedDomains: [],
      ...config,
    };

    this.cspManager = new CSPManager(this.config);
    this.permissionManager = new PermissionManager(this.config);
    this.navigationManager = new NavigationSecurityManager(this.config);
  }

  /**
   * Initialize security policies
   */
  initialize(): void {
    if (this.isInitialized) return;

    this.setupAppSecurityHeaders();
    this.setupPermissionHandlers();
    this.setupNavigationHandlers();
    this.setupCSPViolationHandling();
    this.setupAppProtocol();

    this.isInitialized = true;
    console.log('Electron security policies initialized');
  }

  /**
   * Get secure browser window options
   */
  getSecureBrowserWindowOptions(): any {
    return {
      webPreferences: {
        nodeIntegration: this.config.enableNodeIntegration || false,
        contextIsolation: this.config.enableContextIsolation !== false,
        enableRemoteModule: false,
        allowRunningInsecureContent: this.config.allowInsecureContent || false,
        webSecurity: this.config.enableWebSecurity !== false,
        sandbox: this.config.enableSandbox !== false,
        spellcheck: false,
        backgroundThrottling: false,
      },
      show: false, // Show only after ready-to-show
    };
  }

  /**
   * Setup security headers for all sessions
   */
  private setupAppSecurityHeaders(): void {
    const defaultSession = session.defaultSession;

    // Set up CSP if enabled
    if (this.config.enableCSP) {
      const csp = this.cspManager.generateCSP();
      
      defaultSession.webRequest.onHeadersReceived((details: any, callback: any) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [csp],
            'X-Content-Type-Options': ['nosniff'],
            'X-Frame-Options': ['DENY'],
            'X-XSS-Protection': ['1; mode=block'],
            'Strict-Transport-Security': ['max-age=31536000; includeSubDomains'],
          },
        });
      });
    }

    // Block dangerous protocols
    defaultSession.protocol.interceptStringProtocol('javascript', (req: any, callback: any) => {
      console.warn('Blocked javascript: protocol access');
      callback({ error: -3 }); // ERR_ABORTED
    });
  }

  /**
   * Setup permission handlers
   */
  private setupPermissionHandlers(): void {
    const defaultSession = session.defaultSession;

    defaultSession.setPermissionRequestHandler((webContents: any, permission: any, callback: any, details: any) => {
      const origin = webContents.getURL();
      const allowed = this.permissionManager.checkPermission(permission, origin, details);
      
      console.log(`Permission ${permission} ${allowed ? 'granted' : 'denied'} for ${origin}`);
      callback(allowed);
    });

    defaultSession.setPermissionCheckHandler((webContents: any, permission: any, requestingOrigin: any) => {
      return this.permissionManager.checkPermission(permission, requestingOrigin);
    });
  }

  /**
   * Setup navigation security handlers
   */
  private setupNavigationHandlers(): void {
    app.on('web-contents-created', (event: any, contents: any) => {
      contents.on('will-navigate', (navigationEvent: any, navigationUrl: any) => {
        const origin = contents.getURL();
        
        if (!this.navigationManager.shouldAllowNavigation(navigationUrl, origin)) {
          navigationEvent.preventDefault();
        }
      });

      contents.setWindowOpenHandler(({ url }: any) => {
        if (this.navigationManager.shouldOpenExternal(url)) {
          shell.openExternal(url);
        }
        return { action: 'deny' };
      });

      // Block new window creation from renderer
      contents.on('new-window', (event: any, url: any) => {
        event.preventDefault();
        
        if (this.navigationManager.shouldOpenExternal(url)) {
          shell.openExternal(url);
        }
      });
    });
  }

  /**
   * Setup CSP violation handling
   */
  private setupCSPViolationHandling(): void {
    // This would require implementing a CSP violation endpoint
    // For now, we'll set up basic logging
    console.log('CSP violation handling configured');
  }

  /**
   * Setup app protocol for local file serving
   */
  private setupAppProtocol(): void {
    const { protocol } = session.defaultSession;

    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'app',
        privileges: {
          secure: true,
          standard: true,
          corsEnabled: false,
          supportFetchAPI: true,
        },
      },
    ]);
  }

  /**
   * Get security event summary
   */
  getSecuritySummary(): {
    cspViolations: number;
    permissionDenials: number;
    blockedNavigations: number;
    recentEvents: SecurityEvent[];
  } {
    const cspViolations = this.cspManager.getViolations();
    const permissionDenials = this.permissionManager.getPermissionLog();
    const blockedNavigations = this.navigationManager.getBlockedAttempts();

    const allEvents = [...cspViolations, ...permissionDenials, ...blockedNavigations]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 20);

    return {
      cspViolations: cspViolations.length,
      permissionDenials: permissionDenials.length,
      blockedNavigations: blockedNavigations.length,
      recentEvents: allEvents,
    };
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityPolicyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize managers with new config
    this.cspManager = new CSPManager(this.config);
    this.permissionManager = new PermissionManager(this.config);
    this.navigationManager = new NavigationSecurityManager(this.config);
  }

  /**
   * Export security configuration for debugging
   */
  exportConfig(): SecurityPolicyConfig {
    return { ...this.config };
  }
}

/**
 * Security policy presets for common use cases
 */
export class SecurityPolicyPresets {
  /**
   * Maximum security configuration
   */
  static getMaxSecurityConfig(): SecurityPolicyConfig {
    return {
      enableCSP: true,
      enableContextIsolation: true,
      enableNodeIntegration: false,
      allowInsecureContent: false,
      enableWebSecurity: true,
      enableSandbox: true,
      allowedProtocols: ['https:', 'file:', 'app:'],
      allowedDomains: [],
      customPermissions: {
        microphone: false,
        camera: false,
        geolocation: false,
        notifications: false,
      },
    };
  }

  /**
   * Development configuration (more permissive)
   */
  static getDevelopmentConfig(): SecurityPolicyConfig {
    return {
      enableCSP: true,
      enableContextIsolation: true,
      enableNodeIntegration: false,
      allowInsecureContent: false,
      enableWebSecurity: true,
      enableSandbox: false, // Easier debugging
      allowedProtocols: ['https:', 'http:', 'file:', 'app:', 'ws:', 'wss:'],
      allowedDomains: ['localhost', '127.0.0.1', '*.local'],
      customPermissions: {
        notifications: true,
      },
    };
  }

  /**
   * Wallet application specific configuration
   */
  static getWalletAppConfig(): SecurityPolicyConfig {
    return {
      enableCSP: true,
      enableContextIsolation: true,
      enableNodeIntegration: false,
      allowInsecureContent: false,
      enableWebSecurity: true,
      enableSandbox: true,
      allowedProtocols: ['https:', 'file:', 'app:'],
      allowedDomains: [
        'api.tari.com',
        'explorer.tari.com',
        'wallet.tari.com',
      ],
      customPermissions: {
        notifications: true,
        'clipboard-read': true,
        'clipboard-write': true,
      },
      customCSP: {
        'connect-src': "'self' https://api.tari.com https://explorer.tari.com wss://api.tari.com",
        'img-src': "'self' data: https://explorer.tari.com",
      },
    };
  }
}
