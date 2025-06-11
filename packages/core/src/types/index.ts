/**
 * @fileoverview Core type definitions for Tari JavaScript SDK
 * 
 * This module contains fundamental types shared across all packages,
 * including network configurations, basic data structures, and
 * common interfaces that don't depend on FFI implementation.
 */

// Network configuration types
export enum NetworkType {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
  Nextnet = 'nextnet',
}

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace',
}

// Basic configuration interfaces
export interface BaseConfig {
  network: NetworkType;
  logLevel?: LogLevel;
}

// FFI handle types (placeholders for now)
export type NativeHandle = bigint;

export interface FFIResource {
  handle: NativeHandle;
  destroyed: boolean;
}

// Utility types
export type HexString = string;
export type Base58String = string;
export type EmojiId = string;

// Types are already exported above - no need to re-export
