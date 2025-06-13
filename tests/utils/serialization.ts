/**
 * Serialization utilities for test data
 * Handles BigInt and complex types that JSON.stringify can't handle natively
 */

/**
 * JSON replacer function that handles BigInt values
 */
export function bigintReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * JSON reviver function that converts string numbers back to BigInt
 * Only converts values that end with 'n' suffix or are in known BigInt fields
 */
export function bigintReviver(key: string, value: any): any {
  // Known BigInt fields in our test data
  const bigintFields = ['amount', 'fee', 'value', 'balance'];
  
  if (typeof value === 'string') {
    // Handle explicit BigInt notation (ends with 'n')
    if (value.endsWith('n') && /^\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    
    // Handle known BigInt fields
    if (bigintFields.includes(key) && /^\d+$/.test(value)) {
      return BigInt(value);
    }
  }
  
  return value;
}

/**
 * Safe JSON.stringify that handles BigInt values
 */
export function safeStringify(obj: any, space?: string | number): string {
  return JSON.stringify(obj, bigintReplacer, space);
}

/**
 * Safe JSON.parse that handles BigInt values
 */
export function safeParse(json: string): any {
  return JSON.parse(json, bigintReviver);
}

/**
 * Create a mock object with BigInt values converted to strings
 * for test assertions
 */
export function createMockWithStrings<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, bigintReplacer));
}

/**
 * Deep clone an object while handling BigInt values
 */
export function deepCloneWithBigInt<T>(obj: T): T {
  return safeParse(safeStringify(obj));
}

/**
 * Compare two objects that may contain BigInt values
 */
export function deepEqualWithBigInt(a: any, b: any): boolean {
  const aStr = safeStringify(a);
  const bStr = safeStringify(b);
  return aStr === bStr;
}

/**
 * Mock transaction data with proper BigInt types
 */
export function createMockTransaction(overrides: Partial<any> = {}) {
  return {
    id: 'mock_tx_123',
    amount: 1000000n, // 1 Tari in µT
    fee: 5000n, // 5000 µT
    status: 'pending',
    message: 'Mock transaction',
    timestamp: Date.now(),
    is_inbound: false,
    address: 'tari://testnet/mock_address',
    ...overrides
  };
}

/**
 * Mock balance data with proper BigInt types
 */
export function createMockBalance(overrides: Partial<any> = {}) {
  return {
    available: 1000000000n, // 1000 Tari in µT
    pending_incoming: 0n,
    pending_outgoing: 0n,
    timelocked: 0n,
    ...overrides
  };
}

/**
 * Mock UTXO data with proper BigInt types  
 */
export function createMockUtxo(overrides: Partial<any> = {}) {
  return {
    commitment: '0x' + '00'.repeat(32),
    value: 1000000n, // 1 Tari in µT
    script: 'mock_script',
    features: { output_type: 'Standard' },
    maturity: 0n,
    status: 0,
    ...overrides
  };
}

/**
 * Create test data factory for consistent mock objects
 */
export class TestDataFactory {
  private counter = 1;
  
  nextId(): string {
    return `mock_${Date.now()}_${this.counter++}`;
  }
  
  createTransaction(overrides: Partial<any> = {}) {
    return createMockTransaction({
      id: this.nextId(),
      ...overrides
    });
  }
  
  createBalance(overrides: Partial<any> = {}) {
    return createMockBalance(overrides);
  }
  
  createUtxo(overrides: Partial<any> = {}) {
    return createMockUtxo({
      commitment: `0x${this.nextId()}`,
      ...overrides
    });
  }
  
  reset(): void {
    this.counter = 1;
  }
}

// Export singleton factory instance
export const testDataFactory = new TestDataFactory();
