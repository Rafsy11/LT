import { NextResponse } from 'next/server';
import { SystemService } from '@/server/services/system.service';
import { CURRENT_MOBILE_APP_VERSION, MIN_MOBILE_APP_VERSION } from '@repo/shared';

export async function GET() {
  const { settings } = await SystemService.getSystemSettings();

  return NextResponse.json({
    success: true,
    data: {
      runtimeVersion: CURRENT_MOBILE_APP_VERSION,
      minRequiredVersion: settings.minAppVersion || MIN_MOBILE_APP_VERSION,
      apkDownloadUrl: settings.apkDownloadUrl,
      otaUpdateUrl: settings.otaUpdateUrl,
      publishedAt: new Date().toISOString(),
      channel: 'production-on-premise',
    },
  });
}

