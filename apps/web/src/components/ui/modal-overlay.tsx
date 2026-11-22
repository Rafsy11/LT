'use client';

import React, { useEffect, useRef } from 'react';

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
 * Renders a native top-layer `<dialog>` modal via `showModal()`, relying on browser-native
 * focus containment, inert background page, `Esc` / back-gesture dismissal, and CSS
 * `overscroll-behavior: contain` without mutating `html`/`body` overflow.
 *
 * @param props - Modal overlay configuration and dialog surface children.
 * @returns A native `<dialog className="overlay">` promoted to the browser Top Layer.
 * @example
 * ```tsx
 * <ModalOverlay onClose={handleClose} labelledBy="detail-title">
 *   <article className="modal">
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const pressedBackdropRef = useRef(false);
  const isUnmountingRef = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    isUnmountingRef.current = false;

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute('open', '');
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };

    const handleClose = () => {
      if (!isUnmountingRef.current) {
        onCloseRef.current();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    return () => {
      isUnmountingRef.current = true;
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDialogElement>) => {
    // Require both press and release on the backdrop so text-selection drags never dismiss
    pressedBackdropRef.current = event.target === event.currentTarget;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDialogElement>) => {
    if (pressedBackdropRef.current && event.target === event.currentTarget) {
      pressedBackdropRef.current = false;
      onCloseRef.current();
      return;
    }
    pressedBackdropRef.current = false;
  };

  return (
    <dialog
      ref={dialogRef}
      className={className ? `overlay ${className}` : 'overlay'}
      aria-labelledby={labelledBy}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      {children}
    </dialog>
  );
}
