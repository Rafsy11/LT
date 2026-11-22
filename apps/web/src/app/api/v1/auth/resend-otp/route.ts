import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
import { resendOtpRequestSchema, ERROR_CODES } from '@repo/shared';
import {
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_PROFILES,
} from '@/server/lib/rate-limit';

function buildResendLimitResponse(retryAfterMs: number) {
  const retrySeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Terlalu banyak permintaan pengiriman ulang OTP. Silakan tunggu sejenak.',
        retryAfter: retrySeconds,
      },
      meta: { retryAfterMs, retryAfter: retrySeconds },
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retrySeconds) },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = resendOtpRequestSchema.parse(rawBody);

    const clientIp = extractClientIp(request);
    const ipRateResult = await checkRateLimit(
      `auth_otp_resend:${clientIp}`,
      RATE_LIMIT_PROFILES.AUTH_OTP_RESEND,
    );
    if (!ipRateResult.allowed) {
      return buildResendLimitResponse(ipRateResult.retryAfterMs);
    }

    const preAuth = await AuthService.verifyPreAuthToken(validated.preAuthToken);

    const challengeRateResult = await checkRateLimit(
      `auth_otp_resend_ch:${preAuth.challengeId}`,
      RATE_LIMIT_PROFILES.AUTH_OTP_RESEND,
    );
    if (!challengeRateResult.allowed) {
      return buildResendLimitResponse(challengeRateResult.retryAfterMs);
    }

    const userRateResult = await checkRateLimit(`auth_otp_resend_user:${preAuth.userId}`, {
      windowMs: 5 * 60_000,
      maxRequests: 8,
    });
    if (!userRateResult.allowed) {
      return buildResendLimitResponse(userRateResult.retryAfterMs);
    }

    const result = await AuthService.resendWebOtp(validated.preAuthToken, clientIp);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    return sanitizeAndLogServerError(error, {
      route: 'POST /api/v1/auth/resend-otp',
      defaultCode: ERROR_CODES.OTP_EXPIRED,
    });
  }
}

