import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
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

    const preAuth = await AuthService.verifyPreAuthToken(validated.preAuthToken);

    // Mobile 2FA OTP verification: binds UserSession + issues Bearer accessToken & refreshToken
    // without overwriting the Web Admin Dashboard HttpOnly session cookie.
    if (preAuth.channel === 'mobile' || Boolean(validated.deviceId)) {
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
    return sanitizeAndLogServerError(error, {
      route: 'POST /api/v1/auth/verify-otp',
      defaultCode: ERROR_CODES.OTP_INVALID,
    });
  }
}

