'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  clearServiceUnavailable,
  getServiceUnavailableState,
  reportServiceUnavailable,
  subscribeServiceUnavailable,
  type ServiceUnavailableState,
} from '@/lib/api-error';
import { ERROR_CATEGORY_DICTIONARY } from '@/lib/error-dictionary';

export interface NetworkStatusContextValue {
  /** Whether the browser reports active network connectivity. */
  isOnline: boolean;
  /** True briefly after transitioning from offline back to online. */
  wasOffline: boolean;
  /** Live HTTP 503 maintenance/overload state from backend calls. */
  serviceUnavailable: ServiceUnavailableState;
  /** True while actively probing `/api/v1/health`. */
  isChecking: boolean;
  /** Actively tests backend connectivity and clears banners if healthy. */
  checkConnection: () => Promise<boolean>;
  /** Dismisses the maintenance (503) banner locally. */
  dismissMaintenance: () => void;
}

const RECONNECTED_BANNER_DURATION_MS = 3500;
const HEALTH_CHECK_TIMEOUT_MS = 8000;

const NetworkStatusContext = createContext<NetworkStatusContextValue | null>(null);

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [serviceUnavailable, setServiceUnavailable] = useState<ServiceUnavailableState>(() =>
    getServiceUnavailableState(),
  );
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const hasBeenOfflineRef = useRef<boolean>(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    setIsOnline(initialOnline);
    if (!initialOnline) {
      hasBeenOfflineRef.current = true;
    }

    const handleOffline = () => {
      clearReconnectTimer();
      hasBeenOfflineRef.current = true;
      setIsOnline(false);
      setWasOffline(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
      if (hasBeenOfflineRef.current) {
        setWasOffline(true);
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          setWasOffline(false);
          hasBeenOfflineRef.current = false;
        }, RECONNECTED_BANNER_DURATION_MS);
        window.dispatchEvent(new CustomEvent('app:refresh-data'));
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    setServiceUnavailable(getServiceUnavailableState());
    const unsubscribeOutage = subscribeServiceUnavailable((nextState) => {
      setServiceUnavailable(nextState);
    });

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      unsubscribeOutage();
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (isChecking) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline(false);
      return false;
    }

    setIsChecking(true);
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
      const res = await fetch('/api/v1/health', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean } | null;

      if (res.ok && json?.success) {
        setIsOnline(true);
        clearServiceUnavailable();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app:refresh-data'));
        }
        return true;
      }

      reportServiceUnavailable(
        ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.message,
        serviceUnavailable.category,
        '/api/v1/health',
      );
      return false;
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setIsOnline(false);
      } else {
        reportServiceUnavailable(
          ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.message,
          serviceUnavailable.category,
          '/api/v1/health',
        );
      }
      return false;
    } finally {
      globalThis.clearTimeout(timer);
      setIsChecking(false);
    }
  }, [isChecking, serviceUnavailable.category]);

  const dismissMaintenance = useCallback(() => {
    clearServiceUnavailable();
  }, []);

  return (
    <NetworkStatusContext.Provider
      value={{
        isOnline,
        wasOffline,
        serviceUnavailable,
        isChecking,
        checkConnection,
        dismissMaintenance,
      }}
    >
      {children}
    </NetworkStatusContext.Provider>
  );
}

/**
 * Accesses live browser online/offline state and HTTP 503 service availability status.
 *
 * @example
 * const { isOnline, checkConnection } = useNetworkStatus();
 */
export function useNetworkStatus(): NetworkStatusContextValue {
  const ctx = useContext(NetworkStatusContext);
  if (!ctx) {
    throw new Error('useNetworkStatus must be used within a NetworkStatusProvider');
  }
  return ctx;
}
