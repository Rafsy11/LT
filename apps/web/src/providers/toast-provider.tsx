'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { normalizeAppError } from '@/lib/error-normalizer';
import '@/styles/components/error-ux.css';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  refCode?: string;
  message: string;
  action?: ToastAction;
  createdAt: number;
}

export interface ShowErrorOptions {
  fallbackCode?: string;
  fallbackMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

interface ToastContextType {
  toasts: ToastItem[];
  showSuccess: (message: string) => void;
  showError: (error: unknown, optionsOrFallbackCode?: string | ShowErrorOptions) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  dismissToast: (id: string) => void;
}

const TOAST_AUTO_DISMISS_MS = 5500;
const TOAST_WITH_ACTION_DISMISS_MS = 9000;

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id' | 'createdAt'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { ...toast, id, createdAt: Date.now() };

      setToasts((prev) => [newToast, ...prev].slice(0, 5));

      const duration = toast.action ? TOAST_WITH_ACTION_DISMISS_MS : TOAST_AUTO_DISMISS_MS;
      globalThis.setTimeout(() => {
        dismissToast(id);
      }, duration);
    },
    [dismissToast],
  );

  const showSuccess = useCallback(
    (message: string) => {
      addToast({ type: 'success', title: 'Berhasil', message });
    },
    [addToast],
  );

  /**
   * Normalizes and sanitizes any thrown error before presenting it as a humane toast.
   * Raw machine codes (`INTERNAL_ERROR`, `VALIDATION_ERROR`) are never exposed to users;
   * a short reference (`Ref: #ERR-XXXX`) is shown only for unexpected 5xx server failures.
   */
  const showError = useCallback(
    (rawError: unknown, optionsOrFallbackCode?: string | ShowErrorOptions) => {
      const opts: ShowErrorOptions =
        typeof optionsOrFallbackCode === 'string'
          ? { fallbackCode: optionsOrFallbackCode }
          : optionsOrFallbackCode || {};

      const normalized = normalizeAppError(rawError, {
        code: opts.fallbackCode,
        fallbackMessage: opts.fallbackMessage,
      });

      const shouldShowRef =
        normalized.category === 'SERVER_ERROR' || normalized.statusCode >= 500;

      const isWarningTone =
        normalized.category === 'OFFLINE' ||
        normalized.category === 'TIMEOUT' ||
        normalized.category === 'RATE_LIMITED' ||
        normalized.category === 'CONFLICT';

      addToast({
        type: isWarningTone ? 'warning' : 'error',
        title: normalized.title,
        refCode: shouldShowRef ? normalized.refCode : undefined,
        message: normalized.message,
        action: opts.onRetry
          ? {
              label: opts.retryLabel || normalized.actionLabel || 'Coba Lagi',
              onClick: opts.onRetry,
            }
          : undefined,
      });
    },
    [addToast],
  );

  const showWarning = useCallback(
    (message: string) => {
      addToast({ type: 'warning', title: 'Perhatian', message });
    },
    [addToast],
  );

  const showInfo = useCallback(
    (message: string) => {
      addToast({ type: 'info', title: 'Informasi', message });
    },
    [addToast],
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        dismissToast,
      }}
    >
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-card toast-${toast.type}`} role="status">
            <div className="toast-content">
              <div className="toast-header">
                <span className="toast-indicator" aria-hidden="true" />
                <span className="toast-title">
                  {toast.title ||
                    (toast.type === 'error'
                      ? 'Kendala Sementara'
                      : toast.type === 'success'
                        ? 'Berhasil'
                        : toast.type === 'warning'
                          ? 'Perhatian'
                          : 'Informasi')}
                </span>
                {toast.refCode && <span className="toast-ref">Ref: {toast.refCode}</span>}
              </div>
              <p className="toast-message">{toast.message}</p>
              {toast.action && (
                <div className="toast-action-row">
                  <button
                    type="button"
                    className="toast-action-btn"
                    onClick={() => {
                      const handler = toast.action?.onClick;
                      dismissToast(toast.id);
                      handler?.();
                    }}
                  >
                    {toast.action.label}
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Tutup notifikasi"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
