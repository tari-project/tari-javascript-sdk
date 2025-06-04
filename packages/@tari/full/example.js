// Example usage of the full-featured Tari client
const { TariClient, Network } = require('./dist');

async function example() {
  try {
    // Create a full client with all features enabled
    const client = TariClient.builder()
      .network(Network.Testnet)
      .seedWords('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
      .enableAll()
      .build();

    console.log('Created Tari Full Client with all features');
    
    // Connect to network
    await client.connect();
    console.log('Connected to Tari network');

    // Access different managers
    console.log('Mining manager available:', !!client.mining);
    console.log('P2P manager available:', !!client.p2p);
    console.log('Advanced features available:', !!client.advanced);
    console.log('Recovery manager available:', !!client.recovery);

    // Example: Start mining
    console.log('Starting mining simulation...');
    await client.mining.startMining({ threads: 4 });
    
    // Example: Get network stats
    const stats = client.p2p.getNetworkStats();
    console.log('Network stats:', stats);

    // Example: Create a covenant (advanced feature)
    const covenant = client.advanced.createCovenant(new Uint8Array([1, 2, 3, 4]));
    console.log('Created covenant with handle:', covenant.handle);

    // Cleanup
    await client.close();
    console.log('Client closed successfully');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

if (require.main === module) {
  example();
}

module.exports = { example };
