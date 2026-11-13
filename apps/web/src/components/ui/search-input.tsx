'use client';

import React, { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface SearchInputProps {
  /** Controlled current search query string. */
  value: string;
  /** Callback fired whenever the user types or clears the search query. */
  onChange: (value: string) => void;
  /** Input placeholder text shown when empty. */
  placeholder: string;
  /** Accessible label applied to both the `<search>` landmark and `<input>`. */
  ariaLabel: string;
  /** Optional feature-level layout class (width/flex) appended alongside `.fiberops-search-box`. */
  className?: string;
  /** Optional inline layout overrides for container width/flex alignment. */
  style?: React.CSSProperties;
}

/**
 * Shared accessible search field used across every FiberOps view so search height,
 * border styling, focus ring, icon placement, and clear action remain consistent
 * across light and dark modes on all viewports.
 *
 * @param props - Search state, labels, placeholder, and layout classes.
 * @returns A semantic `<search>` landmark wrapping icon, full-height input, and clear button.
 * @example
 * ```tsx
 * <SearchInput
 *   value={search}
 *   onChange={setSearch}
 *   placeholder="Cari pelanggan atau SIA..."
 *   ariaLabel="Cari pelanggan"
 * />
 * ```
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
  style,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <search
      role="search"
      aria-label={ariaLabel}
      className={className ? `fiberops-search-box ${className}` : 'fiberops-search-box'}
      style={style}
    >
      <span className="fiberops-search-icon" aria-hidden="true">
        <Icon name="search" size={14} />
      </span>
      <input
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="fiberops-search-input"
      />
      {value && (
        <button
          type="button"
          className="fiberops-search-clear"
          aria-label={`Hapus kata kunci ${ariaLabel.toLowerCase()}`}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </search>
  );
}

