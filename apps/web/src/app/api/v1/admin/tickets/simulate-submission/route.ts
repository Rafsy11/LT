import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';

export async function POST(request: NextRequest) {
  try {
    let ticketId: string | undefined;

    try {
      const body = await request.json();
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
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SIMULATION_ERROR',
          message: error.message || 'Gagal mensimulasikan kiriman data teknisi',
        },
      },
      { status: 500 }
    );
  }
}
