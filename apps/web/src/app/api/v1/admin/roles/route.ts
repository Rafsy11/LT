import { NextRequest, NextResponse } from 'next/server';
import { RoleService } from '@/services/role.service';
import {
  createRoleSchema,
  updateRolePermissionsSchema,
  UserSessionContext,
  UserTypeEnum,
  ERROR_CODES,
} from '@repo/shared';

function getActorContext(request: NextRequest): UserSessionContext {
  const userId = request.headers.get('x-user-id') || 'superadmin';
  const username = request.headers.get('x-username') || 'superadmin';
  const role = request.headers.get('x-user-role') || 'Super Admin';
  const userType = (request.headers.get('x-user-type') || 'SUPER_ADMIN') as UserTypeEnum;
  const hierarchyLevel = parseInt(request.headers.get('x-hierarchy-level') || '100', 10);

  return {
    userId,
    username,
    fullName: username,
    role,
    userType,
    hierarchyLevel,
    assignedClusters: [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = getActorContext(request);
    const roles = await RoleService.listRoles(actor.hierarchyLevel);

    return NextResponse.json({
      success: true,
      data: roles,
      meta: { count: roles.length },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ROLES_FETCH_ERROR',
          message: error.message || 'Gagal mengambil data peran',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = getActorContext(request);
    const body = await request.json();
    const validated = createRoleSchema.parse(body);

    const newRole = await RoleService.createRole(actor, validated);

    return NextResponse.json(
      {
        success: true,
        data: newRole,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isValidation = error.name === 'ZodError';
    const isHierarchy = error.message?.includes(ERROR_CODES.HIERARCHY_VIOLATION);
    const isForbidden = error.message?.includes(ERROR_CODES.FORBIDDEN);

    let status = 500;
    if (isValidation) status = 400;
    else if (isHierarchy || isForbidden) status = 403;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isHierarchy
            ? ERROR_CODES.HIERARCHY_VIOLATION
            : isForbidden
              ? ERROR_CODES.FORBIDDEN
              : isValidation
                ? ERROR_CODES.VALIDATION_ERROR
                : ERROR_CODES.INTERNAL_ERROR,
          message: isValidation ? error.errors[0]?.message : error.message,
          details: error.errors,
        },
      },
      { status }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = getActorContext(request);
    const body = await request.json();

    // 1. If payload contains targetUserId and newRoleId -> reassign user role
    if (body.targetUserId && body.newRoleId) {
      const updatedUser = await RoleService.updateUserRole(
        actor,
        body.targetUserId,
        body.newRoleId
      );
      return NextResponse.json({
        success: true,
        data: updatedUser,
      });
    }

    // 2. Otherwise update role permissions
    const { roleId, permissions } = body;
    if (!roleId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'roleId wajib disertakan.',
          },
        },
        { status: 400 }
      );
    }

    const validated = updateRolePermissionsSchema.parse({ permissions });
    const updatedRole = await RoleService.updateRolePermissions(
      actor,
      roleId,
      validated.permissions
    );

    return NextResponse.json({
      success: true,
      data: updatedRole,
    });
  } catch (error: any) {
    const isHierarchy = error.message?.includes(ERROR_CODES.HIERARCHY_VIOLATION);
    const isForbidden = error.message?.includes(ERROR_CODES.FORBIDDEN);

    let status = 500;
    if (error.name === 'ZodError') status = 400;
    else if (isHierarchy || isForbidden) status = 403;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isHierarchy
            ? ERROR_CODES.HIERARCHY_VIOLATION
            : isForbidden
              ? ERROR_CODES.FORBIDDEN
              : error.name === 'ZodError'
                ? ERROR_CODES.VALIDATION_ERROR
                : ERROR_CODES.INTERNAL_ERROR,
          message: error.errors ? error.errors[0]?.message : error.message,
        },
      },
      { status }
    );
  }
}
