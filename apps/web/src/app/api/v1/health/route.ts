import { NextResponse } from 'next/server';
import { isDatabaseAvailable, prisma, markDatabaseUnavailable } from '@repo/database';
import { redisManager } from '@/server/lib/redis';
import { minioManager } from '@/server/lib/minio';
import { ollamaClient } from '@/server/lib/ollama';
import { isStrictLiveMode } from '@/server/lib/live-data';

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

  const [redisUp, minioUp, ollamaUp] = await Promise.all([
    redisManager.ping(),
    minioManager.isHealthy(),
    ollamaClient.isHealthy(),
  ]);

  const isHealthy = postgresUp && redisUp;
  const criticalFailure = (process.env.NODE_ENV === 'production' || isStrictLiveMode()) && !postgresUp;

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'degraded',
      strictLiveData: isStrictLiveMode(),
      system: 'FiberOps On-Premise',
      checks: {
        postgres: postgresUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
        minio: minioUp ? 'up' : 'down',
        ollama: ollamaUp ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    },
    { status: criticalFailure ? 503 : 200 },
  );
}
