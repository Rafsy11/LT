'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface AiPromptInputProps {
  prompt: string;
  setPrompt: (val: string) => void;
  loading: boolean;
  onSubmit: (prompt: string) => void;
}

export function AiPromptInput({ prompt, setPrompt, loading, onSubmit }: AiPromptInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(prompt);
      }}
      style={{
        width: '100%',
        maxWidth: 'calc(100% - 40px)',
        margin: '0 auto',
        background: '#ffffff',
        border: '1px solid #e1ebf4',
        borderRadius: '9999px',
        boxShadow: '0 4px 24px rgba(27, 92, 162, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)',
        display: 'flex',
        alignItems: 'center',
        padding: '6px 8px 6px 28px',
        height: '62px',
        gap: '12px',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <input
        required
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Tanyakan sesuatu..."
        disabled={loading}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: '14.5px',
          color: '#0f172a',
        }}
      />

      {/* Attachment Paperclip Button */}
      <button
        type="button"
        title="Lampirkan file atau data ukur"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#0e5b92')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
      >
        <Icon name="paperclip" size={19} />
      </button>

      {/* Circular Vibrant Blue Send Button */}
      <button
        type="submit"
        disabled={loading || !prompt.trim()}
        title="Kirim pesan"
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background: '#0284c7',
          color: '#ffffff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
          opacity: loading || !prompt.trim() ? 0.45 : 1,
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!loading && prompt.trim()) {
            e.currentTarget.style.background = '#0369a1';
            e.currentTarget.style.transform = 'scale(1.04)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#0284c7';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <Icon name="send" size={16} />
      </button>
    </form>
  );
}
