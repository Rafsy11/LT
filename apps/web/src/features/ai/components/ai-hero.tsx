'use client';

import React from 'react';
import Image from 'next/image';
import { AiSuggestionItem } from '../hooks/use-ai-assistant';
import { AI_PERSONA } from '../lib/ai-persona';

export interface AiHeroProps {
  suggestions: AiSuggestionItem[];
  onSelectSuggestion: (text: string) => void;
}

export function AiHero({ suggestions, onSelectSuggestion }: AiHeroProps) {
  return (
    <section aria-label={`Pengenalan ${AI_PERSONA.displayName}`} className="ai-hero-section">
      {/* Brand Logo Emblem from Lintasarta-Icon.svg */}
      <figure className="ai-hero-logo-wrap">
        <Image
          src="/assets/Lintasarta-Icon.svg"
          alt={AI_PERSONA.displayName}
          width={64}
          height={64}
          priority
          className="ai-hero-logo-img"
        />
      </figure>

      {/* Persona Role Badge */}
      <span className="ai-hero-persona-badge">
        <span className="status-dot status-dot--ok" aria-hidden="true" />
        <span>{AI_PERSONA.heroBadge}</span>
      </span>

      {/* Heading */}
      <h1 className="ai-hero-title">{AI_PERSONA.heroTitle}</h1>

      {/* Subtitle */}
      <p className="ai-hero-desc">{AI_PERSONA.heroDescription}</p>

      {/* 2x2 Suggestion Grid */}
      <nav aria-label="Saran Pertanyaan AI" className="ai-hero-cards-grid">
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            className="ai-hero-suggestion-btn"
            onClick={() => onSelectSuggestion(item.label)}
          >
            <span className="ai-hero-btn-text">{item.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
