'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
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
const TOAST_RESUME_DISMISS_MS = 3000;

const ToastContext = createContext<ToastContextType | null>(null);

function announceToast(message: string, hasAction: boolean): void {
  if (typeof document === 'undefined') return;
  const text = hasAction ? `${message}. Aksi tersedia.` : message;
  const docWithAriaNotify = document as Document & {
    ariaNotify?: (announcement: string, options?: { priority?: 'normal' | 'high' }) => void;
  };
  if (typeof docWithAriaNotify.ariaNotify === 'function') {
    try {
      docWithAriaNotify.ariaNotify(text, { priority: 'normal' });
    } catch {
      // Fallback live region remains active
    }
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pausedIdsRef = useRef<Set<string>>(new Set());

  const clearToastTimer = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) {
      globalThis.clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      clearToastTimer(id);
      pausedIdsRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearToastTimer],
  );

  const scheduleAutoDismiss = useCallback(
    (id: string, durationMs: number) => {
      clearToastTimer(id);
      if (pausedIdsRef.current.has(id)) return;
      const timer = globalThis.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [clearToastTimer, dismissToast],
  );

  const pauseToastDismiss = useCallback(
    (id: string) => {
      pausedIdsRef.current.add(id);
      clearToastTimer(id);
    },
    [clearToastTimer],
  );

  const resumeToastDismiss = useCallback(
    (id: string, hasAction: boolean) => {
      pausedIdsRef.current.delete(id);
      scheduleAutoDismiss(id, hasAction ? TOAST_AUTO_DISMISS_MS : TOAST_RESUME_DISMISS_MS);
    },
    [scheduleAutoDismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        globalThis.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // Promote toast stack into the browser Top Layer via popover="manual" so toasts remain
  // visible above open native <dialog> modals while degrading cleanly without Popover API.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof el.showPopover !== 'function' || typeof el.hidePopover !== 'function') {
      return;
    }

    try {
      if (toasts.length > 0) {
        const isOpen = el.matches(':popover-open');
        const hasOpenModal = Boolean(document.querySelector('dialog:modal'));
        if (isOpen && hasOpenModal) {
          el.hidePopover();
          el.showPopover();
        } else if (!isOpen) {
          el.showPopover();
        }
      } else if (el.matches(':popover-open')) {
        el.hidePopover();
      }
    } catch {
      // Safe fallback to fixed positioning
    }
  }, [toasts]);

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id' | 'createdAt'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { ...toast, id, createdAt: Date.now() };

      setToasts((prev) => [newToast, ...prev].slice(0, 5));

      const spoken = toast.title ? `${toast.title}: ${toast.message}` : toast.message;
      setLiveAnnouncement(toast.action ? `${spoken}. Aksi tersedia.` : spoken);
      announceToast(spoken, Boolean(toast.action));

      const duration = toast.action ? TOAST_WITH_ACTION_DISMISS_MS : TOAST_AUTO_DISMISS_MS;
      scheduleAutoDismiss(id, duration);
    },
    [scheduleAutoDismiss],
  );

  const handleManualDismiss = useCallback(
    (id: string, buttonEl: HTMLButtonElement | null) => {
      const cardEl = buttonEl?.closest('.toast-card');
      const nextCard =
        (cardEl?.nextElementSibling as HTMLElement | null) ??
        (cardEl?.previousElementSibling as HTMLElement | null);
      const nextCloseBtn = nextCard?.querySelector<HTMLButtonElement>('.toast-close');

      dismissToast(id);

      if (nextCloseBtn) {
        requestAnimationFrame(() => nextCloseBtn.focus());
      }
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
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      <div
        ref={containerRef}
        className="toast-container"
        role="region"
        aria-label="Notifikasi sistem"
        {...({ popover: 'manual' } as Record<string, string>)}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-card toast-${toast.type}`}
            role="status"
            onMouseEnter={() => pauseToastDismiss(toast.id)}
            onMouseLeave={() => resumeToastDismiss(toast.id, Boolean(toast.action))}
            onFocusCapture={() => pauseToastDismiss(toast.id)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                resumeToastDismiss(toast.id, Boolean(toast.action));
              }
            }}
          >
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
              onClick={(e) => handleManualDismiss(toast.id, e.currentTarget)}
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
