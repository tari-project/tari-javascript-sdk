/**
 * @fileoverview Event system integration tests
 * 
 * This module provides tests for the wallet event system functionality,
 * including FFI integration, event mapping, and lifecycle management.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  WalletEventSystem,
  createWalletEventSystem,
  TypedWalletEventEmitter,
  createWalletEventEmitter,
  EventRegistrationManager,
  createEventRegistrationManager,
  CallbackManager,
  createCallbackManager,
  EventSystemLifecycleManager,
  createEventSystemLifecycleManager,
  defaultMapperRegistry,
  mapEventData,
  type WalletEventMap,
  type ConnectivityEvent,
  type SyncProgressEvent
} from '../index.js';
import type { WalletHandle } from '@tari-project/tarijs-core';
import type { Balance } from '../../types/index.js';
import { ConnectivityStatus } from '../event-types.js';

describe('WalletEventSystem', () => {
  let eventSystem: WalletEventSystem;

  beforeEach(() => {
    eventSystem = createWalletEventSystem();
  });

  afterEach(() => {
    eventSystem.dispose();
  });

  test('should create event system with default configuration', () => {
    expect(eventSystem).toBeDefined();
    expect(eventSystem.disposed).toBe(false);
  });

  test('should add and remove event listeners', () => {
    const mockListener = jest.fn();
    const subscription = eventSystem.on('balance:updated', mockListener);

    expect(eventSystem.hasListeners('balance:updated')).toBe(true);
    expect(eventSystem.getListenerCount('balance:updated')).toBe(1);

    subscription.unsubscribe();
    expect(eventSystem.hasListeners('balance:updated')).toBe(false);
    expect(eventSystem.getListenerCount('balance:updated')).toBe(0);
  });

  test('should emit events to registered listeners', async () => {
    const mockListener = jest.fn();
    eventSystem.on('balance:updated', mockListener);

    const balanceData: Balance = {
      available: 1000n,
      pendingIncoming: 500n,
      pendingOutgoing: 200n,
      total: 1500n,
      lastUpdated: new Date()
    };

    await eventSystem.emit('balance:updated', balanceData);

    expect(mockListener).toHaveBeenCalledWith(balanceData);
    expect(mockListener).toHaveBeenCalledTimes(1);
  });

  test('should support once listeners', async () => {
    const mockListener = jest.fn();
    eventSystem.once('connectivity:changed', mockListener);

    const connectivityData: ConnectivityEvent = {
      status: ConnectivityStatus.Online,
      peerCount: 5,
      timestamp: new Date()
    };

    await eventSystem.emit('connectivity:changed', connectivityData);
    await eventSystem.emit('connectivity:changed', connectivityData);

    expect(mockListener).toHaveBeenCalledTimes(1);
  });

  test('should support bulk subscription', () => {
    const balanceListener = jest.fn();
    const connectivityListener = jest.fn();

    const subscription = eventSystem.subscribe({
      'balance:updated': balanceListener,
      'connectivity:changed': connectivityListener
    });

    expect(eventSystem.hasListeners('balance:updated')).toBe(true);
    expect(eventSystem.hasListeners('connectivity:changed')).toBe(true);

    subscription.unsubscribe();
    expect(eventSystem.hasListeners('balance:updated')).toBe(false);
    expect(eventSystem.hasListeners('connectivity:changed')).toBe(false);
  });

  test('should provide event statistics', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    eventSystem.on('balance:updated', listener1);
    eventSystem.on('connectivity:changed', listener2);

    const stats = eventSystem.getStats();
    expect(stats.totalListeners).toBe(2);
    expect(stats.activeEvents).toBe(2);
    expect(stats.ffiCallbackRegistered).toBe(false);
  });

  test('should handle error events without throwing', async () => {
    const errorListener = jest.fn();
    const faultyListener = jest.fn(() => {
      throw new Error('Test error');
    });

    eventSystem.on('error', errorListener);
    eventSystem.on('balance:updated', faultyListener);

    const balanceData: Balance = {
      available: 1000n,
      pendingIncoming: 0n,
      pendingOutgoing: 0n,
      total: 1000n,
      lastUpdated: new Date()
    };

    await eventSystem.emit('balance:updated', balanceData);

    // Error should be caught and emitted as error event
    expect(errorListener).toHaveBeenCalled();
  });

  test('should dispose cleanly', () => {
    const listener = jest.fn();
    eventSystem.on('balance:updated', listener);

    expect(eventSystem.disposed).toBe(false);
    expect(eventSystem.hasListeners('balance:updated')).toBe(true);

    eventSystem.dispose();

    expect(eventSystem.disposed).toBe(true);
    expect(() => eventSystem.on('balance:updated', jest.fn())).toThrow();
  });
});

describe('TypedWalletEventEmitter', () => {
  let emitter: TypedWalletEventEmitter;

  beforeEach(() => {
    emitter = createWalletEventEmitter();
  });

  afterEach(() => {
    emitter.dispose();
  });

  test('should prevent memory leaks with max listeners', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    emitter.setMaxListeners(2);

    emitter.on('balance:updated', jest.fn());
    emitter.on('balance:updated', jest.fn());
    emitter.on('balance:updated', jest.fn()); // Should trigger warning

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Maximum listeners (2) exceeded')
    );

    consoleSpy.mockRestore();
  });

  test('should support event options like debouncing', (done) => {
    const listener = jest.fn();
    emitter.on('sync:progress', listener, { debounce: 100 });

    const progressData: SyncProgressEvent = {
      current: 50,
      total: 100,
      percent: 50,
      timestamp: new Date()
    };

    // Rapid emissions should be debounced
    emitter.emit('sync:progress', progressData);
    emitter.emit('sync:progress', progressData);
    emitter.emit('sync:progress', progressData);

    setTimeout(() => {
      expect(listener).toHaveBeenCalledTimes(1);
      done();
    }, 150);
  });
});

describe('EventMappers', () => {
  test('should map transaction event data correctly', () => {
    const ffiData = {
      id: '123',
      amount: '1000000',
      source: 'test_address',
      message: 'Test transaction',
      status: 'pending',
      isInbound: true,
      timestamp: Date.now(),
      confirmations: 0
    };

    expect(() => {
      mapEventData('tx:received', ffiData);
    }).not.toThrow();
  });

  test('should map balance event data correctly', () => {
    const ffiData = {
      available: '1000000',
      pendingIncoming: '500000',
      pendingOutgoing: '200000',
      total: '1500000',
      lastUpdated: Date.now()
    };

    expect(() => {
      mapEventData('balance:updated', ffiData);
    }).not.toThrow();
  });

  test('should validate event data and throw on invalid input', () => {
    const invalidData = {
      id: null, // Invalid: should be string
      amount: 'not_a_number', // Invalid: should be valid bigint string
    };

    expect(() => {
      mapEventData('tx:received', invalidData);
    }).toThrow();
  });
});

describe('EventRegistrationManager', () => {
  let registrationManager: EventRegistrationManager;
  let eventSystem: WalletEventSystem;
  const mockWalletHandle: WalletHandle = 123;

  beforeEach(() => {
    registrationManager = createEventRegistrationManager({
      autoRegister: true,
      autoCleanup: true,
      debug: false
    });
    eventSystem = createWalletEventSystem();
  });

  afterEach(async () => {
    await registrationManager.dispose();
    eventSystem.dispose();
  });

  test('should track registration state', () => {
    expect(registrationManager.isRegistered(mockWalletHandle)).toBe(false);
    
    const stats = registrationManager.getStats();
    expect(stats.registeredWallets).toBe(0);
  });

  test('should provide detailed statistics', () => {
    const stats = registrationManager.getStats();
    
    expect(stats).toHaveProperty('totalWallets');
    expect(stats).toHaveProperty('registeredWallets');
    expect(stats).toHaveProperty('totalEvents');
    expect(stats).toHaveProperty('averageEventsPerWallet');
  });
});

describe('CallbackManager', () => {
  let callbackManager: CallbackManager;
  let eventSystem: WalletEventSystem;
  const mockWalletHandle: WalletHandle = 123;

  beforeEach(() => {
    callbackManager = createCallbackManager({
      autoRegister: true,
      autoCleanup: true,
      healthMonitoring: false // Disable for tests
    });
    eventSystem = createWalletEventSystem();
  });

  afterEach(async () => {
    await callbackManager.dispose();
    eventSystem.dispose();
  });

  test('should track wallet registration', () => {
    expect(callbackManager.isWalletRegistered(mockWalletHandle)).toBe(false);
    expect(callbackManager.getRegisteredWallets()).toEqual([]);
  });

  test('should provide manager state', () => {
    const state = callbackManager.getState();
    
    expect(state).toHaveProperty('isActive');
    expect(state).toHaveProperty('registeredWallets');
    expect(state).toHaveProperty('totalEvents');
    expect(state.isActive).toBe(true);
  });

  test('should perform health checks', () => {
    const health = callbackManager.performHealthCheck();
    
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('warnings');
    expect(health).toHaveProperty('errors');
    expect(health.healthy).toBe(true);
  });
});

describe('EventSystemLifecycleManager', () => {
  let lifecycleManager: EventSystemLifecycleManager;
  const mockWalletHandle: WalletHandle = 123;

  beforeEach(() => {
    lifecycleManager = createEventSystemLifecycleManager({
      autoCleanupOnExit: false // Disable for tests
    });
  });

  afterEach(async () => {
    await lifecycleManager.dispose();
  });

  test('should track managed wallets', () => {
    expect(lifecycleManager.getManagedWallets()).toEqual([]);
    expect(lifecycleManager.hasEventSystem(mockWalletHandle)).toBe(false);
  });

  test('should provide lifecycle statistics', () => {
    const stats = lifecycleManager.getStats();
    
    expect(stats).toHaveProperty('managedWallets');
    expect(stats).toHaveProperty('activeEventSystems');
    expect(stats).toHaveProperty('isDisposed');
    expect(stats.managedWallets).toBe(0);
  });

  test('should perform comprehensive health checks', () => {
    const health = lifecycleManager.performHealthCheck();
    
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('walletChecks');
    expect(health).toHaveProperty('managerHealth');
    expect(Array.isArray(health.walletChecks)).toBe(true);
  });
});
