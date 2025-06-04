import { NativeBinding, setBinding } from './bindings';
import { join } from 'path';

export function loadNativeBinding(): NativeBinding {
  let bindingPath: string | undefined;
  
  // Try multiple possible paths for the native module
  const possiblePaths = [
    join(__dirname, '..', 'native', 'index.node'),
    join(__dirname, '..', '..', 'native', 'index.node'),
    join(process.cwd(), 'packages', '@tari', 'core', 'native', 'index.node'),
    join(process.cwd(), 'native', 'index.node'),
  ];
  
  let nativeModule: any;
  let lastError: Error | null = null;
  
  for (const path of possiblePaths) {
    try {
      nativeModule = require(path);
      bindingPath = path;
      break;
    } catch (error) {
      lastError = error as Error;
      continue;
    }
  }
  
  if (!nativeModule) {
    console.error('Failed to load native binding from any of these paths:');
    possiblePaths.forEach(path => console.error(`  - ${path}`));
    console.error('Last error:', lastError);
    throw new Error(
      'Failed to load native binding. Make sure you have built the native module with "npm run build:native"'
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
