'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import '@/styles/components/error-ux.css';

export interface FieldErrorProps {
  /** Accessible element ID linked via `aria-describedby` from the corresponding input. */
  id?: string;
  /** Polite Indonesian correction message shown beneath the input. */
  message?: string | null;
  className?: string;
}

/**
 * Accessible inline validation feedback rendered directly underneath a form field.
 */
export function FieldError({ id, message, className = '' }: FieldErrorProps) {
  if (!message || !message.trim()) return null;

  return (
    <p id={id} role="alert" className={`ui-field-error ${className}`.trim()}>
      <span className="ui-field-error-icon" aria-hidden="true">
        <Icon name="alert" size={13} />
      </span>
      <span>{message}</span>
    </p>
  );
}
