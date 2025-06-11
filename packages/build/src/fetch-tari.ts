/**
 * Tari source code fetching and management
 */

import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { 
  NetworkType, 
  TariSourceConfig, 
  BuildError, 
  BuildErrorCode 
} from './types.js';
import { GitManager, GitCloneOptions } from './utils/git.js';
import { CacheManager, createCacheManager } from './utils/cache.js';
import { 
  TARI_REPO, 
  TAG_PATTERNS, 
  DEFAULT_CONFIG, 
  resolveTariTag 
} from './config.js';
import { createLogger, ProgressReporter } from './utils/logger.js';

const logger = createLogger('tari-fetch');

/** Tari source fetcher configuration */
export interface TariFetcherConfig {
  /** Base cache directory */
  cacheDir: string;
  /** Whether to use cache */
  useCache: boolean;
  /** Git clone timeout */
  timeout: number;
  /** Whether to force re-fetch */
  force: boolean;
}

/** Default fetcher configuration */
const DEFAULT_FETCHER_CONFIG: TariFetcherConfig = {
  cacheDir: DEFAULT_CONFIG.CACHE_DIR,
  useCache: true,
  timeout: DEFAULT_CONFIG.CLONE_TIMEOUT,
  force: false
};

/** Tari source fetch result */
export interface TariFetchResult {
  /** Path to Tari source directory */
  sourcePath: string;
  /** Resolved git tag */
  tag: string;
  /** Commit hash */
  commit: string;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Size of source in bytes */
  size: number;
}

/**
 * Tari source code fetcher and manager
 */
export class TariFetcher {
  private config: TariFetcherConfig;
  private cacheManager: CacheManager;

  constructor(config: Partial<TariFetcherConfig> = {}) {
    this.config = { ...DEFAULT_FETCHER_CONFIG, ...config };
    this.cacheManager = createCacheManager(this.config.cacheDir);
  }

  /**
   * Fetch Tari source code for the specified configuration
   */
  async fetch(sourceConfig: TariSourceConfig): Promise<TariFetchResult> {
    // Validate configuration
    this.validateConfig(sourceConfig);

    // Resolve git tag
    const tag = resolveTariTag(
      sourceConfig.version,
      sourceConfig.network,
      sourceConfig.buildNumber
    );

    logger.info(`Fetching Tari source for ${sourceConfig.network} network, tag: ${tag}`);

    // Generate cache key
    const cacheKey = this.generateCacheKey(sourceConfig, tag);

    // Check cache first (if enabled and not forced)
    if (this.config.useCache && !sourceConfig.force) {
      const cachedResult = await this.tryFromCache(cacheKey, tag);
      if (cachedResult) {
        return cachedResult;
      }
    }

    // Fetch from git
    return await this.fetchFromGit(sourceConfig, tag, cacheKey);
  }

  /**
   * List available Tari tags in a cached repository
   */
  async listAvailableTags(
    network: NetworkType,
    pattern?: string
  ): Promise<string[]> {
    // Try to find existing repository in cache
    const entries = await this.cacheManager.list();
    const networkEntries = entries.filter(entry => 
      entry.metadata.buildConfig?.network === network
    );

    if (networkEntries.length === 0) {
      logger.warn(`No cached repositories found for ${network} network`);
      return [];
    }

    // Use the most recent repository
    const latestEntry = networkEntries[0];
    
    try {
      const tags = await GitManager.listTags(latestEntry.path, pattern);
      logger.debug(`Found ${tags.length} tags for ${network} network`);
      return tags;
    } catch (error) {
      logger.warn(`Failed to list tags: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Check if a specific tag exists for a network
   */
  async tagExists(
    network: NetworkType,
    version: string,
    buildNumber?: number
  ): Promise<boolean> {
    const tag = resolveTariTag(version, network, buildNumber);
    
    // Try local repositories first
    const entries = await this.cacheManager.list();
    for (const entry of entries) {
      if (entry.metadata.buildConfig?.network === network) {
        try {
          const exists = await GitManager.tagExists(entry.path, tag);
          if (exists) {
            return true;
          }
        } catch {
          // Continue to next entry
        }
      }
    }

    // If not found locally, try fetching without checkout
    try {
      const tempConfig: TariSourceConfig = {
        baseUrl: TARI_REPO.URL,
        version,
        network,
        buildNumber,
        cacheDir: this.config.cacheDir
      };

      // Fetch to a temporary location to check tag
      const tempPath = join(this.config.cacheDir, `temp-${Date.now()}`);
      
      await GitManager.clone(TARI_REPO.URL, tempPath, {
        depth: 1,
        timeout: this.config.timeout
      });

      await GitManager.fetch(tempPath);
      const exists = await GitManager.tagExists(tempPath, tag);

      // Cleanup temp directory
      try {
        await this.cacheManager.delete(`temp-${Date.now()}`);
      } catch {
        // Ignore cleanup errors
      }

      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Get information about a cached Tari repository
   */
  async getRepositoryInfo(sourcePath: string): Promise<{
    network: NetworkType;
    tag: string;
    commit: string;
    size: number;
    lastUpdated: number;
  } | null> {
    if (!existsSync(sourcePath) || !GitManager.isGitRepository(sourcePath)) {
      return null;
    }

    try {
      const repoInfo = await GitManager.getRepoInfo(sourcePath);
      const size = await GitManager.getRepositorySize(sourcePath);

      // Try to determine network from tag pattern
      let network = NetworkType.Mainnet;
      if (repoInfo.tag) {
        if (repoInfo.tag.includes('-pre.')) {
          network = NetworkType.Testnet;
        } else if (repoInfo.tag.includes('-rc.')) {
          network = NetworkType.Nextnet;
        }
      }

      return {
        network,
        tag: repoInfo.tag || repoInfo.branch,
        commit: repoInfo.commit,
        size,
        lastUpdated: Date.now() // Would need to get from filesystem
      };
    } catch (error) {
      logger.warn(`Failed to get repository info: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Clean up old cached repositories
   */
  async cleanup(): Promise<number> {
    logger.info('Cleaning up old Tari source repositories');
    
    const cleanedEntries = await this.cacheManager.cleanup();
    const freedSpace = await this.cacheManager.enforceSize();
    
    logger.info(`Cleanup completed: ${cleanedEntries} expired entries, ${freedSpace} entries removed for size`);
    
    return cleanedEntries + freedSpace;
  }

  /**
   * Validate source configuration
   */
  private validateConfig(config: TariSourceConfig): void {
    if (!config.baseUrl) {
      throw new BuildError(
        BuildErrorCode.InvalidConfig,
        'Base URL is required for Tari source configuration'
      );
    }

    if (!config.version || !/^\d+\.\d+\.\d+$/.test(config.version)) {
      throw new BuildError(
        BuildErrorCode.InvalidConfig,
        `Invalid version format: ${config.version}. Expected semantic version (e.g., 4.3.1)`
      );
    }

    if (!Object.values(NetworkType).includes(config.network)) {
      throw new BuildError(
        BuildErrorCode.InvalidConfig,
        `Invalid network type: ${config.network}`
      );
    }

    if (config.network !== NetworkType.Mainnet && config.buildNumber === undefined) {
      throw new BuildError(
        BuildErrorCode.InvalidConfig,
        `Build number is required for ${config.network} network`
      );
    }
  }

  /**
   * Try to get result from cache
   */
  private async tryFromCache(
    cacheKey: string,
    tag: string
  ): Promise<TariFetchResult | null> {
    try {
      const entry = await this.cacheManager.get(cacheKey);
      if (!entry) {
        logger.debug('No cache entry found');
        return null;
      }

      // Verify repository is still valid
      if (!GitManager.isGitRepository(entry.path)) {
        logger.warn('Cached repository is invalid, removing from cache');
        await this.cacheManager.delete(cacheKey);
        return null;
      }

      const repoInfo = await GitManager.getRepoInfo(entry.path);
      
      logger.success(`Using cached Tari source: ${entry.path}`);
      return {
        sourcePath: entry.path,
        tag,
        commit: repoInfo.commit,
        fromCache: true,
        size: entry.size
      };
    } catch (error) {
      logger.warn(`Failed to use cache: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Fetch from git repository
   */
  private async fetchFromGit(
    sourceConfig: TariSourceConfig,
    tag: string,
    cacheKey: string
  ): Promise<TariFetchResult> {
    const targetPath = join(this.config.cacheDir, `tari-${tag}`);
    
    // Ensure target directory doesn't exist or clean it
    if (existsSync(targetPath)) {
      logger.warn(`Removing existing directory: ${targetPath}`);
      await this.cacheManager.delete(cacheKey);
    }

    // Create progress reporter
    const progress = new ProgressReporter('Fetching Tari source', 3, logger);

    try {
      // Step 1: Clone repository
      progress.update(1, 'Cloning repository');
      
      const cloneOptions: GitCloneOptions = {
        branch: tag,
        depth: 1,
        submodules: true,
        timeout: this.config.timeout,
        force: true
      };

      await GitManager.clone(sourceConfig.baseUrl, targetPath, cloneOptions);

      // Step 2: Verify checkout
      progress.update(1, 'Verifying checkout');
      
      const repoInfo = await GitManager.getRepoInfo(targetPath);
      
      // Verify we're on the correct tag
      if (repoInfo.tag !== tag && repoInfo.branch !== tag) {
        // Try explicit checkout
        await GitManager.checkout(targetPath, tag);
        const updatedInfo = await GitManager.getRepoInfo(targetPath);
        
        if (updatedInfo.tag !== tag && updatedInfo.branch !== tag) {
          throw new BuildError(
            BuildErrorCode.TagNotFound,
            `Failed to checkout tag ${tag}. Current: ${updatedInfo.tag || updatedInfo.branch}`
          );
        }
      }

      // Step 3: Cache the result
      progress.update(1, 'Caching result');
      
      const size = await GitManager.getRepositorySize(targetPath);
      
      await this.cacheManager.set(cacheKey, targetPath, {
        tariCommit: repoInfo.commit,
        buildConfig: {
          network: sourceConfig.network,
          tariTag: tag
        }
      });

      progress.complete('Tari source fetched successfully');

      return {
        sourcePath: targetPath,
        tag,
        commit: repoInfo.commit,
        fromCache: false,
        size
      };
    } catch (error) {
      progress.fail('Failed to fetch Tari source');
      
      // Cleanup on failure
      try {
        await this.cacheManager.delete(cacheKey);
      } catch {
        // Ignore cleanup errors
      }

      if (error instanceof BuildError) {
        throw error;
      }

      throw new BuildError(
        BuildErrorCode.GitCloneFailed,
        `Failed to fetch Tari source: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generate cache key for source configuration
   */
  private generateCacheKey(config: TariSourceConfig, tag: string): string {
    return `tari-${config.network}-${tag}`;
  }
}

/**
 * Create a default Tari fetcher instance
 */
export function createTariFetcher(config?: Partial<TariFetcherConfig>): TariFetcher {
  return new TariFetcher(config);
}

/**
 * Convenience function to fetch Tari source
 */
export async function fetchTariSource(
  version: string,
  network: NetworkType,
  options: {
    buildNumber?: number;
    cacheDir?: string;
    force?: boolean;
  } = {}
): Promise<TariFetchResult> {
  const fetcher = createTariFetcher({
    cacheDir: options.cacheDir,
    force: options.force
  });

  const config: TariSourceConfig = {
    baseUrl: TARI_REPO.URL,
    version,
    network,
    buildNumber: options.buildNumber,
    cacheDir: options.cacheDir || DEFAULT_CONFIG.CACHE_DIR,
    force: options.force
  };

  return await fetcher.fetch(config);
}
