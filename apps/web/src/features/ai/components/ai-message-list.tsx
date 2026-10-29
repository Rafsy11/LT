'use client';

import React from 'react';
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
    <div
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '12px',
          borderBottom: '1px solid #edf2f7',
          marginBottom: '6px',
        }}
      >
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
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
            AI Assistant · Qwen 2.5 7B On-Premise
          </span>
        </div>

        <button
          className="button"
          onClick={onClearChat}
          title="Kembali ke tampilan awal"
          type="button"
          style={{
            padding: '5px 12px',
            background: '#ffffff',
            border: '1px solid #dce7f0',
            borderRadius: '9999px',
            color: '#475569',
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Icon name="refresh" size={12} />
          <span>Sesi Baru</span>
        </button>
      </div>

      {messages.map((m, i) => (
        <div
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
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #dce7f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
                padding: '2px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              }}
            >
              <img
                src="/assets/Logo.png"
                alt="AI Assistant"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          )}

          <div
            style={{
              maxWidth: m.role === 'user' ? '76%' : '88%',
              background: m.role === 'user' ? '#0e5b92' : '#ffffff',
              color: m.role === 'user' ? '#ffffff' : '#0f172a',
              border: m.role === 'user' ? 'none' : '1px solid #dce7f0',
              borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
              padding: '14px 18px',
              fontSize: '13.5px',
              lineHeight: 1.6,
              boxShadow: m.role === 'user' ? '0 2px 6px rgba(14, 91, 146, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.03)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
                gap: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: m.role === 'user' ? '#e0f2fe' : '#0f172a',
                }}
              >
                {m.role === 'user' ? 'Aditya Saputra' : 'AI Assistant'}
              </span>
              {m.timestamp && (
                <span
                  style={{
                    fontSize: '10.5px',
                    color: m.role === 'user' ? 'rgba(255, 255, 255, 0.8)' : '#64748b',
                  }}
                >
                  {m.timestamp}
                </span>
              )}
            </div>

            <p
              style={{
                whiteSpace: 'pre-wrap',
                margin: 0,
                color: m.role === 'user' ? '#ffffff' : '#0f172a',
                fontWeight: m.role === 'user' ? 500 : 450,
              }}
            >
              {m.text}
            </p>

            {/* Draft Action Card (Human-in-the-Loop with 6-State Local Machine) */}
            {m.draft && (
              <DraftActionCard
                draft={m.draft}
                formatPayloadEntry={formatPayloadEntry}
              />
            )}
          </div>

          {m.role === 'user' && (
            <DefaultAvatar name="Aditya Saputra" size={32} />
          )}
        </div>
      ))}

      {loading && (
        <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-start' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #dce7f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              padding: '2px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          >
            <img
              src="/assets/Logo.png"
              alt="AI Assistant"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '14px 14px 14px 2px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#64748b',
              fontSize: '13px',
              fontStyle: 'italic',
            }}
          >
            <Icon name="refresh" size={14} className="animate-spin" />
            <span>Menjalankan inferensi model Qwen 2.5 di server internal...</span>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

