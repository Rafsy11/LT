import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';
import { submitTicketSchema } from '@isp/shared';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Support Idempotency key from either header or body
    const headerIdempotencyKey = request.headers.get('x-idempotency-key');
    if (headerIdempotencyKey && !body.submissionId) {
      body.submissionId = headerIdempotencyKey;
    }

    const validated = submitTicketSchema.parse(body);

    const result = await TicketService.submitTicket(id, validated);

    return NextResponse.json({
      success: true,
      data: result.ticket,
      meta: {
        alreadyProcessed: result.alreadyProcessed,
        message: result.message,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SUBMISSION_ERROR',
          message: error.errors ? error.errors[0]?.message : error.message,
          details: error.errors,
        },
      },
      { status: 400 }
    );
  }
}
