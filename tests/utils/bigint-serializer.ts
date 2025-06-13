/**
 * BigInt serialization utilities for Jest testing
 * 
 * Provides utilities to handle BigInt values in test data to prevent
 * "BigInt cannot be serialized" errors during Jest test execution.
 */

/**
 * Custom Jest serializer for BigInt values
 */
export const bigintSerializer = {
  test: (val: any): boolean => typeof val === 'bigint',
  print: (val: bigint): string => `BigInt("${val.toString()}")`,
};

/**
 * JSON replacer function for BigInt serialization
 */
export const bigintReplacer = (key: string, value: any): any => {
  return typeof value === 'bigint' ? value.toString() + 'n' : value;
};

/**
 * JSON reviver function for BigInt deserialization
 */
export const bigintReviver = (key: string, value: any): any => {
  if (typeof value === 'string' && value.endsWith('n') && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
};

/**
 * Converts BigInt values in an object to strings for JSON serialization
 */
export function serializeBigInts<T>(obj: T): T {
  if (typeof obj === 'bigint') {
    return obj.toString() as any;
  }
  
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInts) as any;
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = serializeBigInts(value);
  }
  return result;
}

/**
 * Creates a JSON-safe version of test data with BigInt conversion
 */
export function createJsonSafeTestData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, bigintReplacer), bigintReviver);
}

/**
 * Safely stringify data containing BigInt values
 */
export function safeJsonStringify(data: any, space?: number): string {
  return JSON.stringify(data, bigintReplacer, space);
}

/**
 * Type guard to check if a value contains BigInt
 */
export function containsBigInt(value: any): boolean {
  if (typeof value === 'bigint') {
    return true;
  }
  
  if (value === null || typeof value !== 'object') {
    return false;
  }
  
  if (Array.isArray(value)) {
    return value.some(containsBigInt);
  }
  
  return Object.values(value).some(containsBigInt);
}

/**
 * Setup BigInt serialization globally for Jest
 */
export function setupBigIntSerialization(): void {
  // Add global toJSON method for BigInt
  if (!BigInt.prototype.toJSON) {
    BigInt.prototype.toJSON = function() {
      return this.toString();
    };
  }
  
  // Add expect serializer
  if (typeof expect !== 'undefined' && expect.addSnapshotSerializer) {
    expect.addSnapshotSerializer(bigintSerializer);
  }
}
