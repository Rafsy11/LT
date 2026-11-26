'use client';

import React, { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DraftActionCardData } from '@repo/shared';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { useToast } from '@/providers';
import { DraftActionCard } from './draft-action-card';
import { AiMessageContent, formatOllamaModelLabel } from '../lib/ai-format';
import { AI_PERSONA } from '../lib/ai-persona';
import '@/styles/components/ai-widget.css';

const MAX_WIDGET_HISTORY_MESSAGES = 12;
const MAX_WIDGET_HISTORY_ITEM_CHARS = 3800;
const AI_WIDGET_TIMEOUT_MS = 60_000;

interface WidgetChatMessage {
  role: 'user' | 'assistant';
  text: string;
  draft?: DraftActionCardData;
  isGreeting?: boolean;
  isError?: boolean;
}

export function AiChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string>('');
  const { showError } = useToast();

  const [messages, setMessages] = useState<WidgetChatMessage[]>([
    {
      role: 'assistant',
      text: AI_PERSONA.widgetGreeting,
      isGreeting: true,
    },
  ]);
  const messagesRef = useRef<WidgetChatMessage[]>(messages);
  messagesRef.current = messages;
  const [executedFeedback, setExecutedFeedback] = useState<string | null>(null);

  if (pathname === '/' || pathname === '/ai') return null;

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userText = textToSend.trim();
    const historyPayload = messagesRef.current
      .filter((m) => !m.isGreeting && !m.isError && m.text.trim().length > 0)
      .slice(-MAX_WIDGET_HISTORY_MESSAGES)
      .map((m) => {
        const raw = m.draft
          ? `${m.text}\n[Draf aksi siap dikonfirmasi: ${m.draft.title}]`
          : m.text;
        return {
          role: m.role,
          content: raw.trim().slice(0, MAX_WIDGET_HISTORY_ITEM_CHARS),
        };
      });

    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPrompt('');
    setLoading(true);
    setExecutedFeedback(null);

    try {
      const json = await webApiClient.post<{
        content: string;
        model?: string;
        draftCard?: DraftActionCardData;
      }>(
        '/api/v1/admin/ai/chat',
        {
          message: userText,
          ...(historyPayload.length > 0 ? { history: historyPayload } : {}),
        },
        { timeoutMs: AI_WIDGET_TIMEOUT_MS },
      );

      if (json.success && json.data) {
        if (json.data.model) {
          setActiveModel(json.data.model);
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: json.data.content,
            draft: json.data.draftCard,
          },
        ]);
      } else {
        throw normalizeAppError(!json.success ? json.error : null, {
          fallbackMessage: 'Asisten AI belum dapat merespons saat ini. Silakan coba kembali.',
        });
      }
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, {
        fallbackMessage: 'Asisten AI belum dapat merespons saat ini. Silakan coba kembali.',
      });
      const refSuffix =
        normalized.category === 'SERVER_ERROR' || normalized.statusCode >= 500
          ? ` (Ref: ${normalized.refCode})`
          : '';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `${normalized.title}: ${normalized.message}${refSuffix}`,
          isError: true,
        },
      ]);
      showError(normalized, {
        onRetry:
          normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
            ? () => void sendMessage(userText)
            : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isOpen && (
        <aside className="chat" role="complementary" aria-label="Widget AI Assistant">
          <header className="panel-heading">
            <h2>
              {AI_PERSONA.widgetTitle}{' '}
              <span className="ai-tag">
                {activeModel ? formatOllamaModelLabel(activeModel) : 'LOCAL AI'}
              </span>
            </h2>
            <button
              className="dots"
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Tutup widget AI Assistant"
            >
              ×
            </button>
          </header>

          <section className="chat-body" aria-label="Riwayat Percakapan AI">
            {messages.map((m, idx) => (
              <div key={idx} className={m.role === 'user' ? 'user-message' : 'assistant-message'}>
                {m.role === 'assistant' ? (
                  <AiMessageContent text={m.text} />
                ) : (
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
                )}

                {m.draft && (
                  <div style={{ marginTop: '12px' }}>
                    <DraftActionCard
                      draft={m.draft}
                      onExecutedSuccess={() =>
                        setExecutedFeedback(`Aksi "${m.draft?.title || 'Draf'}" berhasil dieksekusi.`)
                      }
                    />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="assistant-message">
                <i>Arta sedang memeriksa data jaringan...</i>
              </div>
            )}

            {executedFeedback && (
              <p className="save-feedback" style={{ padding: '8px 12px' }}>
                ✓ {executedFeedback}
              </p>
            )}
          </section>

          <form
            role="search"
            aria-label="Kirim pesan ke widget AI"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={AI_PERSONA.widgetInputPlaceholder}
              disabled={loading}
              required
              aria-label="Pesan untuk AI"
            />
            <button
              className="button primary"
              type="submit"
              disabled={loading}
              aria-label="Kirim pesan"
            >
              <Icon name="arrow" size={17} />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
