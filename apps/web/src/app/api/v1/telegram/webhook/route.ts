import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthService, FallbackAccount } from '@/server/services/auth.service';
import { TicketService, DbTicket } from '@/server/services/ticket.service';
import { redisManager } from '@/server/lib/redis';
import { minioManager } from '@/server/lib/minio';
import { downloadTelegramFileBuffer, sendTelegramHtmlMessage } from '@/server/lib/telegram';
import { normalizeTechUsernameAlias } from '@/server/lib/tech-auth';

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
    location?: {
      latitude: number;
      longitude: number;
    };
  };
}

interface TelegramReportDraft {
  ticketId: string;
  ticketNumber: string;
  customerName: string;
  targetLat: number | null;
  targetLng: number | null;
  submittedLat?: number;
  submittedLng?: number;
  photoObjectKey?: string;
  splitterId?: string;
  portNumber?: number;
  attenuationDbm?: number;
  technicianNotes?: string;
  updatedAt: string;
}

const DRAFT_TTL_SECONDS = 900;

function draftRedisKey(chatId: string): string {
  return `tg_report:${chatId}`;
}

function escapeHtml(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildDeterministicUuid(seed: string): string {
  const bytes = crypto.createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function extractCandidateNik(text: string): string | null {
  const trimmed = text.trim();
  const cmdMatch = trimmed.match(/^\/(?:start|mulai)(?:@[a-zA-Z0-9_]+)?\s+([a-zA-Z0-9_-]+)/i);
  if (cmdMatch?.[1]) return cmdMatch[1].trim();
  if (/^\d{4,12}$/.test(trimmed)) return trimmed;
  return null;
}

function ticketBelongsToAccount(ticket: DbTicket, account: FallbackAccount): boolean {
  if (account.userType === 'SUPER_ADMIN') return true;
  const acctNorm = normalizeTechUsernameAlias(account.username);
  const ticketNorm = normalizeTechUsernameAlias(
    ticket.assignedTechUsername || ticket.assignedTech.toLowerCase().replace(/\s+/g, '.'),
  );
  return (
    ticketNorm === acctNorm ||
    ticket.assignedTech.trim().toLowerCase() === account.fullName.trim().toLowerCase()
  );
}

async function resolveAssignedTicket(
  ticketRef: string,
  account: FallbackAccount,
): Promise<DbTicket | null> {
  const cleanRef = ticketRef.trim().toLowerCase();
  const list = await TicketService.listTickets();
  const match = list.find(
    (t) => t.ticketNumber.toLowerCase() === cleanRef || t.id.toLowerCase() === cleanRef,
  );
  if (!match) return null;
  if (!ticketBelongsToAccount(match, account)) return null;
  return match;
}

async function storeTelegramPhotoToMinio(
  fileId: string,
  ticketId: string,
  uniqueSeed: string,
): Promise<string | null> {
  const downloaded = await downloadTelegramFileBuffer(fileId);
  if (!downloaded) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = downloaded.mimeType.includes('png')
    ? 'png'
    : downloaded.mimeType.includes('webp')
      ? 'webp'
      : 'jpg';
  const safeId = ticketId.replace(/[^a-zA-Z0-9_-]/g, '');
  const objectKey = `opm-proofs/${year}/${month}/${safeId}-tg-${uniqueSeed}.${ext}`;
  const uploaded = await minioManager.putObjectBuffer(objectKey, downloaded.buffer, downloaded.mimeType);
  return uploaded.objectKey;
}

async function finalizeTelegramReport(params: {
  chatId: string;
  account: FallbackAccount;
  ticket: DbTicket;
  splitterId: string;
  portNumber: number;
  attenuationDbm: number;
  photoObjectKey: string;
  lat: number;
  lng: number;
  notes?: string;
  updateId: number;
}) {
  const submissionId = buildDeterministicUuid(
    `telegram:${params.updateId}:${params.ticket.ticketNumber}:${params.account.id}`,
  );

  const result = await TicketService.submitTicketByTechnician(
    params.ticket.id,
    {
      submissionId,
      splitterId: params.splitterId,
      portNumber: params.portNumber,
      attenuationDbm: params.attenuationDbm,
      photoObjectKey: params.photoObjectKey,
      submittedLat: params.lat,
      submittedLng: params.lng,
      isMockLocation: false,
      technicianNotes: params.notes,
      channel: 'TELEGRAM',
    },
    {
      id: params.account.id,
      username: normalizeTechUsernameAlias(params.account.username),
    },
  );

  await redisManager.deleteKey(draftRedisKey(params.chatId));

  const replyHtml = [
    `✅ <b>LAPORAN BERHASIL DIKIRIM KE PUSAT LINTASARTA</b>`,
    ``,
    `• <b>No. Tiket:</b> <code>${escapeHtml(params.ticket.ticketNumber)}</code>`,
    `• <b>Pelanggan:</b> ${escapeHtml(params.ticket.customerName)}`,
    `• <b>ODP &amp; Port:</b> <code>${escapeHtml(params.splitterId)}</code> (Port ${params.portNumber})`,
    `• <b>Redaman Terbaru:</b> <b>${params.attenuationDbm} dBm</b>`,
    `• <b>Bukti Foto:</b> <code>${escapeHtml(params.photoObjectKey)}</code>`,
    `• <b>Koordinat:</b> <code>${params.lat.toFixed(6)}, ${params.lng.toFixed(6)}</code>`,
    ``,
    `Status tiket kini <b>Menunggu verifikasi</b> Admin Pusat / CS Lintasarta. Anda akan mendapat notifikasi saat laporan disetujui atau memerlukan revisi.`,
  ].join('\n');

  await sendTelegramHtmlMessage(params.chatId, replyHtml);
  return NextResponse.json({
    ok: true,
    action: 'report_submitted',
    ticketNumber: params.ticket.ticketNumber,
    alreadyProcessed: result.alreadyProcessed,
  });
}

async function handleBoundCommandHelp(chatId: string, account: FallbackAccount) {
  const vendorLabel = account.vendorCompany ? ` (${escapeHtml(account.vendorCompany)})` : '';
  const html = [
    `📡 <b>PORTAL TELEGRAM VENDOR LINTASARTA</b>`,
    `Halo, <b>${escapeHtml(account.fullName)}</b>${vendorLabel}.`,
    ``,
    `<b>Perintah Operasional Lapangan:</b>`,
    `• /tugas - Lihat daftar tugas aktif, alamat &amp; titik lokasi`,
    `• /mulai <code>NO_TIKET</code> - Catat waktu mulai eksekusi di lokasi`,
    `• /lapor <code>NO_TIKET</code> - Mulai sesi laporan (foto OPM + lokasi + ODP/redaman)`,
    `• /lapor <code>NO_TIKET | ODP | PORT | DBM | CATATAN</code> - Kirim laporan cepat 1 baris`,
    `• /batal - Batalkan draf laporan aktif`,
    `• /status - Cek status akun &amp; ringkasan tugas`,
    `• /unlink - Lepas tautan Telegram`,
  ].join('\n');

  await sendTelegramHtmlMessage(chatId, html);
}

export async function POST(request: NextRequest) {
  try {
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (configuredSecret && secretToken !== configuredSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized webhook secret' }, { status: 401 });
    }

    const body = (await request.json()) as TelegramUpdate;
    const message = body.message;
    if (!message) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const chatId = String(message.chat.id);
    const updateId = body.update_id ?? message.message_id ?? Date.now();
    const rawText = (message.text || message.caption || '').trim();
    const senderName = message.from?.first_name || 'Vendor Lapangan';
    const boundUser = await AuthService.resolveAccountByTelegramChatId(chatId);

    // 1. /unlink command
    if (/^\/(?:unlink|putus)\b/i.test(rawText)) {
      await redisManager.deleteKey(draftRedisKey(chatId));
      if (boundUser) {
        await AuthService.unlinkTelegramChatId(boundUser.id);
        await sendTelegramHtmlMessage(
          chatId,
          [
            `🔓 <b>IKATAN AKUN DILEPAS</b>`,
            ``,
            `Tautan ke akun <b>${escapeHtml(boundUser.fullName)} (${escapeHtml(boundUser.nik || boundUser.username)})</b> telah berhasil dilepas.`,
            `Kirim NIK resmi Anda kapan saja untuk menautkan kembali.`,
          ].join('\n'),
        );
      } else {
        await sendTelegramHtmlMessage(
          chatId,
          `ℹ️ Akun Telegram ini belum terhubung ke sistem FiberOps.`,
        );
      }
      return NextResponse.json({ ok: true, action: 'unlink' });
    }

    // 2. /batal command (cancels active /lapor draft)
    if (/^\/batal\b/i.test(rawText)) {
      const existingDraft = await redisManager.getKey(draftRedisKey(chatId));
      if (existingDraft) {
        await redisManager.deleteKey(draftRedisKey(chatId));
        await sendTelegramHtmlMessage(
          chatId,
          `🗑️ Draf laporan aktif telah dibatalkan. Ketik /tugas untuk melihat antrean pekerjaan Anda.`,
        );
      } else {
        await sendTelegramHtmlMessage(
          chatId,
          `ℹ️ Tidak ada draf laporan aktif saat ini. Untuk melepas tautan akun gunakan /unlink.`,
        );
      }
      return NextResponse.json({ ok: true, action: 'cancel_draft' });
    }

    // 3. /status command
    if (/^\/status\b/i.test(rawText)) {
      if (boundUser) {
        const allTickets = await TicketService.listTickets();
        const mine = allTickets.filter(
          (t) => t.status !== 'Selesai' && ticketBelongsToAccount(t, boundUser),
        );
        await sendTelegramHtmlMessage(
          chatId,
          [
            `🟢 <b>STATUS AKUN TERVERIFIKASI</b>`,
            ``,
            `• <b>Nama:</b> ${escapeHtml(boundUser.fullName)}`,
            `• <b>Vendor / Tim:</b> ${escapeHtml(boundUser.vendorCompany || boundUser.role.name)}`,
            `• <b>NIK:</b> <code>${escapeHtml(boundUser.nik || '-')}</code>`,
            `• <b>Tugas Aktif / Pending:</b> <b>${mine.length}</b> tiket`,
          ].join('\n'),
        );
      } else {
        await sendTelegramHtmlMessage(
          chatId,
          `🔴 Akun Telegram Anda belum terdaftar. Silakan kirimkan <b>NIK</b> Anda untuk registrasi.\nContoh: <code>882043</code>`,
        );
      }
      return NextResponse.json({ ok: true, action: 'status' });
    }

    // 4. /start (or bare /mulai when NOT bound yet -> NIK onboarding)
    const isStartCmd = /^\/start(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(rawText);
    const isBareMulai = /^\/mulai(?:@[a-zA-Z0-9_]+)?$/i.test(rawText);
    if (isStartCmd || (isBareMulai && !boundUser)) {
      const candidateFromStart = extractCandidateNik(rawText);
      if (candidateFromStart) {
        return await handleNikRegistration(chatId, candidateFromStart, senderName);
      }
      if (boundUser) {
        await handleBoundCommandHelp(chatId, boundUser);
        return NextResponse.json({ ok: true, action: 'help' });
      }
      await sendTelegramHtmlMessage(
        chatId,
        [
          `👋 <b>Selamat datang, ${escapeHtml(senderName)}!</b>`,
          ``,
          `Sistem integrasi <b>FiberOps NOC Lintasarta</b> membutuhkan verifikasi identitas Vendor / Teknisi.`,
          `Silakan balas pesan ini dengan mengetikkan <b>NIK resmi Anda</b> (contoh: <code>882043</code>).`,
        ].join('\n'),
      );
      return NextResponse.json({ ok: true, action: 'prompt_nik' });
    }

    // 5. Bare numeric NIK registration
    if (!rawText.startsWith('/') && /^\d{4,12}$/.test(rawText)) {
      return await handleNikRegistration(chatId, rawText, senderName);
    }

    // Gate all operational commands & uploads behind bound Telegram user
    if (!boundUser) {
      await sendTelegramHtmlMessage(
        chatId,
        `🔒 Akun Telegram Anda belum tertaut ke sistem.\nSilakan ketikkan <b>NIK resmi Anda</b> terlebih dahulu (contoh: <code>882043</code>).`,
      );
      return NextResponse.json({ ok: true, action: 'unauthenticated_prompt' });
    }

    // 6. /tugas command: list Vendor active tasks
    if (/^\/tugas\b/i.test(rawText)) {
      const allTickets = await TicketService.listTickets();
      const myTickets = allTickets.filter(
        (t) => t.status !== 'Selesai' && ticketBelongsToAccount(t, boundUser),
      );

      if (myTickets.length === 0) {
        await sendTelegramHtmlMessage(
          chatId,
          `✨ Tidak ada tiket tugas aktif saat ini untuk <b>${escapeHtml(boundUser.fullName)}</b>.`,
        );
        return NextResponse.json({ ok: true, action: 'list_tasks', count: 0 });
      }

      const blocks = myTickets.slice(0, 6).map((t) => {
        const mapsUrl =
          t.targetLat !== undefined && t.targetLng !== undefined
            ? `\n  📍 <a href="https://maps.google.com/?q=${t.targetLat},${t.targetLng}">Buka Titik (${t.targetLat.toFixed(5)}, ${t.targetLng.toFixed(5)})</a>`
            : '';
        return [
          `🎫 <code>${escapeHtml(t.ticketNumber)}</code> - <b>${escapeHtml(t.status)}</b>`,
          `  • <b>Pelanggan:</b> ${escapeHtml(t.customerName)}${t.customerPhone ? ` (${escapeHtml(t.customerPhone)})` : ''}`,
          `  • <b>Aduan:</b> ${escapeHtml(t.complaintSummary || t.ticketType)}`,
          `  • <b>Tempat:</b> ${escapeHtml(t.locationPlace || '-')}`,
          `  • <b>Alamat:</b> ${escapeHtml(t.serviceAddress || '-')}${mapsUrl}`,
          t.rejectionReason ? `  • ⚠️ <b>Revisi Pusat:</b> ${escapeHtml(t.rejectionReason)}` : '',
          `  ➡️ <code>/mulai ${escapeHtml(t.ticketNumber)}</code> | <code>/lapor ${escapeHtml(t.ticketNumber)}</code>`,
        ]
          .filter(Boolean)
          .join('\n');
      });

      await sendTelegramHtmlMessage(
        chatId,
        [`📋 <b>DAFTAR TUGAS AKTIF (${myTickets.length})</b>`, ``, ...blocks].join('\n\n'),
      );
      return NextResponse.json({ ok: true, action: 'list_tasks', count: myTickets.length });
    }

    // 7. /mulai <NO_TIKET>: mark vendor arrived / started execution
    const mulaiMatch = rawText.match(/^\/mulai(?:@[a-zA-Z0-9_]+)?\s+([a-zA-Z0-9_-]+)/i);
    if (mulaiMatch || (isBareMulai && boundUser)) {
      const ticketRef = mulaiMatch?.[1]?.trim();
      if (!ticketRef) {
        await sendTelegramHtmlMessage(
          chatId,
          `ℹ️ Format: <code>/mulai NO_TIKET</code>\nContoh: <code>/mulai TK-2024-001</code>`,
        );
        return NextResponse.json({ ok: true, action: 'mulai_usage' });
      }

      const targetTicket = await resolveAssignedTicket(ticketRef, boundUser);
      if (!targetTicket) {
        await sendTelegramHtmlMessage(
          chatId,
          `❌ Tiket <code>${escapeHtml(ticketRef)}</code> tidak ditemukan atau bukan tugas Anda.`,
        );
        return NextResponse.json({ ok: true, action: 'mulai_not_found' });
      }

      try {
        await TicketService.startExecutionByTechnician(
          targetTicket.id,
          {
            channel: 'TELEGRAM',
            checkInLat: message.location?.latitude,
            checkInLng: message.location?.longitude,
          },
          {
            id: boundUser.id,
            username: normalizeTechUsernameAlias(boundUser.username),
          },
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Gagal memulai eksekusi.';
        await sendTelegramHtmlMessage(chatId, `⚠️ ${escapeHtml(errMsg)}`);
        return NextResponse.json({ ok: true, action: 'mulai_error' });
      }

      await sendTelegramHtmlMessage(
        chatId,
        [
          `🛠️ <b>EKSEKUSI DIMULAI: ${escapeHtml(targetTicket.ticketNumber)}</b>`,
          `• <b>Pelanggan:</b> ${escapeHtml(targetTicket.customerName)}`,
          `• <b>Tempat:</b> ${escapeHtml(targetTicket.locationPlace || targetTicket.serviceAddress || '-')}`,
          ``,
          `Setelah selesai pengerjaan, ketik <code>/lapor ${escapeHtml(targetTicket.ticketNumber)}</code> untuk mengirim bukti foto OPM, lokasi, dan nilai redaman terbaru.`,
        ].join('\n'),
      );
      return NextResponse.json({
        ok: true,
        action: 'start_execution',
        ticketNumber: targetTicket.ticketNumber,
      });
    }

    // 8. /lapor command (Interactive start OR quick one-line pipe format)
    const laporMatch = rawText.match(/^\/lapor(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]+))?$/i);
    if (laporMatch) {
      const argsRaw = (laporMatch[1] || '').trim();
      if (!argsRaw) {
        await sendTelegramHtmlMessage(
          chatId,
          [
            `📝 <b>CARA MELAPOR HASIL VENDOR</b>`,
            ``,
            `<b>Cara 1 - Interaktif (Dengan Foto OPM &amp; Share Location):</b>`,
            `1. Kirim: <code>/lapor TK-2024-001</code>`,
            `2. Kirim <b>Share Location</b> + <b>Foto Bukti OPM</b>`,
            `3. Balas format: <code>ODP-BDG-01 | 2 | -19.2 | Catatan pekerjaan</code>`,
            ``,
            `<b>Cara 2 - Cepat 1 Baris:</b>`,
            `<code>/lapor TK-2024-001 | ODP-BDG-01 | 2 | -19.2 | Splicing selesai</code>`,
          ].join('\n'),
        );
        return NextResponse.json({ ok: true, action: 'lapor_usage' });
      }

      if (argsRaw.includes('|')) {
        const parts = argsRaw.split('|').map((p) => p.trim());
        const [ticketRef, splitterId, portStr, dbmStr, ...noteParts] = parts;
        const notes = noteParts.join(' | ').trim() || undefined;
        const portNumber = Number(portStr);
        const attenuationDbm = Number(dbmStr);

        if (
          !ticketRef ||
          !splitterId ||
          !Number.isInteger(portNumber) ||
          portNumber < 1 ||
          portNumber > 32 ||
          Number.isNaN(attenuationDbm) ||
          attenuationDbm < -40 ||
          attenuationDbm > 5
        ) {
          await sendTelegramHtmlMessage(
            chatId,
            `⚠️ Format 1 baris belum valid.\nGunakan: <code>/lapor NO_TIKET | KODE_ODP | PORT(1-32) | REDAMAN(-40..5) | CATATAN</code>`,
          );
          return NextResponse.json({ ok: true, action: 'lapor_invalid_pipe' });
        }

        const ticket = await resolveAssignedTicket(ticketRef, boundUser);
        if (!ticket) {
          await sendTelegramHtmlMessage(
            chatId,
            `❌ Tiket <code>${escapeHtml(ticketRef)}</code> tidak ditemukan atau bukan tugas Anda.`,
          );
          return NextResponse.json({ ok: true, action: 'lapor_not_found' });
        }

        let photoKey: string | undefined;
        if (message.photo && message.photo.length > 0) {
          const bestPhoto = message.photo[message.photo.length - 1]!;
          photoKey =
            (await storeTelegramPhotoToMinio(
              bestPhoto.file_id,
              ticket.id,
              bestPhoto.file_unique_id || String(updateId),
            )) || undefined;
        }

        const existingDraftRaw = await redisManager.getKey(draftRedisKey(chatId));
        const existingDraft = existingDraftRaw
          ? (JSON.parse(existingDraftRaw) as TelegramReportDraft)
          : null;

        if (!photoKey && existingDraft?.ticketId === ticket.id && existingDraft.photoObjectKey) {
          photoKey = existingDraft.photoObjectKey;
        }

        const lat =
          message.location?.latitude ??
          existingDraft?.submittedLat ??
          ticket.targetLat ??
          -6.914744;
        const lng =
          message.location?.longitude ??
          existingDraft?.submittedLng ??
          ticket.targetLng ??
          107.60981;

        const finalPhotoKey =
          photoKey || `opm-proofs/telegram/${ticket.ticketNumber}-${updateId}-text-report.txt`;

        return await finalizeTelegramReport({
          chatId,
          account: boundUser,
          ticket,
          splitterId,
          portNumber,
          attenuationDbm,
          photoObjectKey: finalPhotoKey,
          lat,
          lng,
          notes,
          updateId,
        });
      }

      // Single arg `/lapor <NO_TIKET>` -> start interactive draft
      const ticket = await resolveAssignedTicket(argsRaw, boundUser);
      if (!ticket) {
        await sendTelegramHtmlMessage(
          chatId,
          `❌ Tiket <code>${escapeHtml(argsRaw)}</code> tidak ditemukan atau bukan tugas Anda.`,
        );
        return NextResponse.json({ ok: true, action: 'lapor_not_found' });
      }
      if (ticket.status === 'Selesai') {
        await sendTelegramHtmlMessage(
          chatId,
          `ℹ️ Tiket <code>${escapeHtml(ticket.ticketNumber)}</code> sudah berstatus Selesai.`,
        );
        return NextResponse.json({ ok: true, action: 'lapor_already_closed' });
      }

      const draft: TelegramReportDraft = {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        targetLat: ticket.targetLat ?? null,
        targetLng: ticket.targetLng ?? null,
        updatedAt: new Date().toISOString(),
      };
      await redisManager.setKeyWithTtl(
        draftRedisKey(chatId),
        JSON.stringify(draft),
        DRAFT_TTL_SECONDS,
      );

      await sendTelegramHtmlMessage(
        chatId,
        [
          `📝 <b>SESI LAPORAN AKTIF: ${escapeHtml(ticket.ticketNumber)}</b>`,
          `Pelanggan: <b>${escapeHtml(ticket.customerName)}</b>`,
          ``,
          `Silakan kirimkan kelengkapan berikut:`,
          `1️⃣ <b>Share Location</b> lokasi Anda saat ini (atau langsung gunakan koordinat target)`,
          `2️⃣ <b>Foto Bukti OPM</b> (kirim sebagai gambar)`,
          `3️⃣ Data teknis dengan format: <code>ODP | PORT | REDAMAN_DBM | CATATAN</code>`,
          `<i>Contoh:</i> <code>ODP-BDG-01 | 2 | -19.2 | Kabel normal &amp; redaman bagus</code>`,
          ``,
          `Ketik /batal kapan saja untuk membatalkan draf.`,
        ].join('\n'),
      );
      return NextResponse.json({
        ok: true,
        action: 'lapor_draft_started',
        ticketNumber: ticket.ticketNumber,
      });
    }

    // 9. Handle active draft contributions (location, photo, or pipe-delimited technical payload)
    const draftRaw = await redisManager.getKey(draftRedisKey(chatId));
    if (draftRaw) {
      const draft = JSON.parse(draftRaw) as TelegramReportDraft;
      const draftTicket = await resolveAssignedTicket(draft.ticketId, boundUser);

      if (!draftTicket) {
        await redisManager.deleteKey(draftRedisKey(chatId));
        await sendTelegramHtmlMessage(
          chatId,
          `⚠️ Draf laporan tidak lagi valid atau tiket sudah dipindahkan.`,
        );
        return NextResponse.json({ ok: true, action: 'draft_invalidated' });
      }

      let updated = false;
      const notices: string[] = [];

      if (message.location) {
        draft.submittedLat = message.location.latitude;
        draft.submittedLng = message.location.longitude;
        updated = true;
        notices.push(
          `📍 Koordinat lokasi diterima (${draft.submittedLat.toFixed(6)}, ${draft.submittedLng.toFixed(6)})`,
        );
      }

      if (message.photo && message.photo.length > 0) {
        const bestPhoto = message.photo[message.photo.length - 1]!;
        const storedKey = await storeTelegramPhotoToMinio(
          bestPhoto.file_id,
          draft.ticketId,
          bestPhoto.file_unique_id || String(updateId),
        );
        if (storedKey) {
          draft.photoObjectKey = storedKey;
          updated = true;
          notices.push(`📷 Foto bukti OPM berhasil disimpan ke MinIO`);
        }
      }

      if (rawText && !rawText.startsWith('/') && rawText.includes('|')) {
        const parts = rawText.split('|').map((p) => p.trim());
        const [splitterId, portStr, dbmStr, ...noteParts] = parts;
        const portNumber = Number(portStr);
        const attenuationDbm = Number(dbmStr);

        if (
          !splitterId ||
          !Number.isInteger(portNumber) ||
          portNumber < 1 ||
          portNumber > 32 ||
          Number.isNaN(attenuationDbm) ||
          attenuationDbm < -40 ||
          attenuationDbm > 5
        ) {
          await sendTelegramHtmlMessage(
            chatId,
            `⚠️ Format data teknis belum tepat.\nGunakan: <code>KODE_ODP | PORT(1-32) | REDAMAN(-40..5) | CATATAN</code>`,
          );
          return NextResponse.json({ ok: true, action: 'draft_invalid_metrics' });
        }

        draft.splitterId = splitterId;
        draft.portNumber = portNumber;
        draft.attenuationDbm = attenuationDbm;
        draft.technicianNotes = noteParts.join(' | ').trim() || draft.technicianNotes;
        updated = true;
        notices.push(`🧪 Data ODP <code>${escapeHtml(splitterId)}</code> Port ${portNumber} (${attenuationDbm} dBm) dicatat`);
      }

      if (updated) {
        draft.updatedAt = new Date().toISOString();
        await redisManager.setKeyWithTtl(
          draftRedisKey(chatId),
          JSON.stringify(draft),
          DRAFT_TTL_SECONDS,
        );

        const readyMetrics =
          Boolean(draft.splitterId) &&
          typeof draft.portNumber === 'number' &&
          typeof draft.attenuationDbm === 'number';
        const readyPhoto = Boolean(draft.photoObjectKey);

        if (readyMetrics && readyPhoto) {
          return await finalizeTelegramReport({
            chatId,
            account: boundUser,
            ticket: draftTicket,
            splitterId: draft.splitterId!,
            portNumber: draft.portNumber!,
            attenuationDbm: draft.attenuationDbm!,
            photoObjectKey: draft.photoObjectKey!,
            lat: draft.submittedLat ?? draft.targetLat ?? -6.914744,
            lng: draft.submittedLng ?? draft.targetLng ?? 107.60981,
            notes: draft.technicianNotes,
            updateId,
          });
        }

        const missing: string[] = [];
        if (!readyPhoto) missing.push('• <b>Foto Bukti OPM</b>');
        if (!readyMetrics) {
          missing.push('• Data teknis: <code>ODP | PORT | REDAMAN_DBM | CATATAN</code>');
        }

        await sendTelegramHtmlMessage(
          chatId,
          [
            ...notices,
            ``,
            `<b>Masih menunggu kelengkapan untuk <code>${escapeHtml(draft.ticketNumber)}</code>:</b>`,
            ...missing,
          ].join('\n'),
        );
        return NextResponse.json({ ok: true, action: 'draft_updated' });
      }
    }

    // 10. Default fallback when authenticated user sends unrecognized text / media without draft
    if (message.photo || message.location) {
      await sendTelegramHtmlMessage(
        chatId,
        `ℹ️ Belum ada sesi laporan aktif. Ketik /tugas lalu kirim <code>/lapor NO_TIKET</code> sebelum mengunggah foto atau lokasi.`,
      );
      return NextResponse.json({ ok: true, action: 'media_without_draft' });
    }

    await handleBoundCommandHelp(chatId, boundUser);
    return NextResponse.json({ ok: true, action: 'help' });
  } catch (error) {
    console.error('[Telegram Webhook Error]:', error);
    return NextResponse.json({ ok: false, error: 'Internal webhook error' }, { status: 500 });
  }
}

async function handleNikRegistration(chatId: string, candidateNik: string, _senderName: string) {
  const result = await AuthService.bindTelegramChatIdByNik({
    nik: candidateNik,
    chatId,
  });

  if (!result.success || !result.user) {
    const errorHtml = [
      `❌ <b>NIK TIDAK TERDAFTAR</b>`,
      ``,
      `Nomor Induk Karyawan <code>${escapeHtml(candidateNik)}</code> tidak ditemukan di dalam direktori sistem FiberOps NOC Lintasarta.`,
      ``,
      `<i>Petunjuk:</i>`,
      `• Pastikan NIK resmi dimasukkan tanpa spasi.`,
      `• Hubungi <b>Super Admin / Tim CS Lintasarta</b> agar akun &amp; NIK Anda didaftarkan terlebih dahulu.`,
    ].join('\n');

    await sendTelegramHtmlMessage(chatId, errorHtml);
    return NextResponse.json({ ok: true, action: 'nik_not_found', nik: candidateNik });
  }

  const user = result.user;
  const successHtml = [
    `✅ <b>INTEGRASI AKUN BERHASIL!</b>`,
    ``,
    `Akun Telegram Anda telah resmi ditautkan ke sistem <b>FiberOps NOC Lintasarta</b>:`,
    `• <b>Nama:</b> ${escapeHtml(user.fullName)}`,
    `• <b>NIK:</b> <code>${escapeHtml(user.nik || candidateNik)}</code>`,
    `• <b>Username:</b> <code>${escapeHtml(user.username)}</code>`,
    `• <b>Peran:</b> ${escapeHtml(user.role.name)}`,
    ``,
    `Ketik /tugas untuk melihat pekerjaan aktif atau gunakan kode 2FA saat login di portal web.`,
  ].join('\n');

  await sendTelegramHtmlMessage(chatId, successHtml);
  return NextResponse.json({
    ok: true,
    action: 'bound_success',
    userId: user.id,
    nik: user.nik,
  });
}
