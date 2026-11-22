import { NextRequest, NextResponse } from 'next/server';
import { SystemService } from '@/server/services/system.service';
import {
  AuthHttpError,
  requireAdminActor,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { ERROR_CODES, SystemSettingsSchema } from '@repo/shared';

function assertSuperAdmin(actor: { userType: string; hierarchyLevel: number }): void {
  if (actor.userType !== 'SUPER_ADMIN' || actor.hierarchyLevel < 100) {
    throw new AuthHttpError(
      403,
      ERROR_CODES.FORBIDDEN,
      'Hanya Super Admin yang berwenang mengakses atau mengubah pengaturan sistem.',
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request);
    assertSuperAdmin(actor);
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
    assertSuperAdmin(actor);
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
    );
  }
}
