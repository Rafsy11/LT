import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { ERROR_CODES, STANDARD_ERROR_MESSAGES } from '@repo/shared';
import { minioManager } from '@/server/lib/minio';
import {
  resolveTechActor,
  normalizeTechUsernameAlias,
  handleTechRouteError,
} from '@/server/lib/tech-auth';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';
import { requireLiveDatabase } from '@/server/lib/live-data';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
} from '@/server/lib/image-validation';
import { TicketService } from '@/server/services/ticket.service';

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const CONTENT_TYPE_TO_EXT: Record<string, { mimeType: string; ext: 'jpg' | 'png' | 'webp' }> = {
  'image/jpeg': { mimeType: 'image/jpeg', ext: 'jpg' },
  'image/jpg': { mimeType: 'image/jpeg', ext: 'jpg' },
  'image/png': { mimeType: 'image/png', ext: 'png' },
  'image/webp': { mimeType: 'image/webp', ext: 'webp' },
};

export async function POST(request: NextRequest) {
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
            message: 'Terlalu banyak permintaan upload URL. Silakan tunggu 60 detik.',
          },
          meta: { retryAfterMs: rateResult.retryAfterMs },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        },
      );
    }

    const body = (await request.json()) as {
      ticketId?: unknown;
      submissionId?: unknown;
      contentType?: unknown;
      fileSize?: unknown;
    };
    const ticketId = body.ticketId;
    const submissionId = body.submissionId;
    const rawContentType =
      typeof body.contentType === 'string' && body.contentType.trim()
        ? body.contentType.trim().toLowerCase()
        : 'image/jpeg';

    if (
      !ticketId ||
      !submissionId ||
      typeof ticketId !== 'string' ||
      typeof submissionId !== 'string' ||
      !SAFE_ID_PATTERN.test(ticketId) ||
      !SAFE_ID_PATTERN.test(submissionId)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message:
              'ticketId dan submissionId wajib berupa string alfanumerik/UUID valid tanpa karakter khusus.',
          },
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(rawContentType)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
            message:
              'Tipe media tidak diizinkan. Hanya gambar JPG, PNG, atau WEBP yang diperbolehkan.',
          },
        },
        { status: 415 },
      );
    }

    const mappedType = CONTENT_TYPE_TO_EXT[rawContentType]!;

    if (body.fileSize !== undefined) {
      if (typeof body.fileSize !== 'number' || !Number.isFinite(body.fileSize) || body.fileSize <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'Ukuran berkas foto tidak valid.',
            },
          },
          { status: 400 },
        );
      }
      if (body.fileSize > MAX_IMAGE_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.PAYLOAD_TOO_LARGE,
              message: 'Ukuran foto melebihi batas maksimal 5 MB.',
            },
          },
          { status: 413 },
        );
      }
    }

    const dbOnline = await requireLiveDatabase(
      'Database PostgreSQL tidak tersedia untuk memvalidasi unggahan tiket.',
    );
    let canonicalTicketId = ticketId;

    if (dbOnline) {
      const ticket = await prisma.ticket.findFirst({
        where: {
          OR: [{ id: ticketId }, { ticketNumber: ticketId }],
        },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          assignedTechId: true,
        },
      });

      if (!ticket) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.TICKET_NOT_FOUND,
              message: `Tiket ${ticketId} tidak ditemukan.`,
            },
          },
          { status: 404 },
        );
      }

      if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.TICKET_ALREADY_CLOSED,
              message: `Tiket tidak dapat dimutasi karena sudah berstatus ${ticket.status}.`,
            },
          },
          { status: 409 },
        );
      }

      if (
        actor.userType !== 'SUPER_ADMIN' &&
        (!ticket.assignedTechId || ticket.assignedTechId !== actor.userId)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.IDOR_VIOLATION,
              message: 'Akses ditolak: Anda bukan teknisi yang ditugaskan pada tiket ini.',
            },
          },
          { status: 403 },
        );
      }

      canonicalTicketId = ticket.id;
    } else {
      const offlineTicket = await TicketService.getTicketById(ticketId);
      if (offlineTicket.status === 'Selesai' || offlineTicket.status === 'Dibatalkan') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.TICKET_ALREADY_CLOSED,
              message: 'Tiket sudah selesai atau dibatalkan dan tidak dapat dimutasi.',
            },
          },
          { status: 409 },
        );
      }
      if (actor.userType !== 'SUPER_ADMIN') {
        const assignedNorm = normalizeTechUsernameAlias(
          offlineTicket.assignedTechUsername ||
            offlineTicket.assignedTech.toLowerCase().replace(/\s+/g, '.'),
        );
        if (
          assignedNorm !== actor.canonicalUsername &&
          offlineTicket.assignedTech.toLowerCase() !== (actor.fullName || '').toLowerCase()
        ) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.IDOR_VIOLATION,
                message: 'Akses ditolak: Anda bukan teknisi yang ditugaskan pada tiket ini.',
              },
            },
            { status: 403 },
          );
        }
      }
      canonicalTicketId = offlineTicket.id;
    }

    const safeTicketRef = canonicalTicketId.replace(/[^a-zA-Z0-9_-]/g, '');
    const objectKey = `proofs/${safeTicketRef}_${submissionId}.${mappedType.ext}`;
    const expirySeconds = 900;

    const uploadUrl = await minioManager.generatePresignedPutUrl(objectKey, expirySeconds);

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,
        objectKey,
        expiresIn: expirySeconds,
        contentType: mappedType.mimeType,
      },
    });
  } catch (error: unknown) {
    return handleTechRouteError(
      error,
      ERROR_CODES.INTERNAL_ERROR,
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      500,
    );
  }
}
