import { NextRequest, NextResponse } from 'next/server';
import { RoleService } from '@/server/services/role.service';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';
import { createUserSchema, PERMISSIONS } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, [PERMISSIONS.ROLE_EDIT, PERMISSIONS.TECH_MANAGE]);
    const users = await RoleService.listUsers(actor);

    return NextResponse.json({
      success: true,
      data: users,
      meta: { count: users.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'USER_LIST_ERROR', 'Gagal memuat daftar pengguna');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.ROLE_EDIT);
    const body: unknown = await request.json();
    const validated = createUserSchema.parse(body);

    const created = await RoleService.createUser(actor, validated);
    return NextResponse.json(
      {
        success: true,
        data: created,
        meta: { createdBy: actor.username },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'USER_CREATE_ERROR', 'Gagal membuat akun pengguna', 400);
  }
}

