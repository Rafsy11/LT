import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ERROR_CODES } from '@repo/shared';
import { minioManager } from '@/server/lib/minio';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';
import { TicketService } from '@/server/services/ticket.service';
import {
  resolveTechActor,
  normalizeTechUsernameAlias,
  handleTechRouteError,
} from '@/server/lib/tech-auth';

const SAFE_TICKET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveTechActor(request);

    const rateResult = await checkRateLimit(
      `tech_upload:${actor.userId}`,
      RATE_LIMIT_PROFILES.TECH_UPLOAD,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: 'Terlalu banyak unggahan foto. Silakan tunggu 60 detik.',
          },
          meta: { retryAfterMs: rateResult.retryAfterMs },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        },
      );
    }

    const { id } = await params;
    if (!SAFE_TICKET_ID_PATTERN.test(id)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Format ID tiket tidak valid.',
          },
        },
        { status: 400 },
      );
    }

    const tickets = await TicketService.listTickets();
    const targetTicket = tickets.find((t) => t.id === id || t.ticketNumber === id);
    if (!targetTicket) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.TICKET_NOT_FOUND,
            message: `Tiket ${id} tidak ditemukan.`,
          },
        },
        { status: 404 },
      );
    }

    if (targetTicket.status === 'Selesai') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.TICKET_ALREADY_CLOSED,
            message: 'Tiket sudah selesai diverifikasi dan tidak dapat menerima bukti baru.',
          },
        },
        { status: 409 },
      );
    }

    if (actor.userType !== 'SUPER_ADMIN') {
      const assignedNorm = normalizeTechUsernameAlias(
        targetTicket.assignedTechUsername ||
          targetTicket.assignedTech.toLowerCase().replace(/\s+/g, '.'),
      );
      if (
        assignedNorm !== actor.canonicalUsername &&
        targetTicket.assignedTech.toLowerCase() !== (actor.fullName || '').toLowerCase()
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.IDOR_VIOLATION,
              message: 'Anda tidak berwenang mengunggah bukti foto untuk tiket vendor lain.',
            },
          },
          { status: 403 },
        );
      }
    }

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'File foto bukti OPM wajib dikirim dengan field form "file".',
          },
        },
        { status: 400 },
      );
    }

    const ext = MIME_TO_EXT[fileEntry.type];
    if (!ext) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Tipe file harus berupa gambar JPG, PNG, atau WEBP.',
          },
        },
        { status: 400 },
      );
    }

    if (fileEntry.size <= 0 || fileEntry.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Ukuran foto maksimal 5 MB.',
          },
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const safeTicketRef = targetTicket.id.replace(/[^a-zA-Z0-9_-]/g, '');
    const objectKey = `opm-proofs/${year}/${month}/${safeTicketRef}-${crypto.randomUUID()}.${ext}`;

    const uploadResult = await minioManager.putObjectBuffer(objectKey, buffer, fileEntry.type);

    return NextResponse.json(
      {
        success: true,
        data: {
          photoObjectKey: uploadResult.objectKey,
          storedInMinio: uploadResult.stored,
          sizeBytes: buffer.length,
          contentType: fileEntry.type,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleTechRouteError(error, 'PHOTO_UPLOAD_ERROR', 'Gagal mengunggah bukti foto OPM');
  }
}

