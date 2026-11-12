import { NextRequest, NextResponse } from 'next/server';
import { TechnicianService } from '@/server/services/technician.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { PERMISSIONS } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.TECH_MANAGE,
    ]);
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const cluster = searchParams.get('cluster') || 'Semua cluster';

    const rawTechs = await TechnicianService.listTechnicians(search, cluster);
    const techs = rawTechs.filter((t) => matchesAssignedClusters(actor, t.cluster));

    return NextResponse.json({
      success: true,
      data: techs,
      meta: { count: techs.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'TECH_FETCH_ERROR', 'Gagal memuat daftar teknisi');
  }
}
