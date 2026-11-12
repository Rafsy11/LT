import { NextResponse } from 'next/server';
import { isDatabaseAvailable, prisma, markDatabaseUnavailable } from '@repo/database';
import { redisManager } from '@/server/lib/redis';

export async function GET() {
  let postgresUp = false;
  if (await isDatabaseAvailable()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      postgresUp = true;
    } catch (err) {
      markDatabaseUnavailable(err);
      postgresUp = false;
    }
  }

  const redisUp = await redisManager.ping();
  const isHealthy = postgresUp && redisUp;
  const criticalFailureInProd = process.env.NODE_ENV === 'production' && !postgresUp;

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'degraded',
      system: 'FiberOps On-Premise',
      checks: {
        postgres: postgresUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'fallback_or_down',
      },
      timestamp: new Date().toISOString(),
    },
    { status: criticalFailureInProd ? 503 : 200 },
  );
}
