import { env, ensureRootEnvLoaded } from '../../env';

const TELEGRAM_API_TIMEOUT_MS = 8000;
const NUMERIC_CHAT_ID_REGEX = /^-?\d{5,20}$/;

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
}

/**
 * Masks one or more comma-separated numeric Telegram Chat IDs so only the last 4 digits are visible.
 *
 * @param chatId - Single or comma-separated Telegram Chat ID string.
 * @returns Masked representation (e.g., "••••9677" or "••••9677, ••••4321").
 * @example
 * maskTelegramChatId("7072749677"); // "••••9677"
 */
export function maskTelegramChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  const parts = chatId
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  return parts
    .map((clean) => (clean.length <= 4 ? `••••${clean}` : `••••${clean.slice(-4)}`))
    .join(', ');
}

/**
 * Parses a single or comma-separated string of Telegram Chat IDs and returns valid numeric IDs.
 *
 * @param rawValue - Raw string from database or environment variable.
 * @returns Array of validated numeric Telegram Chat ID strings.
 * @example
 * parseValidChatIds("7072749677, 123456789"); // ["7072749677", "123456789"]
 */
function parseValidChatIds(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter((item) => NUMERIC_CHAT_ID_REGEX.test(item));
}

/**
 * Resolves the Telegram Chat ID(s) strictly from trusted server-side sources (Zero-Trust Pre-Bound Mode).
 * Supports comma-separated Chat IDs in `TELEGRAM_DEFAULT_CHAT_ID` for multi-contributor teams.
 *
 * Priority:
 * 1. Database `user.telegramChatId` column bound by Super Admin.
 * 2. Server environment `TELEGRAM_DEFAULT_CHAT_ID` in `.env` (single or comma-separated).
 *
 * @param params - Operator database chat ID.
 * @returns Resolved numeric chatId string (or comma-separated list) or null if not pre-bound.
 * @example
 * const chatId = resolveTelegramChatId({ dbChatId: user.telegramChatId });
 */
export function resolveTelegramChatId(params: { dbChatId?: string | null }): string | null {
  ensureRootEnvLoaded();

  const dbIds = parseValidChatIds(params.dbChatId);
  if (dbIds.length > 0) {
    return dbIds.join(',');
  }

  const fallbackEnvValue = process.env.TELEGRAM_DEFAULT_CHAT_ID || env.TELEGRAM_DEFAULT_CHAT_ID;
  const envIds = parseValidChatIds(fallbackEnvValue);
  if (envIds.length > 0) {
    return envIds.join(',');
  }

  return null;
}

/**
 * Sends a formatted 6-digit 2FA OTP message to one or more pre-bound Telegram Chat IDs.
 * When multiple contributor Chat IDs are configured via comma-separated list, sends in parallel
 * and succeeds if at least one recipient receives the message.
 *
 * @param params - Pre-bound recipient chat ID(s), OTP code, operator details, and client IP.
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
  ensureRootEnvLoaded();

  const botUsername =
    process.env.TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || 'FiberOpsNOCBot';
  const botToken = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const targetChatIds = parseValidChatIds(params.chatId);

  if (!botToken || targetChatIds.length === 0) {
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

  const results = await Promise.allSettled(
    targetChatIds.map(async (singleChatId) => {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: singleChatId,
          text: htmlText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
      });

      const data = (await response.json().catch(() => null)) as TelegramSendMessageResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.description || 'TELEGRAM_API_REJECTED');
      }
      return singleChatId;
    }),
  );

  const deliveredChatIds: string[] = [];
  let lastErrorReason = 'TELEGRAM_API_REJECTED';

  for (const res of results) {
    if (res.status === 'fulfilled') {
      deliveredChatIds.push(res.value);
    } else {
      lastErrorReason = (res.reason as Error)?.message || 'NETWORK_ERROR';
    }
  }

  if (deliveredChatIds.length === 0) {
    return {
      sent: false,
      maskedChatId: maskTelegramChatId(targetChatIds.join(',')),
      botUsername,
      errorReason: lastErrorReason,
    };
  }

  return {
    sent: true,
    maskedChatId: maskTelegramChatId(deliveredChatIds.join(',')),
    botUsername,
  };
}
