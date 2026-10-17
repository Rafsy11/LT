'use client';

import React, { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DraftActionCardData, sanitizeUiErrorMessage } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';

export function AiChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [executingToken, setExecutingToken] = useState<string | null>(null);
  const [executedTokens, setExecutedTokens] = useState<string[]>([]);
  const executingRef = useRef(false);
  const { showSuccess, showError } = useToast();

  if (pathname === '/') return null;

  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; draft?: DraftActionCardData }>
  >([
    {
      role: 'assistant',
      text: 'Halo! Saya FiberOps AI Assistant (On-Premise). Ada yang bisa saya bantu terkait master data jaringan, tiket teknisi, atau pemantauan redaman hari ini?',
    },
  ]);
  const [executedFeedback, setExecutedFeedback] = useState<string | null>(null);

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userText = textToSend;
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPrompt('');
    setLoading(true);
    setExecutedFeedback(null);

    try {
      const res = await fetch('/api/v1/admin/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });
      const json = await res.json();

      if (json.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: json.data.content,
            draft: json.data.draftCard,
          },
        ]);
      } else {
        // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
        const sanitized = sanitizeUiErrorMessage(json.error);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: `Perhatian: ${sanitized.message}` },
        ]);
        showError(json.error);
      }
    } catch (err: unknown) {
      // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      const sanitized = sanitizeUiErrorMessage(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Perhatian: ${sanitized.message}` },
      ]);
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Eksekusi Draft Action Card dengan Debounce & Kunci 1-Milidetik (Requirement 2).
   * Kunci tombol (disabled={isSubmitting}) tepat pada milidetik klik pertama
   * sebelum request jaringan selesai guna melengkapi Idempotency Key.
   */
  const handleApproveAction = async (draft: DraftActionCardData) => {
    // 1. Debounce guard cepat: tolak jika sudah ada aksi aktif atau sudah pernah dieksekusi
    if (executingRef.current || executedTokens.includes(draft.actionToken)) {
      return;
    }

    // 2. Kunci instan tepat pada milidetik klik pertama
    executingRef.current = true;
    setExecutingToken(draft.actionToken);

    try {
      const res = await fetch('/api/v1/admin/ai/confirm-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionToken: draft.actionToken,
          actionType: draft.actionType,
          payload: draft.payload,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setExecutedTokens((prev) => [...prev, draft.actionToken]);
        const msg = `Aksi "${draft.title}" berhasil disetujui & dieksekusi ke PostgreSQL.`;
        setExecutedFeedback(msg);
        showSuccess(msg);
      } else {
        // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
        showError(json.error);
      }
    } catch (err: unknown) {
      // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      showError(err);
    } finally {
      executingRef.current = false;
      setExecutingToken(null);
    }
  };

  return (
    <>
      <button
        className="assistant-fab"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Tanya AI Assistant"
      >
        <Icon name="spark" size={20} />
        <span>Tanya AI Assistant</span>
      </button>

      {isOpen && (
        <div className="chat">
          <div className="panel-heading">
            <h2>
              Fiberops Assistant <span className="ai-tag">LOCAL AI</span>
            </h2>
            <button className="dots" onClick={() => setIsOpen(false)}>
              ×
            </button>
          </div>

          <div className="chat-body">
            {messages.map((m, idx) => {
              const isCardExecuted = m.draft ? executedTokens.includes(m.draft.actionToken) : false;
              const isCardExecuting = m.draft ? executingToken === m.draft.actionToken : false;

              return (
                <div key={idx} className={m.role === 'user' ? 'user-message' : 'assistant-message'}>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>

                  {m.draft && (
                    <div className="draft-card" style={{ marginTop: '12px' }}>
                      <span className={`badge ${isCardExecuted ? 'green' : 'blue'}`}>
                        {isCardExecuted ? '✓ AKSI TELAH DIEKSEKUSI' : 'MENUNGGU KONFIRMASI ADMIN'}
                      </span>
                      <h3>{m.draft.title}</h3>
                      <p>{m.draft.summary}</p>

                      <div className="heading-actions" style={{ marginTop: '14px' }}>
                        {isCardExecuted ? (
                          <div className="badge green" style={{ padding: '6px 12px' }}>
                            ✓ Transaksi database telah tercatat di Audit Log
                          </div>
                        ) : (
                          <>
                            {/* State disabled & Debounce pada Tombol Kritis (Requirement 2) */}
                            <button
                              className="button primary"
                              disabled={isCardExecuting}
                              onClick={() => handleApproveAction(m.draft!)}
                            >
                              {isCardExecuting ? 'Mengeksekusi...' : 'Setujui & Eksekusi'}
                            </button>
                            <button
                              className="button"
                              disabled={isCardExecuting}
                              onClick={() => setExecutedFeedback('Aksi dibatalkan oleh Admin.')}
                            >
                              Batalkan
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

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
          </div>

          <form
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
            />
            <button className="button primary" type="submit" disabled={loading}>
              <Icon name="arrow" size={17} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
