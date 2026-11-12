import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/server/services/ticket.service';
import {
  requireAdminActor,
  isGlobalScopeActor,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.TECH_MANAGE);
    if (!isGlobalScopeActor(actor)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Simulasi kiriman lapangan hanya dapat dijalankan oleh Super Admin.',
          },
        },
        { status: 403 },
      );
    }

    let ticketId: string | undefined;
    try {
      const body = (await request.json()) as { ticketId?: unknown };
      if (body?.ticketId) {
        ticketId = String(body.ticketId);
      }
    } catch {
      // Body is optional
    }

    const ticket = await TicketService.simulateTechnicianSubmission(ticketId);

    return NextResponse.json({
      success: true,
      data: ticket,
      meta: {
        message: `Laporan baru dari teknisi (${ticket.assignedTech}) berhasil diterima melalui mobile app. Silakan periksa dan lakukan verifikasi persetujuan (Accepted).`,
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'SIMULATION_ERROR',
      'Gagal mensimulasikan kiriman data teknisi',
    );
  }
}
