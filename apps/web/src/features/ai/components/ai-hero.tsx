'use client';

import React from 'react';
import { AiSuggestionItem } from '../hooks/use-ai-assistant';

export interface AiHeroProps {
  suggestions: AiSuggestionItem[];
  onSelectSuggestion: (text: string) => void;
}

export function AiHero({ suggestions, onSelectSuggestion }: AiHeroProps) {
  return (
    <section
      aria-label="Pengenalan AI Assistant"
      style={{
        margin: 'auto 0',
        textAlign: 'center',
        width: '100%',
        maxWidth: '680px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Brand Logo Emblem from Logo.png */}
      <figure style={{ margin: '0 auto 20px' }}>
        <img
          src="/assets/Logo.png"
          alt="AI Assistant"
          width={64}
          height={82}
          style={{
            display: 'block',
            margin: '0 auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 12px rgba(0, 40, 85, 0.08))',
          }}
        />
      </figure>

      {/* Heading */}
      <h1
        style={{
          fontSize: '34px',
          fontWeight: 700,
          color: '#082138',
          letterSpacing: '-0.5px',
          margin: '0 0 12px',
          textAlign: 'center',
        }}
      >
        AI Assistant
      </h1>

      {/* Subtitle with High-Contrast Slate-700 */}
      <p
        style={{
          fontSize: '15px',
          color: '#334155',
          margin: '0 0 40px',
          textAlign: 'center',
          fontWeight: 500,
        }}
      >
        Tanyakan tentang jaringan, tiket, atau pekerjaan teknisi.
      </p>

      {/* 2x2 Suggestion Grid (Exact match to reference image with high contrast text) */}
      <nav
        aria-label="Saran Pertanyaan AI"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 260px))',
          justifyContent: 'center',
          gap: '14px 18px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelectSuggestion(item.label)}
            style={{
              background: 'rgba(238, 246, 255, 0.95)',
              border: '1px solid rgba(200, 226, 252, 0.9)',
              borderRadius: '8px',
              padding: '16px 28px',
              fontSize: '14.5px',
              fontWeight: 600,
              color: '#0f172a',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 1px 3px rgba(27, 92, 162, 0.04)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e1f0fc';
              e.currentTarget.style.borderColor = '#93c5fd';
              e.currentTarget.style.color = '#0e5b92';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(238, 246, 255, 0.95)';
              e.currentTarget.style.borderColor = 'rgba(200, 226, 252, 0.9)';
              e.currentTarget.style.color = '#0f172a';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </section>
  );
}
