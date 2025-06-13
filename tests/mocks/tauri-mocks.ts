/**
 * @fileoverview Mock implementations for Tauri runtime testing
 * 
 * Provides comprehensive mock implementations for Tauri runtime environment,
 * commands, and security features for testing Tauri integrations.
 */

import { jest } from '@jest/globals';

/**
 * Mock Tauri runtime response
 */
export interface MockTauriResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * Mock Tauri global object
 */
export interface MockTauriGlobal {
  invoke: jest.MockedFunction<(command: string, payload?: any) => Promise<any>>;
  version: string;
  __version?: string;
  convertFileSrc?: jest.MockedFunction<(path: string) => string>;
  transformCallback?: jest.MockedFunction<(callback: any) => any>;
}

/**
 * Stored original window object for restoration
 */
let originalWindow: any = undefined;

/**
 * Mock Tauri runtime environment
 */
export function mockTauriRuntime(): MockTauriGlobal {
  // Store original window if it exists
  if (typeof window !== 'undefined') {
    originalWindow = window;
  }

  // Create mock Tauri global
  const mockTauri: MockTauriGlobal = {
    invoke: jest.fn().mockImplementation(async (command: string, payload?: any) => {
      // Default successful response
      return {
        success: true,
        data: mockTauriCommands[command]?.(payload) || null,
        timestamp: Date.now()
      };
    }),
    version: '1.5.0',
    __version: '1.5.0',
    convertFileSrc: jest.fn().mockImplementation((path: string) => `tauri://localhost/${path}`),
    transformCallback: jest.fn().mockImplementation((callback: any) => callback)
  };

  // Mock global window object
  (global as any).window = {
    __TAURI__: mockTauri,
    navigator: {
      userAgent: 'Tauri/1.5.0'
    },
    performance: {
      now: () => Date.now(),
      memory: {
        usedJSHeapSize: 50 * 1024 * 1024, // 50MB
        totalJSHeapSize: 100 * 1024 * 1024 // 100MB
      }
    }
  };

  return mockTauri;
}

/**
 * Restore original runtime environment
 */
export function restoreTauriRuntime(): void {
  if (originalWindow !== undefined) {
    (global as any).window = originalWindow;
  } else {
    delete (global as any).window;
  }
}

/**
 * Mock Tauri command implementations
 */
export const mockTauriCommands: Record<string, (payload?: any) => any> = {
  // Storage commands
  'store_secure_data_command': (payload: any) => {
    if (!payload?.key || !payload?.value) {
      throw new Error('Invalid payload: missing key or value');
    }
    
    // Simulate storage size limits
    if (payload.value.length > 10 * 1024 * 1024) { // 10MB limit
      throw new Error('Data size exceeds platform limit');
    }
    
    // Simulate platform-specific restrictions
    if (payload.key.length > 255) {
      throw new Error('Key length exceeds platform limit');
    }
    
    return undefined; // Successful store returns no data
  },

  'retrieve_secure_data_command': (payload: any) => {
    if (!payload?.key) {
      throw new Error('Invalid payload: missing key');
    }
    
    // Simulate stored data retrieval
    const mockData = generateMockStorageData(payload.key);
    if (!mockData) {
      throw new Error('Key not found');
    }
    
    return Array.from(mockData); // Return as number array (Tauri serialization)
  },

  'remove_secure_data_command': (payload: any) => {
    if (!payload?.key) {
      throw new Error('Invalid payload: missing key');
    }
    
    // Simulate removal
    return undefined;
  },

  'exists_secure_data_command': (payload: any) => {
    if (!payload?.key) {
      throw new Error('Invalid payload: missing key');
    }
    
    // Simulate existence check
    return payload.key.includes('exists');
  },

  'list_secure_keys_command': () => {
    // Simulate key listing
    return ['test-key-1', 'test-key-2', 'test-key-3'];
  },

  'get_storage_metadata_command': (payload: any) => {
    if (!payload?.key) {
      throw new Error('Invalid payload: missing key');
    }
    
    return {
      key: payload.key,
      size: 1024,
      created: Date.now() - 86400000, // 1 day ago
      modified: Date.now() - 3600000,  // 1 hour ago
      encrypted: true
    };
  },

  'test_storage_backend_command': () => {
    return {
      available: true,
      secure: true,
      writable: true,
      readable: true
    };
  },

  'get_tauri_platform_info_command': () => {
    return {
      platform: process.platform === 'darwin' ? 'darwin' : 
                process.platform === 'win32' ? 'windows' : 'linux',
      arch: process.arch,
      secure_storage: true,
      biometric_available: process.platform === 'darwin',
      tauri_version: '1.5.0',
      permissions: ['fs:read', 'fs:write', 'crypto:digest'],
      features: ['secure-storage', 'biometric-auth', 'hardware-crypto']
    };
  },

  // Batch operations
  'batch_storage_operations_command': (payload: any) => {
    if (!payload?.operations || !Array.isArray(payload.operations)) {
      throw new Error('Invalid payload: missing operations array');
    }
    
    // Process each operation in the batch
    return payload.operations.map((op: any, index: number) => {
      try {
        const commandName = `${op.operation}_secure_data_command`;
        const result = mockTauriCommands[commandName]?.(op);
        return {
          index,
          success: true,
          data: result
        };
      } catch (error) {
        return {
          index,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
  },

  // Security and validation commands
  'validate_security_context_command': () => {
    return {
      valid: true,
      permissions: ['storage:read', 'storage:write', 'crypto:encrypt'],
      restrictions: [],
      security_level: 'high'
    };
  },

  'get_system_capabilities_command': () => {
    return {
      hardware_security: process.platform === 'darwin',
      biometric_auth: process.platform === 'darwin',
      secure_enclave: process.platform === 'darwin',
      tpm_available: process.platform === 'win32',
      keyring_available: true,
      memory_protection: true
    };
  }
};

/**
 * Generate mock storage data based on key
 */
function generateMockStorageData(key: string): Buffer | null {
  // Simulate some keys not existing
  if (key.includes('nonexistent') || key.includes('missing')) {
    return null;
  }
  
  // Generate consistent mock data based on key
  const data = Buffer.from(`mock-data-for-${key}-${key.length}`, 'utf8');
  return data;
}

/**
 * Mock Tauri with specific behaviors
 */
export function mockTauriWithBehavior(behavior: {
  shouldFail?: boolean;
  delay?: number;
  permissionDenied?: boolean;
  networkError?: boolean;
  rateLimited?: boolean;
}): MockTauriGlobal {
  const mockTauri = mockTauriRuntime();
  
  mockTauri.invoke.mockImplementation(async (command: string, payload?: any) => {
    // Simulate delay
    if (behavior.delay) {
      await new Promise(resolve => setTimeout(resolve, behavior.delay));
    }
    
    // Simulate permission denied
    if (behavior.permissionDenied) {
      throw new Error('Permission denied: insufficient privileges');
    }
    
    // Simulate network errors
    if (behavior.networkError) {
      throw new Error('Network error: connection timeout');
    }
    
    // Simulate rate limiting
    if (behavior.rateLimited) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        timestamp: Date.now()
      };
    }
    
    // Simulate general failure
    if (behavior.shouldFail) {
      throw new Error('Mock operation failed');
    }
    
    // Default success behavior
    return {
      success: true,
      data: mockTauriCommands[command]?.(payload) || null,
      timestamp: Date.now()
    };
  });
  
  return mockTauri;
}

/**
 * Mock Tauri with security restrictions
 */
export function mockTauriWithSecurityRestrictions(restrictions: {
  allowedCommands?: string[];
  maxPayloadSize?: number;
  requiresPermission?: string[];
}): MockTauriGlobal {
  const mockTauri = mockTauriRuntime();
  
  mockTauri.invoke.mockImplementation(async (command: string, payload?: any) => {
    // Check command allowlist
    if (restrictions.allowedCommands && !restrictions.allowedCommands.includes(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }
    
    // Check payload size
    if (restrictions.maxPayloadSize && payload) {
      const payloadSize = JSON.stringify(payload).length;
      if (payloadSize > restrictions.maxPayloadSize) {
        throw new Error('Payload exceeds size limit');
      }
    }
    
    // Check permissions
    if (restrictions.requiresPermission?.length) {
      const hasPermission = restrictions.requiresPermission.some(perm => 
        command.includes(perm.split(':')[0])
      );
      if (!hasPermission) {
        throw new Error('Insufficient permissions');
      }
    }
    
    // Execute if all checks pass
    return {
      success: true,
      data: mockTauriCommands[command]?.(payload) || null,
      timestamp: Date.now()
    };
  });
  
  return mockTauri;
}

/**
 * Mock Tauri performance characteristics
 */
export function mockTauriWithPerformance(performance: {
  latency?: number;
  throughput?: number;
  errorRate?: number;
}): MockTauriGlobal {
  const mockTauri = mockTauriRuntime();
  let callCount = 0;
  
  mockTauri.invoke.mockImplementation(async (command: string, payload?: any) => {
    callCount++;
    
    // Simulate latency
    if (performance.latency) {
      await new Promise(resolve => setTimeout(resolve, performance.latency));
    }
    
    // Simulate throughput limits
    if (performance.throughput && callCount > performance.throughput) {
      throw new Error('Throughput limit exceeded');
    }
    
    // Simulate error rate
    if (performance.errorRate && Math.random() < performance.errorRate) {
      throw new Error('Random performance error');
    }
    
    return {
      success: true,
      data: mockTauriCommands[command]?.(payload) || null,
      timestamp: Date.now()
    };
  });
  
  return mockTauri;
}

/**
 * Reset all mock counters and state
 */
export function resetMockState(): void {
  jest.clearAllMocks();
  restoreTauriRuntime();
}

/**
 * Utility to create mock test environment
 */
export function createMockTestEnvironment() {
  const mockTauri = mockTauriRuntime();
  
  return {
    mockTauri,
    cleanup: () => {
      restoreTauriRuntime();
      jest.clearAllMocks();
    }
  };
}
