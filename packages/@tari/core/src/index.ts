import { loadNativeBinding } from './loader';
import { binding } from './bindings';

export * from './bindings';
export { loadNativeBinding };

export const VERSION = '0.0.1';

// Auto-load on import
let loaded = false;
if (!loaded) {
  loadNativeBinding();
  loaded = true;
}

export const core = binding;
