'use client';

import React, { useEffect, useId, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const emptySubscribe = () => () => {};
const openModalStack: string[] = [];
let previousHtmlOverflow: string | null = null;

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
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    if (!isClient) return;
    lockBodyScroll(modalId);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const topModalId = openModalStack[openModalStack.length - 1];
      if (topModalId === modalId) {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unlockBodyScroll(modalId);
    };
  }, [isClient, modalId, onClose]);

  if (!isClient) return null;

  return createPortal(
    <div
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

