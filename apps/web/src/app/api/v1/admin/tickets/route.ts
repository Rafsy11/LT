import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';
import { createTicketSchema } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cluster = searchParams.get('cluster') || undefined;
    const status = searchParams.get('status') || undefined;
    const query = searchParams.get('query') || undefined;

    const tickets = await TicketService.listTickets({ cluster, status: status as any, query });

    return NextResponse.json({
      success: true,
      data: tickets,
      meta: { count: tickets.length },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'TICKET_FETCH_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createTicketSchema.parse(body);

    const ticket = await TicketService.createTicket(validated);

    return NextResponse.json({
      success: true,
      data: ticket,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors ? error.errors[0]?.message : error.message,
          details: error.errors,
        },
      },
      { status: 400 }
    );
  }
}
