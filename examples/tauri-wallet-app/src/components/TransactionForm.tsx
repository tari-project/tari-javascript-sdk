import React, { useState } from 'react';
import { validateSendTransaction } from '../utils/validation';
import { validateAmountInput, validateAddressFormat, parseAmount } from '../utils/formatting';
import { LoadingSpinner } from './LoadingSpinner';
import type { SendFormData } from '../types/wallet';

interface TransactionFormProps {
  onSendTransaction: (recipient: string, amount: number, message?: string) => Promise<string>;
  onValidateAddress: (address: string) => Promise<boolean>;
  isLoading: boolean;
  disabled: boolean;
}

export function TransactionForm({ 
  onSendTransaction, 
  onValidateAddress,
  isLoading, 
  disabled 
}: TransactionFormProps) {
  const [formData, setFormData] = useState<SendFormData>({
    recipient: '',
    amount: '',
    message: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof SendFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    // Validate recipient address
    if (!formData.recipient.trim()) {
      newErrors.recipient = 'Recipient address is required';
    } else {
      const addressValidation = validateAddressFormat(formData.recipient);
      if (!addressValidation.isValid) {
        newErrors.recipient = addressValidation.error!;
      } else {
        // Additional validation using wallet service
        setIsValidating(true);
        try {
          const isValid = await onValidateAddress(formData.recipient);
          if (!isValid) {
            newErrors.recipient = 'Invalid address format';
          }
        } catch (error) {
          newErrors.recipient = 'Unable to validate address';
        }
        setIsValidating(false);
      }
    }

    // Validate amount
    if (!formData.amount.trim()) {
      newErrors.amount = 'Amount is required';
    } else {
      const amountValidation = validateAmountInput(formData.amount);
      if (!amountValidation.isValid) {
        newErrors.amount = amountValidation.error!;
      }
    }

    // Validate message length
    if (formData.message && formData.message.length > 500) {
      newErrors.message = 'Message too long (max 500 characters)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (disabled || isSubmitting || isLoading) {
      return;
    }

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const amountInMicroTari = parseAmount(formData.amount);
      const message = formData.message.trim() || undefined;
      
      const txId = await onSendTransaction(
        formData.recipient,
        amountInMicroTari,
        message
      );

      // Reset form on success
      setFormData({
        recipient: '',
        amount: '',
        message: ''
      });

      // Show success message
      if (window.__TAURI__?.dialog) {
        window.__TAURI__.dialog.message(
          `Transaction sent successfully!\nTransaction ID: ${txId}`,
          { title: 'Success', type: 'info' }
        );
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send transaction';
      
      if (window.__TAURI__?.dialog) {
        window.__TAURI__.dialog.message(errorMessage, {
          title: 'Transaction Failed',
          type: 'error'
        });
      } else {
        alert(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaxAmount = () => {
    // TODO: Implement max amount calculation based on available balance
    // For now, just clear the amount field
    updateField('amount', '');
  };

  const isFormDisabled = disabled || isSubmitting || isLoading;

  return (
    <div className="transaction-form">
      <h2>Send Transaction</h2>

      <form onSubmit={handleSubmit} className="send-form">
        <div className="form-group">
          <label htmlFor="recipient" className="form-label">
            Recipient Address *
          </label>
          <div className="input-group">
            <input
              id="recipient"
              type="text"
              value={formData.recipient}
              onChange={(e) => updateField('recipient', e.target.value)}
              placeholder="Enter recipient address (64 character hex)"
              className={`form-input ${errors.recipient ? 'error' : ''}`}
              disabled={isFormDisabled}
              maxLength={64}
            />
            {isValidating && (
              <div className="input-spinner">
                <LoadingSpinner size="small" />
              </div>
            )}
          </div>
          {errors.recipient && (
            <div className="form-error">{errors.recipient}</div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="amount" className="form-label">
            Amount (XTR) *
          </label>
          <div className="input-group">
            <input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => updateField('amount', e.target.value)}
              placeholder="0.000000"
              className={`form-input ${errors.amount ? 'error' : ''}`}
              disabled={isFormDisabled}
              step="0.000001"
              min="0"
            />
            <button
              type="button"
              onClick={handleMaxAmount}
              className="btn btn-max"
              disabled={isFormDisabled}
              title="Use maximum available amount"
            >
              MAX
            </button>
          </div>
          {errors.amount && (
            <div className="form-error">{errors.amount}</div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="message" className="form-label">
            Message (optional)
          </label>
          <textarea
            id="message"
            value={formData.message}
            onChange={(e) => updateField('message', e.target.value)}
            placeholder="Optional message to include with transaction..."
            className={`form-textarea ${errors.message ? 'error' : ''}`}
            disabled={isFormDisabled}
            maxLength={500}
            rows={3}
          />
          <div className="form-help">
            {formData.message.length}/500 characters
          </div>
          {errors.message && (
            <div className="form-error">{errors.message}</div>
          )}
        </div>

        <div className="form-actions">
          <button
            type="submit"
            disabled={isFormDisabled}
            className="btn btn-primary btn-send"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="small" />
                Sending...
              </>
            ) : (
              <>
                <span className="icon">💸</span>
                Send Transaction
              </>
            )}
          </button>
        </div>
      </form>

      <div className="form-info">
        <div className="info-item">
          <span className="info-icon">ℹ️</span>
          <span className="info-text">
            Transactions are irreversible. Double-check the recipient address.
          </span>
        </div>
        <div className="info-item">
          <span className="info-icon">💰</span>
          <span className="info-text">
            Network fees will be automatically calculated and added.
          </span>
        </div>
      </div>
    </div>
  );
}
