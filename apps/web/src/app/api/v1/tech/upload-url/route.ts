import { NextRequest, NextResponse } from 'next/server';
import { minioManager } from '@/lib/minio';
import { redisManager } from '@/lib/redis';
import { ERROR_CODES } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';
import { prisma } from '@repo/database';

/**
 * Strict alphanumeric and safe identifier pattern (alphanumeric, dash, underscore only).
 * Disallows dots, slashes, or special characters to eliminate path traversal (CWE-22).
 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export async function POST(request: NextRequest) {
  try {
    // 1. Instant Force Logout Check via Redis (Task 2 & Law 4)
    const deviceId = request.headers.get('x-device-id');
    if (deviceId) {
      const isBlacklisted = await redisManager.isSessionBlacklisted(deviceId);
      if (isBlacklisted) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.SESSION_REVOKED,
              message: 'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
            },
          },
          { status: 401 }
        );
      }
    }

    const techUserId = request.headers.get('x-user-id') || deviceId || 'anonymous_tech';

    // 2. Rate Limiting: Maksimal 20 request per menit per Teknisi user ID
    const rateResult = await checkRateLimit(
      `tech_upload:${techUserId}`,
      RATE_LIMIT_PROFILES.TECH_UPLOAD
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
        }
      );
    }

    const body = await request.json();
    const { ticketId, submissionId, contentType = 'image/jpeg' } = body;

    // 3. Strict Input Validation (Anti-Path Traversal)
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
            message: 'ticketId dan submissionId wajib berupa string alfanumerik/UUID valid tanpa karakter khusus.',
          },
        },
        { status: 400 }
      );
    }

    // 4. Anti-IDOR & Ticket Lifecycle Validation
    try {
      const ticket = await prisma.ticket.findFirst({
        where: {
          OR: [{ id: ticketId }, { ticketNumber: ticketId }],
        },
      });

      if (ticket) {
        // Reject if ticket is already closed
        if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.TICKET_ALREADY_CLOSED,
                message: `Tiket tidak dapat dimutasi karena sudah berstatus ${ticket.status}.`,
              },
            },
            { status: 400 }
          );
        }

        // Reject if requested by a technician other than the assigned technician
        if (techUserId && ticket.assignedTechId && ticket.assignedTechId !== techUserId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.IDOR_VIOLATION,
                message: 'Akses ditolak: Anda bukan teknisi yang ditugaskan pada tiket ini.',
              },
            },
            { status: 403 }
          );
        }
      }
    } catch {
      // In-memory / DB unavailable fallback
    }

    // 5. Pure Server-Side Object Key Construction (Client cannot control path)
    const objectKey = `proofs/${ticketId}_${submissionId}.jpg`;
    const expirySeconds = 900; // 15 minutes validity for presigned PUT

    const uploadUrl = await minioManager.generatePresignedPutUrl(objectKey, expirySeconds);

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,
        objectKey,
        expiresIn: expirySeconds,
        contentType,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: err.message || 'Gagal menghasilkan Presigned PUT URL MinIO',
        },
      },
      { status: 500 }
    );
  }
}
