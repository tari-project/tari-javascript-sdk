import React from 'react';
import { formatAmount } from '../utils/formatting';
import { LoadingSpinner } from './LoadingSpinner';
import type { Balance } from '../types/wallet';

interface BalanceDisplayProps {
  balance?: Balance;
  isLoading: boolean;
}

export function BalanceDisplay({ balance, isLoading }: BalanceDisplayProps) {
  if (isLoading && !balance) {
    return (
      <div className="balance-display">
        <h2>Balance</h2>
        <div className="balance-loading">
          <LoadingSpinner size="medium" />
          <p>Loading balance...</p>
        </div>
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="balance-display">
        <h2>Balance</h2>
        <div className="balance-error">
          <p>Unable to load balance</p>
        </div>
      </div>
    );
  }

  const totalBalance = balance.available + balance.pending_incoming;
  const totalPending = balance.pending_incoming + balance.pending_outgoing;

  return (
    <div className="balance-display">
      <h2>Balance</h2>
      
      <div className="balance-main">
        <div className="balance-total">
          <span className="balance-label">Total Available</span>
          <span className="balance-amount primary">
            {formatAmount(balance.available)} XTR
          </span>
        </div>
      </div>

      <div className="balance-details">
        <div className="balance-item">
          <span className="balance-label">Available</span>
          <span className="balance-amount">
            {formatAmount(balance.available)} XTR
          </span>
        </div>

        {balance.pending_incoming > 0 && (
          <div className="balance-item pending-in">
            <span className="balance-label">Pending Incoming</span>
            <span className="balance-amount positive">
              +{formatAmount(balance.pending_incoming)} XTR
            </span>
          </div>
        )}

        {balance.pending_outgoing > 0 && (
          <div className="balance-item pending-out">
            <span className="balance-label">Pending Outgoing</span>
            <span className="balance-amount negative">
              -{formatAmount(balance.pending_outgoing)} XTR
            </span>
          </div>
        )}

        {balance.timelocked > 0 && (
          <div className="balance-item timelocked">
            <span className="balance-label">Timelocked</span>
            <span className="balance-amount">
              {formatAmount(balance.timelocked)} XTR
            </span>
          </div>
        )}
      </div>

      {totalPending > 0 && (
        <div className="balance-summary">
          <div className="summary-item">
            <span className="summary-label">Total Pending</span>
            <span className="summary-amount">
              {formatAmount(totalPending)} XTR
            </span>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="balance-updating">
          <LoadingSpinner size="small" />
          <span>Updating...</span>
        </div>
      )}
    </div>
  );
}
