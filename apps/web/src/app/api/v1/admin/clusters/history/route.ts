import { NextRequest, NextResponse } from 'next/server';
import { NetworkService } from '@/server/services/network.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { PERMISSIONS } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_READ);
    const cluster = request.nextUrl.searchParams.get('cluster') || 'Semua cluster';
    const splitterCode = request.nextUrl.searchParams.get('splitter') || undefined;

    const rawLogs = await NetworkService.getOdpHistoryLogs(cluster, splitterCode);
    const clusterOptions = await NetworkService.listClusterOptions();
    const splitterClusterMap = new Map<string, { clusterCode: string; name: string }>();
    const splitters = await NetworkService.listClusters();
    for (const s of splitters) {
      splitterClusterMap.set(s.splitterCode, { clusterCode: s.clusterCode, name: s.name });
    }

    const logs = rawLogs.filter((entry) => {
      const meta = splitterClusterMap.get(entry.splitterCode);
      if (!meta) return actor.hierarchyLevel >= 100 || clusterOptions.length > 0;
      return matchesAssignedClusters(actor, meta.clusterCode, meta.name);
    });

    return NextResponse.json({
      success: true,
      data: logs,
      meta: { count: logs.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'ODP_HISTORY_ERROR', 'Gagal memuat histori ODP');
  }
}

