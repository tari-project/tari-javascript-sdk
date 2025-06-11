#!/usr/bin/env node
/**
 * @fileoverview Script to compile Tari FFI bindings
 */

import { FFICompiler } from '../src/compile/index';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: compile-ffi <source-path> <output-path>');
    console.error('Example: compile-ffi ./tari-source ./output');
    process.exit(1);
  }

  const [sourcePath, outputPath] = args;

  try {
    console.log('Checking compilation dependencies...');
    const depsOk = await FFICompiler.checkDependencies();
    if (!depsOk) {
      console.error('Missing compilation dependencies');
      process.exit(1);
    }

    console.log(`Compiling FFI from ${sourcePath} to ${outputPath}...`);
    
    const config = {
      sourcePath,
      outputPath,
      target: { triple: process.arch, name: process.platform },
      features: ['wallet'],
      profile: 'release' as const,
      stripSymbols: true,
    };

    const binaryPath = await FFICompiler.compile(config);
    console.log(`FFI compiled successfully: ${binaryPath}`);
  } catch (error) {
    console.error('Failed to compile FFI:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
