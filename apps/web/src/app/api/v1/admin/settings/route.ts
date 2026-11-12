import { NextRequest, NextResponse } from 'next/server';
import { SystemService } from '@/server/services/system.service';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';
import { SystemSettingsSchema } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    await requireAdminActor(request);
    const data = await SystemService.getSystemSettings();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'SETTINGS_FETCH_ERROR',
      'Gagal memuat konfigurasi sistem',
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request);
    const body: unknown = await request.json();
    const validated = SystemSettingsSchema.parse(body);

    const updated = await SystemService.updateSettings(actor, validated);
    return NextResponse.json({
      success: true,
      data: updated,
      meta: { updatedBy: actor.username },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'SETTINGS_UPDATE_ERROR',
      'Gagal memperbarui konfigurasi sistem',
      400,
    );
  }
}
