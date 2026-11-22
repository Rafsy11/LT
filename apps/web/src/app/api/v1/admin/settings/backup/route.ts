import { NextRequest, NextResponse } from 'next/server';
import { SystemService } from '@/server/services/system.service';
import {
  AuthHttpError,
  requireAdminActor,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request);
    if (actor.userType !== 'SUPER_ADMIN' || actor.hierarchyLevel < 100) {
      throw new AuthHttpError(
        403,
        ERROR_CODES.FORBIDDEN,
        'Hanya Super Admin yang berwenang memicu backup snapshot sistem.',
      );
    }
    const snapshot = await SystemService.triggerBackupSnapshot(actor);

    return NextResponse.json({
      success: true,
      data: snapshot,
      meta: { triggeredBy: actor.username },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'BACKUP_TRIGGER_ERROR',
      'Gagal mengeksekusi backup snapshot',
    );
  }
}
