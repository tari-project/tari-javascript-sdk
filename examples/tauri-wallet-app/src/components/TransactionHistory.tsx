import React, { useState } from 'react';
import { formatAmount, formatTimestamp, formatTransactionStatus, truncateAddress } from '../utils/formatting';
import { LoadingSpinner } from './LoadingSpinner';
import type { TransactionInfo } from '../types/wallet';

interface TransactionHistoryProps {
  transactions: TransactionInfo[];
  isLoading: boolean;
}

type FilterType = 'all' | 'incoming' | 'outgoing';
type SortOrder = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export function TransactionHistory({ transactions, isLoading }: TransactionHistoryProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [showDetails, setShowDetails] = useState<Set<string>>(new Set());
  const [itemsToShow, setItemsToShow] = useState(10);

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;
    return tx.direction === filter;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    switch (sortOrder) {
      case 'newest':
        return b.timestamp - a.timestamp;
      case 'oldest':
        return a.timestamp - b.timestamp;
      case 'amount_high':
        return b.amount - a.amount;
      case 'amount_low':
        return a.amount - b.amount;
      default:
        return b.timestamp - a.timestamp;
    }
  });

  const displayedTransactions = sortedTransactions.slice(0, itemsToShow);

  const toggleDetails = (txId: string) => {
    const newShowDetails = new Set(showDetails);
    if (newShowDetails.has(txId)) {
      newShowDetails.delete(txId);
    } else {
      newShowDetails.add(txId);
    }
    setShowDetails(newShowDetails);
  };

  const loadMore = () => {
    setItemsToShow(prev => prev + 10);
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'incoming' ? '📥' : '📤';
  };

  const getAmountDisplay = (tx: TransactionInfo) => {
    const prefix = tx.direction === 'incoming' ? '+' : '-';
    const className = tx.direction === 'incoming' ? 'positive' : 'negative';
    return (
      <span className={`transaction-amount ${className}`}>
        {prefix}{formatAmount(tx.amount)} XTR
      </span>
    );
  };

  if (isLoading && transactions.length === 0) {
    return (
      <div className="transaction-history">
        <h2>Transaction History</h2>
        <div className="transaction-loading">
          <LoadingSpinner size="medium" />
          <p>Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="transaction-history">
      <div className="history-header">
        <h2>Transaction History</h2>
        <div className="history-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            className="filter-select"
          >
            <option value="all">All Transactions</option>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="sort-select"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="amount_high">Highest Amount</option>
            <option value="amount_low">Lowest Amount</option>
          </select>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="no-transactions">
          <div className="no-transactions-icon">📭</div>
          <h3>No transactions yet</h3>
          <p>Your transaction history will appear here once you send or receive Tari coins.</p>
        </div>
      ) : (
        <>
          <div className="transaction-summary">
            <span>
              Showing {displayedTransactions.length} of {filteredTransactions.length} transactions
            </span>
            {filter !== 'all' && (
              <span className="filter-indicator">
                (filtered by {filter})
              </span>
            )}
          </div>

          <div className="transaction-list">
            {displayedTransactions.map((tx) => {
              const status = formatTransactionStatus(tx.status);
              const showingDetails = showDetails.has(tx.id);

              return (
                <div key={tx.id} className="transaction-item">
                  <div className="transaction-main" onClick={() => toggleDetails(tx.id)}>
                    <div className="transaction-info">
                      <div className="transaction-direction">
                        <span className="direction-icon">
                          {getDirectionIcon(tx.direction)}
                        </span>
                        <span className="direction-text">
                          {tx.direction === 'incoming' ? 'Received' : 'Sent'}
                        </span>
                      </div>
                      
                      <div className="transaction-meta">
                        <div className="transaction-timestamp">
                          {formatTimestamp(tx.timestamp)}
                        </div>
                        <div className={`transaction-status ${status.className}`}>
                          {status.text}
                        </div>
                      </div>
                    </div>

                    <div className="transaction-amounts">
                      {getAmountDisplay(tx)}
                      {tx.fee > 0 && (
                        <div className="transaction-fee">
                          Fee: {formatAmount(tx.fee)} XTR
                        </div>
                      )}
                    </div>

                    <div className="transaction-expand">
                      <span className={`expand-icon ${showingDetails ? 'expanded' : ''}`}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {showingDetails && (
                    <div className="transaction-details">
                      <div className="detail-row">
                        <span className="detail-label">Transaction ID:</span>
                        <span className="detail-value monospace">
                          {tx.id}
                        </span>
                      </div>

                      {tx.source_address && (
                        <div className="detail-row">
                          <span className="detail-label">From:</span>
                          <span className="detail-value monospace">
                            {truncateAddress(tx.source_address)}
                          </span>
                        </div>
                      )}

                      {tx.destination_address && (
                        <div className="detail-row">
                          <span className="detail-label">To:</span>
                          <span className="detail-value monospace">
                            {truncateAddress(tx.destination_address)}
                          </span>
                        </div>
                      )}

                      {tx.message && (
                        <div className="detail-row">
                          <span className="detail-label">Message:</span>
                          <span className="detail-value message">
                            "{tx.message}"
                          </span>
                        </div>
                      )}

                      <div className="detail-row">
                        <span className="detail-label">Amount:</span>
                        <span className="detail-value">
                          {formatAmount(tx.amount)} XTR
                        </span>
                      </div>

                      {tx.fee > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">Network Fee:</span>
                          <span className="detail-value">
                            {formatAmount(tx.fee)} XTR
                          </span>
                        </div>
                      )}

                      <div className="detail-row">
                        <span className="detail-label">Total:</span>
                        <span className="detail-value">
                          {formatAmount(tx.amount + tx.fee)} XTR
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {displayedTransactions.length < filteredTransactions.length && (
            <div className="load-more">
              <button onClick={loadMore} className="btn btn-secondary">
                Load More Transactions
              </button>
            </div>
          )}
        </>
      )}

      {isLoading && (
        <div className="history-updating">
          <LoadingSpinner size="small" />
          <span>Updating transactions...</span>
        </div>
      )}
    </div>
  );
}
