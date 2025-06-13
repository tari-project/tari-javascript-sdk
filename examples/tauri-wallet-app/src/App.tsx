import React from 'react';
import { WalletDashboard } from './components/WalletDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <div className="app">
      <ErrorBoundary>
        <WalletDashboard />
      </ErrorBoundary>
    </div>
  );
}

export default App;
