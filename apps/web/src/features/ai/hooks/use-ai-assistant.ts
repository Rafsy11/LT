'use client';

import { useState, useRef, useCallback } from 'react';
import { DraftActionCardData, ERROR_CODES } from '@repo/shared';
import { useRateLimitCountdown } from '@/hooks/use-rate-limit-countdown';
import { webApiClient } from '@/lib/api-client';
import {
  AI_ATTACHMENT_RULE,
  normalizeAppError,
  validateUploadFile,
} from '@/lib/error-normalizer';
import { useToast } from '@/providers';

const MAX_AI_PROMPT_LENGTH = 4000;
const MAX_ATTACHMENT_EXCERPT_CHARS = 2800;
const DEFAULT_ATTACHMENT_PROMPT =
  'Analisis isi berkas terlampir dan berikan ringkasan temuan operasional NOC.';
const TRUNCATION_NOTICE = '\n[... sebagian isi berkas dipotong agar sesuai batas 4000 karakter]';
const CONTROL_AND_BIDI_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export interface AiPromptAttachment {
  name: string;
  size: number;
  content: string;
  truncated: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  attachment?: Pick<AiPromptAttachment, 'name' | 'size' | 'truncated'>;
  draft?: DraftActionCardData;
  timestamp?: string;
}

function sanitizeAttachmentText(raw: string): string {
  return raw.replace(CONTROL_AND_BIDI_RE, '').replace(/\r\n/g, '\n').trim();
}

function composePromptWithAttachment(
  rawPrompt: string,
  attachment: AiPromptAttachment | null,
): string {
  const basePrompt = rawPrompt.trim() || (attachment ? DEFAULT_ATTACHMENT_PROMPT : '');
  if (!attachment) return basePrompt;

  const safeFileName = attachment.name
    .replace(CONTROL_AND_BIDI_RE, '')
    .replace(/["<>]/g, '')
    .trim() || 'lampiran.txt';
  const header = `${basePrompt}\n\nLampiran berkas (${safeFileName}):\n<untrusted_data filename="${safeFileName}">\n`;
  const footer = '\n</untrusted_data>';

  const maxBodyChars = Math.max(
    0,
    MAX_AI_PROMPT_LENGTH - header.length - footer.length,
  );
  if (maxBodyChars <= 0) {
    return basePrompt.slice(0, MAX_AI_PROMPT_LENGTH);
  }

  let body = attachment.content;
  if (body.length > maxBodyChars) {
    const sliceLimit = Math.max(0, maxBodyChars - TRUNCATION_NOTICE.length);
    body = `${body.slice(0, sliceLimit)}${TRUNCATION_NOTICE}`;
  } else if (attachment.truncated && body.length + TRUNCATION_NOTICE.length <= maxBodyChars) {
    body = `${body}${TRUNCATION_NOTICE}`;
  }

  return `${header}${body}${footer}`;
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
  const [attachment, setAttachment] = useState<AiPromptAttachment | null>(null);
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

  const handleAttachFile = useCallback(
    async (file: File | null | undefined) => {
      const check = validateUploadFile(file, AI_ATTACHMENT_RULE);
      if (!check.valid || !file) {
        showError(
          check.error ||
            normalizeAppError('Berkas lampiran belum sesuai format yang didukung.', {
              statusCode: 400,
              code: ERROR_CODES.VALIDATION_ERROR,
            }),
        );
        return;
      }

      try {
        const rawText = await file.text();
        const cleaned = sanitizeAttachmentText(rawText);
        if (!cleaned) {
          showError(
            normalizeAppError(
              'Berkas tidak berisi teks yang dapat dibaca. Pilih berkas data ukur atau log yang valid.',
              {
                statusCode: 400,
                code: ERROR_CODES.VALIDATION_ERROR,
              },
            ),
          );
          return;
        }

        const isTruncated = cleaned.length > MAX_ATTACHMENT_EXCERPT_CHARS;
        setAttachment({
          name: file.name,
          size: file.size,
          content: isTruncated ? cleaned.slice(0, MAX_ATTACHMENT_EXCERPT_CHARS) : cleaned,
          truncated: isTruncated,
        });
      } catch (err: unknown) {
        showError(err, {
          fallbackMessage: 'Isi berkas lampiran belum dapat dibaca oleh browser.',
        });
      }
    },
    [showError],
  );

  const handleRemoveAttachment = useCallback(() => {
    setAttachment(null);
  }, []);

  const sendMessage = async (
    textToSend: string,
    attachedOverride?: AiPromptAttachment | null,
  ) => {
    const activeAttachment = attachedOverride !== undefined ? attachedOverride : attachment;
    if ((!textToSend.trim() && !activeAttachment) || loading || rateLimit.isLimited) return;

    const visibleText = textToSend.trim() || DEFAULT_ATTACHMENT_PROMPT;
    const composedPrompt = composePromptWithAttachment(visibleText, activeAttachment);

    const userMsg: ChatMessage = {
      role: 'user',
      text: visibleText,
      attachment: activeAttachment
        ? {
            name: activeAttachment.name,
            size: activeAttachment.size,
            truncated: activeAttachment.truncated,
          }
        : undefined,
      timestamp: formatTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setAttachment(null);
    setLoading(true);

    setTimeout(scrollToBottom, 50);

    try {
      const json = await webApiClient.post<{ content: string; draftCard?: DraftActionCardData }>(
        '/api/v1/admin/ai/chat',
        { message: composedPrompt },
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
            ? () => void sendMessage(textToSend, activeAttachment)
            : undefined,
      });
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setAttachment(null);
  };

  return {
    prompt,
    setPrompt,
    attachment,
    handleAttachFile,
    handleRemoveAttachment,
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
