import { NextRequest, NextResponse } from 'next/server';
import { NetworkService } from '@/server/services/network.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import {
  createClusterSchema,
  createSplitterSchema,
  updateSplitterSchema,
  ERROR_CODES,
  PERMISSIONS,
} from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_READ);
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const cluster = searchParams.get('cluster') || 'Semua cluster';

    const { clusters: rawClusters } = await NetworkService.getClustersWithStats(search, cluster);
    const clusters = rawClusters.filter((c) =>
      matchesAssignedClusters(actor, c.clusterCode, c.name),
    );
    const stats = NetworkService.computeStatsFromClusters(clusters);

    return NextResponse.json({
      success: true,
      data: {
        clusters,
        stats,
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'CLUSTER_FETCH_ERROR', 'Gagal memuat data cluster');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_UPDATE);
    const rawBody = (await request.json()) as Record<string, unknown>;
    const entityType = rawBody.entityType === 'CLUSTER' ? 'CLUSTER' : 'SPLITTER';

    if (entityType === 'CLUSTER') {
      const validated = createClusterSchema.parse(rawBody);
      if (!matchesAssignedClusters(actor, validated.clusterCode, validated.name)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Hanya Super Admin atau operator cluster terkait yang dapat menambah wilayah.',
            },
          },
          { status: 403 },
        );
      }
      const created = await NetworkService.createCluster(validated, actor);
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    }

    const validated = createSplitterSchema.parse(rawBody);
    if (!matchesAssignedClusters(actor, validated.clusterCode)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: `Cluster "${validated.clusterCode}" di luar wilayah cakupan Anda.`,
          },
        },
        { status: 403 },
      );
    }

    const created = await NetworkService.createSplitter(validated, actor);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'NETWORK_CREATE_ERROR',
      'Gagal menambahkan master data jaringan',
      400,
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_UPDATE);
    const rawBody: unknown = await request.json();
    const validated = updateSplitterSchema.parse(rawBody);

    const existing = await NetworkService.getSplitterDetail(validated.splitterCode);
    if (!matchesAssignedClusters(actor, existing.clusterCode, existing.name)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: `ODP "${validated.splitterCode}" berada di luar cakupan wilayah Anda.`,
          },
        },
        { status: 403 },
      );
    }

    const updated = await NetworkService.updateSplitter(validated, actor);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'NETWORK_UPDATE_ERROR',
      'Gagal memperbarui data ODP splitter',
      400,
    );
  }
}
