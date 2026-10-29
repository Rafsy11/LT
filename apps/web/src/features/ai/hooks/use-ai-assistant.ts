'use client';

import { useState, useRef } from 'react';
import { DraftActionCardData, sanitizeUiErrorMessage } from '@repo/shared';
import { useToast } from '@/providers';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  draft?: DraftActionCardData;
  timestamp?: string;
}

export interface AiSuggestionItem {
  label: string;
}

export const AI_SUGGESTIONS: AiSuggestionItem[] = [
  { label: 'Analisis gangguan redaman' },
  { label: 'Buat draft tiket' },
  { label: 'Cari teknisi terdekat' },
  { label: 'Ringkasan gangguan' },
];

export const formatPayloadEntry = (key: string, val: unknown) => {
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

export function useAiAssistant() {
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

  return {
    prompt,
    setPrompt,
    loading,
    messages,
    messagesEndRef,
    suggestions: AI_SUGGESTIONS,
    sendMessage,
    handleClearChat,
    formatPayloadEntry,
  };
}

