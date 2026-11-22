import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
import { verifyOtpRequestSchema, ERROR_CODES } from '@repo/shared';
import {
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_PROFILES,
} from '@/server/lib/rate-limit';
import { env } from '@/env';

function buildRateLimitResponse(retryAfterMs: number) {
  const retrySeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message:
          'Terlalu banyak percobaan verifikasi OTP. Silakan tunggu beberapa saat sebelum mencoba lagi.',
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
    const validated = verifyOtpRequestSchema.parse(rawBody);

    const clientIp = extractClientIp(request);
    const ipRateResult = await checkRateLimit(
      `auth_otp_verify:${clientIp}`,
      RATE_LIMIT_PROFILES.AUTH_OTP_VERIFY,
    );
    if (!ipRateResult.allowed) {
      return buildRateLimitResponse(ipRateResult.retryAfterMs);
    }

    const preAuth = await AuthService.verifyPreAuthToken(validated.preAuthToken);

    const challengeRateResult = await checkRateLimit(
      `auth_otp_verify_ch:${preAuth.challengeId}`,
      RATE_LIMIT_PROFILES.AUTH_OTP_VERIFY,
    );
    if (!challengeRateResult.allowed) {
      return buildRateLimitResponse(challengeRateResult.retryAfterMs);
    }

    const userRateResult = await checkRateLimit(`auth_otp_verify_user:${preAuth.userId}`, {
      windowMs: 5 * 60_000,
      maxRequests: 12,
    });
    if (!userRateResult.allowed) {
      return buildRateLimitResponse(userRateResult.retryAfterMs);
    }

    // Mobile 2FA OTP verification: binds UserSession + issues Bearer accessToken & refreshToken
    // without overwriting the Web Admin Dashboard HttpOnly session cookie.
    if (preAuth.channel === 'mobile') {
      const mobileResult = await AuthService.verifyMobileOtp(
        validated.preAuthToken,
        validated.otpCode,
        {
          deviceId: validated.deviceId,
          deviceModel: validated.deviceModel,
          appVersion: validated.appVersion,
          clientIp,
        },
      );

      return NextResponse.json({
        success: true,
        data: mobileResult,
      });
    }

    if (validated.deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Token tantangan web tidak dapat digunakan untuk perangkat mobile.',
          },
        },
        { status: 403 },
      );
    }

    const result = await AuthService.verifyWebOtp(
      validated.preAuthToken,
      validated.otpCode,
      clientIp,
    );

    // Web channel: deliver access & refresh JWTs strictly via HttpOnly cookies (never JSON body)
    const response = NextResponse.json({
      success: true,
      data: {
        user: result.user,
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set('fiberops_session', result.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      maxAge: env.SESSION_EXPIRY_SECONDS,
    });
    response.cookies.set('fiberops_refresh', result.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: unknown) {
    return sanitizeAndLogServerError(error, {
      route: 'POST /api/v1/auth/verify-otp',
      defaultCode: ERROR_CODES.OTP_INVALID,
    });
  }
}

