#!/usr/bin/env node

/**
 * Tari Console Wallet Example
 * 
 * An interactive command-line wallet application demonstrating
 * comprehensive Tari JavaScript SDK functionality.
 * 
 * Features:
 * - Interactive menu system
 * - Real-time transaction monitoring
 * - Balance and transaction history
 * - Fee estimation and address validation
 * - Multi-network support
 * - Secure storage integration
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import {
  TariWallet,
  NetworkType,
  createSecureStorage,
  PlatformDetector,
  TariError,
  ErrorCode,
  type Balance,
  type TransactionInfo,
  type WalletConfig
} from '@tari-project/tarijs-wallet';
import { loadNativeModuleForNetwork } from '@tari-project/tarijs-core';

// Console wallet configuration
interface ConsoleWalletConfig {
  network: NetworkType;
  storagePath: string;
  autoConnect: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

class ConsoleWallet {
  private wallet: TariWallet | null = null;
  private config: ConsoleWalletConfig;
  private isRunning = false;

  constructor(config: ConsoleWalletConfig) {
    this.config = config;
  }

  /**
   * Initialize and start the console wallet
   */
  async start(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Tari Console Wallet\n'));
    
    // Display platform information
    await this.showPlatformInfo();
    
    // Initialize wallet
    await this.initializeWallet();
    
    // Start interactive menu
    this.isRunning = true;
    await this.showMainMenu();
  }

  /**
   * Display platform and environment information
   */
  private async showPlatformInfo(): Promise<void> {
    const platform = PlatformDetector.detect();
    
    console.log(chalk.blue('Platform Information:'));
    console.log(`  • Runtime: ${platform.runtime}`);
    console.log(`  • Storage: ${platform.storage.primary}`);
    console.log(`  • Security Level: ${platform.securityLevel}`);
    console.log(`  • Node.js: ${process.version}`);
    
    if (platform.runtime === 'tauri') {
      console.log(chalk.green('  🦀 Tauri optimization active!'));
    }
    console.log();
  }

  /**
   * Initialize wallet with secure storage
   */
  private async initializeWallet(): Promise<void> {
    const spinner = ora('Initializing wallet...').start();
    
    try {
      // STEP 1: Load network-specific FFI binary
      spinner.text = 'Loading network-specific FFI binary...';
      await loadNativeModuleForNetwork(this.config.network);
      spinner.text = `FFI binary loaded for ${this.config.network}`;
      
      // STEP 2: Create secure storage
      spinner.text = 'Setting up secure storage...';
      const storage = await createSecureStorage({
        enableCaching: true,
        enableBatching: true,
        testBackends: true
      });
      
      spinner.text = 'Creating wallet...';
      
      // Create wallet configuration
      const walletConfig: WalletConfig = {
        network: this.config.network,
        storagePath: this.config.storagePath,
        logLevel: this.config.logLevel,
        storage: storage,
        autoConnect: this.config.autoConnect
      };
      
      // Check if wallet already exists
      const walletExists = await TariWallet.exists(this.config.storagePath);
      
      if (walletExists) {
        spinner.text = 'Loading existing wallet...';
        this.wallet = await TariWallet.load(walletConfig);
        spinner.succeed('Existing wallet loaded successfully');
      } else {
        spinner.text = 'Creating new wallet...';
        this.wallet = await TariWallet.create(walletConfig);
        spinner.succeed('New wallet created successfully');
        
        // Show new wallet information
        await this.showWalletInfo();
      }
      
      // Set up event listeners
      this.setupEventListeners();
      
    } catch (error) {
      spinner.fail('Failed to initialize wallet');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      
      // Enhanced error message for FFI issues
      if (error instanceof Error) {
        if (error.message.includes('FFI binary not found') || error.message.includes('native module')) {
          console.error(chalk.yellow('\n💡 Tip: Ensure network-specific FFI binaries are built:'));
          console.error(chalk.dim(`   npm run build:networks:${this.config.network.toLowerCase()}`));
          console.error(chalk.dim('   npm run setup:tari-source'));
        }
      }
      
      process.exit(1);
    }
  }

  /**
   * Set up wallet event listeners for real-time updates
   */
  private setupEventListeners(): void {
    if (!this.wallet) return;

    this.wallet.on('onTransactionReceived', (tx) => {
      console.log(chalk.green(`\n🎉 Received ${this.formatAmount(tx.amount)} T from ${tx.source.slice(0, 12)}...`));
    });

    this.wallet.on('onTransactionSent', (tx) => {
      console.log(chalk.blue(`\n💸 Sent ${this.formatAmount(tx.amount)} T to ${tx.destination.slice(0, 12)}...`));
    });

    this.wallet.on('onBalanceUpdated', (balance) => {
      console.log(chalk.yellow(`\n💰 Balance updated: ${this.formatAmount(balance.available)} T available`));
    });

    this.wallet.on('onConnectionStatusChanged', (status) => {
      const statusText = status.connected ? 'Connected' : 'Disconnected';
      const color = status.connected ? chalk.green : chalk.red;
      console.log(color(`\n🌐 Network: ${statusText}`));
    });

    this.wallet.on('onSyncProgress', (progress) => {
      if (progress.percentage % 10 === 0) { // Show every 10%
        console.log(chalk.cyan(`\n🔄 Sync: ${progress.percentage}% complete`));
      }
    });
  }

  /**
   * Show main interactive menu
   */
  private async showMainMenu(): Promise<void> {
    while (this.isRunning) {
      try {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { name: '💰 Check Balance', value: 'balance' },
              { name: '📍 Show Address', value: 'address' },
              { name: '💸 Send Transaction', value: 'send' },
              { name: '📋 Transaction History', value: 'history' },
              { name: '💵 Estimate Fees', value: 'fees' },
              { name: '✅ Validate Address', value: 'validate' },
              { name: '🔄 Sync Wallet', value: 'sync' },
              { name: '🌐 Network Status', value: 'status' },
              { name: '⚙️  Settings', value: 'settings' },
              { name: '🚪 Exit', value: 'exit' }
            ]
          }
        ]);

        switch (action) {
          case 'balance':
            await this.showBalance();
            break;
          case 'address':
            await this.showAddress();
            break;
          case 'send':
            await this.sendTransaction();
            break;
          case 'history':
            await this.showTransactionHistory();
            break;
          case 'fees':
            await this.estimateFees();
            break;
          case 'validate':
            await this.validateAddress();
            break;
          case 'sync':
            await this.syncWallet();
            break;
          case 'status':
            await this.showNetworkStatus();
            break;
          case 'settings':
            await this.showSettings();
            break;
          case 'exit':
            await this.exit();
            break;
        }
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        await this.pressEnterToContinue();
      }
    }
  }

  /**
   * Display current wallet balance
   */
  private async showBalance(): Promise<void> {
    const spinner = ora('Fetching balance...').start();
    
    try {
      const balance = await this.wallet!.getBalance();
      spinner.stop();
      
      console.log(chalk.blue.bold('\n💰 Wallet Balance:'));
      console.log(`  Available:     ${chalk.green(this.formatAmount(balance.available))} T`);
      console.log(`  Pending In:    ${chalk.yellow(this.formatAmount(balance.pendingIncoming))} T`);
      console.log(`  Pending Out:   ${chalk.red(this.formatAmount(balance.pendingOutgoing))} T`);
      console.log(`  Time Locked:   ${chalk.gray(this.formatAmount(balance.timelocked))} T`);
      console.log(`  Total:         ${chalk.cyan(this.formatAmount(balance.available + balance.pendingIncoming))} T`);
      
    } catch (error) {
      spinner.fail('Failed to fetch balance');
      this.handleError(error);
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Display wallet address information
   */
  private async showAddress(): Promise<void> {
    const spinner = ora('Getting wallet address...').start();
    
    try {
      const address = await this.wallet!.getAddress();
      spinner.stop();
      
      console.log(chalk.blue.bold('\n📍 Your Wallet Address:'));
      console.log(`  Base58: ${chalk.gray(address.toString())}`);
      console.log(`  Emoji:  ${address.toEmojiId()}`);
      
      // Show QR code suggestion
      console.log(chalk.dim('\n💡 Tip: Use the emoji format for easy sharing!'));
      
    } catch (error) {
      spinner.fail('Failed to get address');
      this.handleError(error);
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Send a transaction with interactive input
   */
  private async sendTransaction(): Promise<void> {
    try {
      // Check balance first
      const balance = await this.wallet!.getBalance();
      
      if (balance.available === 0n) {
        console.log(chalk.red('\n❌ No funds available for transactions'));
        console.log(chalk.dim('Get some testnet funds from the Tari Discord faucet!'));
        await this.pressEnterToContinue();
        return;
      }
      
      console.log(chalk.blue.bold('\n💸 Send Transaction'));
      console.log(`Available balance: ${this.formatAmount(balance.available)} T\n`);
      
      // Get transaction details
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'recipient',
          message: 'Recipient address (base58 or emoji):',
          validate: (input: string) => input.trim().length > 0 || 'Address is required'
        },
        {
          type: 'input',
          name: 'amount',
          message: 'Amount to send (in Tari):',
          validate: (input: string) => {
            const num = parseFloat(input);
            return (num > 0 && !isNaN(num)) || 'Please enter a valid amount';
          }
        },
        {
          type: 'input',
          name: 'message',
          message: 'Message (optional):',
          default: ''
        }
      ]);
      
      const amountMicroTari = BigInt(Math.floor(parseFloat(answers.amount) * 1_000_000));
      
      // Estimate fees
      const spinner = ora('Estimating fees...').start();
      
      try {
        const feeEstimate = await this.wallet!.estimateFee(amountMicroTari, {
          recipient: answers.recipient,
          message: answers.message
        });
        
        const totalCost = amountMicroTari + feeEstimate.fee;
        
        spinner.stop();
        
        console.log(chalk.blue('\n📊 Transaction Summary:'));
        console.log(`  Amount:       ${this.formatAmount(amountMicroTari)} T`);
        console.log(`  Fee:          ${this.formatAmount(feeEstimate.fee)} T`);
        console.log(`  Total Cost:   ${this.formatAmount(totalCost)} T`);
        console.log(`  Recipient:    ${answers.recipient.slice(0, 20)}...`);
        if (answers.message) {
          console.log(`  Message:      ${answers.message}`);
        }
        
        if (balance.available < totalCost) {
          console.log(chalk.red('\n❌ Insufficient funds for transaction + fees'));
          await this.pressEnterToContinue();
          return;
        }
        
        // Confirm transaction
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Send this transaction?',
            default: false
          }
        ]);
        
        if (!confirm) {
          console.log(chalk.yellow('Transaction cancelled'));
          await this.pressEnterToContinue();
          return;
        }
        
        // Send transaction
        const sendSpinner = ora('Sending transaction...').start();
        
        const txId = await this.wallet!.sendTransaction(
          answers.recipient,
          amountMicroTari,
          {
            message: answers.message,
            feePerGram: feeEstimate.feePerGram
          }
        );
        
        sendSpinner.succeed('Transaction sent successfully!');
        console.log(chalk.green(`\n✅ Transaction ID: ${txId.toString()}`));
        console.log(chalk.dim('Monitor the transaction status from the main menu'));
        
      } catch (error) {
        spinner.fail('Transaction failed');
        this.handleError(error);
      }
      
    } catch (error) {
      this.handleError(error);
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Show transaction history
   */
  private async showTransactionHistory(): Promise<void> {
    const spinner = ora('Fetching transaction history...').start();
    
    try {
      const transactions = await this.wallet!.getTransactionHistory({ limit: 20 });
      spinner.stop();
      
      if (transactions.length === 0) {
        console.log(chalk.yellow('\n📭 No transactions found'));
        await this.pressEnterToContinue();
        return;
      }
      
      console.log(chalk.blue.bold('\n📋 Recent Transactions:'));
      
      const tableData = [
        ['Type', 'Amount', 'Status', 'Date', 'ID']
      ];
      
      transactions.forEach(tx => {
        const type = tx.direction === 'inbound' ? '⬇️  In' : '⬆️  Out';
        const amount = this.formatAmount(tx.amount);
        const status = this.getStatusEmoji(tx.status);
        const date = new Date(tx.timestamp).toLocaleDateString();
        const id = tx.id.toString().slice(0, 8) + '...';
        
        tableData.push([type, `${amount} T`, status, date, id]);
      });
      
      console.log(table(tableData));
      
    } catch (error) {
      spinner.fail('Failed to fetch transaction history');
      this.handleError(error);
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Estimate fees for a transaction
   */
  private async estimateFees(): Promise<void> {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'amount',
          message: 'Amount to estimate fees for (in Tari):',
          validate: (input: string) => {
            const num = parseFloat(input);
            return (num > 0 && !isNaN(num)) || 'Please enter a valid amount';
          }
        }
      ]);
      
      const amountMicroTari = BigInt(Math.floor(parseFloat(answers.amount) * 1_000_000));
      
      const spinner = ora('Estimating fees...').start();
      
      const feeEstimate = await this.wallet!.estimateFee(amountMicroTari);
      
      spinner.stop();
      
      console.log(chalk.blue.bold('\n💵 Fee Estimation:'));
      console.log(`  Amount:           ${this.formatAmount(amountMicroTari)} T`);
      console.log(`  Estimated Fee:    ${this.formatAmount(feeEstimate.fee)} T`);
      console.log(`  Fee Per Gram:     ${feeEstimate.feePerGram} µT/gram`);
      console.log(`  Total Cost:       ${this.formatAmount(amountMicroTari + feeEstimate.fee)} T`);
      console.log(`  Fee Percentage:   ${((Number(feeEstimate.fee) / Number(amountMicroTari)) * 100).toFixed(4)}%`);
      
    } catch (error) {
      this.handleError(error);
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Validate a Tari address
   */
  private async validateAddress(): Promise<void> {
    const { address } = await inquirer.prompt([
      {
        type: 'input',
        name: 'address',
        message: 'Enter address to validate:',
        validate: (input: string) => input.trim().length > 0 || 'Address is required'
      }
    ]);
    
    const spinner = ora('Validating address...').start();
    
    try {
      const { TariAddress } = await import('@tari-project/tarijs-wallet');
      const parsedAddress = await TariAddress.fromString(address);
      
      spinner.succeed('Address is valid!');
      
      console.log(chalk.green.bold('\n✅ Valid Tari Address:'));
      console.log(`  Base58: ${parsedAddress.toString()}`);
      console.log(`  Emoji:  ${parsedAddress.toEmojiId()}`);
      console.log(`  Network: ${this.config.network}`);
      
    } catch (error) {
      spinner.fail('Address validation failed');
      console.log(chalk.red('\n❌ Invalid address format'));
      console.log(chalk.dim('Make sure you\'re using a valid base58 or emoji address'));
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Sync wallet with the network
   */
  private async syncWallet(): Promise<void> {
    const spinner = ora('Starting wallet sync...').start();
    
    try {
      await this.wallet!.sync();
      spinner.succeed('Wallet synchronized successfully!');
      
    } catch (error) {
      spinner.fail('Sync failed');
      this.handleError(error);
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Show network connection status
   */
  private async showNetworkStatus(): Promise<void> {
    const spinner = ora('Checking network status...').start();
    
    try {
      const status = await this.wallet!.getConnectionStatus();
      const networkInfo = await this.wallet!.getNetworkInfo();
      
      spinner.stop();
      
      console.log(chalk.blue.bold('\n🌐 Network Status:'));
      console.log(`  Connected:        ${status.connected ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`  Peer Count:       ${status.peerCount}`);
      console.log(`  Network:          ${this.config.network}`);
      console.log(`  Local Height:     ${networkInfo.localHeight}`);
      console.log(`  Network Height:   ${networkInfo.blockHeight}`);
      console.log(`  Sync Status:      ${networkInfo.localHeight === networkInfo.blockHeight ? chalk.green('Synced') : chalk.yellow('Syncing')}`);
      
    } catch (error) {
      spinner.fail('Failed to get network status');
      this.handleError(error);
    }
    
    await this.pressEnterToContinue();
  }

  /**
   * Show wallet settings and information
   */
  private async showSettings(): Promise<void> {
    console.log(chalk.blue.bold('\n⚙️  Wallet Settings:'));
    console.log(`  Network:          ${this.config.network}`);
    console.log(`  Storage Path:     ${this.config.storagePath}`);
    console.log(`  Log Level:        ${this.config.logLevel}`);
    console.log(`  Auto Connect:     ${this.config.autoConnect ? 'Yes' : 'No'}`);
    
    const platform = PlatformDetector.detect();
    console.log(`\n  Platform:         ${platform.runtime}`);
    console.log(`  Storage Backend:  ${platform.storage.primary}`);
    console.log(`  Security Level:   ${platform.securityLevel}`);
    
    await this.pressEnterToContinue();
  }

  /**
   * Show initial wallet information for new wallets
   */
  private async showWalletInfo(): Promise<void> {
    try {
      const address = await this.wallet!.getAddress();
      
      console.log(chalk.green.bold('\n🎉 Wallet Created Successfully!'));
      console.log('\n📍 Your wallet address:');
      console.log(`  ${address.toEmojiId()}`);
      console.log('\n💡 Important:');
      console.log('  • Save your seed words securely (shown only once)');
      console.log('  • Your emoji address is easier to share');
      console.log('  • Get testnet funds from the Tari Discord');
      console.log();
      
    } catch (error) {
      console.error('Failed to get wallet info:', error);
    }
  }

  /**
   * Helper method to format microTari amounts to Tari
   */
  private formatAmount(microTari: bigint): string {
    const tari = Number(microTari) / 1_000_000;
    return tari.toLocaleString(undefined, { 
      minimumFractionDigits: 6, 
      maximumFractionDigits: 6 
    });
  }

  /**
   * Get emoji for transaction status
   */
  private getStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'completed': return '✅ Completed';
      case 'pending': return '⏳ Pending';
      case 'broadcast': return '📡 Broadcast';
      case 'mined': return '⛏️  Mined';
      case 'failed': return '❌ Failed';
      case 'cancelled': return '🚫 Cancelled';
      default: return `🔄 ${status}`;
    }
  }

  /**
   * Handle and display errors appropriately
   */
  private handleError(error: unknown): void {
    if (error instanceof TariError) {
      switch (error.code) {
        case ErrorCode.InsufficientFunds:
          console.log(chalk.red('\n💰 Insufficient funds for this transaction'));
          break;
        case ErrorCode.InvalidAddress:
          console.log(chalk.red('\n📍 Invalid recipient address format'));
          break;
        case ErrorCode.NetworkError:
          console.log(chalk.red('\n🌐 Network connection error - check your internet'));
          break;
        default:
          console.log(chalk.red(`\n❌ Wallet error: ${error.message}`));
      }
    } else {
      console.log(chalk.red('\n❌ Unexpected error:'), error instanceof Error ? error.message : error);
    }
  }

  /**
   * Wait for user to press Enter
   */
  private async pressEnterToContinue(): Promise<void> {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...',
        default: ''
      }
    ]);
  }

  /**
   * Clean up and exit the application
   */
  private async exit(): Promise<void> {
    this.isRunning = false;
    
    const spinner = ora('Closing wallet...').start();
    
    try {
      if (this.wallet) {
        await this.wallet.destroy();
      }
      spinner.succeed('Wallet closed successfully');
      
    } catch (error) {
      spinner.fail('Error closing wallet');
      console.error(error);
    }
    
    console.log(chalk.cyan('\n👋 Thanks for using Tari Console Wallet!'));
    console.log(chalk.dim('Join us on Discord: https://discord.gg/tari\n'));
    
    process.exit(0);
  }
}

// CLI Program setup
const program = new Command();

program
  .name('tari-console-wallet')
  .description('Interactive console wallet for Tari cryptocurrency')
  .version('1.0.0');

program
  .option('-n, --network <network>', 'Network to use (mainnet, testnet, nextnet)', 'testnet')
  .option('-s, --storage-path <path>', 'Wallet storage path', './console-wallet-data')
  .option('-l, --log-level <level>', 'Log level (error, warn, info, debug)', 'info')
  .option('--no-auto-connect', 'Disable automatic network connection')
  .action(async (options) => {
    try {
      // Validate network
      const networkMap: Record<string, NetworkType> = {
        'mainnet': NetworkType.Mainnet,
        'testnet': NetworkType.Testnet,
        'nextnet': NetworkType.Nextnet
      };
      
      const network = networkMap[options.network.toLowerCase()];
      if (!network) {
        console.error(chalk.red('❌ Invalid network. Use: mainnet, testnet, or nextnet'));
        process.exit(1);
      }
      
      const config: ConsoleWalletConfig = {
        network,
        storagePath: options.storagePath,
        autoConnect: options.autoConnect,
        logLevel: options.logLevel
      };
      
      const wallet = new ConsoleWallet(config);
      await wallet.start();
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to start console wallet:'), error);
      process.exit(1);
    }
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
  process.exit(0);
});

// Run the program
program.parse();
