/**
 * @fileoverview Build system types and interfaces
 */

import { NetworkType } from '@tari-project/tarijs-core';

export interface TariSourceConfig {
  baseUrl: string;
  version: string;
  network: NetworkType;
  cachePath?: string;
}

export interface CompilationTarget {
  triple: string;
  name: string;
  rustcFlags?: string[];
  linkerFlags?: string[];
}

export interface FFICompileConfig {
  sourcePath: string;
  outputPath: string;
  target: CompilationTarget;
  features: string[];
  profile: 'debug' | 'release';
  stripSymbols?: boolean;
}

export interface PackageVariant {
  network: NetworkType;
  packageName: string;
  binaryPath: string;
  outputPath: string;
  npmTag?: string;
}

// Platform detection
export const SUPPORTED_TARGETS: CompilationTarget[] = [
  { triple: 'x86_64-pc-windows-msvc', name: 'Windows x64' },
  { triple: 'x86_64-apple-darwin', name: 'macOS Intel' },
  { triple: 'aarch64-apple-darwin', name: 'macOS Apple Silicon' },
  { triple: 'x86_64-unknown-linux-gnu', name: 'Linux x64' },
  { triple: 'aarch64-unknown-linux-gnu', name: 'Linux ARM64' },
  { triple: 'x86_64-unknown-linux-musl', name: 'Alpine Linux' },
];
