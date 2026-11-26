'use client';

import React from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { formatFileSizeLabel } from '@/lib/error-normalizer';
import { useAuth } from '@/providers';
import { DraftActionCard } from './draft-action-card';
import { ChatMessage } from '../hooks/use-ai-assistant';
import { AiMessageContent, formatOllamaModelLabel } from '../lib/ai-format';

export interface AiMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  activeModel?: string;
  onClearChat: () => void;
  formatPayloadEntry: (key: string, val: unknown) => { label: string; value: string };
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function AiMessageList({
  messages,
  loading,
  activeModel,
  onClearChat,
  formatPayloadEntry,
  messagesEndRef,
}: AiMessageListProps) {
  const { user, isAuthenticated } = useAuth();
  const senderDisplayName =
    isAuthenticated && user.fullName && user.fullName !== 'Memuat Sesi...'
      ? user.fullName
      : 'Admin NOC';
  const modelLabel = formatOllamaModelLabel(activeModel);

  return (
    <section aria-label="Riwayat Percakapan AI" className="ai-message-list-section">
      {/* Subtle conversation toolbar */}
      <header className="ai-chat-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="status-dot status-dot--ok" aria-hidden="true" />
          <span className="ai-chat-model-text">
            AI Assistant · {modelLabel} On-Premise
          </span>
        </div>

        <button
          className="button ai-chat-new-session-btn"
          onClick={onClearChat}
          title="Kembali ke tampilan awal"
          type="button"
        >
          <Icon name="refresh" size={12} />
          <span>Sesi Baru</span>
        </button>
      </header>

      <ol role="log" aria-live="polite" className="ai-messages-ol">
        {messages.map((m, i) => (
          <li
            key={i}
            className={`message-row ${m.role === 'user' ? 'user' : 'assistant'}`}
            style={{
              display: 'flex',
              gap: '12px',
              width: '100%',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {m.role === 'assistant' && (
              <figure className="ai-msg-avatar-figure">
                <Image
                  src="/assets/Lintasarta-Icon.svg"
                  alt="AI Assistant"
                  width={112}
                  height={112}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </figure>
            )}

            <article className={`ai-msg-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
              <header className="ai-msg-bubble-header">
                <span className="ai-msg-sender-name">
                  {m.role === 'user' ? senderDisplayName : 'AI Assistant'}
                </span>
                {m.timestamp && (
                  <time className="ai-msg-timestamp">
                    {m.timestamp}
                  </time>
                )}
              </header>

              {m.attachment && (
                <div className="ai-msg-attachment-chip" title={m.attachment.name}>
                  <Icon name="paperclip" size={13} />
                  <span className="ai-msg-attachment-name">{m.attachment.name}</span>
                  <span className="ai-msg-attachment-size">
                    {formatFileSizeLabel(m.attachment.size)}
                  </span>
                </div>
              )}

              {m.role === 'assistant' ? (
                <AiMessageContent text={m.text} />
              ) : (
                <p className="ai-msg-text">{m.text}</p>
              )}

              {/* Draft Action Card (Human-in-the-Loop with 6-State Local Machine) */}
              {m.draft && <DraftActionCard draft={m.draft} formatPayloadEntry={formatPayloadEntry} />}
            </article>

            {m.role === 'user' && <DefaultAvatar name={senderDisplayName} size={32} />}
          </li>
        ))}
      </ol>

      {loading && (
        <aside
          role="status"
          aria-live="polite"
          style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-start' }}
        >
          <figure className="ai-msg-avatar-figure">
            <Image
              src="/assets/Lintasarta-Icon.svg"
              alt="AI Assistant"
              width={112}
              height={112}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </figure>
          <div className="ai-msg-loading-bubble">
            <Icon name="refresh" size={14} className="animate-spin" />
            <span>Menjalankan inferensi model {modelLabel} di server internal...</span>
          </div>
        </aside>
      )}

      <div ref={messagesEndRef} />
    </section>
  );
}
