'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatRetryCountdownMessage } from '@/lib/error-dictionary';
import '@/styles/components/error-ux.css';

export interface RateLimitNoticeProps {
  /** Remaining wait duration in seconds. Hidden when `<= 0`. */
  remainingSeconds: number;
  /** Optional custom heading. */
  title?: string;
  /** Optional prefix message prepended before the live countdown sentence. */
  message?: string;
  className?: string;
}

/**
 * Live countdown notice for HTTP 429 Too Many Requests responses.
 */
export function RateLimitNotice({
  remainingSeconds,
  title = 'Mohon Tunggu Sebentar',
  message,
  className = '',
}: RateLimitNoticeProps) {
  if (remainingSeconds <= 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`ui-rate-limit-notice ${className}`.trim()}
    >
      <span className="ui-rate-limit-notice-icon" aria-hidden="true">
        <Icon name="clock" size={16} />
      </span>
      <div className="ui-rate-limit-notice-body">
        <strong className="ui-rate-limit-notice-title">
          {title} ({remainingSeconds} detik)
        </strong>
        <p className="ui-rate-limit-notice-text">
          {formatRetryCountdownMessage(remainingSeconds, message)}
        </p>
      </div>
    </div>
  );
}
