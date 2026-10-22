'use client';

import React, { useState, useRef } from 'react';
import { DraftActionCardData, sanitizeUiErrorMessage } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { DraftActionCard } from '@/components/ai/DraftActionCard';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  draft?: DraftActionCardData;
  timestamp?: string;
}


export default function AiPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showError } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const formatTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      text: textToSend,
      timestamp: formatTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    setTimeout(scrollToBottom, 50);

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
            timestamp: formatTime(),
          },
        ]);
      } else {
        const sanitized = sanitizeUiErrorMessage(json.error);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `Perhatian: ${sanitized.message}`,
            timestamp: formatTime(),
          },
        ]);
        showError(json.error);
      }
    } catch (e: unknown) {
      const sanitized = sanitizeUiErrorMessage(e);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Perhatian: ${sanitized.message}`,
          timestamp: formatTime(),
        },
      ]);
      showError(e);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };


  const handleClearChat = () => {
    setMessages([]);
  };

  // Helper to format payload keys into human-readable Indonesian labels
  const formatPayloadEntry = (key: string, val: unknown) => {
    const keyLabels: Record<string, string> = {
      ticketType: 'Tipe Tiket',
      customerName: 'Nama Pelanggan',
      siaNumber: 'Nomor SIA',
      clusterCode: 'Wilayah Cluster',
      assignedTechUsername: 'Teknisi Ditugaskan',
      adminNotes: 'Instruksi Kerja',
      techUsername: 'Username Teknisi',
      techId: 'ID Teknisi',
      setActive: 'Status Akun Baru',
      reason: 'Alasan Perubahan',
      newSplitterCode: 'ODP Splitter Baru',
      newPortNumber: 'Nomor Port Baru',
    };

    const label = keyLabels[key] || key;
    let formattedVal = String(val);
    if (typeof val === 'boolean') {
      formattedVal = val ? 'Aktif' : 'Nonaktif (Cabut Sesi)';
    }

    return { label, value: formattedVal };
  };

  // The 4 Exact suggestions from Minimal AI Assistant Dashboard.png
  const SUGGESTIONS = [
    { label: 'Analisis gangguan redaman' },
    { label: 'Buat draft tiket' },
    { label: 'Cari teknisi terdekat' },
    { label: 'Ringkasan gangguan' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 'calc(100vh - 125px)',
        width: '100%',
        padding: '36px 24px 32px 24px',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Empty State / Hero view (Matches Minimal AI Assistant Dashboard.png) */}
      {!messages.length ? (
        <div
          style={{
            margin: 'auto 0',
            textAlign: 'center',
            width: '100%',
            maxWidth: '680px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Brand Logo Emblem from Logo.png */}
          <img
            src="/assets/Logo.png"
            alt="AI Assistant"
            width={64}
            height={82}
            style={{
              display: 'block',
              margin: '0 auto 20px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 12px rgba(0, 40, 85, 0.08))',
            }}
          />

          {/* Heading */}
          <h1
            style={{
              fontSize: '34px',
              fontWeight: 700,
              color: '#082138',
              letterSpacing: '-0.5px',
              margin: '0 0 12px',
              textAlign: 'center',
            }}
          >
            AI Assistant
          </h1>

          {/* Subtitle with High-Contrast Slate-700 */}
          <p
            style={{
              fontSize: '15px',
              color: '#334155',
              margin: '0 0 40px',
              textAlign: 'center',
              fontWeight: 500,
            }}
          >
            Tanyakan tentang jaringan, tiket, atau pekerjaan teknisi.
          </p>

          {/* 2x2 Suggestion Grid (Exact match to reference image with high contrast text) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 260px))',
              justifyContent: 'center',
              gap: '14px 18px',
              width: '100%',
              margin: '0 auto',
            }}
          >
            {SUGGESTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => sendMessage(item.label)}
                style={{
                  background: 'rgba(238, 246, 255, 0.95)',
                  border: '1px solid rgba(200, 226, 252, 0.9)',
                  borderRadius: '9999px',
                  padding: '16px 28px',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  color: '#0f172a',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 1px 3px rgba(27, 92, 162, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e1f0fc';
                  e.currentTarget.style.borderColor = '#93c5fd';
                  e.currentTarget.style.color = '#0e5b92';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(238, 246, 255, 0.95)';
                  e.currentTarget.style.borderColor = 'rgba(200, 226, 252, 0.9)';
                  e.currentTarget.style.color = '#0f172a';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Active Conversation View */
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
              onClick={handleClearChat}
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
      )}

      {/* Floating Bottom Input Bar (Exact match to Minimal AI Assistant Dashboard.png) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(prompt);
        }}
        style={{
          width: '100%',
          maxWidth: 'calc(100% - 40px)',
          margin: '0 auto',
          background: '#ffffff',
          border: '1px solid #e1ebf4',
          borderRadius: '9999px',
          boxShadow: '0 4px 24px rgba(27, 92, 162, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          alignItems: 'center',
          padding: '6px 8px 6px 28px',
          height: '62px',
          gap: '12px',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <input
          required
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tanyakan sesuatu..."
          disabled={loading}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '14.5px',
            color: '#0f172a',
          }}
        />

        {/* Attachment Paperclip Button */}
        <button
          type="button"
          title="Lampirkan file atau data ukur"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#0e5b92')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
        >
          <Icon name="paperclip" size={19} />
        </button>

        {/* Circular Vibrant Blue Send Button */}
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          title="Kirim pesan"
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: '#0284c7',
            color: '#ffffff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !prompt.trim() ? 0.45 : 1,
            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!loading && prompt.trim()) {
              e.currentTarget.style.background = '#0369a1';
              e.currentTarget.style.transform = 'scale(1.04)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#0284c7';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
}
