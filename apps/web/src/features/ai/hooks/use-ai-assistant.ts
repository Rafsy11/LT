'use client';

import { useState, useRef } from 'react';
import { DraftActionCardData } from '@repo/shared';
import { useRateLimitCountdown } from '@/hooks/use-rate-limit-countdown';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
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
  const rateLimit = useRateLimitCountdown();

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const formatTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading || rateLimit.isLimited) return;

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
      const json = await webApiClient.post<{ content: string; draftCard?: DraftActionCardData }>(
        '/api/v1/admin/ai/chat',
        { message: textToSend },
        { timeoutMs: 45_000 },
      );

      if (json.success && json.data) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: json.data!.content,
            draft: json.data!.draftCard,
            timestamp: formatTime(),
          },
        ]);
      } else {
        throw normalizeAppError(!json.success ? json.error : null, {
          fallbackMessage: 'Asisten AI belum dapat merespons saat ini. Silakan coba kembali.',
        });
      }
    } catch (e: unknown) {
      const normalized = normalizeAppError(e, {
        fallbackMessage: 'Asisten AI belum dapat merespons saat ini. Silakan coba kembali.',
      });
      if (normalized.category === 'RATE_LIMITED' && normalized.retryAfterSeconds) {
        rateLimit.startCooldown(normalized.retryAfterSeconds);
      }
      const refSuffix =
        normalized.category === 'SERVER_ERROR' || normalized.statusCode >= 500
          ? ` (Ref: ${normalized.refCode})`
          : '';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `${normalized.title}: ${normalized.message}${refSuffix}`,
          timestamp: formatTime(),
        },
      ]);
      showError(normalized, {
        onRetry:
          normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
            ? () => void sendMessage(textToSend)
            : undefined,
      });
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
    rateLimitSeconds: rateLimit.remainingSeconds,
    messages,
    messagesEndRef,
    suggestions: AI_SUGGESTIONS,
    sendMessage,
    handleClearChat,
    formatPayloadEntry,
  };
}
