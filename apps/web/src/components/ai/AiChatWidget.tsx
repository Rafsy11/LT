'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DraftActionCardData } from '@repo/shared';

export function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
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
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: `Error: ${json.error?.message || 'Gagal memproses pesan'}` },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Gagal terhubung ke AI service: ${err.message}` },
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
        setExecutedFeedback(`Aksi "${draft.title}" berhasil disetujui & dieksekusi ke database.`);
      } else {
        alert(`Gagal mengeksekusi aksi: ${json.error?.message}`);
      }
    } catch (err: any) {
      alert(`Kesalahan server: ${err.message}`);
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
            {messages.map((m, idx) => (
              <div key={idx} className={m.role === 'user' ? 'user-message' : 'assistant-message'}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>

                {m.draft && (
                  <div className="draft-card" style={{ marginTop: '12px' }}>
                    <span className="badge blue">MENUNGGU KONFIRMASI ADMIN</span>
                    <h3>{m.draft.title}</h3>
                    <p>{m.draft.summary}</p>
                    <div className="heading-actions" style={{ marginTop: '14px' }}>
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
