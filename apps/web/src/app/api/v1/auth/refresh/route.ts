import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
import { refreshTokenRequestSchema, ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = refreshTokenRequestSchema.parse(rawBody);

    const result = await AuthService.refreshMobileSession(
      validated.refreshToken,
      validated.deviceId,
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    return sanitizeAndLogServerError(error, {
      route: 'POST /api/v1/auth/refresh',
      defaultCode: ERROR_CODES.UNAUTHORIZED,
    });
  }
}
