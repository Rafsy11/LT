import { NextRequest, NextResponse } from 'next/server';
import { RoleService } from '@/server/services/role.service';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';
import { updateUserSchema, PERMISSIONS } from '@repo/shared';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.ROLE_EDIT);
    const { id } = await context.params;
    const body: unknown = await request.json();
    const validated = updateUserSchema.parse(body);

    const updated = await RoleService.updateUser(actor, id, validated);
    return NextResponse.json({
      success: true,
      data: updated,
      meta: { updatedBy: actor.username },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'USER_UPDATE_ERROR',
      'Gagal memperbarui data pengguna',
      400,
    );
  }
}

