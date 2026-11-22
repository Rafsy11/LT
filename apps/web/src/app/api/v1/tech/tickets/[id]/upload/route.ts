import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { ERROR_CODES } from '@repo/shared';
import { minioManager } from '@/server/lib/minio';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';
import { requireLiveDatabase } from '@/server/lib/live-data';
import {
  MAX_IMAGE_UPLOAD_BYTES,
  validateImageUploadBuffer,
} from '@/server/lib/image-validation';
import { TicketService } from '@/server/services/ticket.service';
import {
  resolveTechActor,
  normalizeTechUsernameAlias,
  handleTechRouteError,
} from '@/server/lib/tech-auth';

const SAFE_TICKET_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

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

    const dbOnline = await requireLiveDatabase(
      'Database PostgreSQL tidak tersedia untuk memverifikasi tiket unggahan.',
    );
    let resolvedTicketId = id;

    if (dbOnline) {
      const dbTicket = await prisma.ticket.findFirst({
        where: {
          OR: [{ id }, { ticketNumber: id }],
        },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          assignedTechId: true,
        },
      });

      if (!dbTicket) {
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

      if (dbTicket.status === 'COMPLETED' || dbTicket.status === 'CANCELLED') {
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

      if (
        actor.userType !== 'SUPER_ADMIN' &&
        (!dbTicket.assignedTechId || dbTicket.assignedTechId !== actor.userId)
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

      resolvedTicketId = dbTicket.id;
    } else {
      const targetTicket = await TicketService.getTicketById(id);

      if (targetTicket.status === 'Selesai' || targetTicket.status === 'Dibatalkan') {
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

      resolvedTicketId = targetTicket.id;
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

    if (fileEntry.size > MAX_IMAGE_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.PAYLOAD_TOO_LARGE,
            message:
              'Ukuran foto melebihi batas maksimal 5 MB. Perkecil ukuran foto (JPG, PNG, atau WEBP) lalu coba kembali.',
          },
        },
        { status: 413 },
      );
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const detected = validateImageUploadBuffer(fileEntry, buffer);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const safeTicketRef = resolvedTicketId.replace(/[^a-zA-Z0-9_-]/g, '');
    const objectKey = `opm-proofs/${year}/${month}/${safeTicketRef}-${crypto.randomUUID()}.${detected.ext}`;

    const uploadResult = await minioManager.putObjectBuffer(objectKey, buffer, detected.mimeType);

    return NextResponse.json(
      {
        success: true,
        data: {
          photoObjectKey: uploadResult.objectKey,
          storedInMinio: uploadResult.stored,
          sizeBytes: buffer.length,
          contentType: detected.mimeType,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleTechRouteError(error, 'PHOTO_UPLOAD_ERROR', 'Gagal mengunggah bukti foto OPM');
  }
}

