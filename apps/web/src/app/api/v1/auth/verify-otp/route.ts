import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { verifyOtpRequestSchema, ERROR_CODES } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = verifyOtpRequestSchema.parse(rawBody);

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitKey = `auth_otp_verify:${clientIp}`;
    const rateResult = await checkRateLimit(rateLimitKey, RATE_LIMIT_PROFILES.AUTH_OTP_VERIFY);

    if (!rateResult.allowed) {
      const retrySeconds = Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message:
              'Terlalu banyak percobaan verifikasi OTP. Silakan tunggu beberapa saat sebelum mencoba lagi.',
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

    const result = await AuthService.verifyWebOtp(
      validated.preAuthToken,
      validated.otpCode,
      clientIp,
    );

    const response = NextResponse.json({
      success: true,
      data: {
        accessToken: result.token,
        user: result.user,
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set('fiberops_session', result.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });

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
      : err.code || ERROR_CODES.OTP_INVALID;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: errorCode,
          message: isValidation
            ? err.errors?.[0]?.message || 'Format kode OTP harus berupa 6 digit angka.'
            : err.message || 'Kode OTP tidak valid atau telah kedaluwarsa.',
          details: err.errors,
        },
      },
      { status: statusCode },
    );
  }
}

