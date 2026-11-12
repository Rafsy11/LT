import { NextRequest, NextResponse } from 'next/server';
import { TechnicianService } from '@/server/services/technician.service';
import { RoleService } from '@/server/services/role.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { ERROR_CODES, HIERARCHY_LEVELS, PERMISSIONS } from '@repo/shared';

/**
 * POST /api/v1/admin/technicians/[id]/force-logout
 * Instant Session Revocation (PRD Section 2.2 & agent.md Law 4).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.TECH_MANAGE);
    RoleService.checkHierarchyProtection(actor.hierarchyLevel, HIERARCHY_LEVELS.TECHNICIAN);

    const { id } = await params;

    // Verify technician belongs to actor's assigned clusters
    const list = await TechnicianService.listTechnicians('', 'Semua cluster');
    const target = list.find(
      (t) =>
        t.id === id ||
        t.username === id ||
        t.fullName.toLowerCase() === id.toLowerCase(),
    );
    if (target && !matchesAssignedClusters(actor, target.cluster)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: `Akses ditolak: Teknisi pada cluster ${target.cluster} di luar cakupan wilayah Anda.`,
          },
        },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason =
      typeof body?.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : 'Admin Force Logout (Sesi Dicabut)';

    const updated = await TechnicianService.forceLogoutTechnician(id, reason, actor.userId);

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Sesi perangkat mobile untuk teknisi ${updated.fullName} (@${updated.username}) berhasil dicabut seketika (Force Logout).`,
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'FORCE_LOGOUT_ERROR',
      'Gagal mencabut sesi perangkat teknisi',
      400,
    );
  }
}
