# Manual Testing Framework

This directory contains a comprehensive manual testing framework for the Tari JavaScript SDK. These tests are designed to work with **real funded wallets** on testnet or mainnet, allowing for end-to-end validation of wallet functionality.

## ⚠️ Important Warnings

- **REAL FUNDS**: These tests use real wallet seed words and will send actual transactions
- **TESTNET RECOMMENDED**: Always test on testnet first before using mainnet
- **BACKUP SEED WORDS**: Ensure you have secure backups of any seed words used
- **SMALL AMOUNTS**: Use small test amounts to avoid significant losses

## Prerequisites

1. **Funded Wallets**: You need two funded wallets (sender and receiver)
2. **Seed Words**: 24-word seed phrases for both wallets
3. **Base Node**: Access to a Tari base node (optional but recommended)
4. **Node.js**: Node.js 18+ with the Tari SDK built

## Environment Setup

Create a `.env` file or set these environment variables:

```bash
# Required: Seed words for test wallets (24 words each)
SENDER_SEED_WORDS="word1 word2 word3 ... word24"
RECEIVER_SEED_WORDS="word1 word2 word3 ... word24"

# Optional: Network selection (default: testnet)
TARI_NETWORK=testnet  # or mainnet

# Optional: Base node configuration
TARI_BASE_NODE_PUBLIC_KEY=your_base_node_public_key
TARI_BASE_NODE_ADDRESS=/ip4/127.0.0.1/tcp/18189

# Optional: Test parameters
TEST_AMOUNT=1000000  # Amount in µT (default: 0.001 Tari)
TEST_STORAGE_PATH=/path/to/test/storage  # Default: system temp directory
```

## Getting Test Funds (Testnet)

### Option 1: Tari Testnet Faucet
1. Visit the Tari testnet faucet (if available)
2. Enter your testnet wallet address
3. Request test funds

### Option 2: Mining (Advanced)
1. Set up a Tari miner on testnet
2. Mine directly to your test wallet addresses

### Option 3: Community
1. Ask in the Tari community channels for testnet funds
2. Provide your testnet wallet addresses

## Running Manual Tests

### Quick Start

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Set environment variables
export SENDER_SEED_WORDS="your 24 seed words here"
export RECEIVER_SEED_WORDS="your 24 receiver seed words here"

# Run manual tests
npm run test:manual
```

### Interactive Mode

The manual testing framework provides an interactive menu:

```
📋 Manual Test Menu:
1. Check wallet balances
2. Send basic transaction
3. Send transaction with memo
4. Check transaction status
5. View transaction history
6. Test fee estimation
7. Test address validation
8. Test wallet sync
9. Stress test (multiple transactions)
10. Run all tests
0. Exit
```

### Programmatic Usage

```typescript
import { ManualTestSuite, createManualTestConfig } from './examples/manual-tests';

async function runTests() {
  const config = createManualTestConfig();
  const testSuite = new ManualTestSuite(config);
  
  try {
    await testSuite.setup();
    await testSuite.runInteractiveTests();
  } finally {
    await testSuite.cleanup();
  }
}

runTests().catch(console.error);
```

## Test Scenarios

### 1. Balance Checks
- Verifies wallet connectivity and balance retrieval
- Checks for sufficient funds before running transaction tests
- Displays detailed balance breakdown (available, pending, timelocked)

### 2. Basic Transactions
- Sends simple transactions between test wallets
- Monitors transaction status progression
- Verifies balance updates

### 3. Transaction with Memo
- Tests transaction message/memo functionality
- Verifies memo storage and retrieval
- Useful for testing metadata handling

### 4. Transaction Status Monitoring
- Tracks transaction progression through network states
- Tests status polling and updates
- Identifies any stuck or failed transactions

### 5. Transaction History
- Retrieves and displays transaction history
- Tests pagination and filtering
- Verifies historical data accuracy

### 6. Fee Estimation
- Tests fee calculation for different amounts
- Compares estimated vs actual fees
- Validates network fee statistics

### 7. Address Validation
- Tests Tari address format validation
- Verifies emoji ID conversions
- Tests invalid address rejection

### 8. Wallet Sync
- Tests blockchain synchronization
- Monitors sync progress and completion
- Verifies network connectivity

### 9. Stress Testing
- Sends multiple concurrent transactions
- Tests system performance under load
- Identifies potential bottlenecks

## Safety Guidelines

### Before Testing
1. **Verify Network**: Ensure you're on the correct network (testnet/mainnet)
2. **Check Balances**: Verify sufficient funds for all planned tests
3. **Backup Data**: Ensure seed words and important data are backed up
4. **Small Amounts**: Start with minimal test amounts

### During Testing
1. **Monitor Progress**: Watch transaction status and confirmations
2. **Check Logs**: Review wallet logs for any errors or warnings
3. **Verify Results**: Confirm expected vs actual outcomes
4. **Stop on Errors**: Halt testing if unexpected behavior occurs

### After Testing
1. **Verify Balances**: Check final balances match expectations
2. **Review History**: Ensure all transactions completed correctly
3. **Save Results**: Document any issues or unexpected behavior
4. **Clean Up**: Properly close wallets and clean up test data

## Troubleshooting

### Common Issues

**"Insufficient funds" errors:**
- Check wallet balances with test 1
- Ensure sender wallet has enough for amount + fees
- Verify network connectivity

**Transaction stuck in "pending":**
- Check base node connectivity
- Verify network is processing transactions
- Wait longer (network may be slow)

**"Invalid seed words" errors:**
- Verify 24-word format
- Check for typos or extra spaces
- Ensure words are from valid wordlist

**Wallet sync failures:**
- Check base node configuration
- Verify network connectivity
- Try different base node

**Connection timeouts:**
- Increase timeout values
- Check firewall settings
- Verify base node address

### Getting Help

1. **Check Logs**: Review wallet logs for detailed error information
2. **Community**: Ask in Tari community channels
3. **Documentation**: Refer to the main SDK documentation
4. **Issues**: Report bugs via GitHub issues

## Advanced Configuration

### Custom Test Scenarios

You can create custom test scenarios by extending the `ManualTestSuite` class:

```typescript
class CustomTestSuite extends ManualTestSuite {
  async customTest(): Promise<void> {
    // Your custom test logic here
  }
}
```

### Integration with CI/CD

For automated testing with real funds (not recommended for production):

```bash
# Set environment variables in CI
export SENDER_SEED_WORDS="$SECRET_SENDER_SEEDS"
export RECEIVER_SEED_WORDS="$SECRET_RECEIVER_SEEDS"
export TARI_NETWORK=testnet

# Run specific tests
npm run test:manual -- --test balance
npm run test:manual -- --test transaction
```

### Performance Monitoring

The framework includes built-in performance monitoring:

- Transaction timing measurements
- Memory usage tracking
- Network operation monitoring
- Error rate analysis

Results are logged and can be exported for analysis.

## Security Considerations

### Seed Word Protection
- Never commit seed words to version control
- Use environment variables or secure vaults
- Rotate test seed words regularly
- Use dedicated test-only wallets

### Network Security
- Use secure connections to base nodes
- Verify base node authenticity
- Monitor for unusual network activity
- Use VPN if needed for privacy

### System Security
- Run tests on secure, isolated systems
- Keep wallet software updated
- Monitor system resources
- Use proper access controls

## Contributing

To contribute to the manual testing framework:

1. Follow existing code patterns
2. Add comprehensive error handling
3. Include user-friendly output
4. Update documentation
5. Test on both testnet and mainnet (where appropriate)

### Adding New Tests

1. Add test method to `ManualTestSuite` class
2. Add menu option in `runInteractiveTests()`
3. Include in `runAllTests()` if appropriate
4. Document in this README
5. Add safety warnings if needed

## License

This manual testing framework is part of the Tari JavaScript SDK and follows the same license terms.
