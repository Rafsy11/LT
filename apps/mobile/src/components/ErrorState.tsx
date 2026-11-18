import React from 'react';
import { sanitizeUiErrorMessage, STANDARD_ACTION_LABELS } from '@repo/shared';
import { getThemeTokens } from '../theme/tokens';

export interface MobileErrorStateProps {
  title?: string;
  message?: string | null;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
  size?: 'default' | 'compact';
  style?: React.CSSProperties;
  className?: string;
}

export type ErrorStateProps = MobileErrorStateProps;

function ErrorShieldIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * Reusable, zero-dependency mobile ErrorState component.
 * Displays a full recovery card with sanitized Indonesian error copy.
 * Strict zero em-dashes, min 44px touch targets, and WCAG AA contrast.
 */
export function ErrorState({
  title = 'Terjadi Gangguan Sistem',
  message,
  error,
  onRetry,
  retryLabel = STANDARD_ACTION_LABELS.RETRY,
  onSecondaryAction,
  secondaryActionLabel,
  themeMode = 'light',
  size = 'default',
  style,
  className,
}: MobileErrorStateProps) {
  const theme = getThemeTokens(themeMode);

  const resolvedMessage = error
    ? sanitizeUiErrorMessage(error).message
    : sanitizeUiErrorMessage(message).message;

  const isCompact = size === 'compact';
  const isDark = themeMode === 'dark';
  const isOutdoor = themeMode === 'outdoorSunlight';

  const cardBg = isOutdoor ? '#FFFFFF' : isDark ? '#1F1315' : '#FEF2F2';
  const cardBorder = isOutdoor ? '2px solid #000000' : isDark ? '1px solid #7F1D1D' : '1px solid #FECACA';
  const titleColor = isOutdoor ? '#000000' : isDark ? '#FCA5A5' : '#991B1B';
  const descColor = isOutdoor ? '#111827' : isDark ? '#F87171' : '#B91C1C';
  const iconWrapperBg = isOutdoor ? '#F3F4F6' : isDark ? '#450A0A' : '#FEE2E2';
  const iconColor = isOutdoor ? '#000000' : isDark ? '#EF4444' : '#DC2626';

  const retryBtnBg = isOutdoor ? '#000000' : isDark ? '#DC2626' : '#DC2626';
  const retryBtnColor = '#FFFFFF';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: isCompact ? '24px 16px' : '36px 20px',
        background: cardBg,
        border: cardBorder,
        borderRadius: `${theme.radii.card}px`,
        fontFamily: theme.typography.fontFamily.sans,
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          width: isCompact ? '44px' : '52px',
          height: isCompact ? '44px' : '52px',
          borderRadius: '50%',
          background: iconWrapperBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '14px',
        }}
      >
        <ErrorShieldIcon size={isCompact ? 24 : 28} />
      </div>

      <h3
        style={{
          margin: '0 0 8px 0',
          fontSize: isCompact ? '15px' : '17px',
          fontWeight: 700,
          color: titleColor,
          lineHeight: theme.typography.lineHeight.tight,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: isCompact ? '12px' : '13px',
          color: descColor,
          lineHeight: theme.typography.lineHeight.normal,
          maxWidth: '380px',
        }}
      >
        {resolvedMessage}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginTop: '20px',
        }}
      >
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              minHeight: `${theme.touch.buttonMinHeight}px`,
              minWidth: '44px',
              padding: '10px 22px',
              background: retryBtnBg,
              color: retryBtnColor,
              border: 'none',
              borderRadius: `${theme.radii.button}px`,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'opacity 150ms ease',
            }}
          >
            {retryLabel}
          </button>
        )}

        {onSecondaryAction && secondaryActionLabel && (
          <button
            type="button"
            onClick={onSecondaryAction}
            style={{
              minHeight: `${theme.touch.buttonMinHeight}px`,
              minWidth: '44px',
              padding: '10px 18px',
              background: 'transparent',
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: `${theme.radii.button}px`,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorState;
