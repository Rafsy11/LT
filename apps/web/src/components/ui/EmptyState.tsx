'use client';

import React from 'react';
import { Icon } from './Icon';
import '@/styles/components/empty-state.css';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: string | React.ComponentType<{ className?: string; size?: number }>;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  /** Icon name mapped in Icon.tsx OR a custom component */
  icon?: string | React.ComponentType<{ className?: string; size?: number }>;
  /** Primary heading explaining what is empty. */
  title: string;
  /** Contextual explanation of why it is empty and what the user can do next. */
  description: string;
  /** Action button specification per PROJECT.md contract */
  action?: EmptyStateAction;
  /** Optional primary or recovery action label (e.g. 'Reset Filter', 'Buat Tiket Baru'). */
  actionLabel?: string;
  /** Optional icon inside the action button. */
  actionIcon?: string;
  /** Callback executed when the user clicks the action button. */
  onAction?: () => void;
  /** Visual variant of the action button. */
  actionVariant?: 'primary' | 'secondary';
  /** Density mode for full grids ('default') vs compact panels/dropdowns ('compact'). */
  size?: 'default' | 'compact';
  /** Optional extra CSS class name. */
  className?: string;
}

export function EmptyState({
  icon = 'search',
  title,
  description,
  action,
  actionLabel,
  actionIcon,
  onAction,
  actionVariant = 'secondary',
  size = 'default',
  className = '',
}: EmptyStateProps) {
  const isCompact = size === 'compact';
  const iconSize = isCompact ? 18 : 22;

  const resolvedLabel = action?.label ?? actionLabel;
  const resolvedAction = action?.onClick ?? onAction;
  const resolvedIcon = action?.icon ?? actionIcon;
  const resolvedVariant = action?.variant ?? actionVariant;

  const renderMainIcon = () => {
    if (!icon) return null;
    if (typeof icon === 'string') {
      return <Icon name={icon} size={iconSize} />;
    }
    const IconComponent = icon;
    return <IconComponent size={iconSize} />;
  };

  const renderActionIcon = () => {
    if (!resolvedIcon) return null;
    if (typeof resolvedIcon === 'string') {
      return <Icon name={resolvedIcon} size={14} />;
    }
    const ActionIconComponent = resolvedIcon;
    return <ActionIconComponent size={14} />;
  };

  return (
    <div
      className={`ui-empty-state ${isCompact ? 'ui-empty-state--compact' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="ui-empty-state-icon-box" aria-hidden="true">
        {renderMainIcon()}
      </div>
      <h3 className="ui-empty-state-title">{title}</h3>
      <p className="ui-empty-state-desc">{description}</p>
      {resolvedLabel && resolvedAction && (
        <div className="ui-empty-state-actions">
          <button
            type="button"
            onClick={resolvedAction}
            className={`ui-empty-state-btn ${
              resolvedVariant === 'secondary' ? 'ui-empty-state-btn--secondary' : ''
            }`.trim()}
          >
            {renderActionIcon()}
            <span>{resolvedLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}

