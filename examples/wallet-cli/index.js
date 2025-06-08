// Simple wallet CLI example using the new FFI-based SDK
// This demonstrates the mobile wallet pattern with direct FFI calls

const { 
  ffi, 
  withWallet,
  createTestnetWallet,
  formatBalance,
  parseBalance,
  Network,
  TariFFIError,
  validateSeedWords
} = require('@tari/sdk');

const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

class SimpleTariWallet {
  constructor() {
    this.walletHandle = null;
    this.seedWords = null;
  }

  async start() {
    console.clear();
    this.printHeader();
    
    try {
      await this.initialize();
      await this.mainMenu();
    } catch (error) {
      console.error(chalk.red('❌ Fatal error:'), error.message);
      if (error instanceof TariFFIError) {
        console.error(chalk.red(`   Error code: ${error.code}`));
      }
      process.exit(1);
    }
  }

  printHeader() {
    console.log(chalk.cyan.bold('┌─────────────────────────────────────────┐'));
    console.log(chalk.cyan.bold('│       Simple Tari Wallet CLI           │'));
    console.log(chalk.cyan.bold('│        (FFI-based SDK)                  │'));
    console.log(chalk.cyan.bold('└─────────────────────────────────────────┘'));
    console.log('');
  }

  async initialize() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🆕 Create new wallet', value: 'create' },
          { name: '🔄 Use existing seed words', value: 'seed' },
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);

    switch (action) {
      case 'create':
        await this.createNewWallet();
        break;
      case 'seed':
        await this.useExistingSeed();
        break;
      case 'exit':
        console.log(chalk.yellow('👋 Goodbye!'));
        process.exit(0);
        break;
    }
  }

  async createNewWallet() {
    // Generate new seed words (in real app, use crypto-secure generation)
    const seedWords = this.generateTestSeedWords();
    
    console.log(chalk.yellow('\n🔐 Generated new seed words:'));
    console.log(chalk.white.bold(seedWords));
    console.log(chalk.red.bold('\n⚠️  IMPORTANT: Write these down and keep them safe!'));
    console.log(chalk.red('    You will need them to recover your wallet.'));
    
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Have you safely stored your seed words?',
        default: false
      }
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('Please save your seed words before continuing.'));
      return this.initialize();
    }

    this.seedWords = seedWords;
  }

  async useExistingSeed() {
    const { seedWords } = await inquirer.prompt([
      {
        type: 'input',
        name: 'seedWords',
        message: 'Enter your seed words:',
        validate: (input) => {
          if (!input || !validateSeedWords(input)) {
            return 'Please enter valid seed words (12 or 24 words)';
          }
          return true;
        }
      }
    ]);

    this.seedWords = seedWords.trim();
  }

  async mainMenu() {
    // Create wallet with our seed words using the simple FFI approach
    await withWallet(
      {
        seedWords: this.seedWords,
        network: Network.Testnet,
        dbPath: './wallet-data',
        dbName: 'cli_wallet'
      },
      async (walletHandle) => {
        this.walletHandle = walletHandle;
        console.log(chalk.green('\n✅ Wallet loaded successfully!'));
        
        await this.showMainMenu();
      }
    );
  }

  async showMainMenu() {
    while (true) {
      try {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { name: '💰 Check balance', value: 'balance' },
              { name: '📍 Show receive address', value: 'address' },
              { name: '📤 Send transaction', value: 'send' },
              { name: '📜 Show transactions', value: 'transactions' },
              { name: '👥 Contact management', value: 'contacts' },
              { name: '🔄 Refresh data', value: 'refresh' },
              { name: '❌ Exit', value: 'exit' }
            ]
          }
        ]);

        await this.handleAction(action);
        
        if (action === 'exit') {
          break;
        }

        // Wait for user to continue
        await inquirer.prompt([
          {
            type: 'input',
            name: 'continue',
            message: 'Press Enter to continue...'
          }
        ]);

      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
      }
    }
  }

  async handleAction(action) {
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
      case 'transactions':
        await this.showTransactions();
        break;
      case 'contacts':
        await this.manageContacts();
        break;
      case 'refresh':
        console.log(chalk.blue('🔄 Data refreshed'));
        break;
      case 'exit':
        console.log(chalk.yellow('👋 Goodbye!'));
        break;
    }
  }

  async showBalance() {
    console.log(chalk.blue('\n💰 Checking balance...'));
    
    const balance = ffi.getBalance(this.walletHandle);
    
    const table = new Table({
      head: ['Type', 'Amount (µT)', 'Amount (T)'],
      colWidths: [15, 20, 15]
    });

    table.push(
      ['Available', balance.available.toString(), formatBalance(balance.available)],
      ['Pending', balance.pending.toString(), formatBalance(balance.pending)],
      ['Locked', balance.locked.toString(), formatBalance(balance.locked)],
      ['Total', balance.total.toString(), formatBalance(balance.total)]
    );

    console.log(table.toString());
  }

  async showAddress() {
    console.log(chalk.blue('\n📍 Your receive address:'));
    
    const addressInfo = ffi.getAddress(this.walletHandle);
    
    console.log(chalk.white.bold(`\n${addressInfo.emojiId}\n`));
    
    const { showQR } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'showQR',
        message: 'Show QR code?',
        default: false
      }
    ]);

    if (showQR) {
      console.log('\n📱 QR Code:');
      qrcode.generate(addressInfo.emojiId, { small: true });
    }
  }

  async sendTransaction() {
    console.log(chalk.blue('\n📤 Send Transaction'));
    
    // Check balance first
    const balance = ffi.getBalance(this.walletHandle);
    if (balance.available === BigInt(0)) {
      console.log(chalk.red('❌ No funds available to send'));
      return;
    }
    
    console.log(chalk.white(`Available balance: ${formatBalance(balance.available)}`));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'destination',
        message: 'Destination address:',
        validate: (input) => input ? true : 'Please enter a destination address'
      },
      {
        type: 'input',
        name: 'amount',
        message: 'Amount to send (in Tari):',
        validate: (input) => {
          try {
            const amount = parseBalance(input);
            if (amount <= BigInt(0)) {
              return 'Amount must be greater than 0';
            }
            if (amount > balance.available) {
              return 'Insufficient balance';
            }
            return true;
          } catch {
            return 'Please enter a valid amount';
          }
        }
      },
      {
        type: 'input',
        name: 'message',
        message: 'Message (optional):',
        default: ''
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Confirm transaction?',
        default: false
      }
    ]);

    if (!answers.confirm) {
      console.log(chalk.yellow('Transaction cancelled'));
      return;
    }

    try {
      console.log(chalk.blue('📡 Sending transaction...'));
      
      const txId = ffi.sendTransaction(this.walletHandle, {
        destination: answers.destination,
        amount: parseBalance(answers.amount),
        message: answers.message,
        feePerGram: BigInt(5) // Standard fee
      });

      console.log(chalk.green(`✅ Transaction sent successfully!`));
      console.log(chalk.white(`Transaction ID: ${txId}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Transaction failed:'), error.message);
    }
  }

  async showTransactions() {
    console.log(chalk.blue('\n📜 Transaction History'));
    
    try {
      const completed = ffi.getCompletedTransactions(this.walletHandle);
      const pendingIn = ffi.getPendingInboundTransactions(this.walletHandle);
      const pendingOut = ffi.getPendingOutboundTransactions(this.walletHandle);
      
      if (completed.length === 0 && pendingIn.length === 0 && pendingOut.length === 0) {
        console.log(chalk.yellow('No transactions found'));
        return;
      }

      // Show completed transactions
      if (completed.length > 0) {
        console.log(chalk.white.bold('\n✅ Completed Transactions:'));
        const table = new Table({
          head: ['Type', 'Amount', 'Status', 'Date', 'Message'],
          colWidths: [8, 15, 12, 20, 20]
        });

        completed.slice(-10).forEach(tx => { // Show last 10
          table.push([
            tx.isOutbound ? 'OUT' : 'IN',
            formatBalance(tx.amount),
            'Confirmed',
            tx.timestamp.toLocaleString(),
            tx.message || ''
          ]);
        });

        console.log(table.toString());
      }

      // Show pending transactions
      if (pendingIn.length > 0 || pendingOut.length > 0) {
        console.log(chalk.white.bold('\n⏳ Pending Transactions:'));
        const pendingTable = new Table({
          head: ['Type', 'Amount', 'Status', 'Date', 'Message'],
          colWidths: [8, 15, 12, 20, 20]
        });

        [...pendingIn, ...pendingOut].forEach(tx => {
          pendingTable.push([
            tx.isOutbound ? 'OUT' : 'IN',
            formatBalance(tx.amount),
            'Pending',
            tx.timestamp.toLocaleString(),
            tx.message || ''
          ]);
        });

        console.log(pendingTable.toString());
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to load transactions:'), error.message);
    }
  }

  async manageContacts() {
    console.log(chalk.blue('\n👥 Contact Management'));
    
    try {
      const contacts = ffi.getContacts(this.walletHandle);
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📋 View contacts', value: 'view' },
            { name: '➕ Add contact', value: 'add' },
            { name: '🗑️  Remove contact', value: 'remove' },
            { name: '🔙 Back to main menu', value: 'back' }
          ]
        }
      ]);

      switch (action) {
        case 'view':
          if (contacts.length === 0) {
            console.log(chalk.yellow('No contacts found'));
          } else {
            const table = new Table({
              head: ['Alias', 'Address', 'Favorite'],
              colWidths: [15, 50, 10]
            });
            
            contacts.forEach(contact => {
              table.push([
                contact.alias,
                contact.address,
                contact.isFavorite ? '⭐' : ''
              ]);
            });
            
            console.log(table.toString());
          }
          break;

        case 'add':
          const newContact = await inquirer.prompt([
            {
              type: 'input',
              name: 'alias',
              message: 'Contact name:',
              validate: input => input ? true : 'Please enter a name'
            },
            {
              type: 'input',
              name: 'address',
              message: 'Contact address:',
              validate: input => input ? true : 'Please enter an address'
            }
          ]);

          const success = ffi.upsertContact(this.walletHandle, {
            alias: newContact.alias,
            address: newContact.address,
            isFavorite: false
          });

          if (success) {
            console.log(chalk.green('✅ Contact added successfully'));
          } else {
            console.log(chalk.red('❌ Failed to add contact'));
          }
          break;

        case 'remove':
          if (contacts.length === 0) {
            console.log(chalk.yellow('No contacts to remove'));
            break;
          }

          const { contactToRemove } = await inquirer.prompt([
            {
              type: 'list',
              name: 'contactToRemove',
              message: 'Which contact would you like to remove?',
              choices: contacts.map(c => ({ name: `${c.alias} (${c.address})`, value: c }))
            }
          ]);

          const removed = ffi.removeContact(this.walletHandle, contactToRemove);
          if (removed) {
            console.log(chalk.green('✅ Contact removed'));
          } else {
            console.log(chalk.red('❌ Failed to remove contact'));
          }
          break;
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Contact management error:'), error.message);
    }
  }

  generateTestSeedWords() {
    // Generate deterministic test seed words for demo
    return [
      'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
      'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
      'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
      'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'art'
    ].join(' ');
  }
}

// Start the wallet CLI
const walletCLI = new SimpleTariWallet();
walletCLI.start().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
