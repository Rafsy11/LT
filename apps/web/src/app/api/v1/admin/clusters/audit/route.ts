import { NextRequest, NextResponse } from 'next/server';
import { NetworkService } from '@/server/services/network.service';
import {
  requireAdminActor,
  isGlobalScopeActor,
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

    if (isGlobalScopeActor(actor)) {
      return NextResponse.json({
        success: true,
        data: {
          ...audit,
          findings: scopedFindings,
        },
        meta: { auditedBy: actor.username },
      });
    }

    const allSplitters = await NetworkService.listClusters();
    const scopedSplitters = allSplitters.filter((s) =>
      matchesAssignedClusters(actor, s.clusterCode, s.name),
    );
    const scopedClusterCodes = new Set(scopedSplitters.map((s) => s.clusterCode));

    return NextResponse.json({
      success: true,
      data: {
        auditedAt: audit.auditedAt,
        totalClusters: scopedClusterCodes.size,
        totalSplitters: scopedSplitters.length,
        totalPorts: scopedSplitters.reduce((sum, s) => sum + s.maxPorts, 0),
        usedPorts: scopedSplitters.reduce((sum, s) => sum + s.usedPorts, 0),
        warningSplitters: scopedSplitters.filter(
          (s) => s.maxPorts > 0 && s.usedPorts / s.maxPorts >= 0.75,
        ).length,
        criticalAttenuationCount: scopedFindings.filter(
          (f) => f.category === 'ATTENUATION' && f.severity === 'critical',
        ).length,
        doubleBookedPorts: scopedFindings.filter((f) => f.category === 'DOUBLE_BOOKING').length,
        geofenceAnomalies: scopedFindings.filter((f) => f.category === 'GEOFENCE').length,
        findings: scopedFindings,
      },
      meta: { auditedBy: actor.username },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'NETWORK_AUDIT_ERROR', 'Gagal menjalankan audit jaringan');
  }
}

