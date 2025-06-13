import { parentPort, workerData } from 'worker_threads';
import { createHash, randomBytes, pbkdf2Sync } from 'crypto';
import { performance } from 'perf_hooks';

/**
 * Worker task implementations for various CPU-intensive operations
 * This file runs in worker threads and handles the actual task execution
 */

/**
 * Task handler registry
 */
const taskHandlers = new Map<string, (data: any) => Promise<any> | any>();

/**
 * Register a task handler
 */
function registerTaskHandler(type: string, handler: (data: any) => Promise<any> | any): void {
  taskHandlers.set(type, handler);
}

/**
 * Cryptographic hash operations
 */
registerTaskHandler('crypto-hash', async (data: {
  algorithm: 'sha256' | 'sha512' | 'sha1' | 'md5';
  input: string | Buffer;
  iterations?: number;
}) => {
  const { algorithm, input, iterations = 1 } = data;
  
  let result = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  
  for (let i = 0; i < iterations; i++) {
    const hash = createHash(algorithm);
    hash.update(result);
    result = hash.digest();
  }
  
  return {
    algorithm,
    hash: result.toString('hex'),
    inputSize: Buffer.isBuffer(input) ? input.length : Buffer.byteLength(input),
    iterations
  };
});

/**
 * Key derivation operations
 */
registerTaskHandler('crypto-key-derivation', async (data: {
  password: string;
  salt: string | Buffer;
  iterations: number;
  keyLength: number;
  digest?: string;
}) => {
  const { password, salt, iterations, keyLength, digest = 'sha256' } = data;
  
  const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'hex');
  const derivedKey = pbkdf2Sync(password, saltBuffer, iterations, keyLength, digest);
  
  return {
    derivedKey: derivedKey.toString('hex'),
    keyLength,
    iterations,
    digest
  };
});

/**
 * Random data generation
 */
registerTaskHandler('crypto-random', async (data: {
  size: number;
  encoding?: 'hex' | 'base64' | 'buffer';
}) => {
  const { size, encoding = 'hex' } = data;
  const randomData = randomBytes(size);
  
  let result: string | Buffer;
  switch (encoding) {
    case 'hex':
      result = randomData.toString('hex');
      break;
    case 'base64':
      result = randomData.toString('base64');
      break;
    case 'buffer':
      result = randomData;
      break;
    default:
      result = randomData.toString('hex');
  }
  
  return {
    data: result,
    size,
    encoding
  };
});

/**
 * Data compression operations
 */
registerTaskHandler('compression', async (data: {
  operation: 'compress' | 'decompress';
  input: string | Buffer;
  algorithm?: 'gzip' | 'deflate';
}) => {
  const { operation, input, algorithm = 'gzip' } = data;
  const zlib = require('zlib');
  
  const inputBuffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, result: Buffer) => {
      if (error) {
        reject(error);
      } else {
        resolve({
          operation,
          algorithm,
          inputSize: inputBuffer.length,
          outputSize: result.length,
          compressionRatio: inputBuffer.length / result.length,
          result: result.toString('base64')
        });
      }
    };
    
    if (operation === 'compress') {
      if (algorithm === 'gzip') {
        zlib.gzip(inputBuffer, callback);
      } else {
        zlib.deflate(inputBuffer, callback);
      }
    } else {
      if (algorithm === 'gzip') {
        zlib.gunzip(inputBuffer, callback);
      } else {
        zlib.inflate(inputBuffer, callback);
      }
    }
  });
});

/**
 * JSON parsing and processing
 */
registerTaskHandler('parsing', async (data: {
  operation: 'parse' | 'stringify' | 'validate';
  input: string | any;
  options?: {
    reviver?: string;
    replacer?: string;
    space?: number;
  };
}) => {
  const { operation, input, options = {} } = data;
  
  switch (operation) {
    case 'parse':
      try {
        const reviver = options.reviver ? eval(`(${options.reviver})`) : undefined;
        const parsed = JSON.parse(input as string, reviver);
        return {
          operation,
          success: true,
          result: parsed,
          inputSize: (input as string).length
        };
      } catch (error) {
        return {
          operation,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    
    case 'stringify':
      try {
        const replacer = options.replacer ? eval(`(${options.replacer})`) : undefined;
        const stringified = JSON.stringify(input, replacer, options.space);
        return {
          operation,
          success: true,
          result: stringified,
          outputSize: stringified.length
        };
      } catch (error) {
        return {
          operation,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    
    case 'validate':
      try {
        JSON.parse(input as string);
        return {
          operation,
          valid: true,
          inputSize: (input as string).length
        };
      } catch (error) {
        return {
          operation,
          valid: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    
    default:
      throw new Error(`Unknown parsing operation: ${operation}`);
  }
});

/**
 * Mathematical computations
 */
registerTaskHandler('computation', async (data: {
  operation: 'factorial' | 'fibonacci' | 'prime-check' | 'matrix-multiply' | 'sort';
  input: any;
  options?: any;
}) => {
  const { operation, input, options = {} } = data;
  
  switch (operation) {
    case 'factorial':
      const n = input as number;
      if (n < 0 || n > 170) throw new Error('Invalid input for factorial');
      
      let factorialResult = 1;
      for (let i = 2; i <= n; i++) {
        factorialResult *= i;
      }
      
      return { operation, input: n, result: factorialResult };
    
    case 'fibonacci':
      const fib = input as number;
      if (fib < 0 || fib > 100) throw new Error('Invalid input for fibonacci');
      
      if (fib <= 1) return { operation, input: fib, result: fib };
      
      let a = 0, b = 1;
      for (let i = 2; i <= fib; i++) {
        [a, b] = [b, a + b];
      }
      
      return { operation, input: fib, result: b };
    
    case 'prime-check':
      const num = input as number;
      if (num < 2) return { operation, input: num, isPrime: false };
      
      for (let i = 2; i <= Math.sqrt(num); i++) {
        if (num % i === 0) {
          return { operation, input: num, isPrime: false };
        }
      }
      
      return { operation, input: num, isPrime: true };
    
    case 'matrix-multiply':
      const { matrixA, matrixB } = input;
      if (!Array.isArray(matrixA) || !Array.isArray(matrixB)) {
        throw new Error('Invalid matrices for multiplication');
      }
      
      const rowsA = matrixA.length;
      const colsA = matrixA[0]?.length || 0;
      const colsB = matrixB[0]?.length || 0;
      
      if (colsA !== matrixB.length) {
        throw new Error('Incompatible matrix dimensions');
      }
      
      const matrixResult = Array(rowsA).fill(null).map(() => Array(colsB).fill(0));
      
      for (let i = 0; i < rowsA; i++) {
        for (let j = 0; j < colsB; j++) {
          for (let k = 0; k < colsA; k++) {
            matrixResult[i][j] += matrixA[i][k] * matrixB[k][j];
          }
        }
      }
      
      return { operation, result: matrixResult, dimensions: `${rowsA}x${colsB}` };
    
    case 'sort':
      const { array, algorithm = 'quicksort' } = input;
      if (!Array.isArray(array)) throw new Error('Input must be an array');
      
      const sortedArray = [...array];
      const startTime = performance.now();
      
      switch (algorithm) {
        case 'quicksort':
          quickSort(sortedArray, 0, sortedArray.length - 1);
          break;
        case 'mergesort':
          mergeSortInPlace(sortedArray, 0, sortedArray.length - 1);
          break;
        case 'heapsort':
          heapSort(sortedArray);
          break;
        default:
          sortedArray.sort((a, b) => a - b);
      }
      
      const endTime = performance.now();
      
      return {
        operation,
        algorithm,
        inputSize: array.length,
        result: sortedArray,
        executionTime: endTime - startTime
      };
    
    default:
      throw new Error(`Unknown computation operation: ${operation}`);
  }
});

/**
 * Data processing operations
 */
registerTaskHandler('data-processing', async (data: {
  operation: 'filter' | 'map' | 'reduce' | 'group' | 'aggregate';
  input: any[];
  options: any;
}) => {
  const { operation, input, options } = data;
  
  if (!Array.isArray(input)) {
    throw new Error('Input must be an array for data processing operations');
  }
  
  const startTime = performance.now();
  let result: any;
  
  switch (operation) {
    case 'filter':
      const filterFn = eval(`(${options.predicate})`);
      result = input.filter(filterFn);
      break;
    
    case 'map':
      const mapFn = eval(`(${options.transform})`);
      result = input.map(mapFn);
      break;
    
    case 'reduce':
      const reduceFn = eval(`(${options.reducer})`);
      result = input.reduce(reduceFn, options.initialValue);
      break;
    
    case 'group':
      const groupFn = eval(`(${options.keySelector})`);
      result = input.reduce((groups, item) => {
        const key = groupFn(item);
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return groups;
      }, {});
      break;
    
    case 'aggregate':
      const aggregations = options.aggregations || {};
      result = {};
      
      for (const [key, aggType] of Object.entries(aggregations)) {
        const values = input.map(item => item[key]).filter(v => v != null);
        
        switch (aggType) {
          case 'sum':
            result[key] = values.reduce((sum, val) => sum + val, 0);
            break;
          case 'avg':
            result[key] = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
            break;
          case 'min':
            result[key] = values.length > 0 ? Math.min(...values) : null;
            break;
          case 'max':
            result[key] = values.length > 0 ? Math.max(...values) : null;
            break;
          case 'count':
            result[key] = values.length;
            break;
        }
      }
      break;
    
    default:
      throw new Error(`Unknown data processing operation: ${operation}`);
  }
  
  const endTime = performance.now();
  
  return {
    operation,
    inputSize: input.length,
    result,
    executionTime: endTime - startTime
  };
});

/**
 * Sorting algorithm implementations
 */
function quickSort(arr: number[], low: number, high: number): void {
  if (low < high) {
    const pi = partition(arr, low, high);
    quickSort(arr, low, pi - 1);
    quickSort(arr, pi + 1, high);
  }
}

function partition(arr: number[], low: number, high: number): number {
  const pivot = arr[high];
  let i = low - 1;
  
  for (let j = low; j < high; j++) {
    if (arr[j] < pivot) {
      i++;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  
  [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
  return i + 1;
}

function mergeSortInPlace(arr: number[], left: number, right: number): void {
  if (left < right) {
    const mid = Math.floor((left + right) / 2);
    mergeSortInPlace(arr, left, mid);
    mergeSortInPlace(arr, mid + 1, right);
    merge(arr, left, mid, right);
  }
}

function merge(arr: number[], left: number, mid: number, right: number): void {
  const leftArr = arr.slice(left, mid + 1);
  const rightArr = arr.slice(mid + 1, right + 1);
  
  let i = 0, j = 0, k = left;
  
  while (i < leftArr.length && j < rightArr.length) {
    if (leftArr[i] <= rightArr[j]) {
      arr[k++] = leftArr[i++];
    } else {
      arr[k++] = rightArr[j++];
    }
  }
  
  while (i < leftArr.length) {
    arr[k++] = leftArr[i++];
  }
  
  while (j < rightArr.length) {
    arr[k++] = rightArr[j++];
  }
}

function heapSort(arr: number[]): void {
  const n = arr.length;
  
  // Build heap
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    heapify(arr, n, i);
  }
  
  // Extract elements
  for (let i = n - 1; i > 0; i--) {
    [arr[0], arr[i]] = [arr[i], arr[0]];
    heapify(arr, i, 0);
  }
}

function heapify(arr: number[], n: number, i: number): void {
  let largest = i;
  const left = 2 * i + 1;
  const right = 2 * i + 2;
  
  if (left < n && arr[left] > arr[largest]) {
    largest = left;
  }
  
  if (right < n && arr[right] > arr[largest]) {
    largest = right;
  }
  
  if (largest !== i) {
    [arr[i], arr[largest]] = [arr[largest], arr[i]];
    heapify(arr, n, largest);
  }
}

/**
 * Worker message handler
 */
if (parentPort) {
  parentPort.on('message', async (message) => {
    const { type, task } = message;
    
    if (type === 'execute') {
      const startTime = performance.now();
      
      try {
        const handler = taskHandlers.get(task.type);
        if (!handler) {
          throw new Error(`Unknown task type: ${task.type}`);
        }
        
        const result = await handler(task.data);
        const executionTime = performance.now() - startTime;
        
        parentPort!.postMessage({
          type: 'result',
          taskId: task.id,
          result,
          executionTime
        });
      } catch (error) {
        const executionTime = performance.now() - startTime;
        
        parentPort!.postMessage({
          type: 'result',
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
          executionTime
        });
      }
    }
  });
  
  // Signal that worker is ready
  parentPort.postMessage({
    type: 'ready',
    workerId: workerData?.workerId
  });
}

/**
 * Export task handlers for testing
 */
export { taskHandlers, registerTaskHandler };
