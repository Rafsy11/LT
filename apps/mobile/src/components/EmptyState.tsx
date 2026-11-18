import React from 'react';
import { getThemeTokens } from '../theme/tokens';

export type EmptyStateIconType =
  | 'ticket'
  | 'search'
  | 'filter'
  | 'network'
  | 'alert'
  | 'inbox';

export interface MobileEmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface MobileEmptyStateProps {
  icon?: EmptyStateIconType | string;
  iconName?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: MobileEmptyStateAction;
  actionVariant?: 'primary' | 'secondary';
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
  size?: 'default' | 'compact';
  style?: React.CSSProperties;
  className?: string;
}

export type EmptyStateProps = MobileEmptyStateProps;

function renderSvgIcon(iconName: string, sizePx: number) {
  switch (iconName) {
    case 'ticket':
      return (
        <svg
          width={sizePx}
          height={sizePx}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
          <path d="M13 11v2" />
        </svg>
      );
    case 'filter':
      return (
        <svg
          width={sizePx}
          height={sizePx}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      );
    case 'network':
      return (
        <svg
          width={sizePx}
          height={sizePx}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="16" y="16" width="6" height="6" rx="1" />
          <rect x="2" y="16" width="6" height="6" rx="1" />
          <rect x="9" y="2" width="6" height="6" rx="1" />
          <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
          <path d="M12 12V8" />
        </svg>
      );
    case 'alert':
      return (
        <svg
          width={sizePx}
          height={sizePx}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      );
    case 'inbox':
      return (
        <svg
          width={sizePx}
          height={sizePx}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
    case 'search':
    default:
      return (
        <svg
          width={sizePx}
          height={sizePx}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
  }
}

/**
 * Reusable, zero-dependency mobile EmptyState component.
 * Displays contextual icon, title, description in standard Indonesian, and optional action.
 * Strict zero em-dashes and WCAG AA contrast compliance.
 */
export function EmptyState({
  icon = 'search',
  iconName,
  title,
  description,
  actionLabel,
  onAction,
  action,
  actionVariant = 'secondary',
  themeMode = 'light',
  size = 'default',
  style,
  className,
}: MobileEmptyStateProps) {
  const theme = getThemeTokens(themeMode);
  const resolvedIcon = iconName || icon || 'search';
  const isCompact = size === 'compact';
  const iconPixelSize = isCompact ? 20 : 24;

  const resolvedActionLabel = action?.label || actionLabel;
  const resolvedOnAction = action?.onClick || onAction;
  const resolvedVariant = action?.variant || actionVariant;

  const isPrimary = resolvedVariant === 'primary';
  const buttonBg = isPrimary ? theme.primary : 'transparent';
  const buttonColor = isPrimary ? theme.primaryText : theme.textPrimary;
  const buttonBorder = isPrimary ? 'none' : `1px solid ${theme.border}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: isCompact ? '24px 16px' : '36px 20px',
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: `${theme.radii.card}px`,
        color: theme.textPrimary,
        fontFamily: theme.typography.fontFamily.sans,
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          width: isCompact ? '40px' : '48px',
          height: isCompact ? '40px' : '48px',
          borderRadius: '50%',
          background: theme.badgeBg,
          color: theme.textSecondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px',
        }}
      >
        {renderSvgIcon(resolvedIcon, iconPixelSize)}
      </div>

      <h3
        style={{
          margin: '0 0 6px 0',
          fontSize: isCompact ? '14px' : '16px',
          fontWeight: 600,
          color: theme.textPrimary,
          lineHeight: theme.typography.lineHeight.tight,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: isCompact ? '12px' : '13px',
          color: theme.textSecondary,
          lineHeight: theme.typography.lineHeight.normal,
          maxWidth: '380px',
        }}
      >
        {description}
      </p>

      {resolvedOnAction && resolvedActionLabel && (
        <button
          type="button"
          onClick={resolvedOnAction}
          style={{
            marginTop: '16px',
            minHeight: `${theme.touch.buttonMinHeight}px`,
            padding: '10px 20px',
            background: buttonBg,
            color: buttonColor,
            border: buttonBorder,
            borderRadius: `${theme.radii.button}px`,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 150ms ease, opacity 150ms ease',
          }}
        >
          {resolvedActionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
