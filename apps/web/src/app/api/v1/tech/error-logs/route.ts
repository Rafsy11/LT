import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const errorMessage = body.errorMessage || body.message;
    if (!errorMessage) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'errorMessage wajib disertakan.',
          },
        },
        { status: 400 }
      );
    }

    const userId = body.userId || request.headers.get('x-user-id') || null;
    const appVersion = body.appVersion || request.headers.get('x-app-version') || null;
    const deviceInfo = body.deviceInfo || request.headers.get('x-device-id') || null;
    const stackTrace = body.stackTrace || (body.stack ? String(body.stack) : null);

    const logEntry = await prisma.clientErrorLog.create({
      data: {
        userId,
        appVersion,
        deviceInfo,
        errorMessage: String(errorMessage).slice(0, 1000),
        stackTrace: stackTrace ? String(stackTrace).slice(0, 4000) : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: logEntry.id,
        loggedAt: logEntry.createdAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: error.message || 'Gagal menyimpan client error log',
        },
      },
      { status: 500 }
    );
  }
}
