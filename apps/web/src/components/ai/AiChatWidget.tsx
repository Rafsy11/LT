'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DraftActionCardData, sanitizeUiErrorMessage } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';
import { DraftActionCard } from '@/components/ai/DraftActionCard';

export function AiChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const { showError } = useToast();

  if (pathname === '/' || pathname === '/ai') return null;

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
