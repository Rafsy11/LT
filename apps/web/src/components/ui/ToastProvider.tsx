'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { sanitizeUiErrorMessage, ERROR_CODES } from '@repo/shared';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  code?: string;
  message: string;
  createdAt: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showSuccess: (message: string) => void;
  showError: (error: unknown, fallbackCode?: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id' | 'createdAt'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastItem = { ...toast, id, createdAt: Date.now() };

    setToasts((prev) => [newToast, ...prev].slice(0, 5));

    // Auto dismiss after 5.5s
    setTimeout(() => {
      dismissToast(id);
    }, 5500);
  }, [dismissToast]);

  const showSuccess = useCallback((message: string) => {
    addToast({ type: 'success', message });
  }, [addToast]);

  /**
   * Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1).
   * Mencegah bocornya Prisma query, PostgreSQL error code, dan stack trace ke UI.
   */
  const showError = useCallback((rawError: unknown, fallbackCode?: string) => {
    const sanitized = sanitizeUiErrorMessage(rawError);
    addToast({
      type: 'error',
      code: sanitized.code || fallbackCode || ERROR_CODES.INTERNAL_ERROR,
      message: sanitized.message,
    });
  }, [addToast]);

  const showWarning = useCallback((message: string) => {
    addToast({ type: 'warning', message });
  }, [addToast]);

  const showInfo = useCallback((message: string) => {
    addToast({ type: 'info', message });
  }, [addToast]);

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
          <div key={toast.id} className={`toast-card toast-${toast.type}`}>
            <div className="toast-content">
              <div className="toast-header">
                <span className="toast-indicator" />
                <span className="toast-title">
                  {toast.type === 'error' && 'Peringatan Sistem'}
                  {toast.type === 'success' && 'Berhasil'}
                  {toast.type === 'warning' && 'Perhatian Operasional'}
                  {toast.type === 'info' && 'Informasi'}
                </span>
                {toast.code && <span className="toast-code">{toast.code}</span>}
              </div>
              <p className="toast-message">{toast.message}</p>
            </div>
            <button
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
