import { NextRequest, NextResponse } from 'next/server';
import { RoleService } from '@/server/services/role.service';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';
import {
  createRoleSchema,
  patchRolesSchema,
  ERROR_CODES,
  PERMISSIONS,
} from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, [PERMISSIONS.ROLE_READ, PERMISSIONS.ROLE_EDIT]);
    const roles = await RoleService.listRoles(actor.hierarchyLevel);

    return NextResponse.json({
      success: true,
      data: roles,
      meta: { count: roles.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'ROLES_FETCH_ERROR', 'Gagal mengambil data peran');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.ROLE_EDIT);
    const body: unknown = await request.json();
    const validated = createRoleSchema.parse(body);

    const newRole = await RoleService.createRole(actor, validated);

    return NextResponse.json(
      {
        success: true,
        data: newRole,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleAdminRouteError(error, ERROR_CODES.INTERNAL_ERROR, 'Gagal membuat peran baru');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.ROLE_EDIT);
    const body: unknown = await request.json();
    const validated = patchRolesSchema.parse(body);

    if ('targetUserId' in validated) {
      const updatedUser = await RoleService.updateUserRole(
        actor,
        validated.targetUserId,
        validated.newRoleId,
      );
      return NextResponse.json({
        success: true,
        data: updatedUser,
      });
    }

    const updatedRole = await RoleService.updateRolePermissions(
      actor,
      validated.roleId,
      validated.permissions,
    );

    return NextResponse.json({
      success: true,
      data: updatedRole,
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      ERROR_CODES.INTERNAL_ERROR,
      'Gagal memperbarui izin atau peran',
    );
  }
}
