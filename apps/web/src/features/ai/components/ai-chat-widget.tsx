'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DraftActionCardData } from '@repo/shared';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { useToast } from '@/providers';
import { DraftActionCard } from './draft-action-card';
import '@/styles/components/ai-widget.css';

export function AiChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const { showError } = useToast();

  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; draft?: DraftActionCardData }>
  >([
    {
      role: 'assistant',
      text: 'Halo! Saya FiberOps AI Assistant (On-Premise). Ada yang bisa saya bantu terkait master data jaringan, tiket teknisi, atau pemantauan redaman hari ini?',
    },
  ]);
  const [executedFeedback, setExecutedFeedback] = useState<string | null>(null);

  if (pathname === '/' || pathname === '/ai') return null;

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userText = textToSend;
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPrompt('');
    setLoading(true);
    setExecutedFeedback(null);

    try {
      const json = await webApiClient.post<{ content: string; draftCard?: DraftActionCardData }>(
        '/api/v1/admin/ai/chat',
        { message: userText },
        { timeoutMs: 45_000 },
      );

      if (json.success && json.data) {
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
        { role: 'assistant', text: `${normalized.title}: ${normalized.message}${refSuffix}` },
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
              Fiberops Assistant <span className="ai-tag">LOCAL AI</span>
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
                <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>

                {m.draft && (
                  <div style={{ marginTop: '12px' }}>
                    <DraftActionCard draft={m.draft} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="assistant-message">
                <i>Menghubungi local AI engine...</i>
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
              placeholder="Tanyakan analisis atau siapkan tiket..."
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
