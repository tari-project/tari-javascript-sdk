const { TariWallet, Network, formatTari, parseTari, validateAddress, generateSeedWords } = require('@tari/wallet');
const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

class TariWalletCLI {
  constructor() {
    this.wallet = null;
    this.isConnected = false;
    this.transactions = [];
    this.addressBook = new Map();
  }

  async start() {
    console.clear();
    this.printHeader();
    
    try {
      await this.initialize();
      await this.mainMenu();
    } catch (error) {
      console.error(chalk.red('❌ Fatal error:'), error.message);
      process.exit(1);
    }
  }

  printHeader() {
    console.log(chalk.cyan.bold('┌─────────────────────────────────────────┐'));
    console.log(chalk.cyan.bold('│           Tari Wallet CLI               │'));
    console.log(chalk.cyan.bold('│         Example Application             │'));
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
          { name: '🔓 Open existing wallet', value: 'open' },
          { name: '🔄 Recover wallet from seed', value: 'recover' },
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);

    switch (action) {
      case 'create':
        await this.createWallet();
        break;
      case 'open':
        await this.openWallet();
        break;
      case 'recover':
        await this.recoverWallet();
        break;
      case 'exit':
        console.log(chalk.yellow('👋 Goodbye!'));
        process.exit(0);
    }
  }

  async createWallet() {
    console.log(chalk.blue('\n🆕 Creating new wallet...\n'));

    const { network } = await inquirer.prompt([
      {
        type: 'list',
        name: 'network',
        message: 'Select network:',
        choices: [
          { name: '🧪 Testnet (recommended for testing)', value: Network.Testnet },
          { name: '🌍 Mainnet (real money!)', value: Network.Mainnet }
        ]
      }
    ]);

    const seedWords = generateSeedWords();
    
    console.log(chalk.yellow('\n🔐 Your wallet seed words (KEEP THESE SAFE!):'));
    console.log(chalk.white.bgRed.bold(` ${seedWords} `));
    console.log('');

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Have you written down your seed words in a safe place?',
        default: false
      }
    ]);

    if (!confirmed) {
      console.log(chalk.red('❌ Please write down your seed words before continuing.'));
      return this.initialize();
    }

    await this.connectWallet(network, seedWords);
  }

  async openWallet() {
    const { seedWords, network } = await this.promptForWalletDetails();
    await this.connectWallet(network, seedWords);
  }

  async recoverWallet() {
    console.log(chalk.blue('\n🔄 Recovering wallet from seed words...\n'));
    
    const { seedWords, network } = await this.promptForWalletDetails();
    
    console.log(chalk.yellow('🔍 Scanning for transactions (this may take a while)...'));
    await this.connectWallet(network, seedWords, true);
  }

  async promptForWalletDetails() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'seedWords',
        message: 'Enter your 24-word seed phrase:',
        validate: (input) => {
          const words = input.trim().split(/\s+/);
          return words.length === 24 ? true : 'Please enter exactly 24 words';
        }
      },
      {
        type: 'list',
        name: 'network',
        message: 'Select network:',
        choices: [
          { name: '🧪 Testnet', value: Network.Testnet },
          { name: '🌍 Mainnet', value: Network.Mainnet }
        ]
      }
    ]);

    return answers;
  }

  async connectWallet(network, seedWords, recover = false) {
    try {
      console.log(chalk.blue('\n📡 Connecting to Tari network...'));
      
      this.wallet = TariWallet.builder()
        .network(network)
        .seedWords(seedWords)
        .dataDirectory('./cli-wallet-data')
        .build();

      await this.wallet.connect();
      this.isConnected = true;

      if (recover) {
        console.log(chalk.yellow('🔍 Scanning for transactions...'));
        // In a real implementation, we'd call wallet.scanForUtxos()
      }

      console.log(chalk.green('✅ Connected successfully!'));
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Show initial wallet info
      await this.showWalletInfo();

    } catch (error) {
      console.error(chalk.red('❌ Failed to connect:'), error.message);
      await this.initialize();
    }
  }

  setupEventListeners() {
    this.wallet.on('transaction-received', (tx) => {
      console.log(chalk.green(`\n💰 Incoming transaction: ${formatTari(tx.amount)}`));
      console.log(chalk.gray(`   TX ID: ${tx.id}`));
      this.transactions.unshift(tx);
    });

    this.wallet.on('transaction-confirmed', (tx) => {
      console.log(chalk.green(`✅ Transaction confirmed: ${tx.id}`));
    });

    this.wallet.on('balance-updated', (balance) => {
      console.log(chalk.blue(`💼 Balance updated: ${formatTari(balance.available)} available`));
    });
  }

  async showWalletInfo() {
    console.log('');
    const address = this.wallet.getReceiveAddress();
    const balance = await this.wallet.getBalance();

    const table = new Table({
      head: [chalk.cyan.bold('Wallet Information'), chalk.cyan.bold('Value')],
      style: { head: [], border: [] }
    });

    table.push(
      ['Address', address.substring(0, 40) + '...'],
      ['Available Balance', chalk.green(formatTari(balance.available))],
      ['Pending Balance', chalk.yellow(formatTari(balance.pending))],
      ['Total Balance', chalk.blue(formatTari(balance.total))]
    );

    console.log(table.toString());
    console.log('');
  }

  async mainMenu() {
    while (this.isConnected) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '💰 Check balance', value: 'balance' },
            { name: '📤 Send transaction', value: 'send' },
            { name: '📥 Show receive address', value: 'receive' },
            { name: '📜 Transaction history', value: 'history' },
            { name: '📖 Address book', value: 'addressbook' },
            { name: '⚙️  Settings', value: 'settings' },
            { name: '❌ Exit', value: 'exit' }
          ]
        }
      ]);

      try {
        switch (action) {
          case 'balance':
            await this.showBalance();
            break;
          case 'send':
            await this.sendTransaction();
            break;
          case 'receive':
            await this.showReceiveAddress();
            break;
          case 'history':
            await this.showTransactionHistory();
            break;
          case 'addressbook':
            await this.manageAddressBook();
            break;
          case 'settings':
            await this.showSettings();
            break;
          case 'exit':
            await this.exit();
            return;
        }
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error.message);
        console.log('');
      }
    }
  }

  async showBalance() {
    console.log(chalk.blue('\n💰 Checking balance...'));
    
    const balance = await this.wallet.getBalance();
    
    const table = new Table({
      head: [chalk.cyan.bold('Balance Type'), chalk.cyan.bold('Amount')],
      style: { head: [], border: [] }
    });

    table.push(
      ['Available (spendable)', chalk.green(formatTari(balance.available))],
      ['Pending (incoming)', chalk.yellow(formatTari(balance.pending))],
      ['Locked (staked/time-locked)', chalk.red(formatTari(balance.locked))],
      ['Total', chalk.blue.bold(formatTari(balance.total))]
    );

    console.log(table.toString());
    console.log('');
  }

  async sendTransaction() {
    console.log(chalk.blue('\n📤 Send Transaction\n'));

    // Check balance first
    const balance = await this.wallet.getBalance();
    if (balance.available === 0n) {
      console.log(chalk.red('❌ No funds available to send'));
      return;
    }

    console.log(chalk.gray(`Available balance: ${formatTari(balance.available)}`));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'destination',
        message: 'Destination address (or address book name):',
        validate: (input) => {
          if (this.addressBook.has(input)) return true;
          return validateAddress(input) ? true : 'Invalid Tari address format';
        }
      },
      {
        type: 'input',
        name: 'amount',
        message: 'Amount to send (XTR):',
        validate: (input) => {
          try {
            const amount = parseTari(input);
            if (amount <= 0n) return 'Amount must be greater than 0';
            if (amount > balance.available) return 'Insufficient balance';
            return true;
          } catch {
            return 'Invalid amount format';
          }
        }
      },
      {
        type: 'input',
        name: 'message',
        message: 'Message (optional):'
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: (answers) => `Send ${answers.amount} XTR to ${answers.destination}?`,
        default: false
      }
    ]);

    if (!answers.confirm) {
      console.log(chalk.yellow('❌ Transaction cancelled'));
      return;
    }

    try {
      console.log(chalk.blue('📡 Sending transaction...'));

      // Resolve address from address book if needed
      const destination = this.addressBook.get(answers.destination) || answers.destination;
      
      const tx = await this.wallet.sendTransaction({
        destination,
        amount: parseTari(answers.amount),
        message: answers.message || undefined
      });

      console.log(chalk.green('✅ Transaction sent successfully!'));
      console.log(chalk.gray(`Transaction ID: ${tx.id}`));
      
      this.transactions.unshift(tx);

      // Watch for confirmations
      const unwatch = this.wallet.watchTransaction(tx.id, (updatedTx) => {
        console.log(chalk.blue(`📊 Confirmations: ${updatedTx.confirmations}`));
        if (updatedTx.confirmations >= 6) {
          console.log(chalk.green('🎉 Transaction fully confirmed!'));
          unwatch();
        }
      });

    } catch (error) {
      console.error(chalk.red('❌ Transaction failed:'), error.message);
    }

    console.log('');
  }

  async showReceiveAddress() {
    console.log(chalk.blue('\n📥 Receive Address\n'));
    
    const address = this.wallet.getReceiveAddress();
    
    console.log(chalk.green('Your receiving address:'));
    console.log(chalk.white.bold(address));
    console.log('');

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
      qrcode.generate(address, { small: true });
    }

    console.log('');
  }

  async showTransactionHistory() {
    console.log(chalk.blue('\n📜 Transaction History\n'));

    if (this.transactions.length === 0) {
      console.log(chalk.gray('No transactions yet'));
      console.log('');
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan.bold('Type'),
        chalk.cyan.bold('Amount'),
        chalk.cyan.bold('Status'),
        chalk.cyan.bold('ID'),
        chalk.cyan.bold('Time')
      ],
      style: { head: [], border: [] }
    });

    this.transactions.slice(0, 10).forEach(tx => {
      const type = tx.isOutbound ? '📤 Sent' : '📥 Received';
      const amount = formatTari(tx.amount);
      const status = tx.confirmations >= 6 ? '✅ Confirmed' : `⏳ ${tx.confirmations}/6`;
      const id = tx.id.substring(0, 12) + '...';
      const time = tx.timestamp.toLocaleString();

      table.push([type, amount, status, id, time]);
    });

    console.log(table.toString());
    console.log('');
  }

  async manageAddressBook() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Address Book:',
        choices: [
          { name: '📖 View all addresses', value: 'view' },
          { name: '➕ Add new address', value: 'add' },
          { name: '❌ Remove address', value: 'remove' },
          { name: '🔙 Back to main menu', value: 'back' }
        ]
      }
    ]);

    switch (action) {
      case 'view':
        this.viewAddressBook();
        break;
      case 'add':
        await this.addToAddressBook();
        break;
      case 'remove':
        await this.removeFromAddressBook();
        break;
      case 'back':
        return;
    }
  }

  viewAddressBook() {
    console.log(chalk.blue('\n📖 Address Book\n'));

    if (this.addressBook.size === 0) {
      console.log(chalk.gray('No addresses saved yet'));
      console.log('');
      return;
    }

    const table = new Table({
      head: [chalk.cyan.bold('Name'), chalk.cyan.bold('Address')],
      style: { head: [], border: [] }
    });

    for (const [name, address] of this.addressBook) {
      table.push([name, address.substring(0, 40) + '...']);
    }

    console.log(table.toString());
    console.log('');
  }

  async addToAddressBook() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Name for this address:',
        validate: (input) => input.trim().length > 0 ? true : 'Name cannot be empty'
      },
      {
        type: 'input',
        name: 'address',
        message: 'Tari address:',
        validate: (input) => validateAddress(input) ? true : 'Invalid Tari address format'
      }
    ]);

    this.addressBook.set(answers.name, answers.address);
    console.log(chalk.green(`✅ Added ${answers.name} to address book`));
    console.log('');
  }

  async removeFromAddressBook() {
    if (this.addressBook.size === 0) {
      console.log(chalk.gray('No addresses to remove'));
      return;
    }

    const { name } = await inquirer.prompt([
      {
        type: 'list',
        name: 'name',
        message: 'Remove which address?',
        choices: Array.from(this.addressBook.keys())
      }
    ]);

    this.addressBook.delete(name);
    console.log(chalk.green(`✅ Removed ${name} from address book`));
    console.log('');
  }

  async showSettings() {
    console.log(chalk.blue('\n⚙️  Wallet Settings\n'));

    const table = new Table({
      head: [chalk.cyan.bold('Setting'), chalk.cyan.bold('Value')],
      style: { head: [], border: [] }
    });

    table.push(
      ['Network', this.wallet._network || 'Unknown'],
      ['Data Directory', './cli-wallet-data'],
      ['Address Book Entries', this.addressBook.size.toString()],
      ['Cached Transactions', this.transactions.length.toString()]
    );

    console.log(table.toString());
    console.log('');
  }

  async exit() {
    console.log(chalk.blue('\n🛑 Shutting down wallet...'));
    
    if (this.wallet && this.isConnected) {
      await this.wallet.close();
      console.log(chalk.green('✅ Wallet disconnected safely'));
    }
    
    console.log(chalk.yellow('👋 Goodbye!'));
    process.exit(0);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Goodbye!'));
  process.exit(0);
});

// Start the CLI
const cli = new TariWalletCLI();
cli.start().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
