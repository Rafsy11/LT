import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/services/ticket.service';
import { redisManager } from '@/lib/redis';
import { submitTicketSchema, ERROR_CODES } from '@repo/shared';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Instant Force Logout Check via Redis (Task 2 & Law 4)
    const deviceId = request.headers.get('x-device-id');
    if (deviceId) {
      const isBlacklisted = await redisManager.isSessionBlacklisted(deviceId);
      if (isBlacklisted) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.SESSION_REVOKED,
              message: 'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
            },
          },
          { status: 401 }
        );
      }
    }

    const { id } = await params;
    const body = await request.json();

    // Support Idempotency key from either header or body
    const headerIdempotencyKey =
      request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key');
    if (headerIdempotencyKey && !body.submissionId) {
      body.submissionId = headerIdempotencyKey;
    }

    const validated = submitTicketSchema.parse(body);

    const techUsername = request.headers.get('x-username') || 'andi.pratama';
    const techUserId = request.headers.get('x-user-id') || undefined;

    const result = await TicketService.submitTicketByTechnician(id, validated, {
      id: techUserId,
      username: techUsername,
    });

    return NextResponse.json({
      success: true,
      data: result.ticket,
      meta: {
        alreadyProcessed: result.alreadyProcessed,
        distanceMeters: result.distanceMeters,
        isLocationFlagged: result.isLocationFlagged,
        message: result.message,
      },
    });
  } catch (error: any) {
    const isValidation = error.name === 'ZodError';
    const isOccupied = error.message?.includes(ERROR_CODES.PORT_OCCUPIED);
    const isMock = error.message?.includes(ERROR_CODES.MOCK_LOCATION_DETECTED);

    let status = 400;
    if (isOccupied) status = 409;
    else if (isMock) status = 403;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isOccupied
            ? ERROR_CODES.PORT_OCCUPIED
            : isMock
              ? ERROR_CODES.MOCK_LOCATION_DETECTED
              : isValidation
                ? ERROR_CODES.VALIDATION_ERROR
                : 'SUBMISSION_ERROR',
          message: isValidation ? error.errors[0]?.message : error.message,
          details: error.errors,
        },
      },
      { status }
    );
  }
}
