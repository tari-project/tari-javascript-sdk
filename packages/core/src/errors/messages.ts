/**
 * @fileoverview Developer-friendly error messages and formatting
 * 
 * Provides enhanced error messages with actionable suggestions, documentation
 * links, and context-aware formatting for better developer experience.
 */

import { WalletError, ErrorSeverity } from './wallet-error';
import { WalletErrorCode, ErrorCategory } from './codes';

/**
 * Environment modes for error message formatting
 */
export enum MessageMode {
  Production = 'production',
  Development = 'development',
  Debug = 'debug',
}

/**
 * Error suggestion interface
 */
export interface ErrorSuggestion {
  /** Primary action to take */
  action: string;
  /** Detailed explanation */
  explanation?: string;
  /** Code example if applicable */
  codeExample?: string;
  /** Documentation link */
  docsUrl?: string;
  /** Related error codes */
  relatedCodes?: WalletErrorCode[];
  /** Troubleshooting steps */
  troubleshooting?: string[];
}

/**
 * Enhanced error message information
 */
export interface EnhancedErrorMessage {
  /** Primary error message */
  message: string;
  /** Suggested actions */
  suggestions: ErrorSuggestion[];
  /** Severity indicator */
  severity: ErrorSeverity;
  /** Category */
  category: ErrorCategory;
  /** Whether this is recoverable */
  recoverable: boolean;
  /** Additional context */
  additionalInfo?: string;
  /** Troubleshooting steps */
  troubleshooting?: string[];
  /** Common causes */
  commonCauses?: string[];
}

/**
 * Error message formatter class
 */
export class ErrorMessageFormatter {
  private mode: MessageMode = MessageMode.Production;
  private baseDocsUrl = 'https://docs.tari.com/sdk/javascript/errors';

  constructor(mode: MessageMode = MessageMode.Production) {
    this.mode = mode;
  }

  /**
   * Set the message formatting mode
   */
  setMode(mode: MessageMode): void {
    this.mode = mode;
  }

  /**
   * Format an error for display
   */
  format(error: WalletError): string {
    const enhanced = this.enhance(error);
    
    switch (this.mode) {
      case MessageMode.Debug:
        return this.formatDebugMessage(error, enhanced);
      case MessageMode.Development:
        return this.formatDevelopmentMessage(error, enhanced);
      case MessageMode.Production:
      default:
        return this.formatProductionMessage(error, enhanced);
    }
  }

  /**
   * Enhance error with additional information
   */
  enhance(error: WalletError): EnhancedErrorMessage {
    const suggestions = this.getSuggestions(error.code);
    const additionalInfo = this.getAdditionalInfo(error);
    const troubleshooting = this.getTroubleshootingSteps(error.code);
    const commonCauses = this.getCommonCauses(error.code);

    return {
      message: error.message,
      suggestions,
      severity: error.severity,
      category: error.category,
      recoverable: error.recoverable,
      additionalInfo,
      troubleshooting,
      commonCauses,
    };
  }

  /**
   * Get actionable suggestions for an error code
   */
  private getSuggestions(code: WalletErrorCode): ErrorSuggestion[] {
    const suggestions: Partial<Record<WalletErrorCode, ErrorSuggestion[]>> = {
      [WalletErrorCode.InvalidConfig]: [
        {
          action: 'Verify wallet configuration',
          explanation: 'Check that all required configuration fields are provided and valid',
          codeExample: `const config = {
  network: 'testnet',
  storagePath: './wallet-data',
  // ... other required fields
};`,
          docsUrl: `${this.baseDocsUrl}/configuration`,
        },
      ],

      [WalletErrorCode.WalletNotFound]: [
        {
          action: 'Create a new wallet or check the storage path',
          explanation: 'The wallet file does not exist at the specified location',
          codeExample: `// Create a new wallet
const wallet = await TariWallet.create(config);

// Or check if file exists at storagePath`,
          docsUrl: `${this.baseDocsUrl}/wallet-creation`,
        },
      ],

      [WalletErrorCode.InsufficientFunds]: [
        {
          action: 'Check wallet balance before sending',
          explanation: 'The wallet does not have enough funds for this transaction',
          codeExample: `const balance = await wallet.getBalance();
if (balance.available >= amount + estimatedFee) {
  // Proceed with transaction
}`,
          docsUrl: `${this.baseDocsUrl}/balance-checks`,
        },
      ],

      [WalletErrorCode.InvalidAddress]: [
        {
          action: 'Validate the recipient address format',
          explanation: 'Tari addresses can be emoji IDs (33 emojis), base58, or hex format',
          codeExample: `// Valid address formats:
// Emoji: 🦄🌟⭐🎁🎯🎪🎨🎭🎪🦄🌟⭐🎁🎯🎪🎨🎭🎪🦄🌟⭐🎁🎯🎪🎨🎭🎪🦄🌟⭐🎁🎯🎪
// Base58: 7XiHa...
// Hex: a1b2c3...`,
          docsUrl: `${this.baseDocsUrl}/address-formats`,
        },
      ],

      [WalletErrorCode.NetworkUnavailable]: [
        {
          action: 'Check network connection and base node availability',
          explanation: 'The wallet cannot connect to the Tari network',
          codeExample: `// Configure base node
await wallet.setBaseNode({
  publicKey: 'your-base-node-key',
  address: 'your-base-node-address'
});`,
          docsUrl: `${this.baseDocsUrl}/network-connection`,
        },
      ],

      [WalletErrorCode.DatabaseLocked]: [
        {
          action: 'Ensure no other wallet instances are running',
          explanation: 'The wallet database is locked by another process',
          codeExample: `// Properly close wallet instances
await wallet.destroy();

// Or check for other running processes`,
          docsUrl: `${this.baseDocsUrl}/database-issues`,
        },
      ],

      [WalletErrorCode.TransactionFailed]: [
        {
          action: 'Check transaction details and network status',
          explanation: 'The transaction could not be completed',
          codeExample: `// Retry with proper error handling
try {
  const txId = await wallet.sendTransaction(address, amount);
} catch (error) {
  if (error.recoverable) {
    // Retry logic here
  }
}`,
          docsUrl: `${this.baseDocsUrl}/transaction-handling`,
        },
      ],

      [WalletErrorCode.FFICallFailed]: [
        {
          action: 'Check FFI bindings and native module installation',
          explanation: 'The native Tari library call failed',
          troubleshooting: [
            'Ensure native modules are properly compiled',
            'Check that all dependencies are installed',
            'Verify platform compatibility',
          ],
          docsUrl: `${this.baseDocsUrl}/ffi-troubleshooting`,
        },
      ],

      [WalletErrorCode.InvalidAmount]: [
        {
          action: 'Provide a valid positive amount in microTari',
          explanation: 'Transaction amounts must be positive integers in microTari units',
          codeExample: `// Valid amount formats:
const amount = BigInt('1000000'); // 1 Tari = 1,000,000 microTari
// or
const amount = '1000000'; // String representation`,
          docsUrl: `${this.baseDocsUrl}/amount-formats`,
        },
      ],

      [WalletErrorCode.InvalidFormat]: [
        {
          action: 'Verify seed words are from BIP39 word list',
          explanation: 'Seed words must be exactly 24 valid BIP39 words',
          codeExample: `const seedWords = [
  'abandon', 'ability', 'able', // ... 24 words total
];`,
          docsUrl: `${this.baseDocsUrl}/seed-words`,
        },
      ],
    };

    return suggestions[code] || [
      {
        action: 'Check the error code documentation',
        explanation: `No specific guidance available for error code ${code}`,
        docsUrl: `${this.baseDocsUrl}/${code}`,
      },
    ];
  }

  /**
   * Get additional contextual information
   */
  private getAdditionalInfo(error: WalletError): string | undefined {
    const context = error.context;
    if (!context) return undefined;

    const parts: string[] = [];

    if (context.operation) {
      parts.push(`Operation: ${context.operation}`);
    }

    if (context.network) {
      parts.push(`Network: ${context.network}`);
    }

    if (context.component) {
      parts.push(`Component: ${context.component}`);
    }

    if (context.transactionId) {
      parts.push(`Transaction: ${context.transactionId}`);
    }

    return parts.length > 0 ? parts.join(' | ') : undefined;
  }

  /**
   * Get troubleshooting steps for an error code
   */
  private getTroubleshootingSteps(code: WalletErrorCode): string[] {
    const troubleshooting: Partial<Record<WalletErrorCode, string[]>> = {
      [WalletErrorCode.NetworkUnavailable]: [
        'Check internet connection',
        'Verify base node configuration',
        'Try a different base node',
        'Check firewall settings',
        'Ensure ports are not blocked',
      ],

      [WalletErrorCode.DatabaseLocked]: [
        'Close any other wallet instances',
        'Check for zombie processes',
        'Remove lock files manually if safe',
        'Restart the application',
      ],

      [WalletErrorCode.FFICallFailed]: [
        'Reinstall native dependencies',
        'Check Node.js version compatibility',
        'Verify platform-specific requirements',
        'Clear node_modules and reinstall',
      ],

      [WalletErrorCode.InsufficientFunds]: [
        'Check current wallet balance',
        'Verify pending transactions',
        'Account for transaction fees',
        'Wait for incoming transactions to confirm',
      ],

      [WalletErrorCode.InvalidAddress]: [
        'Verify address format (emoji, base58, or hex)',
        'Check for typos in the address',
        'Ensure address is for the correct network',
        'Validate address length',
      ],
    };

    return troubleshooting[code] || [
      'Check error details for specific guidance',
      'Consult documentation',
      'Enable debug logging for more information',
    ];
  }

  /**
   * Get common causes for an error code
   */
  private getCommonCauses(code: WalletErrorCode): string[] {
    const causes: Partial<Record<WalletErrorCode, string[]>> = {
      [WalletErrorCode.NetworkUnavailable]: [
        'No internet connection',
        'Base node is offline',
        'Firewall blocking connections',
        'Network configuration issues',
      ],

      [WalletErrorCode.InvalidAddress]: [
        'Mistyped address',
        'Wrong address format',
        'Address for different network',
        'Corrupted address data',
      ],

      [WalletErrorCode.InsufficientFunds]: [
        'Not enough available balance',
        'Forgetting to account for fees',
        'Pending outgoing transactions',
        'Incorrect balance calculation',
      ],

      [WalletErrorCode.DatabaseLocked]: [
        'Multiple wallet instances running',
        'Previous process crashed without cleanup',
        'Permission issues with database file',
        'Database corruption',
      ],
    };

    return causes[code] || ['Unknown or uncommon error condition'];
  }

  /**
   * Format error message for production
   */
  private formatProductionMessage(error: WalletError, enhanced: EnhancedErrorMessage): string {
    return `${enhanced.message} (${error.code})`;
  }

  /**
   * Format error message for development
   */
  private formatDevelopmentMessage(error: WalletError, enhanced: EnhancedErrorMessage): string {
    const parts = [
      `[${error.code}] ${enhanced.category}: ${enhanced.message}`,
    ];

    if (enhanced.recoverable) {
      parts.push('(Recoverable)');
    }

    if (enhanced.additionalInfo) {
      parts.push(`\n📍 ${enhanced.additionalInfo}`);
    }

    if (enhanced.suggestions.length > 0) {
      const suggestion = enhanced.suggestions[0];
      parts.push(`\n💡 ${suggestion.action}`);
      
      if (suggestion.explanation) {
        parts.push(`   ${suggestion.explanation}`);
      }

      if (suggestion.docsUrl) {
        parts.push(`   📚 ${suggestion.docsUrl}`);
      }
    }

    return parts.join('');
  }

  /**
   * Format error message for debug mode
   */
  private formatDebugMessage(error: WalletError, enhanced: EnhancedErrorMessage): string {
    const sections = [
      `🚨 [${error.code}] ${enhanced.category} Error (${enhanced.severity})`,
      `Message: ${enhanced.message}`,
      enhanced.recoverable ? '✅ Recoverable' : '❌ Not Recoverable',
    ];

    if (enhanced.additionalInfo) {
      sections.push(`Context: ${enhanced.additionalInfo}`);
    }

    if (enhanced.commonCauses && enhanced.commonCauses.length > 0) {
      sections.push('Common Causes:');
      enhanced.commonCauses.forEach(cause => {
        sections.push(`  • ${cause}`);
      });
    }

    if (enhanced.suggestions.length > 0) {
      sections.push('Suggestions:');
      enhanced.suggestions.forEach(suggestion => {
        sections.push(`  💡 ${suggestion.action}`);
        if (suggestion.explanation) {
          sections.push(`     ${suggestion.explanation}`);
        }
        if (suggestion.codeExample) {
          sections.push(`     Example:\n${suggestion.codeExample.split('\n').map(line => `       ${line}`).join('\n')}`);
        }
        if (suggestion.docsUrl) {
          sections.push(`     📚 ${suggestion.docsUrl}`);
        }
      });
    }

    if (enhanced.troubleshooting && enhanced.troubleshooting.length > 0) {
      sections.push('Troubleshooting:');
      enhanced.troubleshooting.forEach(step => {
        sections.push(`  🔧 ${step}`);
      });
    }

    if (error.stack) {
      sections.push(`Stack Trace:\n${error.stack}`);
    }

    return sections.join('\n');
  }

  /**
   * Get documentation URL for an error code
   */
  getDocsUrl(code: WalletErrorCode): string {
    return `${this.baseDocsUrl}/${code}`;
  }

  /**
   * Check if running in development mode
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
  }

  /**
   * Check if debug mode is enabled
   */
  static isDebug(): boolean {
    return process.env.DEBUG === 'true' || process.env.TARI_DEBUG === 'true';
  }

  /**
   * Get appropriate message mode based on environment
   */
  static getMessageMode(): MessageMode {
    if (ErrorMessageFormatter.isDebug()) {
      return MessageMode.Debug;
    } else if (ErrorMessageFormatter.isDevelopment()) {
      return MessageMode.Development;
    } else {
      return MessageMode.Production;
    }
  }
}

/**
 * Global error message formatter
 */
export const errorFormatter = new ErrorMessageFormatter(ErrorMessageFormatter.getMessageMode());

/**
 * Format an error for display
 */
export function formatError(error: WalletError): string {
  return errorFormatter.format(error);
}

/**
 * Format an error with specific mode
 */
export function formatErrorWithMode(error: WalletError, mode: MessageMode): string {
  const formatter = new ErrorMessageFormatter(mode);
  return formatter.format(error);
}

/**
 * Get enhanced error information
 */
export function getErrorInfo(error: WalletError): EnhancedErrorMessage {
  return errorFormatter.enhance(error);
}

/**
 * Get documentation URL for an error code
 */
export function getErrorDocsUrl(code: WalletErrorCode): string {
  return errorFormatter.getDocsUrl(code);
}

/**
 * Create a user-friendly error summary
 */
export function createErrorSummary(error: WalletError): {
  title: string;
  description: string;
  action: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  docsUrl: string;
} {
  const enhanced = errorFormatter.enhance(error);
  const primarySuggestion = enhanced.suggestions[0];

  return {
    title: `${enhanced.category} Error`,
    description: enhanced.message,
    action: primarySuggestion?.action || 'Check error documentation',
    severity: enhanced.severity,
    recoverable: enhanced.recoverable,
    docsUrl: primarySuggestion?.docsUrl || errorFormatter.getDocsUrl(error.code),
  };
}

/**
 * Console logging helpers with formatted messages
 */
export const ErrorLogger = {
  /**
   * Log error to console with formatting
   */
  log(error: WalletError): void {
    const formatted = formatError(error);
    
    switch (error.severity) {
      case ErrorSeverity.Critical:
        console.error('🔥', formatted);
        break;
      case ErrorSeverity.Error:
        console.error('❌', formatted);
        break;
      case ErrorSeverity.Warning:
        console.warn('⚠️', formatted);
        break;
      case ErrorSeverity.Info:
        console.info('ℹ️', formatted);
        break;
      default:
        console.log('📝', formatted);
    }
  },

  /**
   * Log error with additional context
   */
  logWithContext(error: WalletError, additionalContext?: Record<string, unknown>): void {
    this.log(error);
    
    if (additionalContext && Object.keys(additionalContext).length > 0) {
      console.log('Additional Context:', additionalContext);
    }
  },

  /**
   * Log error summary only
   */
  logSummary(error: WalletError): void {
    const summary = createErrorSummary(error);
    console.error(`${summary.title}: ${summary.description}`);
    
    if (summary.action) {
      console.log(`💡 Suggestion: ${summary.action}`);
    }
    
    if (summary.docsUrl) {
      console.log(`📚 Documentation: ${summary.docsUrl}`);
    }
  },
};
