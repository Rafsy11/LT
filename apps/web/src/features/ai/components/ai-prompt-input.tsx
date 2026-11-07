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
      role="search"
      aria-label="Kirim pertanyaan ke AI"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(prompt);
      }}
      className="ai-prompt-pill-bar"
    >
      <input
        required
        aria-label="Pertanyaan atau instruksi untuk AI"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Tanyakan sesuatu..."
        disabled={loading}
        className="ai-prompt-input-elem"
      />

      {/* Attachment Paperclip Button */}
      <button
        type="button"
        title="Lampirkan file atau data ukur"
        aria-label="Lampirkan berkas"
        className="ai-prompt-attach-btn"
      >
        <Icon name="paperclip" size={19} />
      </button>

      {/* Circular Vibrant Blue Send Button */}
      <button
        type="submit"
        disabled={loading || !prompt.trim()}
        title="Kirim pesan"
        aria-label="Kirim pesan"
        className="ai-prompt-send-btn"
      >
        <Icon name="send" size={16} />
      </button>
    </form>
  );
}
