import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let reason = 'Data redaman atau bukti foto OPM belum memenuhi standar operasional.';

    try {
      const body = await request.json();
      if (body?.reason && typeof body.reason === 'string' && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Body is optional
    }

    const adminUsername = request.headers.get('x-username') || 'Super Admin';
    const adminId = request.headers.get('x-user-id') || 'admin-001';

    const ticket = await TicketService.rejectTicketSubmission(id, reason, {
      id: adminId,
      username: adminUsername,
    });

    return NextResponse.json({
      success: true,
      data: ticket,
      meta: {
        message: 'Laporan teknisi telah ditolak dan dikembalikan ke teknisi untuk pengukuran ulang / perbaikan di lapangan.',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'REJECTION_ERROR',
          message: error.message || 'Gagal menolak laporan tiket',
        },
      },
      { status: 400 }
    );
  }
}
