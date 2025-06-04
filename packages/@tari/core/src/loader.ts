import { NativeBinding, setBinding } from './bindings';
import { join } from 'path';

export function loadNativeBinding(): NativeBinding {
  const bindingPath = join(__dirname, '..', 'native', 'index.node');
  
  try {
    const nativeModule = require(bindingPath);
    setBinding(nativeModule);
    nativeModule.initialize();
    return nativeModule;
  } catch (error) {
    console.error('Failed to load native binding:', error);
    throw new Error(
      `Failed to load native binding from ${bindingPath}. ` +
      `Make sure you have built the native module with 'npm run build:native'`
    );
  }
}
