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

    // Verify cluster ownership before approval
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

    const ticket = await TicketService.approveTicketSubmission(id, {
      id: actor.userId,
      username: actor.username,
    });

    return NextResponse.json({
      success: true,
      data: ticket,
      meta: {
        message:
          'Laporan teknisi berhasil diverifikasi dan disetujui (Accepted). Data redaman dan port splitter telah resmi diterapkan pada Master Data Pelanggan.',
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'APPROVAL_ERROR',
      'Gagal menyetujui laporan tiket',
      400,
    );
  }
}
