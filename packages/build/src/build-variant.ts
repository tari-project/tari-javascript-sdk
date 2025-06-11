/**
 * Network variant build orchestration
 */

import { join } from 'path';
import { NetworkType, BuildConfig, BuildTarget, PackageVariant } from './types.js';
import { PACKAGE_NAMING, resolveTariTag } from './config.js';
import { TariFetcher } from './fetch-tari.js';
import { FFICompiler } from './compile-ffi.js';
import { createLogger, ProgressReporter } from './utils/logger.js';

const logger = createLogger('build-variant');

export interface VariantBuildOptions {
  version: string;
  buildNumber?: number;
  targets: BuildTarget[];
  outputDir: string;
  debug?: boolean;
  force?: boolean;
}

export interface VariantBuildResult {
  network: NetworkType;
  packageName: string;
  binaries: Array<{
    target: BuildTarget;
    path: string;
    size: number;
  }>;
  buildTime: number;
}

export class VariantBuilder {
  async buildVariant(
    network: NetworkType,
    options: VariantBuildOptions
  ): Promise<VariantBuildResult> {
    const startTime = Date.now();
    const progress = new ProgressReporter(`Building ${network} variant`, 4, logger);

    try {
      // Step 1: Fetch Tari source
      progress.update(1, 'Fetching Tari source');
      const fetcher = new TariFetcher();
      const source = await fetcher.fetch({
        baseUrl: 'https://github.com/tari-project/tari.git',
        version: options.version,
        network,
        buildNumber: options.buildNumber,
        cacheDir: '.tari-cache',
        force: options.force
      });

      // Step 2: Compile for each target
      progress.update(1, 'Compiling FFI binaries');
      const compiler = new FFICompiler();
      const binaries = [];

      for (const target of options.targets) {
        const config: BuildConfig = {
          network,
          tariTag: source.tag,
          features: ['wallet'],
          outputPath: join(options.outputDir, network, target.platform, target.arch),
          packageName: PACKAGE_NAMING.getPackageName(network),
          target,
          sourcePath: source.sourcePath,
          debug: options.debug
        };

        const result = await compiler.compile(config);
        binaries.push({
          target,
          path: result.binaryPath,
          size: 0 // Would get from fs.stat
        });
      }

      progress.complete('Variant build completed');

      return {
        network,
        packageName: PACKAGE_NAMING.getPackageName(network),
        binaries,
        buildTime: Date.now() - startTime
      };
    } catch (error) {
      progress.fail('Variant build failed');
      throw error;
    }
  }
}
