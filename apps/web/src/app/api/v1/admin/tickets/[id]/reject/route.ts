import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/server/services/ticket.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminActor(request, [
      PERMISSIONS.TICKET_CREATE,
      PERMISSIONS.TECH_MANAGE,
    ]);
    const { id } = await params;

    const existingList = await TicketService.listTickets({});
    const targetTicket = existingList.find((t) => t.id === id || t.ticketNumber === id);
    if (targetTicket && !matchesAssignedClusters(actor, targetTicket.cluster)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: `Akses ditolak: Tiket pada cluster ${targetTicket.cluster} di luar wilayah Anda.`,
          },
        },
        { status: 403 },
      );
    }

    let reason = 'Data redaman atau bukti foto OPM belum memenuhi standar operasional.';
    try {
      const body = (await request.json()) as { reason?: unknown };
      if (typeof body?.reason === 'string' && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Body is optional
    }

    const ticket = await TicketService.rejectTicketSubmission(id, reason, {
      id: actor.userId,
      username: actor.username,
    });

    return NextResponse.json({
      success: true,
      data: ticket,
      meta: {
        message:
          'Laporan teknisi telah ditolak dan dikembalikan ke teknisi untuk pengukuran ulang / perbaikan di lapangan.',
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'REJECTION_ERROR',
      'Gagal menolak laporan tiket',
      400,
    );
  }
}
