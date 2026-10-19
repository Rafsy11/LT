import { NextRequest, NextResponse } from 'next/server';
import { SystemService } from '@/services/system.service';
import { UserSessionContext, UserTypeEnum } from '@repo/shared';

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

export async function POST(request: NextRequest) {
  try {
    const actor = getActorContext(request);
    const snapshot = await SystemService.triggerBackupSnapshot(actor);

    return NextResponse.json({
      success: true,
      data: snapshot,
      meta: { triggeredBy: actor.username },
    });
  } catch (error: any) {
    const status = error.code === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code || 'BACKUP_TRIGGER_ERROR',
          message: error.message || 'Gagal mengeksekusi backup snapshot',
        },
      },
      { status }
    );
  }
}
