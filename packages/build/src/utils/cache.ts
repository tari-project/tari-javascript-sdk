/**
 * Cache management for Tari source code and build artifacts
 */

import { existsSync, statSync } from 'fs';
import { readFile, writeFile, mkdir, rm, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { CacheMetadata, BuildConfig, BuildErrorCode, BuildError } from '../types.js';
import { createLogger } from './logger.js';

const logger = createLogger('cache');

/** Cache configuration */
export interface CacheConfig {
  /** Base cache directory */
  baseDir: string;
  /** Maximum cache age in milliseconds */
  maxAge: number;
  /** Maximum cache size in bytes */
  maxSize: number;
  /** Whether to enable cache compression */
  compress: boolean;
}

/** Cache entry information */
export interface CacheEntry {
  /** Unique cache key */
  key: string;
  /** Full path to cached content */
  path: string;
  /** Cache metadata */
  metadata: CacheMetadata;
  /** Size of cached content in bytes */
  size: number;
  /** Whether entry is valid */
  isValid: boolean;
}

/** Default cache configuration */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  baseDir: '.tari-cache',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxSize: 5 * 1024 * 1024 * 1024, // 5GB
  compress: false
};

/**
 * Cache manager for Tari source code and build artifacts
 */
export class CacheManager {
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get cache entry if it exists and is valid
   */
  async get(key: string): Promise<CacheEntry | null> {
    try {
      const cachePath = this.getCachePath(key);
      const metadataPath = this.getMetadataPath(key);

      if (!existsSync(cachePath) || !existsSync(metadataPath)) {
        logger.debug(`Cache miss for key: ${key}`);
        return null;
      }

      const metadata = await this.readMetadata(key);
      const stats = statSync(cachePath);

      // Check if cache entry is expired
      if (this.isExpired(metadata)) {
        logger.debug(`Cache expired for key: ${key}`);
        await this.delete(key);
        return null;
      }

      const entry: CacheEntry = {
        key,
        path: cachePath,
        metadata,
        size: stats.size,
        isValid: true
      };

      logger.debug(`Cache hit for key: ${key}`);
      return entry;
    } catch (error) {
      logger.warn(`Failed to read cache for key ${key}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Store content in cache
   */
  async set(
    key: string,
    sourcePath: string,
    metadata: Partial<CacheMetadata>
  ): Promise<void> {
    try {
      const cachePath = this.getCachePath(key);
      const metadataPath = this.getMetadataPath(key);

      // Ensure cache directory exists
      await mkdir(dirname(cachePath), { recursive: true });

      // Copy source to cache (for directories, we'll just create a symlink for efficiency)
      if (statSync(sourcePath).isDirectory()) {
        // For directories, we can't easily copy, so we'll store the path reference
        const fullMetadata: CacheMetadata = {
          key,
          createdAt: Date.now(),
          tariCommit: '',
          buildConfig: {},
          checksums: {},
          ...metadata,
          sourcePath // Store original path for directories
        };

        await this.writeMetadata(key, fullMetadata);
        logger.info(`Cached directory reference for key: ${key}`);
      } else {
        // For files, copy to cache
        const content = await readFile(sourcePath);
        await writeFile(cachePath, content);

        const checksum = this.calculateChecksum(content);
        const fullMetadata: CacheMetadata = {
          key,
          createdAt: Date.now(),
          tariCommit: '',
          buildConfig: {},
          checksums: { [key]: checksum },
          ...metadata
        };

        await this.writeMetadata(key, fullMetadata);
        logger.info(`Cached file for key: ${key}`);
      }
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.CacheWriteFailed,
        `Failed to cache content for key ${key}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<void> {
    try {
      const cachePath = this.getCachePath(key);
      const metadataPath = this.getMetadataPath(key);

      await Promise.all([
        existsSync(cachePath) ? rm(cachePath, { recursive: true, force: true }) : Promise.resolve(),
        existsSync(metadataPath) ? rm(metadataPath, { force: true }) : Promise.resolve()
      ]);

      logger.debug(`Deleted cache entry: ${key}`);
    } catch (error) {
      logger.warn(`Failed to delete cache entry ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      if (existsSync(this.config.baseDir)) {
        await rm(this.config.baseDir, { recursive: true, force: true });
        logger.info('Cache cleared');
      }
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.CacheWriteFailed,
        `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List all cache entries
   */
  async list(): Promise<CacheEntry[]> {
    try {
      if (!existsSync(this.config.baseDir)) {
        return [];
      }

      const entries: CacheEntry[] = [];
      const items = await readdir(this.config.baseDir);

      for (const item of items) {
        if (item.endsWith('.meta.json')) {
          const key = item.replace('.meta.json', '');
          const entry = await this.get(key);
          if (entry) {
            entries.push(entry);
          }
        }
      }

      return entries.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
    } catch (error) {
      logger.warn(`Failed to list cache entries: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry: number;
    newestEntry: number;
  }> {
    const entries = await this.list();

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: 0,
        newestEntry: 0
      };
    }

    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const timestamps = entries.map(entry => entry.metadata.createdAt);

    return {
      totalEntries: entries.length,
      totalSize,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps)
    };
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanup(): Promise<number> {
    const entries = await this.list();
    let cleanedCount = 0;

    for (const entry of entries) {
      if (this.isExpired(entry.metadata)) {
        await this.delete(entry.key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired cache entries`);
    }

    return cleanedCount;
  }

  /**
   * Ensure cache size is within limits
   */
  async enforceSize(): Promise<number> {
    const stats = await this.getStats();
    
    if (stats.totalSize <= this.config.maxSize) {
      return 0;
    }

    logger.info(`Cache size (${this.formatSize(stats.totalSize)}) exceeds limit (${this.formatSize(this.config.maxSize)})`);

    const entries = await this.list();
    // Sort by last accessed time (oldest first)
    entries.sort((a, b) => a.metadata.createdAt - b.metadata.createdAt);

    let removedCount = 0;
    let freedSize = 0;

    for (const entry of entries) {
      if (stats.totalSize - freedSize <= this.config.maxSize) {
        break;
      }

      await this.delete(entry.key);
      freedSize += entry.size;
      removedCount++;
    }

    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} cache entries to free ${this.formatSize(freedSize)}`);
    }

    return removedCount;
  }

  /**
   * Generate cache key from build configuration
   */
  static generateKey(config: Partial<BuildConfig>): string {
    const keyData = {
      network: config.network,
      tariTag: config.tariTag,
      target: config.target?.rustTarget,
      features: config.features?.sort().join(','),
      debug: config.debug || false
    };

    const hash = createHash('sha256');
    hash.update(JSON.stringify(keyData));
    return hash.digest('hex').slice(0, 16);
  }

  /**
   * Get cache path for a key
   */
  private getCachePath(key: string): string {
    return join(this.config.baseDir, key);
  }

  /**
   * Get metadata path for a key
   */
  private getMetadataPath(key: string): string {
    return join(this.config.baseDir, `${key}.meta.json`);
  }

  /**
   * Read metadata for a cache entry
   */
  private async readMetadata(key: string): Promise<CacheMetadata> {
    try {
      const metadataPath = this.getMetadataPath(key);
      const content = await readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.CacheReadFailed,
        `Failed to read cache metadata for key ${key}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        false,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Write metadata for a cache entry
   */
  private async writeMetadata(key: string, metadata: CacheMetadata): Promise<void> {
    try {
      const metadataPath = this.getMetadataPath(key);
      await mkdir(dirname(metadataPath), { recursive: true });
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.CacheWriteFailed,
        `Failed to write cache metadata for key ${key}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(metadata: CacheMetadata): boolean {
    const age = Date.now() - metadata.createdAt;
    return age > this.config.maxAge;
  }

  /**
   * Calculate checksum for content
   */
  private calculateChecksum(content: Buffer): string {
    const hash = createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * Format size in human readable format
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

/**
 * Create a default cache manager instance
 */
export function createCacheManager(baseDir?: string): CacheManager {
  return new CacheManager(baseDir ? { baseDir } : {});
}
