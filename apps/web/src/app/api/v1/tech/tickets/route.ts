import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tech = searchParams.get('tech') || 'Andi Pratama';

    const allTickets = await TicketService.listTickets();
    const techTickets = allTickets.filter(
      (t) => t.assignedTech.toLowerCase() === tech.toLowerCase() && t.status !== 'Selesai'
    );

    return NextResponse.json({
      success: true,
      data: techTickets,
      meta: { count: techTickets.length },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'TECH_TICKETS_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
