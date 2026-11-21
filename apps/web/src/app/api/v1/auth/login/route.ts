import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
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

    // 1. Mobile Technician Login (Step 1: Password Verification + Telegram 2FA OTP Dispatch)
    if (validated.deviceId) {
      const result = await AuthService.loginMobile(
        validated.username,
        validated.password,
        validated.deviceId,
        validated.deviceModel,
        validated.appVersion,
        clientIp,
      );

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // 2. Web Admin Dashboard Login (Step 1: Password Verification + Telegram 2FA OTP Dispatch)
    const result = await AuthService.loginWeb(validated.username, validated.password, clientIp);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    return sanitizeAndLogServerError(error, {
      route: 'POST /api/v1/auth/login',
      defaultCode: ERROR_CODES.INVALID_CREDENTIALS,
    });
  }
}
