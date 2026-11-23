'use client';

import { useEffect, useRef } from 'react';
import { ERROR_CATEGORY_DICTIONARY } from '@/lib/error-dictionary';
import { useNetworkStatus } from '@/providers/network-status-provider';
import { SYSTEM_TOAST_IDS, useToast } from '@/providers/toast-provider';

const RECONNECTED_TOAST_DURATION_MS = 3500;

/**
 * Headless network & HTTP 503 status bridge that routes connectivity alerts into the
 * unified ToastProvider stack (without rendering a layout-shifting banner above Header).
 *
 * - Offline (`!isOnline`): persistent warning toast with "Periksa Koneksi" action
 * - Reconnected (`wasOffline`): transient success toast auto-dismissing after 3.5s
 * - HTTP 503 (`serviceUnavailable.active`): persistent deduplicated error toast
 */
export function GlobalNetworkBanner() {
  const {
    isOnline,
    wasOffline,
    serviceUnavailable,
    isChecking,
    checkConnection,
    dismissMaintenance,
  } = useNetworkStatus();
  const { upsertToast, dismissToast } = useToast();
  const offlineDismissedRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      dismissToast(SYSTEM_TOAST_IDS.RECONNECTED);
      if (!offlineDismissedRef.current) {
        upsertToast({
          id: SYSTEM_TOAST_IDS.OFFLINE,
          type: 'warning',
          title: ERROR_CATEGORY_DICTIONARY.OFFLINE.title,
          message: ERROR_CATEGORY_DICTIONARY.OFFLINE.message,
          persist: true,
          onDismiss: () => {
            offlineDismissedRef.current = true;
          },
          action: {
            label: isChecking ? 'Memeriksa...' : ERROR_CATEGORY_DICTIONARY.OFFLINE.actionLabel,
            disabled: isChecking,
            keepOpen: true,
            onClick: () => {
              void checkConnection();
            },
          },
        });
      }
      return;
    }

    offlineDismissedRef.current = false;
    dismissToast(SYSTEM_TOAST_IDS.OFFLINE);

    if (wasOffline) {
      upsertToast({
        id: SYSTEM_TOAST_IDS.RECONNECTED,
        type: 'success',
        title: 'Koneksi Kembali Terhubung',
        message: 'Jaringan telah pulih. Anda dapat melanjutkan pekerjaan Anda kembali.',
        durationMs: RECONNECTED_TOAST_DURATION_MS,
      });
    }
  }, [isOnline, wasOffline, isChecking, checkConnection, upsertToast, dismissToast]);

  useEffect(() => {
    if (isOnline && serviceUnavailable.active) {
      upsertToast({
        id: SYSTEM_TOAST_IDS.SERVICE_UNAVAILABLE,
        type: 'error',
        title: ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.title,
        message: ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.message,
        persist: true,
        onDismiss: dismissMaintenance,
        action: {
          label: isChecking
            ? 'Memeriksa...'
            : ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.actionLabel,
          disabled: isChecking,
          keepOpen: true,
          onClick: () => {
            void checkConnection();
          },
        },
      });
      return;
    }

    dismissToast(SYSTEM_TOAST_IDS.SERVICE_UNAVAILABLE);
  }, [
    isOnline,
    serviceUnavailable.active,
    isChecking,
    checkConnection,
    dismissMaintenance,
    upsertToast,
    dismissToast,
  ]);

  return null;
}
