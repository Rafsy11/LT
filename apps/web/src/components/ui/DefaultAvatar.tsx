import React from 'react';

interface DefaultAvatarProps {
  size?: number;
  className?: string;
  name?: string;
}

/**
 * Enterprise Default Profile Picture component.
 * Replaces generic/awkward initials boxes with a refined, human vector silhouette avatar.
 * Adheres to stitch-design-taste and antislop-ui guidelines.
 */
export function DefaultAvatar({ size = 36, className = '', name }: DefaultAvatarProps) {
  return (
    <div
      className={`default-avatar-wrap ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={name ? `Profil ${name}` : 'Foto Profil Teknisi'}
      aria-label={name ? `Foto Profil ${name}` : 'Foto Profil Teknisi'}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {/* Head */}
        <circle cx="20" cy="14" r="5.75" fill="currentColor" />
        {/* Neck / Collar */}
        <path d="M17.5 19.5H22.5V22H17.5V19.5Z" fill="currentColor" />
        {/* Shoulders & Torso */}
        <path
          d="M8.5 35.5C8.5 28.5 13.5 24 20 24C26.5 24 31.5 28.5 31.5 35.5H8.5Z"
          fill="currentColor"
        />
        {/* Subtle inner collar cleft */}
        <path
          className="default-avatar-collar"
          d="M17.5 23.5L20 27L22.5 23.5"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
