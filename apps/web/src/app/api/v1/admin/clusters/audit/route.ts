import { NextRequest, NextResponse } from 'next/server';
import { NetworkService } from '@/server/services/network.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { PERMISSIONS } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_READ);
    const audit = await NetworkService.runNetworkAudit(actor);
    const scopedFindings = audit.findings.filter((f) =>
      matchesAssignedClusters(actor, f.clusterCode),
    );

    return NextResponse.json({
      success: true,
      data: {
        ...audit,
        findings: scopedFindings,
      },
      meta: { auditedBy: actor.username },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'NETWORK_AUDIT_ERROR', 'Gagal menjalankan audit jaringan');
  }
}

