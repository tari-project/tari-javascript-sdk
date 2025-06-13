/**
 * Network availability check for E2E tests
 * Skips E2E tests if network is not available
 */

import { execSync } from 'child_process';

// Check if network is available for E2E testing
function checkNetworkAvailability(): boolean {
  try {
    // Try to ping a known testnet node
    execSync('ping -c 1 -W 5000 seed1.tari.com', { stdio: 'ignore' });
    return true;
  } catch {
    try {
      // Fallback: try to ping Google DNS
      execSync('ping -c 1 -W 5000 8.8.8.8', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

// Set environment variable based on network availability
const isNetworkAvailable = checkNetworkAvailability();
process.env.NETWORK_AVAILABLE = isNetworkAvailable.toString();

if (!isNetworkAvailable) {
  console.warn('Network not available - E2E tests will be skipped or mocked');
}
