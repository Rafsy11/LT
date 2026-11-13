import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/server/services/ticket.service';
import { submitTicketSchema, ERROR_CODES } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { resolveTechActor, handleTechRouteError } from '@/server/lib/tech-auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveTechActor(request);

    // Rate Limiting: Maksimal 20 request per menit per Vendor/Teknisi
    const rateResult = await checkRateLimit(
      `tech_submit:${actor.userId}`,
      RATE_LIMIT_PROFILES.TECH_SUBMIT,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message:
              'Terlalu banyak pengiriman laporan tiket. Silakan tunggu cooldown sebelum mengirim ulang.',
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
    const body = (await request.json()) as Record<string, unknown>;

    // Support Idempotency key from either header or body
    const headerIdempotencyKey =
      request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key');
    if (headerIdempotencyKey && !body.submissionId) {
      body.submissionId = headerIdempotencyKey;
    }

    const validated = submitTicketSchema.parse(body);
    const channel = validated.channel || actor.channel;

    // Strict Security Validation Order:
    // (1) Cek kepemilikan tiket (Anti-IDOR)
    // (2) Cek Idempotency (Laporan duplikat dikembalikan sukses tanpa terblokir status)
    // (3) Cek Status Tiket (Tolak submission baru jika tiket sudah COMPLETED/CANCELLED)
    if (await isDatabaseAvailable()) {
      try {
        const ticket = await prisma.ticket.findFirst({
          where: {
            OR: [{ id }, { ticketNumber: id }],
          },
        });

        if (ticket) {
          if (
            actor.userType !== 'SUPER_ADMIN' &&
            ticket.assignedTechId &&
            ticket.assignedTechId !== actor.userId
          ) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: ERROR_CODES.IDOR_VIOLATION,
                  message:
                    'Anda tidak berwenang mengirim laporan untuk tiket yang bukan ditugaskan kepada Anda.',
                },
              },
              { status: 403 },
            );
          }

          const existingHistory = await prisma.attenuationHistory.findUnique({
            where: { submissionId: validated.submissionId },
            include: { ticket: true },
          });

          if (existingHistory) {
            const isSameTicket = existingHistory.ticketId === ticket.id;
            const isSameTech = !actor.userId || existingHistory.techId === actor.userId;

            if (!isSameTicket || !isSameTech) {
              return NextResponse.json(
                {
                  success: false,
                  error: {
                    code: ERROR_CODES.IDOR_VIOLATION,
                    message:
                      'submissionId ini telah digunakan pada tiket atau teknisi lain (Cross-Ticket Replay Blocked).',
                  },
                },
                { status: 403 },
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

          if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: ERROR_CODES.TICKET_ALREADY_CLOSED,
                  message: `Tiket sudah berstatus ${ticket.status} dan tidak dapat dimutasi lagi.`,
                },
              },
              { status: 409 },
            );
          }
        }
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    const result = await TicketService.submitTicketByTechnician(
      id,
      { ...validated, channel },
      {
        id: actor.userId,
        username: actor.canonicalUsername,
      },
    );

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
    return handleTechRouteError(error, 'SUBMISSION_ERROR', 'Gagal mengirim laporan tiket');
  }
}
