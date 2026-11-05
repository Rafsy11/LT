import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { redisManager } from '@/server/lib/redis';
import { logoutRequestSchema } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const validated = logoutRequestSchema.parse(body);

    const deviceId = validated.deviceId || request.headers.get('x-device-id');

    // 1. Invalidate device session in Redis & Postgres if mobile
    if (deviceId) {
      await redisManager.blacklistSession(deviceId).catch(() => {});
      await prisma.userSession
        .updateMany({
          where: {
            deviceId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        })
        .catch(() => {});
    }

    // 2. Clear cookie for web sessions (HttpOnly, Secure, SameSite=Strict, Max-Age=0, Path=/)
    const response = NextResponse.json({
      success: true,
      data: {
        message: 'Sesi berhasil diakhiri.',
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set('fiberops_session', '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });
    response.cookies.set('session', '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'LOGOUT_ERROR',
          message: (error as Error).message || 'Gagal melakukan logout',
        },
      },
      { status: 500 },
    );
  }
}
