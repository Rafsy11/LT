'use client';

import React, { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatFileSizeLabel } from '@/lib/error-normalizer';
import type { AiPromptAttachment } from '../hooks/use-ai-assistant';
import { AI_PERSONA } from '../lib/ai-persona';

const AI_ATTACHMENT_ACCEPT =
  '.csv,.txt,.log,.json,.md,text/csv,text/plain,application/json,text/markdown';

export interface AiPromptInputProps {
  prompt: string;
  setPrompt: (val: string) => void;
  attachment: AiPromptAttachment | null;
  onSelectFile: (file: File) => void | Promise<void>;
  onRemoveAttachment: () => void;
  loading: boolean;
  onSubmit: (prompt: string) => void;
}

export function AiPromptInput({
  prompt,
  setPrompt,
  attachment,
  onSelectFile,
  onRemoveAttachment,
  loading,
  onSubmit,
}: AiPromptInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void onSelectFile(file);
  };

  const canSubmit = !loading && (Boolean(prompt.trim()) || Boolean(attachment));

  return (
    <div className="ai-prompt-wrapper">
      {attachment && (
        <div className="ai-attachment-preview-bar" role="status" aria-live="polite">
          <div className="ai-attachment-chip">
            <Icon name="paperclip" size={14} />
            <span className="ai-attachment-chip-name" title={attachment.name}>
              {attachment.name}
            </span>
            <span className="ai-attachment-chip-meta">
              {formatFileSizeLabel(attachment.size)}
              {attachment.truncated ? ' · dipangkas' : ''}
            </span>
            <button
              type="button"
              className="ai-attachment-remove-btn"
              onClick={onRemoveAttachment}
              disabled={loading}
              aria-label={`Hapus lampiran ${attachment.name}`}
              title="Hapus lampiran"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <form
        role="search"
        aria-label="Kirim pertanyaan ke AI"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onSubmit(prompt);
        }}
        className="ai-prompt-pill-bar"
      >
        <input
          name="aiPrompt"
          required={!attachment}
          aria-label="Pertanyaan atau instruksi untuk AI"
          enterKeyHint="send"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.nativeEvent.isComposing) {
              e.preventDefault();
            }
          }}
          placeholder={
            attachment
              ? 'Tambahkan instruksi analisis untuk berkas terlampir...'
              : AI_PERSONA.inputPlaceholder
          }
          disabled={loading}
          className="ai-prompt-input-elem"
        />

        <input
          ref={fileInputRef}
          name="aiAttachment"
          type="file"
          accept={AI_ATTACHMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={loading}
          onChange={handleFileChange}
          aria-label="Pilih berkas lampiran untuk AI"
        />

        {/* Attachment Paperclip Button */}
        <button
          type="button"
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          title="Lampirkan file atau data ukur (.csv, .txt, .log, .json, .md · maks. 1 MB)"
          aria-label="Lampirkan berkas data ukur atau log"
          className={`ai-prompt-attach-btn ${attachment ? 'has-attachment' : ''}`}
        >
          <Icon name="paperclip" size={19} />
        </button>

        {/* Circular Vibrant Blue Send Button */}
        <button
          type="submit"
          disabled={!canSubmit}
          title="Kirim pesan"
          aria-label="Kirim pesan"
          className="ai-prompt-send-btn"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
}
