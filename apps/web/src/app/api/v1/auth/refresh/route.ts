import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { refreshTokenRequestSchema, ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = refreshTokenRequestSchema.parse(rawBody);

    const result = await AuthService.refreshMobileSession(
      validated.refreshToken,
      validated.deviceId
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const isValidation = error.name === 'ZodError';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isValidation ? ERROR_CODES.VALIDATION_ERROR : ERROR_CODES.UNAUTHORIZED,
          message: isValidation ? error.errors[0]?.message : error.message,
          details: error.errors,
        },
      },
      { status: isValidation ? 400 : 401 }
    );
  }
}
