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
    const actor = await requireAdminActor(request, [
      PERMISSIONS.NETWORK_READ,
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.CUSTOMER_READ,
      PERMISSIONS.TECH_MANAGE,
      PERMISSIONS.ROLE_EDIT,
    ]);
    const rawOptions = await NetworkService.listClusterOptions();
    const options = rawOptions.filter((c) => matchesAssignedClusters(actor, c.clusterCode, c.name));

    return NextResponse.json({
      success: true,
      data: options,
      meta: { count: options.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'CLUSTER_OPTIONS_ERROR', 'Gagal memuat daftar cluster');
  }
}

