/**
 * @fileoverview Test credential fixtures for cross-platform testing
 * 
 * Provides standardized test data sets for validating storage implementations
 * across different platforms with various data types and security scenarios.
 */

export interface TestCredential {
  id: string;
  service: string;
  account: string;
  testData: Buffer;
  platform: string[];
  expectedBackend: string;
  securityLevel: 'low' | 'medium' | 'high';
  description: string;
}

export interface SecurityTestCase {
  name: string;
  description: string;
  attackVector: string;
  testData: Buffer;
  expectedBehavior: 'pass' | 'fail' | 'warning';
  mitigations: string[];
}

/**
 * Standard test credentials for cross-platform validation
 */
export const TEST_CREDENTIALS: TestCredential[] = [
  {
    id: 'wallet-private-key',
    service: 'tari-wallet',
    account: 'main-wallet',
    testData: Buffer.from(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'hex'
    ),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'platform-specific',
    securityLevel: 'high',
    description: 'Primary wallet private key (256-bit)',
  },
  {
    id: 'seed-phrase-recovery',
    service: 'tari-wallet',
    account: 'seed-recovery',
    testData: Buffer.from(JSON.stringify([
      'abandon', 'ability', 'able', 'about', 'above', 'absent',
      'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
      'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
      'across', 'act', 'action', 'actor', 'actress', 'actual'
    ])),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'platform-specific',
    securityLevel: 'high',
    description: 'BIP39 mnemonic seed phrase (24 words)',
  },
  {
    id: 'encrypted-config',
    service: 'tari-wallet',
    account: 'configuration',
    testData: Buffer.from(JSON.stringify({
      network: 'testnet',
      baseNodePublicKey: '0c3fe3c23866ed3827e1cd72aae0c9d364d860d597993104e90d9a9401e52f05',
      baseNodeAddress: '/onion3/2m2xnylrsqbaozsndkbmfisxxbwh2vgvs6oyfak2qah4snnxykrf7zad:18141',
      encryptedApiKey: 'aes256gcm:iv:ciphertext:authTag',
      preferences: {
        autoSync: true,
        notifications: false,
        theme: 'dark'
      }
    })),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'encrypted-file',
    securityLevel: 'medium',
    description: 'Encrypted wallet configuration data',
  },
  {
    id: 'session-token',
    service: 'tari-wallet-api',
    account: 'session',
    testData: Buffer.from(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3YWxsZXQtc2Vzc2lvbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDg2NDAwfQ.signature',
      'utf8'
    ),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'memory',
    securityLevel: 'medium',
    description: 'Temporary session authentication token',
  },
  {
    id: 'encryption-key',
    service: 'tari-wallet',
    account: 'file-encryption',
    testData: Buffer.from(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      'hex'
    ),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'platform-specific',
    securityLevel: 'high',
    description: 'File encryption key (AES-256)',
  },
  {
    id: 'api-credentials',
    service: 'tari-external-api',
    account: 'exchange-connection',
    testData: Buffer.from(JSON.stringify({
      apiKey: 'ak_live_1234567890abcdef',
      apiSecret: 'as_live_0987654321fedcba',
      endpoint: 'https://api.example.com/v1',
      rateLimits: {
        requests: 100,
        window: 60000
      }
    })),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'platform-specific',
    securityLevel: 'high',
    description: 'External API authentication credentials',
  },
  {
    id: 'backup-encryption-key',
    service: 'tari-wallet',
    account: 'backup-encryption',
    testData: Buffer.from(
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      'hex'
    ),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'platform-specific',
    securityLevel: 'high',
    description: 'Wallet backup encryption key',
  },
  {
    id: 'user-preferences',
    service: 'tari-wallet',
    account: 'user-settings',
    testData: Buffer.from(JSON.stringify({
      theme: 'dark',
      language: 'en',
      notifications: {
        transactions: true,
        mining: false,
        security: true
      },
      security: {
        requirePinOnOpen: true,
        autoLockTimeout: 300,
        biometricAuth: true
      }
    })),
    platform: ['darwin', 'win32', 'linux'],
    expectedBackend: 'encrypted-file',
    securityLevel: 'low',
    description: 'User preferences and settings',
  },
];

/**
 * Security-focused test cases for attack vector validation
 */
export const SECURITY_TEST_CASES: SecurityTestCase[] = [
  {
    name: 'buffer-overflow-protection',
    description: 'Test protection against buffer overflow attacks',
    attackVector: 'oversized-data',
    testData: Buffer.alloc(1024 * 1024 * 10, 'A'), // 10MB of 'A'
    expectedBehavior: 'warning',
    mitigations: ['Input validation', 'Size limits', 'Memory boundaries'],
  },
  {
    name: 'null-byte-injection',
    description: 'Test handling of null byte injection attempts',
    attackVector: 'null-injection',
    testData: Buffer.from('malicious\0data\0injection\0test'),
    expectedBehavior: 'pass',
    mitigations: ['Proper encoding', 'Input sanitization', 'Null byte filtering'],
  },
  {
    name: 'unicode-normalization',
    description: 'Test Unicode normalization attack resistance',
    attackVector: 'unicode-confusion',
    testData: Buffer.from('café vs caf\u0065\u0301', 'utf8'), // é vs e+combining accent
    expectedBehavior: 'pass',
    mitigations: ['Unicode normalization', 'Canonical form validation'],
  },
  {
    name: 'timing-attack-resistance',
    description: 'Test constant-time comparison implementation',
    attackVector: 'timing-analysis',
    testData: Buffer.from('timing-attack-test-string-with-varying-length'),
    expectedBehavior: 'pass',
    mitigations: ['Constant-time comparisons', 'crypto.timingSafeEqual usage'],
  },
  {
    name: 'memory-disclosure',
    description: 'Test for unintentional memory disclosure',
    attackVector: 'memory-leak',
    testData: Buffer.from('sensitive-data-that-should-not-leak'),
    expectedBehavior: 'pass',
    mitigations: ['Memory clearing', 'Secure deallocation', 'Buffer overwriting'],
  },
  {
    name: 'injection-attack',
    description: 'Test SQL/NoSQL injection protection',
    attackVector: 'injection',
    testData: Buffer.from("'; DROP TABLE users; --"),
    expectedBehavior: 'pass',
    mitigations: ['Parameterized queries', 'Input validation', 'Escaping'],
  },
  {
    name: 'path-traversal',
    description: 'Test directory traversal attack protection',
    attackVector: 'path-traversal',
    testData: Buffer.from('../../../etc/passwd'),
    expectedBehavior: 'pass',
    mitigations: ['Path validation', 'Sandboxing', 'Canonical path resolution'],
  },
  {
    name: 'cryptographic-oracle',
    description: 'Test resistance to padding oracle attacks',
    attackVector: 'padding-oracle',
    testData: Buffer.from('padding-oracle-test-data-with-invalid-padding'),
    expectedBehavior: 'pass',
    mitigations: ['Authenticated encryption', 'Constant-time validation'],
  },
];

/**
 * Platform-specific test data for edge cases
 */
export const PLATFORM_SPECIFIC_TESTS = {
  darwin: {
    keychainSpecific: [
      {
        id: 'keychain-large-data',
        data: Buffer.alloc(5000, 'x'), // Test 4KB limit
        expectSuccess: false,
        reason: 'Exceeds macOS Keychain 4KB limit',
      },
      {
        id: 'keychain-special-chars',
        data: Buffer.from('macOS special chars: åπ∆©®™'),
        expectSuccess: true,
        reason: 'UTF-8 handling in Keychain',
      },
    ],
  },
  win32: {
    credentialStoreSpecific: [
      {
        id: 'credential-store-limit',
        data: Buffer.alloc(3000, 'x'), // Test 2.5KB limit
        expectSuccess: false,
        reason: 'Exceeds Windows Credential Store 2.5KB limit',
      },
      {
        id: 'credential-store-unicode',
        data: Buffer.from('Windows Unicode: 测试データテスト'),
        expectSuccess: true,
        reason: 'Unicode support in Credential Store',
      },
    ],
  },
  linux: {
    secretServiceSpecific: [
      {
        id: 'secret-service-dbus',
        data: Buffer.from('D-Bus Secret Service test'),
        expectSuccess: true, // May fail in headless
        reason: 'D-Bus dependency for Secret Service',
      },
      {
        id: 'secret-service-headless',
        data: Buffer.from('Headless environment test'),
        expectSuccess: true, // Should use fallback
        reason: 'Fallback to encrypted file in headless',
      },
    ],
  },
};

/**
 * Performance test data sets
 */
export const PERFORMANCE_TEST_DATA = {
  small: Buffer.alloc(256, 'S'),      // 256 bytes
  medium: Buffer.alloc(4096, 'M'),    // 4KB
  large: Buffer.alloc(65536, 'L'),    // 64KB
  xlarge: Buffer.alloc(1048576, 'X'), // 1MB
};

/**
 * Binary test data for edge cases
 */
export const BINARY_TEST_DATA = {
  pngHeader: Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  ]),
  jpegHeader: Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0
  ]),
  pdfHeader: Buffer.from('%PDF-1.4'),
  zipHeader: Buffer.from([0x50, 0x4B, 0x03, 0x04]),
  randomBinary: Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  nullBytes: Buffer.alloc(100, 0),
  maxBytes: Buffer.alloc(100, 0xFF),
};

/**
 * Encryption test vectors
 */
export const ENCRYPTION_TEST_VECTORS = {
  aes256gcm: {
    key: Buffer.from(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      'hex'
    ),
    iv: Buffer.from('000102030405060708090a0b', 'hex'),
    plaintext: Buffer.from('Test encryption data for AES-256-GCM'),
    aad: Buffer.from('additional-authenticated-data'),
  },
  chacha20poly1305: {
    key: Buffer.from(
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      'hex'
    ),
    iv: Buffer.from('fedcba9876543210fedcba98', 'hex'),
    plaintext: Buffer.from('Test encryption data for ChaCha20-Poly1305'),
    aad: Buffer.from('chacha-aad-data'),
  },
};

/**
 * Key derivation test vectors
 */
export const KEY_DERIVATION_VECTORS = {
  pbkdf2: {
    password: 'test-password-for-pbkdf2',
    salt: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
    iterations: 100000,
    keyLength: 32,
    expectedKey: '5c2a3a5c2a3a5c2a3a5c2a3a5c2a3a5c2a3a5c2a3a5c2a3a5c2a3a5c2a3a5c2a', // Example
  },
  scrypt: {
    password: 'test-password-for-scrypt',
    salt: Buffer.from('fedcba9876543210fedcba9876543210', 'hex'),
    n: 16384,
    r: 8,
    p: 1,
    keyLength: 32,
  },
};

/**
 * Helper functions for test data generation
 */
export class TestDataGenerator {
  /**
   * Generate random test credentials
   */
  static generateRandomCredential(platform: string[]): TestCredential {
    const id = `random-${Math.random().toString(36).substr(2, 9)}`;
    const service = `test-service-${Math.random().toString(36).substr(2, 5)}`;
    const account = `test-account-${Math.random().toString(36).substr(2, 5)}`;
    const dataSize = Math.floor(Math.random() * 1024) + 256; // 256-1280 bytes
    const testData = Buffer.alloc(dataSize);
    
    // Fill with random data
    for (let i = 0; i < dataSize; i++) {
      testData[i] = Math.floor(Math.random() * 256);
    }
    
    return {
      id,
      service,
      account,
      testData,
      platform,
      expectedBackend: 'auto',
      securityLevel: 'medium',
      description: `Randomly generated test credential (${dataSize} bytes)`,
    };
  }
  
  /**
   * Generate stress test data
   */
  static generateStressTestData(count: number): TestCredential[] {
    const credentials: TestCredential[] = [];
    
    for (let i = 0; i < count; i++) {
      credentials.push(this.generateRandomCredential(['all']));
    }
    
    return credentials;
  }
  
  /**
   * Generate edge case test data
   */
  static generateEdgeCaseData(): Buffer[] {
    return [
      Buffer.alloc(0), // Empty buffer
      Buffer.alloc(1, 0), // Single null byte
      Buffer.alloc(1, 0xFF), // Single max byte
      Buffer.from('\n\r\t'), // Whitespace characters
      Buffer.from('🎉🔒💾🚀'), // Unicode emojis
      Buffer.concat([Buffer.alloc(100, 0), Buffer.alloc(100, 0xFF)]), // Mixed content
    ];
  }
}

/**
 * Test result validation helpers
 */
export class TestValidator {
  /**
   * Validate credential storage result
   */
  static validateStorageResult(
    credential: TestCredential,
    storeResult: any,
    retrieveResult: any
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!storeResult.success) {
      errors.push(`Storage failed: ${storeResult.error}`);
    }
    
    if (!retrieveResult.success) {
      errors.push(`Retrieval failed: ${retrieveResult.error}`);
    }
    
    if (retrieveResult.data && !retrieveResult.data.equals(credential.testData)) {
      errors.push('Retrieved data does not match stored data');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Validate security test result
   */
  static validateSecurityTest(
    testCase: SecurityTestCase,
    result: any
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    if (testCase.expectedBehavior === 'pass' && !result.success) {
      warnings.push(`Security test should pass but failed: ${testCase.name}`);
    }
    
    if (testCase.expectedBehavior === 'fail' && result.success) {
      warnings.push(`Security test should fail but passed: ${testCase.name}`);
    }
    
    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}
