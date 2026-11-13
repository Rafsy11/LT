'use client';

import React, { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const emptySubscribe = () => () => {};
const openModalStack: string[] = [];
let previousHtmlOverflow: string | null = null;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getVisibleFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true' && (el.offsetParent !== null || el.getClientRects().length > 0),
  );
}

function lockBodyScroll(id: string) {
  if (typeof document === 'undefined') return;
  if (openModalStack.length === 0) {
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
  if (!openModalStack.includes(id)) {
    openModalStack.push(id);
  }
}

function unlockBodyScroll(id: string) {
  if (typeof document === 'undefined') return;
  const idx = openModalStack.lastIndexOf(id);
  if (idx !== -1) {
    openModalStack.splice(idx, 1);
  }
  if (openModalStack.length === 0) {
    document.documentElement.style.overflow = previousHtmlOverflow ?? '';
    previousHtmlOverflow = null;
  }
}

export interface ModalOverlayProps {
  /** Callback invoked when the user clicks the backdrop or presses Escape. */
  onClose: () => void;
  /** Accessible `aria-labelledby` ID pointing to the modal heading element. */
  labelledBy: string;
  /** Optional extra CSS classes appended to the `.overlay` container. */
  className?: string;
  /** Modal surface content (typically `<article className="modal">...</article>`). */
  children: React.ReactNode;
}

/**
 * Renders a modal dialog inside a React Portal attached to `document.body` so
 * overlays escape page-level stacking contexts and sit above all shell chrome
 * while remaining below global toast notifications (`z-index: 9999`).
 *
 * @param props - Modal overlay configuration and dialog surface children.
 * @returns A portaled `.overlay` container once hydrated on the client, or `null` during SSR.
 * @example
 * ```tsx
 * <ModalOverlay onClose={handleClose} labelledBy="detail-title">
 *   <article className="modal" onClick={(e) => e.stopPropagation()}>
 *     <h2 id="detail-title">Rincian</h2>
 *   </article>
 * </ModalOverlay>
 * ```
 */
export function ModalOverlay({
  onClose,
  labelledBy,
  className = '',
  children,
}: ModalOverlayProps) {
  const modalId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    if (!isClient) return;
    const previousFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll(modalId);

    const frameId = requestAnimationFrame(() => {
      const container = overlayRef.current;
      if (!container) return;
      if (container.contains(document.activeElement)) return;
      const focusables = getVisibleFocusableElements(container);
      const target = focusables[0] ?? container;
      target.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const topModalId = openModalStack[openModalStack.length - 1];
      if (topModalId !== modalId) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab') {
        const container = overlayRef.current;
        if (!container) return;
        const focusables = getVisibleFocusableElements(container);
        if (focusables.length === 0) {
          event.preventDefault();
          container.focus({ preventScroll: true });
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (!active || active === first || !container.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !container.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown, true);
      unlockBodyScroll(modalId);
      if (previousFocused && previousFocused.isConnected) {
        previousFocused.focus({ preventScroll: true });
      }
    };
  }, [isClient, modalId]);

  if (!isClient) return null;

  return createPortal(
    <div
      ref={overlayRef}
      tabIndex={-1}
      className={className ? `overlay ${className}` : 'overlay'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

