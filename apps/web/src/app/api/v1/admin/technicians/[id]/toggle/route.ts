import { NextRequest, NextResponse } from 'next/server';
import { TechnicianService } from '@/server/services/technician.service';
import { RoleService } from '@/server/services/role.service';
import {
  requireAdminActor,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { HIERARCHY_LEVELS, PERMISSIONS } from '@repo/shared';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.TECH_MANAGE);
    RoleService.checkHierarchyProtection(actor.hierarchyLevel, HIERARCHY_LEVELS.TECHNICIAN);

    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      isActive?: boolean;
      reason?: string;
    };

    const updated = await TechnicianService.toggleTechnicianStatus(
      id,
      typeof body.isActive === 'boolean' ? body.isActive : undefined,
      typeof body.reason === 'string' ? body.reason : undefined,
      actor.userId,
      actor,
    );

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Akun teknisi ${updated.fullName} berhasil ${updated.isActive ? 'diaktifkan' : 'dinonaktifkan (sesi dicabut)'}`,
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'TECH_TOGGLE_ERROR', 'Gagal mengubah status teknisi');
  }
}
