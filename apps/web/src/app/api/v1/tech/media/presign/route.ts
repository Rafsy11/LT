import { NextRequest, NextResponse } from 'next/server';
import { ERROR_CODES, mobileMediaPresignQuerySchema } from '@repo/shared';
import { TicketService } from '@/server/services/ticket.service';
import { resolveTechActor, handleTechRouteError } from '@/server/lib/tech-auth';

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveTechActor(request);
    const searchParams = request.nextUrl.searchParams;
    const parsedQuery = mobileMediaPresignQuerySchema.safeParse({
      ticketId: searchParams.get('ticketId') ?? '',
      key: searchParams.get('key') ?? '',
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message:
              parsedQuery.error.issues[0]?.message || 'Parameter pratinjau bukti OPM tidak valid.',
          },
        },
        { status: 400 },
      );
    }

    const result = await TicketService.presignTechnicianMedia(actor, parsedQuery.data);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return handleTechRouteError(
      error,
      'TECH_MEDIA_PRESIGN_ERROR',
      'Gagal membuat tautan pratinjau foto OPM.',
      500,
    );
  }
}
