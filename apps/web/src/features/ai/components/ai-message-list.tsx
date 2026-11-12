'use client';

import React from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { DraftActionCard } from './draft-action-card';
import { ChatMessage } from '../hooks/use-ai-assistant';

export interface AiMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  onClearChat: () => void;
  formatPayloadEntry: (key: string, val: unknown) => { label: string; value: string };
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function AiMessageList({
  messages,
  loading,
  onClearChat,
  formatPayloadEntry,
  messagesEndRef,
}: AiMessageListProps) {
  return (
    <section
      aria-label="Riwayat Percakapan AI"
      style={{
        width: '100%',
        maxWidth: '920px',
        margin: '0 auto',
        flex: 1,
        overflowY: 'auto',
        padding: '12px 0 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      {/* Subtle conversation toolbar */}
      <header className="ai-chat-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#16a34a',
              display: 'inline-block',
            }}
          />
          <span className="ai-chat-model-text">
            AI Assistant · Qwen 2.5 7B On-Premise
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

      <ol
        role="log"
        aria-live="polite"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          listStyle: 'none',
          margin: 0,
          padding: 0,
          width: '100%',
        }}
      >
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
                  {m.role === 'user' ? 'Aditya Saputra' : 'AI Assistant'}
                </span>
                {m.timestamp && (
                  <time className="ai-msg-timestamp">
                    {m.timestamp}
                  </time>
                )}
              </header>

              <p className="ai-msg-text">
                {m.text}
              </p>

              {/* Draft Action Card (Human-in-the-Loop with 6-State Local Machine) */}
              {m.draft && <DraftActionCard draft={m.draft} formatPayloadEntry={formatPayloadEntry} />}
            </article>

            {m.role === 'user' && <DefaultAvatar name="Aditya Saputra" size={32} />}
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
            <span>Menjalankan inferensi model Qwen 2.5 di server internal...</span>
          </div>
        </aside>
      )}

      <div ref={messagesEndRef} />
    </section>
  );
}
