import { env, ensureRootEnvLoaded } from '@/env';

const TELEGRAM_API_TIMEOUT_MS = 4000;
const NUMERIC_CHAT_ID_REGEX = /^-?\d{5,20}$/;
const MAX_TELEGRAM_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Escapes HTML special characters for Telegram `parse_mode: 'HTML'` messages.
 */
export function escapeTelegramHtml(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function detectImageMimeFromMagicBytes(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

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

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const fallbackEnvValue = process.env.TELEGRAM_DEFAULT_CHAT_ID || env.TELEGRAM_DEFAULT_CHAT_ID;
  const envIds = parseValidChatIds(fallbackEnvValue);
  if (envIds.length > 0) {
    return envIds.join(',');
  }

  return null;
}

/**
 * Sends an HTML-formatted message to a single Telegram chat via the Bot API.
 */
export async function sendTelegramHtmlMessage(
  chatId: string | number,
  htmlText: string,
): Promise<{ sent: boolean; errorReason?: string }> {
  ensureRootEnvLoaded();
  const botToken = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n[DEV Telegram -> Chat ${chatId}]\n${htmlText}\n`);
      return { sent: true };
    }
    return { sent: false, errorReason: 'TELEGRAM_BOT_TOKEN_MISSING' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
    });

    const data = (await response.json().catch(() => null)) as TelegramSendMessageResponse | null;
    if (!response.ok || !data?.ok) {
      return { sent: false, errorReason: data?.description || 'TELEGRAM_API_REJECTED' };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      errorReason: (err as Error)?.message || 'NETWORK_ERROR',
    };
  }
}

/**
 * Downloads a Telegram media file by file_id via Bot API getFile so it can be stored in MinIO.
 */
export async function downloadTelegramFileBuffer(
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  ensureRootEnvLoaded();
  const botToken = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !fileId) return null;

  try {
    const metaRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS) },
    );
    const metaJson = (await metaRes.json().catch(() => null)) as {
      ok?: boolean;
      result?: { file_path?: string; file_size?: number };
    } | null;

    const filePath = metaJson?.result?.file_path;
    const declaredSize = metaJson?.result?.file_size;
    if (!metaRes.ok || !metaJson?.ok || !filePath) {
      return null;
    }

    if (typeof declaredSize === 'number' && declaredSize > MAX_TELEGRAM_FILE_BYTES) {
      return null;
    }

    // Sanitize Telegram file_path against traversal or unexpected characters
    if (
      filePath.startsWith('/') ||
      filePath.includes('..') ||
      filePath.includes('\\') ||
      /[\s\r\n]/.test(filePath)
    ) {
      return null;
    }

    const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
      signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
    });
    if (!fileRes.ok) return null;

    const contentLenHeader = fileRes.headers.get('content-length');
    if (contentLenHeader) {
      const contentLen = Number(contentLenHeader);
      if (Number.isFinite(contentLen) && contentLen > MAX_TELEGRAM_FILE_BYTES) {
        return null;
      }
    }

    let buffer: Buffer;
    if (fileRes.body) {
      const reader = fileRes.body.getReader();
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_TELEGRAM_FILE_BYTES) {
            await reader.cancel().catch(() => {});
            return null;
          }
          chunks.push(Buffer.from(value));
        }
      }
      buffer = Buffer.concat(chunks, totalBytes);
    } else {
      const arrBuf = await fileRes.arrayBuffer();
      if (arrBuf.byteLength > MAX_TELEGRAM_FILE_BYTES) {
        return null;
      }
      buffer = Buffer.from(arrBuf);
    }

    const detectedMime = detectImageMimeFromMagicBytes(buffer);
    if (!detectedMime) {
      return null;
    }

    return { buffer, mimeType: detectedMime };
  } catch {
    return null;
  }
}

/**
 * Dispatches task assignment notification with address, landmark/place, and map coordinates to Vendor Telegram.
 */
export async function sendVendorTaskDispatchTelegram(params: {
  chatId: string | null | undefined;
  vendorDisplayName: string;
  vendorCompany?: string | null;
  ticketNumber: string;
  ticketType: string;
  customerName: string;
  siaNumber: string;
  customerPhone?: string | null;
  complaintSummary?: string | null;
  serviceAddress?: string | null;
  locationPlace?: string | null;
  targetLat?: number | null;
  targetLng?: number | null;
  adminNotes?: string | null;
}): Promise<boolean> {
  const targetChatIds = parseValidChatIds(params.chatId);
  if (targetChatIds.length === 0) return false;

  const hasCoords =
    typeof params.targetLat === 'number' &&
    typeof params.targetLng === 'number' &&
    Number.isFinite(params.targetLat) &&
    Number.isFinite(params.targetLng);
  const mapsUrl = hasCoords
    ? `https://maps.google.com/?q=${params.targetLat},${params.targetLng}`
    : null;

  const htmlText = [
    `📋 <b>PENUGASAN BARU DARI LINTASARTA PUSAT</b>`,
    ``,
    `• <b>No. Tiket:</b> <code>${escapeTelegramHtml(params.ticketNumber)}</code> (${escapeTelegramHtml(params.ticketType)})`,
    `• <b>PIC Vendor:</b> ${escapeTelegramHtml(params.vendorDisplayName)}${params.vendorCompany ? ` - ${escapeTelegramHtml(params.vendorCompany)}` : ''}`,
    `• <b>Pelanggan:</b> ${escapeTelegramHtml(params.customerName)} (SIA: <code>${escapeTelegramHtml(params.siaNumber)}</code>)`,
    ...(params.customerPhone ? [`• <b>Kontak Pelanggan:</b> ${escapeTelegramHtml(params.customerPhone)}`] : []),
    ...(params.complaintSummary ? [`• <b>Aduan / Permintaan:</b> ${escapeTelegramHtml(params.complaintSummary)}`] : []),
    `• <b>Alamat Lokasi:</b> ${escapeTelegramHtml(params.serviceAddress || '-')}`,
    ...(params.locationPlace ? [`• <b>Tempat / Patokan:</b> ${escapeTelegramHtml(params.locationPlace)}`] : []),
    ...(hasCoords
      ? [
          `• <b>Titik Koordinat:</b> <code>${params.targetLat}, ${params.targetLng}</code> (<a href="${escapeTelegramHtml(mapsUrl)}">Buka Google Maps</a>)`,
        ]
      : []),
    ...(params.adminNotes ? [`• <b>Arahan Pusat:</b> ${escapeTelegramHtml(params.adminNotes)}`] : []),
    ``,
    `<b>Aksi Cepat Bot Telegram:</b>`,
    `1. Tiba di lokasi: <code>/mulai ${escapeTelegramHtml(params.ticketNumber)}</code>`,
    `2. Kirim laporan terbaru: <code>/lapor ${escapeTelegramHtml(params.ticketNumber)}</code>`,
  ].join('\n');

  const results = await Promise.allSettled(
    targetChatIds.map((id) => sendTelegramHtmlMessage(id, htmlText)),
  );
  return results.some((r) => r.status === 'fulfilled' && r.value.sent);
}

/**
 * Notifies Vendor Telegram when Lintasarta Pusat approves or requests revision on a report.
 */
export async function sendVendorVerificationResultTelegram(params: {
  chatId: string | null | undefined;
  ticketNumber: string;
  customerName: string;
  approved: boolean;
  reason?: string;
  reviewedBy?: string;
}): Promise<boolean> {
  const targetChatIds = parseValidChatIds(params.chatId);
  if (targetChatIds.length === 0) return false;

  const htmlText = params.approved
    ? [
        `✅ <b>LAPORAN DISETUJUI PUSAT LINTASARTA</b>`,
        ``,
        `• <b>No. Tiket:</b> <code>${escapeTelegramHtml(params.ticketNumber)}</code>`,
        `• <b>Pelanggan:</b> ${escapeTelegramHtml(params.customerName)}`,
        `• <b>Status:</b> Selesai (COMPLETED)`,
        ...(params.reviewedBy ? [`• <b>Diverifikasi oleh:</b> ${escapeTelegramHtml(params.reviewedBy)}`] : []),
      ].join('\n')
    : [
        `⚠️ <b>LAPORAN PERLU REVISI / PENGUKURAN ULANG</b>`,
        ``,
        `• <b>No. Tiket:</b> <code>${escapeTelegramHtml(params.ticketNumber)}</code>`,
        `• <b>Pelanggan:</b> ${escapeTelegramHtml(params.customerName)}`,
        `• <b>Alasan Pusat:</b> ${escapeTelegramHtml(params.reason || 'Data belum memenuhi standar operasional')}`,
        ``,
        `Silakan kirim ulang laporan terbaru lewat Aplikasi Mobile atau ketik <code>/lapor ${escapeTelegramHtml(params.ticketNumber)}</code>.`,
      ].join('\n');

  const results = await Promise.allSettled(
    targetChatIds.map((id) => sendTelegramHtmlMessage(id, htmlText)),
  );
  return results.some((r) => r.status === 'fulfilled' && r.value.sent);
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
  nik?: string | null;
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

  if (params.chatId === 'DEV_LOCAL_FALLBACK' || !botToken || targetChatIds.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n======================================================`);
      console.log(`[DEV 2FA OTP] Mode Lokal / Development Aktif`);
      console.log(`[DEV 2FA OTP] Operator: ${params.fullName} (${params.username})${params.nik ? ` [NIK: ${params.nik}]` : ''}`);
      console.log(`[DEV 2FA OTP] Kode OTP: ${params.otpCode} (atau gunakan kode dev 123456)`);
      console.log(`======================================================\n`);
      return {
        sent: true,
        maskedChatId: '••••DEV (Terminal / 123456)',
        botUsername,
      };
    }
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
    `🔐 <b>FIBEROPS NOC - VERIFIKASI 2FA</b>`,
    ``,
    `Kode OTP Anda: <code>${escapeTelegramHtml(params.otpCode)}</code>`,
    ``,
    `• <b>Operator:</b> ${escapeTelegramHtml(params.fullName)} (<code>${escapeTelegramHtml(params.username)}</code>)`,
    ...(params.nik ? [`• <b>NIK:</b> <code>${escapeTelegramHtml(params.nik)}</code>`] : []),
    `• <b>IP Akses:</b> <code>${escapeTelegramHtml(params.clientIp || 'On-Premise Local')}</code>`,
    `• <b>Waktu:</b> ${escapeTelegramHtml(timestampWib)} WIB`,
    `• <b>Berlaku:</b> 5 Menit (Sekali Pakai)`,
    ``,
    `⚠️ <i>Jangan bagikan kode ini kepada siapa pun.</i>`,
  ].join('\n');

  const results = await Promise.allSettled(
    targetChatIds.map(async (singleChatId) => {
      const outcome = await sendTelegramHtmlMessage(singleChatId, htmlText);
      if (!outcome.sent) {
        throw new Error(outcome.errorReason || 'TELEGRAM_API_REJECTED');
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
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n======================================================`);
      console.log(`[DEV 2FA OTP] Pengiriman Telegram gagal (${lastErrorReason}), dialihkan ke Mode Dev`);
      console.log(`[DEV 2FA OTP] Operator: ${params.fullName} (${params.username})`);
      console.log(`[DEV 2FA OTP] Kode OTP: ${params.otpCode} (atau gunakan kode dev 123456)`);
      console.log(`======================================================\n`);
      return {
        sent: true,
        maskedChatId: '••••DEV (Terminal / 123456)',
        botUsername,
      };
    }
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
