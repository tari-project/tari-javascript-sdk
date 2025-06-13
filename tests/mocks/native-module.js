/**
 * Native module mock for Jest testing
 * Provides a consistent mock interface for all native modules
 */

function getMockNativeBindings() {
  return {
    // Basic mock implementation that returns test-friendly data
    loadModule: jest.fn().mockResolvedValue({}),
    
    // Mock any native function calls
    __esModule: true,
    default: jest.fn(),
  };
}

module.exports = { getMockNativeBindings };
