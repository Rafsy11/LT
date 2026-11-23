'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { normalizeAppError } from '@/lib/error-normalizer';
import '@/styles/components/error-ux.css';

export interface ToastAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** When true, clicking the action keeps the toast open instead of dismissing immediately. */
  keepOpen?: boolean;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  refCode?: string;
  message: string;
  action?: ToastAction;
  /** Persistent toasts stay visible until explicitly dismissed or cleared programmatically. */
  persist?: boolean;
  /** Optional auto-dismiss override in milliseconds (ignored when persist is true). */
  durationMs?: number;
  /** Optional callback triggered only when the user manually closes this toast. */
  onDismiss?: () => void;
  createdAt: number;
}

export type UpsertToastInput = Omit<ToastItem, 'id' | 'createdAt'> & {
  id?: string;
};

export const SYSTEM_TOAST_IDS = {
  OFFLINE: 'system-network-offline',
  RECONNECTED: 'system-network-reconnected',
  SERVICE_UNAVAILABLE: 'system-service-unavailable',
} as const;

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
  upsertToast: (toast: UpsertToastInput) => string;
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
  const toastsRef = useRef<ToastItem[]>([]);
  const lastExternalFocusRef = useRef<HTMLElement | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pausedIdsRef = useRef<Set<string>>(new Set());

  toastsRef.current = toasts;

  const clearToastTimer = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) {
      globalThis.clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissToastInternal = useCallback(
    (id: string, isManual: boolean) => {
      clearToastTimer(id);
      pausedIdsRef.current.delete(id);
      const target = toastsRef.current.find((t) => t.id === id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
      if (isManual) {
        target?.onDismiss?.();
      }
    },
    [clearToastTimer],
  );

  const dismissToast = useCallback(
    (id: string) => {
      dismissToastInternal(id, false);
    },
    [dismissToastInternal],
  );

  const scheduleAutoDismiss = useCallback(
    (id: string, durationMs: number) => {
      clearToastTimer(id);
      if (pausedIdsRef.current.has(id)) return;
      const timer = globalThis.setTimeout(() => {
        dismissToastInternal(id, false);
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [clearToastTimer, dismissToastInternal],
  );

  const pauseToastDismiss = useCallback(
    (id: string) => {
      pausedIdsRef.current.add(id);
      clearToastTimer(id);
    },
    [clearToastTimer],
  );

  const resumeToastDismiss = useCallback(
    (toast: ToastItem) => {
      pausedIdsRef.current.delete(toast.id);
      if (toast.persist) return;
      scheduleAutoDismiss(
        toast.id,
        toast.action ? TOAST_AUTO_DISMISS_MS : TOAST_RESUME_DISMISS_MS,
      );
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

  const upsertToast = useCallback(
    (toast: UpsertToastInput): string => {
      const id =
        toast.id || `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const existing = toastsRef.current.find((t) => t.id === id);

      const mergedToast: ToastItem = existing
        ? {
            ...existing,
            ...toast,
            id,
            refCode: toast.refCode ?? existing.refCode,
            onDismiss: toast.onDismiss ?? existing.onDismiss,
            action: toast.action ?? (existing.persist ? existing.action : undefined),
            persist: toast.persist ?? existing.persist,
            createdAt: existing.createdAt,
          }
        : {
            ...toast,
            id,
            createdAt: Date.now(),
          };

      setToasts((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = mergedToast;
          return next;
        }
        const combined = [mergedToast, ...prev];
        if (combined.length <= 5) return combined;
        const persistent = combined.filter((t) => t.persist);
        const transient = combined.filter((t) => !t.persist);
        return [...persistent, ...transient].slice(0, Math.max(5, persistent.length));
      });

      const contentChanged =
        !existing ||
        existing.title !== mergedToast.title ||
        existing.message !== mergedToast.message;

      if (contentChanged) {
        const spoken = mergedToast.title
          ? `${mergedToast.title}: ${mergedToast.message}`
          : mergedToast.message;
        setLiveAnnouncement(mergedToast.action ? `${spoken}. Aksi tersedia.` : spoken);
        announceToast(spoken, Boolean(mergedToast.action));
      }

      if (mergedToast.persist) {
        clearToastTimer(id);
      } else {
        const duration =
          mergedToast.durationMs ??
          (mergedToast.action ? TOAST_WITH_ACTION_DISMISS_MS : TOAST_AUTO_DISMISS_MS);
        scheduleAutoDismiss(id, duration);
      }

      return id;
    },
    [clearToastTimer, scheduleAutoDismiss],
  );

  const handleManualDismiss = useCallback(
    (id: string, buttonEl: HTMLButtonElement | null) => {
      const cardEl = buttonEl?.closest('.toast-card');
      const nextCard =
        (cardEl?.nextElementSibling as HTMLElement | null) ??
        (cardEl?.previousElementSibling as HTMLElement | null);
      const nextCloseBtn = nextCard?.querySelector<HTMLButtonElement>('.toast-close');

      dismissToastInternal(id, true);

      if (nextCloseBtn) {
        requestAnimationFrame(() => nextCloseBtn.focus());
      } else if (lastExternalFocusRef.current?.isConnected) {
        const priorFocus = lastExternalFocusRef.current;
        lastExternalFocusRef.current = null;
        requestAnimationFrame(() => priorFocus.focus());
      }
    },
    [dismissToastInternal],
  );

  const showSuccess = useCallback(
    (message: string) => {
      upsertToast({ type: 'success', title: 'Berhasil', message });
    },
    [upsertToast],
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

      const dedupSystemId =
        normalized.category === 'SERVICE_UNAVAILABLE'
          ? SYSTEM_TOAST_IDS.SERVICE_UNAVAILABLE
          : normalized.category === 'OFFLINE'
            ? SYSTEM_TOAST_IDS.OFFLINE
            : undefined;

      upsertToast({
        id: dedupSystemId,
        persist: Boolean(dedupSystemId),
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
    [upsertToast],
  );

  const showWarning = useCallback(
    (message: string) => {
      upsertToast({ type: 'warning', title: 'Perhatian', message });
    },
    [upsertToast],
  );

  const showInfo = useCallback(
    (message: string) => {
      upsertToast({ type: 'info', title: 'Informasi', message });
    },
    [upsertToast],
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        upsertToast,
        dismissToast,
      }}
    >
      {children}
      <p className="sr-only">Pemberitahuan sistem</p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      <div
        ref={containerRef}
        className="toast-container"
        role="region"
        aria-label="Notifikasi sistem"
        onFocusCapture={(e) => {
          const prior = e.relatedTarget;
          if (prior instanceof HTMLElement && !containerRef.current?.contains(prior)) {
            lastExternalFocusRef.current = prior;
          }
        }}
        {...({ popover: 'manual' } as Record<string, string>)}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-card toast-${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => pauseToastDismiss(toast.id)}
            onMouseLeave={() => resumeToastDismiss(toast)}
            onFocusCapture={() => pauseToastDismiss(toast.id)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                resumeToastDismiss(toast);
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
                    disabled={toast.action.disabled}
                    onClick={() => {
                      const handler = toast.action?.onClick;
                      if (!toast.action?.keepOpen) {
                        dismissToastInternal(toast.id, false);
                      }
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
