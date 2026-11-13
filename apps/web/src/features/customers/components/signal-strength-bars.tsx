import React from 'react';

export function SignalStrengthBars({
  status,
}: {
  status: 'normal' | 'warning' | 'critical' | 'neutral';
}) {
  const toneClass =
    status === 'normal'
      ? 'signal-bars--ok'
      : status === 'warning'
        ? 'signal-bars--warn'
        : status === 'critical'
          ? 'signal-bars--danger'
          : 'signal-bars--muted';
  const activeBars =
    status === 'normal' ? 4 : status === 'warning' ? 2 : status === 'critical' ? 1 : 0;

  return (
    <svg
      width="14"
      height="13"
      viewBox="0 0 14 13"
      fill="none"
      className={`signal-bars ${toneClass}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '6px' }}
      aria-label={`Kualitas redaman: ${status}`}
    >
      <rect
        x="0.5"
        y="9.5"
        width="2"
        height="3.5"
        rx="0.5"
        className={`signal-bar ${activeBars >= 1 ? 'is-active' : ''}`}
      />
      <rect
        x="4"
        y="6.5"
        width="2"
        height="6.5"
        rx="0.5"
        className={`signal-bar ${activeBars >= 2 ? 'is-active' : ''}`}
      />
      <rect
        x="7.5"
        y="3.5"
        width="2"
        height="9.5"
        rx="0.5"
        className={`signal-bar ${activeBars >= 3 ? 'is-active' : ''}`}
      />
      <rect
        x="11"
        y="0.5"
        width="2"
        height="12.5"
        rx="0.5"
        className={`signal-bar ${activeBars >= 4 ? 'is-active' : ''}`}
      />
    </svg>
  );
}
