'use client';

import React from 'react';
import Image from 'next/image';
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
      {/* Brand Logo Emblem from Lintasarta-Icon.svg */}
      <figure style={{ margin: '0 auto 20px' }}>
        <Image
          src="/assets/Lintasarta-Icon.svg"
          alt="AI Assistant"
          width={72}
          height={72}
          priority
          className="ai-hero-logo-img"
        />
      </figure>

      {/* Heading */}
      <h1 className="ai-hero-title">
        AI Assistant
      </h1>

      {/* Subtitle */}
      <p className="ai-hero-desc">
        Tanyakan tentang jaringan, tiket, atau pekerjaan teknisi.
      </p>

      {/* 2x2 Suggestion Grid */}
      <nav
        aria-label="Saran Pertanyaan AI"
        className="ai-hero-cards-grid"
      >
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            className="ai-hero-suggestion-btn"
            onClick={() => onSelectSuggestion(item.label)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </section>
  );
}
