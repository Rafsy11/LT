import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { redisManager } from '@/lib/redis';
import { logoutRequestSchema } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const validated = logoutRequestSchema.parse(body);

    const deviceId = validated.deviceId || request.headers.get('x-device-id');
    const userId = request.headers.get('x-user-id');

    // 1. Invalidate device session in Redis & Postgres if mobile
    if (deviceId) {
      await redisManager.blacklistSession(deviceId);
      await prisma.userSession.updateMany({
        where: {
          deviceId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    // 2. Clear cookie for web sessions
    const response = NextResponse.json({
      success: true,
      data: {
        message: 'Sesi berhasil diakhiri.',
      },
    });

    response.cookies.delete('fiberops_session');
    response.cookies.delete('session');

    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'LOGOUT_ERROR',
          message: error.message || 'Gagal melakukan logout',
        },
      },
      { status: 500 }
    );
  }
}
