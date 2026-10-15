'use client';

import React, { useState } from 'react';
import { DraftActionCardData } from '@isp/shared';

export default function AiPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
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
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: `Error: ${json.error?.message || 'Gagal'}` },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Gagal memanggil model AI lokal: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAction = async (draft: DraftActionCardData) => {
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
        setExecutedFeedback(`Aksi "${draft.title}" telah disetujui Admin dan berhasil dieksekusi ke PostgreSQL.`);
      } else {
        alert(json.error?.message);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ASISTEN AI ON-PREMISE (AGENTIC LLM)</div>
          <h1>AI Assistant</h1>
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

            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === 'user' ? 'user-message' : 'assistant-message'}
              >
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.text}</p>

                {m.draft && (
                  <div className="draft-card">
                    <span className="badge blue">MENUNGGU KONFIRMASI ADMIN</span>
                    <h3>{m.draft.title}</h3>
                    <p>{m.draft.summary}</p>
                    <p>
                      Fungsi Tool: <b>prepare_create_ticket</b> · Token: <code>{m.draft.actionToken}</code>
                    </p>
                    <div className="heading-actions">
                      <button
                        className="button primary"
                        onClick={() => handleApproveAction(m.draft!)}
                      >
                        Approve & Execute
                      </button>
                      <button
                        className="button"
                        onClick={() => setExecutedFeedback('Aksi dibatalkan oleh Admin.')}
                      >
                        Batalkan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="assistant-message">
                <i>Menjalankan Tool inference di server lokal...</i>
              </div>
            )}

            {executedFeedback && (
              <p className="save-feedback" style={{ padding: '12px' }}>
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
