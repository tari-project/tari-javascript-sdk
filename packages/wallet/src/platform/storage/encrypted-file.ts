/**
 * @fileoverview Encrypted file storage implementation
 * 
 * Provides encrypted file-based storage as a fallback when platform-specific
 * secure storage is not available.
 */

import { BaseSecureStorage, type StorageResult, StorageResults, type StorageMetadata, type StorageOptions, type StorageInfo } from './secure-storage.js';
import { PlatformDetector } from '../detector.js';
import { encryptData, decryptData } from './encryption.js';

/**
 * Encrypted file storage implementation
 */
export class EncryptedFileStorage extends BaseSecureStorage {
    private readonly storagePath: string;
    private readonly password: string;
    private isAvailable: boolean = false;

    constructor(config: any = {}) {
        super(config);
        this.password = config.password || 'default-tari-wallet-key';
        this.storagePath = this.getStoragePath();
        this.initializeFileStorage();
    }

    /**
     * Store encrypted data to file
     */
    async store(key: string, value: Buffer, options: StorageOptions = {}): Promise<StorageResult<void>> {
        try {
            this.validateKey(key);
            this.validateDataSize(value);

            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const encryptedData = await encryptData(value, this.password);
            const filePath = this.getFilePath(key);

            await this.writeFile(filePath, encryptedData);

            return StorageResults.ok(undefined);
        } catch (error) {
            return StorageResults.error('internal_error', `File storage error: ${error}`);
        }
    }

    /**
     * Retrieve and decrypt data from file
     */
    async retrieve(key: string, options: StorageOptions = {}): Promise<StorageResult<Buffer>> {
        try {
            this.validateKey(key);

            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const filePath = this.getFilePath(key);

            if (!await this.fileExists(filePath)) {
                return StorageResults.notFound('Key not found');
            }

            const encryptedData = await this.readFile(filePath);
            const decryptedData = await decryptData(encryptedData, this.password);

            return StorageResults.ok(decryptedData);
        } catch (error) {
            return StorageResults.error('internal_error', `File retrieval error: ${error}`);
        }
    }

    /**
     * Remove file
     */
    async remove(key: string): Promise<StorageResult<void>> {
        try {
            this.validateKey(key);

            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const filePath = this.getFilePath(key);
            await this.deleteFile(filePath);

            return StorageResults.ok(undefined);
        } catch (error) {
            return StorageResults.error('internal_error', `File removal error: ${error}`);
        }
    }

    /**
     * Check if file exists
     */
    async exists(key: string): Promise<StorageResult<boolean>> {
        try {
            this.validateKey(key);

            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const filePath = this.getFilePath(key);
            const exists = await this.fileExists(filePath);

            return StorageResults.ok(exists);
        } catch (error) {
            return StorageResults.error('internal_error', `File check error: ${error}`);
        }
    }

    /**
     * List all keys
     */
    async list(): Promise<StorageResult<string[]>> {
        try {
            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const files = await this.listFiles(this.storagePath);
            const keys = files
                .filter(file => file.endsWith('.enc'))
                .map(file => file.replace('.enc', ''));

            return StorageResults.ok(keys);
        } catch (error) {
            return StorageResults.error('internal_error', `File listing error: ${error}`);
        }
    }

    /**
     * Get file metadata
     */
    async getMetadata(key: string): Promise<StorageResult<StorageMetadata>> {
        try {
            this.validateKey(key);

            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const filePath = this.getFilePath(key);
            const stats = await this.getFileStats(filePath);

            if (!stats) {
                return StorageResults.notFound('Key not found');
            }

            const metadata: StorageMetadata = {
                created: stats.created,
                modified: stats.modified,
                size: stats.size,
                encryption: 'aes-256-gcm',
            };

            return StorageResults.ok(metadata);
        } catch (error) {
            return StorageResults.error('internal_error', `Metadata error: ${error}`);
        }
    }

    /**
     * Clear all files
     */
    async clear(): Promise<StorageResult<void>> {
        try {
            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const files = await this.listFiles(this.storagePath);
            const encFiles = files.filter(file => file.endsWith('.enc'));

            for (const file of encFiles) {
                await this.deleteFile(`${this.storagePath}/${file}`);
            }

            return StorageResults.ok(undefined);
        } catch (error) {
            return StorageResults.error('internal_error', `Clear error: ${error}`);
        }
    }

    /**
     * Get storage info
     */
    async getInfo(): Promise<StorageResult<StorageInfo>> {
        const info: StorageInfo = {
            type: 'encrypted-file',
            availableSpace: Number.MAX_SAFE_INTEGER, // Would check disk space
            usedSpace: 0, // Would calculate from files
            maxItemSize: Number.MAX_SAFE_INTEGER,
            securityLevel: 'encrypted',
            supportsAuth: false,
            supportsTtl: false,
        };
        return StorageResults.ok(info);
    }

    /**
     * Test file storage
     */
    async test(): Promise<StorageResult<void>> {
        try {
            if (!this.isAvailable) {
                return StorageResults.error('internal_error', 'File storage not available');
            }

            const testKey = 'test-' + Date.now();
            const testData = Buffer.from('test', 'utf8');

            await this.store(testKey, testData);
            const retrieved = await this.retrieve(testKey);
            await this.remove(testKey);

            if (StorageResults.isOk(retrieved) && retrieved.value?.equals(testData)) {
                return StorageResults.ok(undefined);
            }

            return StorageResults.error('internal_error', 'Test failed');
        } catch (error) {
            return StorageResults.error('internal_error', `Test error: ${error}`);
        }
    }

    /**
     * Initialize file storage
     */
    private async initializeFileStorage(): Promise<void> {
        const platform = PlatformDetector.detect();

        if (!platform.capabilities.fileSystem) {
            this.isAvailable = false;
            return;
        }

        try {
            await this.ensureDirectory(this.storagePath);
            this.isAvailable = true;
        } catch (error) {
            console.warn('Failed to initialize file storage:', error);
            this.isAvailable = false;
        }
    }

    /**
     * Get storage directory path
     */
    private getStoragePath(): string {
        const platform = PlatformDetector.detect();
        return platform.capabilities.fileSystem
            ? PlatformDetector.getDefaultStorageDir() + '/secure-storage'
            : './secure-storage';
    }

    /**
     * Get file path for key
     */
    private getFilePath(key: string): string {
        return `${this.storagePath}/${key}.enc`;
    }

    /**
     * File system operations (Node.js only)
     */
    private async writeFile(path: string, data: Buffer): Promise<void> {
        if (typeof require !== 'undefined') {
            const fs = require('fs').promises;
            await fs.writeFile(path, data);
        } else {
            throw new Error('File operations not available in this environment');
        }
    }

    private async readFile(path: string): Promise<Buffer> {
        if (typeof require !== 'undefined') {
            const fs = require('fs').promises;
            return await fs.readFile(path);
        } else {
            throw new Error('File operations not available in this environment');
        }
    }

    private async deleteFile(path: string): Promise<void> {
        if (typeof require !== 'undefined') {
            const fs = require('fs').promises;
            await fs.unlink(path);
        } else {
            throw new Error('File operations not available in this environment');
        }
    }

    private async fileExists(path: string): Promise<boolean> {
        if (typeof require !== 'undefined') {
            const fs = require('fs').promises;
            try {
                await fs.access(path);
                return true;
            } catch {
                return false;
            }
        } else {
            return false;
        }
    }

    private async listFiles(dir: string): Promise<string[]> {
        if (typeof require !== 'undefined') {
            const fs = require('fs').promises;
            try {
                return await fs.readdir(dir);
            } catch {
                return [];
            }
        } else {
            return [];
        }
    }

    private async ensureDirectory(dir: string): Promise<void> {
        if (typeof require !== 'undefined') {
            const fs = require('fs').promises;
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                // Directory might already exist
                if (error.code !== 'EEXIST') {
                    throw error;
                }
            }
        }
    }

    private async getFileStats(path: string): Promise<any> {
        if (typeof require !== 'undefined') {
            const fs = require('fs').promises;
            try {
                const stats = await fs.stat(path);
                return {
                    created: stats.birthtime.getTime(),
                    modified: stats.mtime.getTime(),
                    size: stats.size,
                };
            } catch {
                return null;
            }
        }
        return null;
    }
}
