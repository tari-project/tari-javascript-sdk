import { NativeBinding, setBinding } from './bindings';
import { join } from 'path';
import { existsSync } from 'fs';

export function loadNativeBinding(): NativeBinding {
  const platform = process.platform;
  const arch = process.arch;
  
  // Try loading from multiple locations
  const possiblePaths = [
    // 1. Prebuild location
    join(__dirname, '..', 'prebuilds', `${platform}-${arch}`, 'index.node'),
    // 2. Local build
    join(__dirname, '..', 'native', 'index.node'),
    // 3. Node modules (for npm install)
    join(__dirname, '..', 'build', 'Release', 'tari_core_native.node'),
    // 4. Legacy paths
    join(__dirname, '..', '..', 'native', 'index.node'),
    join(process.cwd(), 'packages', '@tari', 'core', 'native', 'index.node'),
    join(process.cwd(), 'native', 'index.node'),
  ];

  let lastError: Error | null = null;
  let nativeModule: any;
  let bindingPath: string | undefined;

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      try {
        nativeModule = require(path);
        bindingPath = path;
        console.log(`Loaded native binding from: ${path}`);
        break;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Failed to load from ${path}:`, error.message);
      }
    }
  }

  // If all paths failed, provide helpful error
  if (!nativeModule) {
    throw new Error(
      `Failed to load native binding for ${platform}-${arch}.\n` +
      `Tried paths:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}\n` +
      `Last error: ${lastError?.message || 'No binding found'}\n\n` +
      `To fix this, try:\n` +
      `1. Run 'npm run build:native' to build locally\n` +
      `2. Check that you have the correct platform package installed\n` +
      `3. File an issue at https://github.com/tari-project/tari-javascript-sdk/issues`
    );
  }
  
  try {
    setBinding(nativeModule);
    nativeModule.initialize();
    console.log(`✅ Native binding loaded from: ${bindingPath || 'unknown path'}`);
    return nativeModule;
  } catch (error) {
    console.error('Failed to initialize native binding:', error);
    throw error;
  }
}
