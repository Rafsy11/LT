import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';
import { redisManager } from '@/lib/redis';
import { submitTicketSchema, ERROR_CODES } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';
import { prisma } from '@repo/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const techUsername = request.headers.get('x-username') || 'andi.pratama';
    const techUserId = request.headers.get('x-user-id') || deviceId || 'anonymous_tech';

    // 2. Rate Limiting: Maksimal 20 request per menit per Teknisi user ID
    const rateResult = await checkRateLimit(
      `tech_submit:${techUserId}`,
      RATE_LIMIT_PROFILES.TECH_SUBMIT
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Terlalu banyak pengiriman laporan tiket. Silakan tunggu cooldown sebelum mengirim ulang.',
          },
          meta: { retryAfterMs: rateResult.retryAfterMs },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Support Idempotency key from either header or body
    const headerIdempotencyKey =
      request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key');
    if (headerIdempotencyKey && !body.submissionId) {
      body.submissionId = headerIdempotencyKey;
    }

    const validated = submitTicketSchema.parse(body);

    // 3. Strict Security Validation Order:
    // (1) Cek kepemilikan tiket (Anti-IDOR)
    // (2) Cek Idempotency (Laporan duplikat dikembalikan sukses tanpa terblokir status)
    // (3) Cek Status Tiket (Tolak submission baru jika tiket sudah COMPLETED/CANCELLED)
    try {
      const ticket = await prisma.ticket.findFirst({
        where: {
          OR: [{ id }, { ticketNumber: id }],
        },
      });

      if (ticket) {
        // (1) Ownership IDOR Check
        if (techUserId && ticket.assignedTechId && ticket.assignedTechId !== techUserId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.IDOR_VIOLATION,
                message: 'Anda tidak berwenang mengirim laporan untuk tiket yang bukan ditugaskan kepada Anda.',
              },
            },
            { status: 403 }
          );
        }

        // (2) Idempotency Check BEFORE closed status with Cross-Ticket Guard
        const existingHistory = await prisma.attenuationHistory.findUnique({
          where: { submissionId: validated.submissionId },
          include: { ticket: true },
        });

        if (existingHistory) {
          const isSameTicket = existingHistory.ticketId === ticket.id;
          const isSameTech = !techUserId || existingHistory.techId === techUserId;

          if (!isSameTicket || !isSameTech) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: ERROR_CODES.IDOR_VIOLATION,
                  message: 'submissionId ini telah digunakan pada tiket atau teknisi lain (Cross-Ticket Replay Blocked).',
                },
              },
              { status: 403 }
            );
          }

          return NextResponse.json({
            success: true,
            data: existingHistory.ticket,
            meta: {
              alreadyProcessed: true,
              message: 'Laporan telah berhasil diproses sebelumnya (Idempotent response)',
            },
          });
        }

        // (3) Lifecycle Status Check (reject new attempts on completed/cancelled tickets)
        if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.TICKET_ALREADY_CLOSED,
                message: `Tiket sudah berstatus ${ticket.status} dan tidak dapat dimutasi lagi.`,
              },
            },
            { status: 409 }
          );
        }
      }
    } catch {
      // In-memory / DB unavailable fallback
    }

    const result = await TicketService.submitTicketByTechnician(id, validated, {
      id: techUserId,
      username: techUsername,
    });

    return NextResponse.json({
      success: true,
      data: result.ticket,
      meta: {
        alreadyProcessed: result.alreadyProcessed,
        distanceMeters: result.distanceMeters,
        isLocationFlagged: result.isLocationFlagged,
        message: result.message,
      },
    });
  } catch (error: unknown) {
    const err = error as Error & { name?: string; errors?: Array<{ message: string }> };
    const isValidation = err.name === 'ZodError';
    const isOccupied = err.message?.includes(ERROR_CODES.PORT_OCCUPIED);
    const isMock = err.message?.includes(ERROR_CODES.MOCK_LOCATION_DETECTED);
    const isIdor = err.message?.includes(ERROR_CODES.IDOR_VIOLATION);
    const isClosed = err.message?.includes('tidak dapat dimutasi') || err.message?.includes(ERROR_CODES.TICKET_ALREADY_CLOSED);

    let status = 400;
    if (isOccupied || isClosed) status = 409;
    else if (isMock || isIdor) status = 403;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isOccupied
            ? ERROR_CODES.PORT_OCCUPIED
            : isClosed
              ? ERROR_CODES.TICKET_ALREADY_CLOSED
              : isMock
                ? ERROR_CODES.MOCK_LOCATION_DETECTED
                : isIdor
                  ? ERROR_CODES.IDOR_VIOLATION
                  : isValidation
                    ? ERROR_CODES.VALIDATION_ERROR
                    : 'SUBMISSION_ERROR',
          message: isValidation ? err.errors?.[0]?.message : err.message,
          details: err.errors,
        },
      },
      { status }
    );
  }
}
