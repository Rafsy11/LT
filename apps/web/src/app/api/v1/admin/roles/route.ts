import { NextRequest, NextResponse } from 'next/server';
import { RoleService } from '@/server/services/role.service';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';
import {
  createRoleSchema,
  updateRolePermissionsSchema,
  ERROR_CODES,
  PERMISSIONS,
} from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request);
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
    const body = (await request.json()) as {
      targetUserId?: string;
      newRoleId?: string;
      roleId?: string;
      permissions?: unknown;
    };

    if (body.targetUserId && body.newRoleId) {
      const updatedUser = await RoleService.updateUserRole(
        actor,
        body.targetUserId,
        body.newRoleId,
      );
      return NextResponse.json({
        success: true,
        data: updatedUser,
      });
    }

    if (!body.roleId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'roleId wajib disertakan.',
          },
        },
        { status: 400 },
      );
    }

    const validated = updateRolePermissionsSchema.parse({ permissions: body.permissions });
    const updatedRole = await RoleService.updateRolePermissions(
      actor,
      body.roleId,
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
