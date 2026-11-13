import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/server/services/ticket.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { dispatchTicketSchema, ERROR_CODES, PERMISSIONS } from '@repo/shared';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminActor(request, [
      PERMISSIONS.TICKET_CREATE,
      PERMISSIONS.TECH_MANAGE,
    ]);
    const { id } = await params;

    const existingList = await TicketService.listTickets({});
    const targetTicket = existingList.find((t) => t.id === id || t.ticketNumber === id);
    if (!targetTicket) {
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

    if (!matchesAssignedClusters(actor, targetTicket.cluster)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: `Akses ditolak: Tiket pada cluster ${targetTicket.cluster} berada di luar wilayah tugas Anda.`,
          },
        },
        { status: 403 },
      );
    }

    const body: unknown = await request.json();
    const validated = dispatchTicketSchema.parse(body);

    const updated = await TicketService.updateTicketDispatch(id, validated, {
      id: actor.userId,
      username: actor.username,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      meta: {
        message: 'Disposisi vendor, alamat, dan titik koordinat tugas berhasil diperbarui.',
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'DISPATCH_ERROR',
      'Gagal memperbarui disposisi vendor tiket',
      400,
    );
  }
}

