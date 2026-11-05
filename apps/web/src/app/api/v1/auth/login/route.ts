import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { loginRequestSchema, ERROR_CODES } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';

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
      const retrySeconds = Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Terlalu banyak percobaan login untuk akun ini. Silakan tunggu beberapa saat.',
            retryAfter: retrySeconds,
          },
          meta: { retryAfterMs: rateResult.retryAfterMs, retryAfter: retrySeconds },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retrySeconds) },
        },
      );
    }

    // 1. Mobile Technician Login (requires deviceId)
    if (validated.deviceId) {
      const result = await AuthService.loginMobile(
        validated.username,
        validated.password,
        validated.deviceId,
        validated.deviceModel,
        validated.appVersion,
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

    if (result.user.userType !== 'TECHNICIAN') {
      const isProd = process.env.NODE_ENV === 'production';
      response.cookies.set('fiberops_session', result.token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'strict' : 'lax',
        path: '/',
        maxAge: 8 * 60 * 60,
      });
    }

    return response;
  } catch (error: unknown) {
    const err = error as Error & {
      name?: string;
      code?: string;
      statusCode?: number;
      errors?: Array<{ message: string }>;
    };
    const isValidation = err.name === 'ZodError';
    const statusCode = isValidation ? 400 : err.statusCode || 401;
    const errorCode = isValidation
      ? ERROR_CODES.VALIDATION_ERROR
      : err.code || (statusCode === 403 ? ERROR_CODES.FORBIDDEN : ERROR_CODES.UNAUTHORIZED);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: errorCode,
          message: isValidation
            ? err.errors?.[0]?.message || 'Format kredensial tidak valid.'
            : err.message || 'Kombinasi username atau kata sandi tidak valid.',
          details: err.errors,
        },
      },
      { status: statusCode },
    );
  }
}
