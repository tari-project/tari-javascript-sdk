import React, { useState } from 'react';
import { truncateAddress } from '../utils/formatting';
import { LoadingSpinner } from './LoadingSpinner';

interface AddressDisplayProps {
  address?: string;
  isLoading: boolean;
}

export function AddressDisplay({ address, isLoading }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const handleCopy = async () => {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      
      // Show notification if Tauri API is available
      if (window.__TAURI__?.notification) {
        window.__TAURI__.notification.sendNotification({
          title: 'Address Copied',
          body: 'Wallet address copied to clipboard'
        });
      }
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const toggleShowFull = () => {
    setShowFull(!showFull);
  };

  if (isLoading && !address) {
    return (
      <div className="address-display">
        <h2>Your Address</h2>
        <div className="address-loading">
          <LoadingSpinner size="medium" />
          <p>Loading address...</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="address-display">
        <h2>Your Address</h2>
        <div className="address-error">
          <p>Unable to load address</p>
        </div>
      </div>
    );
  }

  return (
    <div className="address-display">
      <h2>Your Address</h2>
      
      <div className="address-content">
        <div className="address-value">
          <code 
            className={`address ${showFull ? 'full' : 'truncated'}`}
            onClick={toggleShowFull}
            title={showFull ? 'Click to truncate' : 'Click to show full address'}
          >
            {showFull ? address : truncateAddress(address, 24)}
          </code>
        </div>

        <div className="address-actions">
          <button
            onClick={handleCopy}
            className={`btn btn-copy ${copied ? 'copied' : ''}`}
            title="Copy address to clipboard"
          >
            {copied ? (
              <>
                <span className="icon">✓</span>
                Copied!
              </>
            ) : (
              <>
                <span className="icon">📋</span>
                Copy
              </>
            )}
          </button>
          
          <button
            onClick={toggleShowFull}
            className="btn btn-toggle"
            title={showFull ? 'Show truncated' : 'Show full address'}
          >
            <span className="icon">{showFull ? '👁️‍🗨️' : '👁️'}</span>
            {showFull ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div className="address-info">
        <p className="address-description">
          This is your public wallet address. Share it to receive Tari coins.
        </p>
        
        <div className="address-warning">
          <span className="warning-icon">⚠️</span>
          <span className="warning-text">
            Never share your private keys or seed words with anyone.
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="address-updating">
          <LoadingSpinner size="small" />
          <span>Updating...</span>
        </div>
      )}
    </div>
  );
}
