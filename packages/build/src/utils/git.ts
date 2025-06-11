/**
 * Git utilities for Tari source fetching and management
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { BuildError, BuildErrorCode } from '../types.js';
import { createLogger } from './logger.js';

const execAsync = promisify(exec);
const logger = createLogger('git');

/** Git clone options */
export interface GitCloneOptions {
  /** Branch or tag to clone */
  branch?: string;
  /** Clone depth (for shallow clones) */
  depth?: number;
  /** Whether to include submodules */
  submodules?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to overwrite existing directory */
  force?: boolean;
}

/** Git repository information */
export interface GitRepoInfo {
  /** Current commit hash */
  commit: string;
  /** Current branch */
  branch: string;
  /** Current tag (if on a tag) */
  tag?: string;
  /** Repository URL */
  remoteUrl: string;
  /** Whether repository is clean */
  isClean: boolean;
}

/**
 * Git operations manager for Tari source code
 */
export class GitManager {
  /**
   * Check if git is available
   */
  static async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync('git --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clone a git repository
   */
  static async clone(
    url: string,
    targetPath: string,
    options: GitCloneOptions = {}
  ): Promise<void> {
    const {
      branch,
      depth = 1,
      submodules = false,
      timeout = 300000, // 5 minutes
      force = false
    } = options;

    logger.info(`Cloning ${url} to ${targetPath}`);

    // Check if target exists
    if (existsSync(targetPath)) {
      if (force) {
        logger.warn(`Removing existing directory: ${targetPath}`);
        await rm(targetPath, { recursive: true, force: true });
      } else {
        throw new BuildError(
          BuildErrorCode.GitCloneFailed,
          `Target directory already exists: ${targetPath}`,
          undefined,
          false
        );
      }
    }

    // Ensure parent directory exists
    const parentDir = join(targetPath, '..');
    await mkdir(parentDir, { recursive: true });

    // Build git clone command
    const args = ['clone'];
    
    if (depth > 0) {
      args.push('--depth', depth.toString());
    }
    
    if (branch) {
      args.push('--branch', branch);
    }
    
    if (submodules) {
      args.push('--recurse-submodules');
    }
    
    args.push(url, targetPath);

    try {
      await GitManager.runGitCommand(args, { timeout });
      logger.success(`Successfully cloned ${url}`);
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.GitCloneFailed,
        `Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        true, // Recoverable - can retry
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Fetch latest changes from remote
   */
  static async fetch(repoPath: string, remote: string = 'origin'): Promise<void> {
    if (!existsSync(repoPath)) {
      throw new BuildError(
        BuildErrorCode.GitCloneFailed,
        `Repository path does not exist: ${repoPath}`
      );
    }

    logger.debug(`Fetching from ${remote} in ${repoPath}`);

    try {
      await GitManager.runGitCommand(['fetch', remote], { 
        cwd: repoPath 
      });
      logger.debug('Fetch completed successfully');
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.NetworkError,
        `Failed to fetch from remote: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Checkout a specific branch or tag
   */
  static async checkout(
    repoPath: string, 
    ref: string, 
    force: boolean = false
  ): Promise<void> {
    if (!existsSync(repoPath)) {
      throw new BuildError(
        BuildErrorCode.GitCloneFailed,
        `Repository path does not exist: ${repoPath}`
      );
    }

    logger.debug(`Checking out ${ref} in ${repoPath}`);

    const args = ['checkout'];
    if (force) {
      args.push('--force');
    }
    args.push(ref);

    try {
      await GitManager.runGitCommand(args, { cwd: repoPath });
      logger.debug(`Successfully checked out ${ref}`);
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.TagNotFound,
        `Failed to checkout ${ref}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        false,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get repository information
   */
  static async getRepoInfo(repoPath: string): Promise<GitRepoInfo> {
    if (!existsSync(repoPath)) {
      throw new BuildError(
        BuildErrorCode.GitCloneFailed,
        `Repository path does not exist: ${repoPath}`
      );
    }

    try {
      const [commit, branch, remoteUrl, status] = await Promise.all([
        GitManager.getCommitHash(repoPath),
        GitManager.getCurrentBranch(repoPath),
        GitManager.getRemoteUrl(repoPath),
        GitManager.getStatus(repoPath)
      ]);

      // Try to get current tag
      let tag: string | undefined;
      try {
        tag = await GitManager.getCurrentTag(repoPath);
      } catch {
        // Not on a tag, which is fine
      }

      return {
        commit,
        branch,
        tag,
        remoteUrl,
        isClean: status.trim().length === 0
      };
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.GitCloneFailed,
        `Failed to get repository info: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        false,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if a tag exists in the repository
   */
  static async tagExists(repoPath: string, tag: string): Promise<boolean> {
    try {
      await GitManager.runGitCommand(['rev-parse', `refs/tags/${tag}`], {
        cwd: repoPath
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List available tags in the repository
   */
  static async listTags(repoPath: string, pattern?: string): Promise<string[]> {
    const args = ['tag', '--list'];
    if (pattern) {
      args.push(pattern);
    }

    try {
      const result = await GitManager.runGitCommand(args, { cwd: repoPath });
      return result.stdout
        .split('\n')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
        .sort();
    } catch (error) {
      throw new BuildError(
        BuildErrorCode.GitCloneFailed,
        `Failed to list tags: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        false,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get current commit hash
   */
  private static async getCommitHash(repoPath: string): Promise<string> {
    const result = await GitManager.runGitCommand(['rev-parse', 'HEAD'], {
      cwd: repoPath
    });
    return result.stdout.trim();
  }

  /**
   * Get current branch name
   */
  private static async getCurrentBranch(repoPath: string): Promise<string> {
    const result = await GitManager.runGitCommand(['branch', '--show-current'], {
      cwd: repoPath
    });
    return result.stdout.trim();
  }

  /**
   * Get current tag (if on a tag)
   */
  private static async getCurrentTag(repoPath: string): Promise<string> {
    const result = await GitManager.runGitCommand(['describe', '--exact-match', '--tags'], {
      cwd: repoPath
    });
    return result.stdout.trim();
  }

  /**
   * Get remote URL
   */
  private static async getRemoteUrl(repoPath: string, remote: string = 'origin'): Promise<string> {
    const result = await GitManager.runGitCommand(['remote', 'get-url', remote], {
      cwd: repoPath
    });
    return result.stdout.trim();
  }

  /**
   * Get git status
   */
  private static async getStatus(repoPath: string): Promise<string> {
    const result = await GitManager.runGitCommand(['status', '--porcelain'], {
      cwd: repoPath
    });
    return result.stdout;
  }

  /**
   * Run a git command with timeout and error handling
   */
  private static async runGitCommand(
    args: string[],
    options: {
      cwd?: string;
      timeout?: number;
    } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const { cwd = process.cwd(), timeout = 30000 } = options;

    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', reject);

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Git command failed with code ${code}: ${stderr || 'Unknown error'}`));
        }
      });

      // Set timeout
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Git command timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timer);
      });
    });
  }

  /**
   * Validate that a directory is a git repository
   */
  static isGitRepository(path: string): boolean {
    try {
      const gitDir = join(path, '.git');
      return existsSync(gitDir) && statSync(gitDir).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get the size of a git repository
   */
  static async getRepositorySize(repoPath: string): Promise<number> {
    if (!GitManager.isGitRepository(repoPath)) {
      return 0;
    }

    try {
      const result = await GitManager.runGitCommand(['count-objects', '-vH'], {
        cwd: repoPath
      });

      // Parse output for size information
      const lines = result.stdout.split('\n');
      const sizeLine = lines.find(line => line.startsWith('size'));
      
      if (sizeLine) {
        const sizeMatch = sizeLine.match(/size (\d+)/);
        if (sizeMatch) {
          return parseInt(sizeMatch[1], 10);
        }
      }

      return 0;
    } catch {
      return 0;
    }
  }
}
