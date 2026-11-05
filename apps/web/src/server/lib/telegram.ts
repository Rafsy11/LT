import { env } from '../../env';

const TELEGRAM_API_TIMEOUT_MS = 8000;

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
}

/**
 * Masks a numeric Telegram Chat ID so only the last 4 digits are visible in the UI.
 *
 * @param chatId - Full Telegram Chat ID string.
 * @returns Masked representation (e.g., "••••9677").
 * @example
 * maskTelegramChatId("7072749677"); // "••••9677"
 */
export function maskTelegramChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  const clean = chatId.trim();
  if (clean.length <= 4) return `••••${clean}`;
  return `••••${clean.slice(-4)}`;
}

/**
 * Resolves the Telegram Chat ID strictly from trusted server-side sources (Zero-Trust Pre-Bound Mode).
 * Client-supplied Chat IDs and unauthenticated public auto-claiming are strictly prohibited.
 *
 * Priority:
 * 1. Database `user.telegramChatId` column bound by Super Admin.
 * 2. Server environment `TELEGRAM_DEFAULT_CHAT_ID` in `.env`.
 *
 * @param params - Operator database chat ID.
 * @returns Resolved numeric chatId string or null if not pre-bound on the server.
 * @example
 * const chatId = resolveTelegramChatId({ dbChatId: user.telegramChatId });
 */
export function resolveTelegramChatId(params: { dbChatId?: string | null }): string | null {
  if (params.dbChatId && /^-?\d{5,20}$/.test(params.dbChatId.trim())) {
    return params.dbChatId.trim();
  }

  if (env.TELEGRAM_DEFAULT_CHAT_ID && /^-?\d{5,20}$/.test(env.TELEGRAM_DEFAULT_CHAT_ID.trim())) {
    return env.TELEGRAM_DEFAULT_CHAT_ID.trim();
  }

  return null;
}

/**
 * Sends a formatted 6-digit 2FA OTP message to the operator via Telegram Bot API.
 *
 * @param params - Pre-bound recipient chat ID, OTP code, operator details, and client IP.
 * @returns Delivery status object indicating whether the Telegram message succeeded.
 * @example
 * const res = await sendTelegramOtpMessage({ chatId: '7072749677', otpCode: '654321', username: 'superadmin', fullName: 'Aditya', clientIp: '127.0.0.1' });
 */
export async function sendTelegramOtpMessage(params: {
  chatId: string | null;
  otpCode: string;
  username: string;
  fullName: string;
  clientIp?: string;
}): Promise<{
  sent: boolean;
  maskedChatId: string | null;
  botUsername: string;
  errorReason?: string;
}> {
  const botUsername = env.TELEGRAM_BOT_USERNAME || 'FiberOpsNOCBot';
  const botToken = env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !params.chatId) {
    return {
      sent: false,
      maskedChatId: null,
      botUsername,
      errorReason: 'CHAT_ID_NOT_BOUND',
    };
  }

  const timestampWib = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

  const htmlText = [
    `🔐 <b>FIBEROPS NOC — VERIFIKASI 2FA</b>`,
    ``,
    `Kode OTP Anda: <code>${params.otpCode}</code>`,
    ``,
    `• <b>Operator:</b> ${params.fullName} (<code>${params.username}</code>)`,
    `• <b>IP Akses:</b> <code>${params.clientIp || 'On-Premise Local'}</code>`,
    `• <b>Waktu:</b> ${timestampWib} WIB`,
    `• <b>Berlaku:</b> 5 Menit (Sekali Pakai)`,
    ``,
    `⚠️ <i>Jangan bagikan kode ini kepada siapa pun.</i>`,
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
    });

    const data = (await response.json().catch(() => null)) as TelegramSendMessageResponse | null;

    if (!response.ok || !data?.ok) {
      return {
        sent: false,
        maskedChatId: maskTelegramChatId(params.chatId),
        botUsername,
        errorReason: data?.description || 'TELEGRAM_API_REJECTED',
      };
    }

    return {
      sent: true,
      maskedChatId: maskTelegramChatId(params.chatId),
      botUsername,
    };
  } catch (err) {
    return {
      sent: false,
      maskedChatId: maskTelegramChatId(params.chatId),
      botUsername,
      errorReason: (err as Error).message || 'NETWORK_ERROR',
    };
  }
}
