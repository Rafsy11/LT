import { NextRequest, NextResponse } from 'next/server';
import { SystemService } from '@/server/services/system.service';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request);
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
