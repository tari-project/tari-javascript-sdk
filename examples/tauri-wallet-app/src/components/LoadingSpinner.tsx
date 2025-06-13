import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function LoadingSpinner({ size = 'medium', className = '' }: LoadingSpinnerProps) {
  const sizeClass = `spinner-${size}`;
  
  return (
    <div className={`loading-spinner ${sizeClass} ${className}`}>
      <div className="spinner-circle"></div>
    </div>
  );
}
