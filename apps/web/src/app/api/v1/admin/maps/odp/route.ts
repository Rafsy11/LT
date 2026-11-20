import { NextRequest, NextResponse } from 'next/server';
import { NetworkService } from '@/server/services/network.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { PERMISSIONS, STANDARD_ERROR_MESSAGES, type OdpRadarSummary } from '@repo/shared';

/**
 * Returns aggregated ODP datek points with radar health classification (Normal <= 28 dB vs Abnormal > 28 dB)
 * scoped to the authenticated operator's assigned clusters.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_READ);
    const cluster = request.nextUrl.searchParams.get('cluster') || 'Semua cluster';
    const search = request.nextUrl.searchParams.get('search') || '';

    const rawItems = await NetworkService.listOdpRadarMap(search, cluster);
    const items = rawItems.filter((item) =>
      matchesAssignedClusters(actor, item.clusterCode, item.clusterName),
    );

    const summary: OdpRadarSummary = {
      totalOdps: items.length,
      normalCount: items.filter((i) => i.radarStatus === 'NORMAL').length,
      abnormalCount: items.filter((i) => i.radarStatus === 'ABNORMAL').length,
      unmeasuredCount: items.filter((i) => i.radarStatus === 'UNMEASURED').length,
      badAttenuationCustomers: items.reduce((sum, i) => sum + i.badPortCount, 0),
      mappedCustomers: items.reduce((sum, i) => sum + i.customers.length, 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        items,
        summary,
      },
      meta: { count: items.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'ODP_MAP_ERROR',
      STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
    );
  }
}
