import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { resendOtpRequestSchema, ERROR_CODES } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = resendOtpRequestSchema.parse(rawBody);

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitKey = `auth_otp_resend:${clientIp}`;
    const rateResult = await checkRateLimit(rateLimitKey, RATE_LIMIT_PROFILES.AUTH_OTP_RESEND);

    if (!rateResult.allowed) {
      const retrySeconds = Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Terlalu banyak permintaan pengiriman ulang OTP. Silakan tunggu sejenak.',
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

    const result = await AuthService.resendWebOtp(validated.preAuthToken, clientIp);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error as Error & {
      name?: string;
      code?: string;
      statusCode?: number;
      retryAfter?: number;
      errors?: Array<{ message: string }>;
    };
    const isValidation = err.name === 'ZodError';
    const statusCode = isValidation ? 400 : err.statusCode || 401;
    const errorCode = isValidation
      ? ERROR_CODES.VALIDATION_ERROR
      : err.code || ERROR_CODES.OTP_EXPIRED;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: errorCode,
          message: isValidation
            ? err.errors?.[0]?.message || 'Permintaan kirim ulang OTP tidak valid.'
            : err.message || 'Gagal mengirim ulang kode OTP.',
          retryAfter: err.retryAfter,
          details: err.errors,
        },
      },
      { status: statusCode },
    );
  }
}

