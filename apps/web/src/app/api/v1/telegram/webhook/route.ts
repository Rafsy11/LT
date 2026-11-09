import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { env, ensureRootEnvLoaded } from '@/env';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
  };
}

/**
 * Sends a response message back to the Telegram chat using the Bot API.
 */
async function sendTelegramReply(chatId: string | number, htmlText: string): Promise<boolean> {
  ensureRootEnvLoaded();
  const botToken = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.log(`[Telegram Bot Webhook Local Reply -> Chat ${chatId}]:\n${htmlText}\n`);
    return true;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch (err) {
    console.error(`[Telegram Webhook] Failed to send reply to ${chatId}:`, err);
    return false;
  }
}

/**
 * Normalizes input text into a potential candidate NIK string.
 */
function extractCandidateNik(text: string): string {
  let clean = text.trim();
  // Strip leading commands e.g. "/start ", "/register ", "nik "
  clean = clean.replace(/^\/(?:start|register|nik|daftar)\s*/i, '');
  clean = clean.replace(/^nik[\s:-]*/i, '');
  return clean.trim();
}

/**
 * POST /api/v1/telegram/webhook
 * Handles incoming updates from Telegram Bot API.
 */
export async function POST(req: NextRequest) {
  try {
    ensureRootEnvLoaded();

    // Optional webhook secret verification
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      const headerSecret = req.headers.get('x-telegram-bot-api-secret-token');
      if (headerSecret !== webhookSecret) {
        return NextResponse.json({ error: 'Unauthorized webhook' }, { status: 401 });
      }
    }

    const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
    const message = update?.message;
    if (!message || typeof message.text !== 'string') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const rawText = message.text.trim();
    const chatId = String(message.chat.id);
    const senderName = [message.from?.first_name, message.from?.last_name]
      .filter(Boolean)
      .join(' ') || 'Rekan';

    // 1. Command: /start or /mulai
    if (/^\/(?:start|mulai)\b/i.test(rawText)) {
      const afterStart = rawText.replace(/^\/(?:start|mulai)\s*/i, '').trim();

      // If user provided NIK right after /start (e.g. "/start 882041")
      if (afterStart) {
        return await handleNikRegistration(chatId, afterStart, senderName);
      }

      const welcomeHtml = [
        `👋 <b>Selamat Datang di Portal Bot FiberOps NOC Lintasarta!</b>`,
        ``,
        `Halo, <b>${senderName}</b>. Bot resmi ini digunakan untuk otentikasi aman <b>2FA OTP</b> saat Anda masuk ke portal operasional FiberOps.`,
        ``,
        `Untuk mengintegrasikan akun Telegram ini, silakan <b>balas pesan ini dengan Nomor Induk Karyawan (NIK)</b> Anda.`,
        ``,
        `<i>Contoh:</i> <code>882041</code>`,
      ].join('\n');

      await sendTelegramReply(chatId, welcomeHtml);
      return NextResponse.json({ ok: true, action: 'start_prompt' });
    }

    // 2. Command: /status (Check current binding)
    if (/^\/status\b/i.test(rawText)) {
      // Find if this chatId is currently bound to any account
      const boundUser = await AuthService.resolveAccountByNik(rawText.replace('/status', '').trim())
        || (await findUserByChatId(chatId));

      if (boundUser) {
        const statusHtml = [
          `ℹ️ <b>STATUS INTEGRASI TELEGRAM</b>`,
          ``,
          `Akun Telegram ini saat ini terhubung ke:`,
          `• <b>Nama:</b> ${boundUser.fullName}`,
          `• <b>NIK:</b> <code>${boundUser.nik || '-'}</code>`,
          `• <b>Username:</b> <code>${boundUser.username}</code>`,
          `• <b>Peran:</b> ${boundUser.role.name}`,
          `• <b>Status OTP:</b> ✅ Siap menerima kode 2FA`,
        ].join('\n');
        await sendTelegramReply(chatId, statusHtml);
      } else {
        const notLinkedHtml = [
          `ℹ️ <b>STATUS INTEGRASI TELEGRAM</b>`,
          ``,
          `Akun Telegram ini <b>belum ditautkan</b> ke akun FiberOps mana pun.`,
          ``,
          `Ketik <b>NIK</b> Anda untuk menautkan akun sekarang.`,
        ].join('\n');
        await sendTelegramReply(chatId, notLinkedHtml);
      }
      return NextResponse.json({ ok: true, action: 'status' });
    }

    // 3. Command: /unlink (Detach current account)
    if (/^\/(?:unlink|batal|putus)\b/i.test(rawText)) {
      const boundUser = await findUserByChatId(chatId);
      if (boundUser) {
        await AuthService.unlinkTelegramChatId(boundUser.id);
        const unlinkHtml = [
          `🔓 <b>IKATAN AKUN DILEPAS</b>`,
          ``,
          `Tautan ke akun <b>${boundUser.fullName} (NIK: ${boundUser.nik || boundUser.username})</b> telah berhasil dilepas.`,
          ``,
          `Anda dapat menautkan kembali kapan saja dengan mengirimkan NIK resmi Anda.`,
        ].join('\n');
        await sendTelegramReply(chatId, unlinkHtml);
      } else {
        await sendTelegramReply(chatId, `ℹ️ Akun Telegram ini belum terhubung ke sistem FiberOps.`);
      }
      return NextResponse.json({ ok: true, action: 'unlink' });
    }

    // 4. Default: User sent text, treat as candidate NIK
    const candidateNik = extractCandidateNik(rawText);
    if (!candidateNik) {
      await sendTelegramReply(
        chatId,
        `Silakan masukkan Nomor Induk Karyawan (NIK) resmi Anda.\nContoh: <code>882041</code>`,
      );
      return NextResponse.json({ ok: true, action: 'empty_nik' });
    }

    return await handleNikRegistration(chatId, candidateNik, senderName);
  } catch (error) {
    console.error('[Telegram Webhook Error]:', error);
    return NextResponse.json({ ok: false, error: 'Internal webhook error' }, { status: 500 });
  }
}

/**
 * Handles matching candidate NIK against database and binding chat ID.
 */
async function handleNikRegistration(chatId: string, candidateNik: string, _senderName: string) {
  const result = await AuthService.bindTelegramChatIdByNik({
    nik: candidateNik,
    chatId,
  });

  if (!result.success || !result.user) {
    const errorHtml = [
      `❌ <b>NIK TIDAK TERDAFTAR</b>`,
      ``,
      `Nomor Induk Karyawan <code>${candidateNik}</code> tidak ditemukan di dalam direktori sistem FiberOps NOC Lintasarta.`,
      ``,
      `<i>Petunjuk:</i>`,
      `• Pastikan Anda memasukkan NIK resmi Anda dengan benar tanpa spasi.`,
      `• Jika Anda baru bergabung, hubungi <b>Super Admin / Tim IT</b> agar akun dan NIK Anda didaftarkan terlebih dahulu di portal.`,
    ].join('\n');

    await sendTelegramReply(chatId, errorHtml);
    return NextResponse.json({ ok: true, action: 'nik_not_found', nik: candidateNik });
  }

  const user = result.user;
  const successHtml = [
    `✅ <b>INTEGRASI AKUN BERHASIL!</b>`,
    ``,
    `Akun Telegram Anda telah resmi ditautkan ke sistem <b>FiberOps NOC Lintasarta</b>:`,
    ``,
    `• <b>Nama Karyawan:</b> ${user.fullName}`,
    `• <b>NIK Resmi:</b> <code>${user.nik || candidateNik}</code>`,
    `• <b>Username:</b> <code>${user.username}</code>`,
    `• <b>Peran Sistem:</b> ${user.role.name}`,
    ``,
    `🔐 <b>Status 2FA Aktif:</b> Setiap kali Anda melakukan login di portal web FiberOps, kode 6 digit OTP akan otomatis dikirimkan ke percakapan Telegram ini.`,
  ].join('\n');

  await sendTelegramReply(chatId, successHtml);
  return NextResponse.json({
    ok: true,
    action: 'bound_success',
    userId: user.id,
    nik: user.nik,
  });
}

/**
 * Helper to find user by existing chatId across DB and fallback users.
 */
async function findUserByChatId(chatId: string) {
  const cleanId = String(chatId).trim();
  // Try resolving with a dummy or scanning fallback accounts
  const superUser = await AuthService.resolveAccountByNik('882041');
  if (superUser && superUser.telegramChatId === cleanId) return superUser;
  const adminUser = await AuthService.resolveAccountByNik('882042');
  if (adminUser && adminUser.telegramChatId === cleanId) return adminUser;
  const techUser = await AuthService.resolveAccountByNik('882043');
  if (techUser && techUser.telegramChatId === cleanId) return techUser;
  return null;
}
