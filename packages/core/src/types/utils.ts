/**
 * @fileoverview Type utilities and helper types for the Tari JavaScript SDK
 * 
 * Provides utility types, conditional types, and helper functions for
 * working with complex type compositions and validations.
 */

// Core utility types

/**
 * Make all properties of T optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make specific properties required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific properties optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract properties of a specific type
 */
export type PropertiesOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Exclude properties of a specific type
 */
export type ExcludePropertiesOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? never : K;
}[keyof T];

/**
 * Get the type of a property by key
 */
export type PropertyType<T, K extends keyof T> = T[K];

/**
 * Create a union of all property types
 */
export type AllPropertyTypes<T> = T[keyof T];

/**
 * Create a type where all properties are readonly
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Create a type where all properties are mutable
 */
export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends object ? DeepMutable<T[P]> : T[P];
};

/**
 * Extract non-undefined properties
 */
export type NonUndefined<T> = T extends undefined ? never : T;

/**
 * Extract non-null properties
 */
export type NonNull<T> = T extends null ? never : T;

/**
 * Extract non-nullable properties
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

// Function type utilities

/**
 * Extract parameter types from a function
 */
export type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * Extract return type from a function
 */
export type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;

/**
 * Create an async version of a function type
 */
export type AsyncFunction<T extends (...args: any) => any> = T extends (...args: infer P) => infer R
  ? (...args: P) => Promise<R>
  : never;

/**
 * Extract the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

// Array and collection utilities

/**
 * Get the element type of an array
 */
export type ElementType<T> = T extends (infer U)[] ? U : never;

/**
 * Create a tuple of N elements of type T
 */
export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleHelper<T, N, []> : never;
type _TupleHelper<T, N extends number, R extends readonly unknown[]> = R['length'] extends N ? R : _TupleHelper<T, N, readonly [T, ...R]>;

/**
 * Get the length of a tuple type
 */
export type Length<T extends readonly any[]> = T['length'];

/**
 * Get the first element of a tuple
 */
export type Head<T extends readonly any[]> = T extends readonly [infer H, ...any[]] ? H : never;

/**
 * Get all but the first element of a tuple
 */
export type Tail<T extends readonly any[]> = T extends readonly [any, ...infer Rest] ? Rest : [];

/**
 * Reverse a tuple type
 */
export type Reverse<T extends readonly any[]> = T extends readonly [...infer Rest, infer Last]
  ? [Last, ...Reverse<Rest>]
  : [];

// Object manipulation utilities

/**
 * Pick properties by value type
 */
export type PickByValueType<T, U> = Pick<T, PropertiesOfType<T, U>>;

/**
 * Omit properties by value type
 */
export type OmitByValueType<T, U> = Omit<T, PropertiesOfType<T, U>>;

/**
 * Create a type with only optional properties
 */
export type OptionalProps<T> = PickByValueType<T, undefined>;

/**
 * Create a type with only required properties
 */
export type RequiredProps<T> = OmitByValueType<T, undefined>;

/**
 * Flatten nested object types
 */
export type Flatten<T> = T extends object ? T extends infer O ? { [K in keyof O]: O[K] } : never : T;

/**
 * Merge two object types
 */
export type Merge<T, U> = Flatten<Omit<T, keyof U> & U>;

/**
 * Deep merge two object types
 */
export type DeepMerge<T, U> = {
  [K in keyof T | keyof U]: K extends keyof U
    ? K extends keyof T
      ? T[K] extends object
        ? U[K] extends object
          ? DeepMerge<T[K], U[K]>
          : U[K]
        : U[K]
      : U[K]
    : K extends keyof T
    ? T[K]
    : never;
};

// Conditional type utilities

/**
 * Check if T extends U
 */
export type Extends<T, U> = T extends U ? true : false;

/**
 * Check if two types are equal
 */
export type Equal<T, U> = T extends U ? U extends T ? true : false : false;

/**
 * Check if T is never
 */
export type IsNever<T> = Equal<T, never>;

/**
 * Check if T is any
 */
export type IsAny<T> = Equal<T, any>;

/**
 * Check if T is unknown
 */
export type IsUnknown<T> = Equal<T, unknown>;

// String manipulation utilities

/**
 * Capitalize first letter of string literal type
 */
export type Capitalize<S extends string> = S extends `${infer F}${infer R}` ? `${Uppercase<F>}${R}` : S;

/**
 * Uncapitalize first letter of string literal type
 */
export type Uncapitalize<S extends string> = S extends `${infer F}${infer R}` ? `${Lowercase<F>}${R}` : S;

/**
 * Convert camelCase to snake_case
 */
export type CamelToSnake<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${CamelToSnake<U>}`
  : S;

/**
 * Convert snake_case to camelCase
 */
export type SnakeToCamel<S extends string> = S extends `${infer T}_${infer U}`
  ? `${T}${Capitalize<SnakeToCamel<U>>}`
  : S;

// Validation utilities

/**
 * Validate that a type satisfies a constraint
 */
export type Validate<T, U> = T extends U ? T : never;

/**
 * Assert that T extends U at compile time
 */
export type Assert<T extends U, U = any> = T;

/**
 * Compile-time error if condition is not met
 */
export type AssertTrue<T extends true> = T;

/**
 * Compile-time error if condition is met
 */
export type AssertFalse<T extends false> = T;

// JSON-related utilities

/**
 * Types that can be represented in JSON
 */
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

/**
 * Check if a type is JSON serializable
 */
export type IsJSONSerializable<T> = T extends JSONValue ? true : false;

/**
 * Convert a type to its JSON representation
 */
export type ToJSON<T> = T extends JSONValue
  ? T
  : T extends { toJSON(): infer U }
  ? U
  : T extends object
  ? { [K in keyof T]: ToJSON<T[K]> }
  : never;

// Event and callback utilities

/**
 * Extract event names from an event handler object
 */
export type EventNames<T> = keyof T;

/**
 * Extract handler type for a specific event
 */
export type EventHandler<T, K extends keyof T> = T[K];

/**
 * Create a typed event emitter interface
 */
export type TypedEventEmitter<T> = {
  on<K extends keyof T>(event: K, handler: T[K]): void;
  off<K extends keyof T>(event: K, handler: T[K]): void;
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K] extends (...args: any[]) => any ? T[K] : never>): void;
};

// Error handling utilities

/**
 * Create a result type for operations that can fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Extract the success type from a Result
 */
export type ResultSuccess<T> = T extends Result<infer U, any> ? U : never;

/**
 * Extract the error type from a Result
 */
export type ResultError<T> = T extends Result<any, infer E> ? E : never;

/**
 * Create an option type for nullable values
 */
export type Option<T> = T | null | undefined;

/**
 * Extract the inner type from an Option
 */
export type OptionValue<T> = T extends Option<infer U> ? U : never;

// Wallet-specific utility types

/**
 * Configuration object with required and optional fields
 */
export type WalletConfigLike<Required extends Record<string, any>, Optional extends Record<string, any> = {}> = 
  Required & Partial<Optional>;

/**
 * Handler function with error handling
 */
export type SafeHandler<T extends any[], R = void> = (...args: T) => R | Promise<R>;

/**
 * Callback with optional error parameter
 */
export type NodeCallback<T> = (error?: Error | null, result?: T) => void;

/**
 * Convert callback-style to promise-style
 */
export type Promisify<T extends (...args: any[]) => any> = T extends (...args: [...infer P, NodeCallback<infer R>]) => any
  ? (...args: P) => Promise<R>
  : never;

// Brand-aware utilities

/**
 * Check if a type is branded
 */
export type IsBranded<T> = T extends { readonly [__brand: symbol]: any } ? true : false;

/**
 * Extract all branded types from an object
 */
export type BrandedProperties<T> = {
  [K in keyof T]: IsBranded<T[K]> extends true ? K : never;
}[keyof T];

/**
 * Extract all non-branded types from an object
 */
export type UnbrandedProperties<T> = {
  [K in keyof T]: IsBranded<T[K]> extends false ? K : never;
}[keyof T];

// Re-export commonly used Node.js types
export type NodeProcess = typeof process;
export type NodeBuffer = Buffer;
export type NodeEventEmitter = import('events').EventEmitter;

// TypeScript version compatibility
export type NoInfer<T> = [T][T extends any ? 0 : never];
