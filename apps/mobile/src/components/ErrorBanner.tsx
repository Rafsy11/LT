import React from 'react';
import { sanitizeUiErrorMessage, STANDARD_ACTION_LABELS } from '@repo/shared';
import { getThemeTokens } from '../theme/tokens';

export interface MobileErrorBannerProps {
  message?: string | null;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
  style?: React.CSSProperties;
  className?: string;
}

export type ErrorBannerProps = MobileErrorBannerProps;

function AlertTriangleIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CloseIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Reusable, zero-dependency mobile ErrorBanner component.
 * Sanitizes errors via `@repo/shared` and displays standardized Indonesian messages.
 * Enforces zero em-dashes, min 44px touch targets, and WCAG AA contrast.
 */
export function ErrorBanner({
  message,
  error,
  onRetry,
  retryLabel = STANDARD_ACTION_LABELS.RETRY,
  onDismiss,
  themeMode = 'light',
  style,
  className,
}: MobileErrorBannerProps) {
  const theme = getThemeTokens(themeMode);

  if (!message && !error) {
    return null;
  }

  const resolvedMessage = error
    ? sanitizeUiErrorMessage(error).message
    : sanitizeUiErrorMessage(message).message;

  // Outdoor vs Dark vs Light theme palettes
  const isDark = themeMode === 'dark';
  const isOutdoor = themeMode === 'outdoorSunlight';

  const bannerBg = isOutdoor ? '#FFFFFF' : isDark ? '#450A0A' : '#FEF2F2';
  const bannerBorder = isOutdoor ? '2px solid #000000' : isDark ? '1px solid #7F1D1D' : '1px solid #FECACA';
  const textColor = isOutdoor ? '#000000' : isDark ? '#FCA5A5' : '#991B1B';
  const iconColor = isOutdoor ? '#000000' : isDark ? '#EF4444' : '#DC2626';
  const buttonBg = isOutdoor ? '#000000' : isDark ? '#7F1D1D' : '#DC2626';
  const buttonTextColor = '#FFFFFF';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 14px',
        background: bannerBg,
        border: bannerBorder,
        borderRadius: `${theme.radii.badge * 1.5}px`,
        color: textColor,
        fontSize: '13px',
        lineHeight: theme.typography.lineHeight.normal,
        fontFamily: theme.typography.fontFamily.sans,
        marginBottom: '14px',
        boxSizing: 'border-box',
        width: '100%',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: '1 1 200px' }}>
        <div style={{ paddingTop: '2px' }}>
          <AlertTriangleIcon size={18} color={iconColor} />
        </div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: textColor, wordBreak: 'break-word' }}>
          {resolvedMessage}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              minHeight: `${theme.touch.buttonMinHeight}px`,
              minWidth: '44px',
              padding: '6px 14px',
              background: buttonBg,
              color: buttonTextColor,
              border: 'none',
              borderRadius: `${theme.radii.button}px`,
              fontSize: '12px',
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

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Tutup pemberitahuan kesalahan"
            style={{
              minHeight: `${theme.touch.headerActionSize}px`,
              minWidth: `${theme.touch.headerActionSize}px`,
              padding: '8px',
              background: 'transparent',
              border: 'none',
              color: textColor,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: `${theme.radii.button}px`,
            }}
          >
            <CloseIcon size={16} color={textColor} />
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorBanner;
