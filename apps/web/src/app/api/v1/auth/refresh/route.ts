import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
import {
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_PROFILES,
} from '@/server/lib/rate-limit';
import { refreshTokenRequestSchema, ERROR_CODES } from '@repo/shared';
import { env } from '@/env';

export async function POST(request: NextRequest) {
  try {
    const clientIp = extractClientIp(request);
    const rateResult = await checkRateLimit(
      `auth_refresh:${clientIp}`,
      RATE_LIMIT_PROFILES.AUTH_REFRESH,
    );
    if (!rateResult.allowed) {
      const retrySeconds = Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Terlalu banyak permintaan pembaruan sesi. Silakan tunggu beberapa saat.',
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

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const cookieRefreshToken = request.cookies.get('fiberops_refresh')?.value?.trim();

    if (
      cookieRefreshToken &&
      !rawBody?.refreshToken &&
      !rawBody?.deviceId
    ) {
      const rotated = await AuthService.refreshWebSession(cookieRefreshToken);
      const response = NextResponse.json({
        success: true,
        data: { refreshed: true },
      });

      const isProd = process.env.NODE_ENV === 'production';
      response.cookies.set('fiberops_session', rotated.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'strict' : 'lax',
        path: '/',
        maxAge: env.SESSION_EXPIRY_SECONDS,
      });
      response.cookies.set('fiberops_refresh', rotated.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'strict' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      return response;
    }

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
