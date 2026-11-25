import { NextRequest, NextResponse } from 'next/server';
import { ERROR_CODES, mobileTicketQuerySchema } from '@repo/shared';
import { TicketService } from '@/server/services/ticket.service';
import { resolveTechActor, handleTechRouteError } from '@/server/lib/tech-auth';

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveTechActor(request);
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = searchParams.get('historyLimit');
    const parsedQuery = mobileTicketQuerySchema.safeParse({
      historyLimit: rawLimit === null ? undefined : rawLimit,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message:
              parsedQuery.error.issues[0]?.message || 'Parameter query riwayat tidak valid.',
          },
        },
        { status: 400 },
      );
    }

    const result = await TicketService.listTechnicianTicketsForMobile(actor, parsedQuery.data);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return handleTechRouteError(
      error,
      'TECH_TICKETS_ERROR',
      'Gagal memuat daftar tiket vendor',
      500,
    );
  }
}
