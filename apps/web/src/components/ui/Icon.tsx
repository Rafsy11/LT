import React from 'react';

const icons: Record<string, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  network: 'M12 3v6 M5 14v-5h14v5 M2 14h6v6H2z M9 2h6v5H9z M16 14h6v6h-6z',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9',
  ticket:
    'M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6z M13 5v3 M13 11v2 M13 16v3',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 4 4 1v8l-4 1-1 4H9l-1-4-4-1V8l4-1z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  search: 'M21 21l-5-5 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  arrow: 'M7 17 17 7 M7 7h10v10',
  chevron: 'm9 5 7 7-7 7',
  plus: 'M12 5v14 M5 12h14',
  clock: 'M12 8v4l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  check: 'm5 12 4 4L19 6',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  pin: 'M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13 M12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className = '' }: IconProps) {
  const path = icons[name] || icons.grid;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}
