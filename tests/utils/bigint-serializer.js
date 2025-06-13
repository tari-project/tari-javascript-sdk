/**
 * BigInt serialization utilities for Jest testing
 * 
 * Provides utilities to handle BigInt values in test data to prevent
 * "BigInt cannot be serialized" errors during Jest test execution.
 */

/**
 * Custom Jest serializer for BigInt values
 */
const bigintSerializer = {
  test: (val) => typeof val === 'bigint',
  print: (val) => `BigInt("${val.toString()}")`,
};

/**
 * JSON replacer function for BigInt serialization
 */
function bigintReplacer(key, value) {
  return typeof value === 'bigint' ? value.toString() + 'n' : value;
}

/**
 * JSON reviver function for BigInt deserialization
 */
function bigintReviver(key, value) {
  if (typeof value === 'string' && value.endsWith('n') && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  return value;
}

/**
 * Converts BigInt values in an object to strings for JSON serialization
 */
function serializeBigInts(obj) {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInts);
  }
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = serializeBigInts(value);
  }
  return result;
}

/**
 * Creates a JSON-safe version of test data with BigInt conversion
 */
function createJsonSafeTestData(data) {
  return JSON.parse(JSON.stringify(data, bigintReplacer), bigintReviver);
}

/**
 * Safely stringify data containing BigInt values
 */
function safeJsonStringify(data, space) {
  return JSON.stringify(data, bigintReplacer, space);
}

/**
 * Type guard to check if a value contains BigInt
 */
function containsBigInt(value) {
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
function setupBigIntSerialization() {
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

module.exports = {
  bigintSerializer,
  bigintReplacer,
  bigintReviver,
  serializeBigInts,
  createJsonSafeTestData,
  safeJsonStringify,
  containsBigInt,
  setupBigIntSerialization,
};
