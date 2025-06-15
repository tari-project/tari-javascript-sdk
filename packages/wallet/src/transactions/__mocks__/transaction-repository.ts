/**
 * @fileoverview Mock implementation of TransactionRepository for testing
 */

import type {
  TransactionInfo,
  TransactionId,
  TransactionFilter,
  TransactionQueryOptions
} from '@tari-project/tarijs-core';
import { TransactionStatus } from '@tari-project/tarijs-core';
import type { TransactionRepositoryConfig, QueryResult } from '../transaction-repository';

/**
 * Mock transaction repository for testing
 */
export class MockTransactionRepository {
  private transactions = new Map<TransactionId, TransactionInfo>();
  private config: TransactionRepositoryConfig;

  constructor(config: TransactionRepositoryConfig) {
    this.config = config;
  }

  async addTransaction(transaction: TransactionInfo): Promise<void> {
    this.transactions.set(transaction.id, transaction);
  }

  async getTransaction(id: TransactionId): Promise<TransactionInfo | undefined> {
    return this.transactions.get(id);
  }

  async updateTransaction(transaction: TransactionInfo): Promise<void> {
    this.transactions.set(transaction.id, transaction);
  }

  async removeTransaction(id: TransactionId): Promise<boolean> {
    return this.transactions.delete(id);
  }

  async getTransactions(
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ): Promise<TransactionInfo[]> {
    let result = Array.from(this.transactions.values());

    if (filter?.status) {
      result = result.filter(tx => filter.status!.includes(tx.status));
    }

    if (filter?.direction) {
      result = result.filter(tx => tx.direction === filter.direction);
    }

    return result;
  }

  async getTransactionsPaginated(
    filter?: TransactionFilter,
    options?: TransactionQueryOptions
  ): Promise<QueryResult<TransactionInfo>> {
    const transactions = await this.getTransactions(filter, options);
    return {
      data: transactions,
      totalCount: transactions.length,
      hasMore: false
    };
  }

  async getTransactionCount(filter?: TransactionFilter): Promise<number> {
    const transactions = await this.getTransactions(filter);
    return transactions.length;
  }

  async clear(): Promise<void> {
    this.transactions.clear();
  }

  async dispose(): Promise<void> {
    this.transactions.clear();
  }

  // Mock event emitter methods
  on(event: string, listener: (...args: any[]) => void): this {
    return this;
  }

  off(event: string, listener: (...args: any[]) => void): this {
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    return true;
  }

  removeAllListeners(): this {
    return this;
  }
}

// Jest mock for the actual TransactionRepository
export const createMockTransactionRepository = (config: TransactionRepositoryConfig) => {
  return new MockTransactionRepository(config);
};
