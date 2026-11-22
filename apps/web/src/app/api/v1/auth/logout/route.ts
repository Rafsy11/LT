import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { redisManager } from '@/server/lib/redis';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
import { ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken =
      request.cookies.get('fiberops_session')?.value ||
      request.cookies.get('session')?.value ||
      null;
    const token = bearerToken || cookieToken;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: 'Sesi otentikasi wajib disertakan untuk logout.',
          },
        },
        { status: 401 },
      );
    }

    const verified = await AuthService.verifyAccessTokenForLogout(token);

    if (verified.jti) {
      const remainingSeconds = verified.exp
        ? Math.max(60, verified.exp - Math.floor(Date.now() / 1000))
        : 28800;
      await redisManager.revokeJwt(verified.jti, remainingSeconds).catch(() => {});
    }

    if (verified.sessionId) {
      await redisManager.blacklistSession(verified.sessionId).catch(() => {});
    }

    const verifiedDeviceId =
      verified.deviceId && verified.deviceId !== 'web-browser' ? verified.deviceId : null;

    if (verifiedDeviceId) {
      await redisManager.blacklistSession(verifiedDeviceId).catch(() => {});
    }

    if (await isDatabaseAvailable()) {
      if (verified.sessionId) {
        await prisma.userSession
          .updateMany({
            where: {
              id: verified.sessionId,
              userId: verified.userId,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          })
          .catch((err) => markDatabaseUnavailable(err));
      } else if (verifiedDeviceId) {
        await prisma.userSession
          .updateMany({
            where: {
              userId: verified.userId,
              deviceId: verifiedDeviceId,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          })
          .catch((err) => markDatabaseUnavailable(err));
      }
    }

    // Clear auth cookies (HttpOnly, Secure in prod, SameSite=Strict, Max-Age=0, Path=/)
    const response = NextResponse.json({
      success: true,
      data: {
        message: 'Sesi berhasil diakhiri.',
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    for (const cookieName of ['fiberops_session', 'session', 'fiberops_refresh']) {
      response.cookies.set(cookieName, '', {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 0,
        path: '/',
      });
    }

    return response;
  } catch (error: unknown) {
    return sanitizeAndLogServerError(error, {
      route: 'POST /api/v1/auth/logout',
      defaultCode: ERROR_CODES.UNAUTHORIZED,
    });
  }
}
