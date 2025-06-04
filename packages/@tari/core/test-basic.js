// Basic functionality test for the FFI wrapper
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing basic FFI functionality...');

try {
  // Check if dist files exist
  const distPath = path.join(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    throw new Error('dist directory not found - run npm run build first');
  }

  const indexPath = path.join(distPath, 'index.js');
  if (!fs.existsSync(indexPath)) {
    throw new Error('index.js not found in dist - build may have failed');
  }

  // Try to import the module
  console.log('📦 Importing @tari/core...');
  const tari = require('./dist/index.js');
  
  console.log('✅ Module imported successfully');
  
  // Check exports
  console.log('🔍 Checking exports...');
  
  const expectedExports = [
    'ffi',
    'initialize',
    'isInitialized',
    'createDefaultWallet',
    'Network',
    'TariErrorCode',
    'VERSION'
  ];
  
  for (const exportName of expectedExports) {
    if (!(exportName in tari)) {
      console.warn(`⚠️  Missing export: ${exportName}`);
    } else {
      console.log(`✅ Export found: ${exportName}`);
    }
  }
  
  // Check initialization
  console.log('🔧 Checking initialization...');
  console.log(`Initialization status: ${tari.isInitialized()}`);
  
  // Check version
  console.log(`📋 Version: ${tari.VERSION}`);
  
  // Test Network enum
  console.log('🌐 Testing Network enum...');
  console.log(`Network.Mainnet: ${tari.Network.Mainnet}`);
  console.log(`Network.Testnet: ${tari.Network.Testnet}`);
  
  // Test error codes
  console.log('❌ Testing error codes...');
  console.log(`TariErrorCode.NoError: ${tari.TariErrorCode.NoError}`);
  console.log(`TariErrorCode.InvalidArgument: ${tari.TariErrorCode.InvalidArgument}`);
  
  console.log('🎉 Basic functionality test completed successfully!');
  
} catch (error) {
  console.error('💥 Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
