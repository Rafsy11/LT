import { NextRequest, NextResponse } from 'next/server';
import { SystemService } from '@/services/system.service';
import {
  SystemSettingsSchema,
  UserSessionContext,
  UserTypeEnum,
} from '@repo/shared';

function getActorContext(request: NextRequest): UserSessionContext {
  const userId = request.headers.get('x-user-id') || 'usr-admin-01';
  const username = request.headers.get('x-username') || 'aditya.saputra';
  const role = request.headers.get('x-user-role') || 'Super Admin';
  const userType = (request.headers.get('x-user-type') || 'SUPER_ADMIN') as UserTypeEnum;
  const hierarchyLevel = parseInt(request.headers.get('x-hierarchy-level') || '100', 10);

  return {
    userId,
    username,
    fullName: 'Aditya Saputra',
    role,
    userType,
    hierarchyLevel,
    assignedClusters: [],
  };
}

export async function GET() {
  try {
    const data = await SystemService.getSystemSettings();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SETTINGS_FETCH_ERROR',
          message: error.message || 'Gagal memuat konfigurasi sistem',
        },
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = getActorContext(request);
    const body = await request.json();
    const validated = SystemSettingsSchema.parse(body);

    const updated = await SystemService.updateSettings(actor, validated);
    return NextResponse.json({
      success: true,
      data: updated,
      meta: { updatedBy: actor.username },
    });
  } catch (error: any) {
    const status = error.code === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code || 'SETTINGS_UPDATE_ERROR',
          message: error.message || 'Gagal memperbarui konfigurasi sistem',
        },
      },
      { status }
    );
  }
}
