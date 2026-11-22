import { NextRequest, NextResponse } from 'next/server';
import { SystemService } from '@/server/services/system.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
import {
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_PROFILES,
} from '@/server/lib/rate-limit';
import {
  CURRENT_MOBILE_APP_VERSION,
  ERROR_CODES,
  MIN_MOBILE_APP_VERSION,
} from '@repo/shared';

export async function GET(): Promise<NextResponse>;
export async function GET(request: NextRequest): Promise<NextResponse>;
export async function GET(request?: NextRequest): Promise<NextResponse> {
  try {
    if (request) {
      const clientIp = extractClientIp(request);
      const rateResult = await checkRateLimit(
        `ota_manifest:${clientIp}`,
        RATE_LIMIT_PROFILES.OTA_MANIFEST,
      );
      if (!rateResult.allowed) {
        const retrySeconds = Math.max(1, Math.ceil(rateResult.retryAfterMs / 1000));
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
              message: 'Terlalu banyak permintaan manifes OTA. Silakan coba kembali.',
              retryAfter: retrySeconds,
            },
          },
          {
            status: 429,
            headers: { 'Retry-After': String(retrySeconds) },
          },
        );
      }
    }

    const settings = await SystemService.getOtaManifestSettings();

    return NextResponse.json(
      {
        success: true,
        data: {
          runtimeVersion: CURRENT_MOBILE_APP_VERSION,
          minRequiredVersion: settings.minAppVersion || MIN_MOBILE_APP_VERSION,
          apkDownloadUrl: settings.apkDownloadUrl,
          otaUpdateUrl: settings.otaUpdateUrl,
          publishedAt: new Date().toISOString(),
          channel: 'production-on-premise',
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error: unknown) {
    return sanitizeAndLogServerError(error, {
      route: 'GET /api/v1/ota/manifest',
    });
  }
}

