'use client';

import React, { useState, useRef } from 'react';
import { DraftActionCardData, sanitizeUiErrorMessage } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';

export default function AiPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [executingToken, setExecutingToken] = useState<string | null>(null);
  const [executedTokens, setExecutedTokens] = useState<string[]>([]);
  const executingRef = useRef(false);
  const { showSuccess, showError } = useToast();

  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; draft?: DraftActionCardData }>
  >([]);
  const [executedFeedback, setExecutedFeedback] = useState<string | null>(null);

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: textToSend }]);
    setPrompt('');
    setLoading(true);
    setExecutedFeedback(null);

    try {
      const res = await fetch('/api/v1/admin/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend }),
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
    } catch (e: unknown) {
      // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      const sanitized = sanitizeUiErrorMessage(e);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Perhatian: ${sanitized.message}` },
      ]);
      showError(e);
    } finally {
      setLoading(false);
    }
  };

  /**
   * State disabled & Debounce pada Tombol Kritis (Requirement 2).
   * Kunci tombol [Setujui & Eksekusi] tepat pada milidetik klik pertama sebelum request jaringan selesai.
   */
  const handleApproveAction = async (draft: DraftActionCardData) => {
    if (executingRef.current || executedTokens.includes(draft.actionToken)) {
      return;
    }

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
        const msg = `Aksi "${draft.title}" telah disetujui Admin dan berhasil dieksekusi ke PostgreSQL.`;
        setExecutedFeedback(msg);
        showSuccess(msg);
      } else {
        // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
        showError(json.error);
      }
    } catch (e: unknown) {
      // Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      showError(e);
    } finally {
      executingRef.current = false;
      setExecutingToken(null);
    }
  };

  return (
    <main>
      <div className="page-heading">
        <div>
          <h1>AI Assistant Operasional</h1>
          <p>Asisten operasional cerdas dengan isolasi container dan kendali Human-in-the-Loop.</p>
        </div>
      </div>

      <div className="ai-page" style={{ marginTop: '20px' }}>
        <section className="panel ai-conversation">
          <div className="panel-heading">
            <h2>Fiberops Assistant</h2>
            <span className="badge green">Local Qwen 2.5 Active</span>
          </div>

          <div className="ai-messages">
            {!messages.length && (
              <div className="ai-intro">
                <span className="ai-orb">✧</span>
                <h2>Asisten Operasional Anda</h2>
                <p>
                  Analisis kualitas redaman optik atau siapkan draf work order baru dengan persetujuan Anda.
                </p>
                <div className="ai-suggestions">
                  {[
                    'Ringkas kesehatan jaringan',
                    'Siapkan tiket maintenance untuk Budi Santoso',
                    'Periksa beban kerja teknisi lapangan',
                  ].map((text) => (
                    <button
                      className="button"
                      key={text}
                      onClick={() => sendMessage(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              const isCardExecuted = m.draft ? executedTokens.includes(m.draft.actionToken) : false;
              const isCardExecuting = m.draft ? executingToken === m.draft.actionToken : false;

              return (
                <div
                  key={i}
                  className={m.role === 'user' ? 'user-message' : 'assistant-message'}
                >
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.text}</p>

                  {m.draft && (
                    <div className="draft-card">
                      <span className={`badge ${isCardExecuted ? 'green' : 'blue'}`}>
                        {isCardExecuted ? '✓ TELAH DIEKSEKUSI' : 'MENUNGGU KONFIRMASI ADMIN'}
                      </span>
                      <h3>{m.draft.title}</h3>
                      <p>{m.draft.summary}</p>
                      <p>
                        Fungsi Tool: <b>{m.draft.actionType}</b> · Token: <code>{m.draft.actionToken.substring(0, 16)}...</code>
                      </p>
                      <div className="heading-actions">
                        {isCardExecuted ? (
                          <div className="badge green" style={{ padding: '6px 12px' }}>
                            ✓ Perubahan database telah diverifikasi dan dicatat pada activity log
                          </div>
                        ) : (
                          <>
                            {/* State disabled & Debounce pada Tombol Kritis (Requirement 2) */}
                            <button
                              className="button primary"
                              disabled={isCardExecuting}
                              onClick={() => handleApproveAction(m.draft!)}
                            >
                              {isCardExecuting ? 'Mengeksekusi Transaksi...' : 'Setujui & Eksekusi'}
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
                <i>Menjalankan Tool inference di server lokal...</i>
              </div>
            )}

            {executedFeedback && (
              <p className="save-feedback" style={{ padding: '8px 12px' }}>
                ✓ {executedFeedback}
              </p>
            )}
          </div>

          <form
            className="ai-input"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(prompt);
            }}
          >
            <input
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Tanyakan analisis redaman atau buat draft tiket..."
              disabled={loading}
            />
            <button className="button primary" type="submit" disabled={loading}>
              Kirim →
            </button>
          </form>
        </section>

        <section className="panel ai-context">
          <h2>Konteks Workspace</h2>
          <p>Nusantara Network</p>
          <div className="settings-divider" />
          <b>4 Cluster Akses</b>
          <p>Bandung Utara, Timur, Barat, Selatan</p>
          <div className="settings-divider" />
          <h2>Aman Dengan Persetujuan</h2>
          <p>
            Sesuai Law 6 AGENT.md, Tool AI tipe Write dilarang mengubah database secara langsung. AI hanya menyusun Draft Action Card; eksekusi mutasi hanya berlangsung setelah Admin menekan tombol Approve & Execute.
          </p>
          <div className="info-strip">
            Model AI berjalan 100% On-Premise via Ollama / vLLM. Zero data leakage ke cloud publik.
          </div>
        </section>
      </div>
    </main>
  );
}
