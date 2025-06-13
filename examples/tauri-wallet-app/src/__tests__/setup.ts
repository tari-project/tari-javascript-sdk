/**
 * Jest test setup for Tauri wallet application
 */

import '@testing-library/jest-dom';

// Mock Tauri API
const mockTauri = {
  invoke: jest.fn(),
  notification: {
    sendNotification: jest.fn(),
  },
  dialog: {
    message: jest.fn(),
    ask: jest.fn(),
    confirm: jest.fn(),
    open: jest.fn(),
    save: jest.fn(),
  },
  app: {
    show: jest.fn(),
    hide: jest.fn(),
    exit: jest.fn(),
  },
  window: {
    close: jest.fn(),
    hide: jest.fn(),
    show: jest.fn(),
    maximize: jest.fn(),
    minimize: jest.fn(),
    unmaximize: jest.fn(),
    unminimize: jest.fn(),
  },
};

// Mock Tauri APIs
jest.mock('@tauri-apps/api/tauri', () => ({
  invoke: mockTauri.invoke,
}));

jest.mock('@tauri-apps/api/notification', () => ({
  sendNotification: mockTauri.notification.sendNotification,
}));

jest.mock('@tauri-apps/api/dialog', () => ({
  message: mockTauri.dialog.message,
  ask: mockTauri.dialog.ask,
  confirm: mockTauri.dialog.confirm,
  open: mockTauri.dialog.open,
  save: mockTauri.dialog.save,
}));

// Mock window.__TAURI__
Object.defineProperty(window, '__TAURI__', {
  value: mockTauri,
  writable: true,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(() => Promise.resolve()),
    readText: jest.fn(() => Promise.resolve('')),
  },
  writable: true,
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Helper function to create mock API responses
export const createMockApiResponse = <T>(data: T, success: boolean = true) => ({
  success,
  data: success ? data : undefined,
  error: success ? undefined : {
    error: 'Mock error',
    code: 'MOCK_ERROR',
    timestamp: Date.now(),
  },
  timestamp: Date.now(),
});

// Export mock for use in tests
export { mockTauri };
