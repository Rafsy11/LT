import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { resolveTechActor, handleTechRouteError } from '@/server/lib/tech-auth';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';
import { ERROR_CODES, STANDARD_ERROR_MESSAGES, techErrorLogSchema } from '@repo/shared';

function redactSensitiveTokens(value: string): string {
  return value
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(token|password|secret|authorization|api[_-]?key)\s*[:=]\s*(['"]?)[^\s,'";\]]+\2/gi,
      '$1=[REDACTED]',
    );
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveTechActor(request);

    const rateResult = await checkRateLimit(
      `tech_error_logs:${actor.userId}`,
      RATE_LIMIT_PROFILES.TECH_ERROR_LOGS,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: 'Terlalu banyak laporan error. Silakan tunggu 60 detik.',
          },
          meta: { retryAfterMs: rateResult.retryAfterMs },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        },
      );
    }

    const rawBody: unknown = await request.json();
    const parsed = techErrorLogSchema.parse(rawBody);

    const rawMessage = parsed.errorMessage || parsed.message || '';
    const rawStack = parsed.stackTrace ?? parsed.stack ?? null;
    const rawAppVersion = parsed.appVersion ?? request.headers.get('x-app-version') ?? null;
    const rawDeviceInfo = parsed.deviceInfo ?? actor.deviceId ?? null;

    const userId = actor.userId;
    const errorMessage = redactSensitiveTokens(rawMessage).slice(0, 1000);
    const stackTrace = rawStack ? redactSensitiveTokens(rawStack).slice(0, 4000) : null;
    const appVersion = rawAppVersion ? redactSensitiveTokens(rawAppVersion).slice(0, 64) : null;
    const deviceInfo = rawDeviceInfo ? redactSensitiveTokens(rawDeviceInfo).slice(0, 200) : null;

    if (await isDatabaseAvailable()) {
      try {
        const logEntry = await prisma.clientErrorLog.create({
          data: {
            userId,
            appVersion,
            deviceInfo,
            errorMessage,
            stackTrace,
          },
        });

        return NextResponse.json({
          success: true,
          data: {
            id: logEntry.id,
            loggedAt: logEntry.createdAt,
          },
        });
      } catch (err) {
        console.error('[POST /api/v1/tech/error-logs] DB insert failed:', err);
        markDatabaseUnavailable(err);
      }
    }

    console.warn('[ClientErrorLog] Offline DB fallback log:', {
      userId,
      appVersion,
      deviceInfo,
      errorMessage: errorMessage.slice(0, 200),
    });

    return NextResponse.json({
      success: true,
      data: {
        id: `offline-err-${Date.now()}`,
        loggedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    return handleTechRouteError(
      error,
      ERROR_CODES.INTERNAL_ERROR,
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      500,
    );
  }
}
