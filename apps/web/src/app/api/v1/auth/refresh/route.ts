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
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string; errors?: unknown[] };
    const isValidation = err.name === 'ZodError';
    const isReuse = Boolean(err.message?.includes(ERROR_CODES.TOKEN_REUSE_DETECTED));
    const isSessionRevoked = Boolean(err.message?.includes(ERROR_CODES.SESSION_REVOKED));

    let status = 401;
    let code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES] = ERROR_CODES.UNAUTHORIZED;

    if (isValidation) {
      status = 400;
      code = ERROR_CODES.VALIDATION_ERROR;
    } else if (isReuse) {
      status = 401;
      code = ERROR_CODES.TOKEN_REUSE_DETECTED;
    } else if (isSessionRevoked) {
      status = 401;
      code = ERROR_CODES.SESSION_REVOKED;
    }

    const firstZodMessage =
      Array.isArray(err.errors) && err.errors[0] && typeof err.errors[0] === 'object' && 'message' in err.errors[0]
        ? String((err.errors[0] as { message: unknown }).message)
        : 'Permintaan tidak valid';

    return NextResponse.json(
      {
        success: false,
        error: {
          code,
          message: isValidation ? firstZodMessage : (err.message || 'Sesi otentikasi tidak valid'),
          details: err.errors,
        },
      },
      { status }
    );
  }
}
