import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';
import { ERROR_CODES } from '@repo/shared';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const adminUsername = request.headers.get('x-username') || 'Super Admin';
    const adminId = request.headers.get('x-user-id') || 'admin-001';

    const ticket = await TicketService.approveTicketSubmission(id, {
      id: adminId,
      username: adminUsername,
    });

    return NextResponse.json({
      success: true,
      data: ticket,
      meta: {
        message: 'Laporan teknisi berhasil diverifikasi dan disetujui (Accepted). Data redaman dan port splitter telah resmi diterapkan pada Master Data Pelanggan.',
      },
    });
  } catch (error: any) {
    const isOccupied = error.message?.includes(ERROR_CODES.PORT_OCCUPIED);
    const status = isOccupied ? 409 : 400;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isOccupied ? ERROR_CODES.PORT_OCCUPIED : 'APPROVAL_ERROR',
          message: error.message || 'Gagal menyetujui laporan tiket',
        },
      },
      { status }
    );
  }
}
