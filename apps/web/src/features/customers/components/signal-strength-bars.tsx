import React from 'react';

export function SignalStrengthBars({
  status,
}: {
  status: 'normal' | 'warning' | 'critical' | 'neutral';
}) {
  const activeColor =
    status === 'normal'
      ? '#16a34a'
      : status === 'warning'
        ? '#d97706'
        : status === 'critical'
          ? '#dc2626'
          : '#cbd5e1';
  const activeBars =
    status === 'normal' ? 4 : status === 'warning' ? 2 : status === 'critical' ? 1 : 0;

  return (
    <svg
      width="14"
      height="13"
      viewBox="0 0 14 13"
      fill="none"
      style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '6px' }}
      aria-label={`Kualitas redaman: ${status}`}
    >
      <rect
        x="0.5"
        y="9.5"
        width="2"
        height="3.5"
        rx="0.5"
        fill={activeBars >= 1 ? activeColor : '#e2e8f0'}
      />
      <rect
        x="4"
        y="6.5"
        width="2"
        height="6.5"
        rx="0.5"
        fill={activeBars >= 2 ? activeColor : '#e2e8f0'}
      />
      <rect
        x="7.5"
        y="3.5"
        width="2"
        height="9.5"
        rx="0.5"
        fill={activeBars >= 3 ? activeColor : '#e2e8f0'}
      />
      <rect
        x="11"
        y="0.5"
        width="2"
        height="12.5"
        rx="0.5"
        fill={activeBars >= 4 ? activeColor : '#e2e8f0'}
      />
    </svg>
  );
}
