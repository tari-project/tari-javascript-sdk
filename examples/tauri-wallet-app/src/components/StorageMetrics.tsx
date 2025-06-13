import React, { useState } from 'react';
import type { StorageInfo } from '../types/wallet';

interface StorageMetricsProps {
  storageInfo: StorageInfo;
}

export function StorageMetrics({ storageInfo }: StorageMetricsProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getBackendIcon = (backend: string) => {
    const backendLower = backend.toLowerCase();
    if (backendLower.includes('keychain')) return '🔐';
    if (backendLower.includes('credential')) return '🗝️';
    if (backendLower.includes('secret')) return '🔒';
    if (backendLower.includes('memory')) return '🧠';
    return '💾';
  };

  const getSecurityLevel = (secure: boolean) => {
    return secure ? 'Hardware-Backed' : 'Software-Based';
  };

  const getSecurityIcon = (secure: boolean) => {
    return secure ? '🛡️' : '⚠️';
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  return (
    <div className="storage-metrics">
      <div className="metrics-header">
        <h3>Storage Backend</h3>
        <button
          onClick={toggleDetails}
          className="btn btn-small btn-ghost"
          title={showDetails ? 'Hide details' : 'Show details'}
        >
          <span className={`expand-icon ${showDetails ? 'expanded' : ''}`}>
            ▼
          </span>
        </button>
      </div>

      <div className="metrics-content">
        <div className="metric-item primary">
          <div className="metric-icon">
            {getBackendIcon(storageInfo.backend)}
          </div>
          <div className="metric-info">
            <div className="metric-label">Backend</div>
            <div className="metric-value">{storageInfo.backend}</div>
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-icon">
            {getSecurityIcon(storageInfo.secure)}
          </div>
          <div className="metric-info">
            <div className="metric-label">Security</div>
            <div className={`metric-value ${storageInfo.secure ? 'secure' : 'insecure'}`}>
              {getSecurityLevel(storageInfo.secure)}
            </div>
          </div>
        </div>

        {showDetails && (
          <div className="metrics-details">
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Version:</span>
                <span className="detail-value">{storageInfo.version}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Metadata Support:</span>
                <span className={`detail-value ${storageInfo.supports_metadata ? 'supported' : 'not-supported'}`}>
                  {storageInfo.supports_metadata ? 'Yes' : 'No'}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Encryption:</span>
                <span className="detail-value">
                  {storageInfo.secure ? 'Platform Native' : 'Application Level'}
                </span>
              </div>
            </div>

            <div className="storage-features">
              <h4>Security Features</h4>
              <ul className="feature-list">
                {storageInfo.secure && (
                  <li className="feature-item supported">
                    <span className="feature-icon">✅</span>
                    <span>Hardware-backed encryption</span>
                  </li>
                )}
                
                <li className="feature-item supported">
                  <span className="feature-icon">✅</span>
                  <span>Process isolation</span>
                </li>
                
                <li className="feature-item supported">
                  <span className="feature-icon">✅</span>
                  <span>Secure memory handling</span>
                </li>
                
                {storageInfo.supports_metadata && (
                  <li className="feature-item supported">
                    <span className="feature-icon">✅</span>
                    <span>Metadata tracking</span>
                  </li>
                )}
                
                <li className="feature-item supported">
                  <span className="feature-icon">✅</span>
                  <span>Automatic cleanup</span>
                </li>
              </ul>
            </div>

            <div className="performance-note">
              <div className="note-icon">💡</div>
              <div className="note-content">
                <strong>Tauri Storage Benefits:</strong>
                <ul>
                  <li>Native OS integration for maximum security</li>
                  <li>Minimal memory footprint</li>
                  <li>Cross-platform compatibility</li>
                  <li>Hardware acceleration where available</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="metrics-footer">
        <div className="footer-status">
          <span className="status-indicator online">🟢</span>
          <span className="status-text">Storage Active</span>
        </div>
      </div>
    </div>
  );
}
