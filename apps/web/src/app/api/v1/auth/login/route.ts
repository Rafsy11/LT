import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { loginRequestSchema, ERROR_CODES } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = loginRequestSchema.parse(rawBody);

    // Rate Limiting: Maksimal 5 request per 15 menit per IP + username (HTTP 429)
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const normalizedUsername = validated.username.trim().toLowerCase();
    const rateLimitKey = `auth_login:${clientIp}:${normalizedUsername}`;
    const rateResult = await checkRateLimit(rateLimitKey, RATE_LIMIT_PROFILES.AUTH_LOGIN);

    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: 'Terlalu banyak percobaan login untuk akun ini. Silakan tunggu 15 menit.',
          },
          meta: { retryAfterMs: rateResult.retryAfterMs },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        }
      );
    }

    // 1. Mobile Technician Login (requires deviceId)
    if (validated.deviceId) {
      const result = await AuthService.loginMobile(
        validated.username,
        validated.password,
        validated.deviceId,
        validated.deviceModel,
        validated.appVersion
      );

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // 2. Web Admin Dashboard Login
    const result = await AuthService.loginWeb(validated.username, validated.password);

    const response = NextResponse.json({
      success: true,
      data: {
        accessToken: result.token,
        user: result.user,
      },
    });

    // Set secure HttpOnly cookie for web admin session
    response.cookies.set('fiberops_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (error: unknown) {
    const err = error as Error & { name?: string; errors?: Array<{ message: string }> };
    const isValidation = err.name === 'ZodError';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isValidation ? ERROR_CODES.VALIDATION_ERROR : ERROR_CODES.UNAUTHORIZED,
          message: isValidation ? err.errors?.[0]?.message : err.message,
          details: err.errors,
        },
      },
      { status: isValidation ? 400 : 401 }
    );
  }
}
