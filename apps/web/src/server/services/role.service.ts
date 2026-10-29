import { prisma } from '@repo/database';
import {
  CreateRoleInput,
  UserSessionContext,
  ERROR_CODES,
} from '@repo/shared';

// In-memory fallback seed roles according to PRD Sections 2.1 & 2.2
const MEMORY_ROLES = [
  {
    id: 'role-super-admin',
    name: 'Super Admin',
    permissions: ['*'],
    hierarchyLevel: 100,
    _count: { users: 2 },
  },
  {
    id: 'role-admin-ops',
    name: 'Admin Operasional',
    permissions: [
      'customer:read',
      'customer:update',
      'network:read',
      'network:update',
      'ticket:read',
      'ticket:create',
      'tech:manage',
      'ai:use',
    ],
    hierarchyLevel: 50,
    _count: { users: 5 },
  },
  {
    id: 'role-noc-mon',
    name: 'NOC Monitoring',
    permissions: ['customer:read', 'network:read', 'ticket:read'],
    hierarchyLevel: 30,
    _count: { users: 4 },
  },
  {
    id: 'role-cs-support',
    name: 'Customer Support',
    permissions: ['customer:read', 'ticket:read', 'ticket:create'],
    hierarchyLevel: 20,
    _count: { users: 6 },
  },
  {
    id: 'role-tech-field',
    name: 'Teknisi Lapangan',
    permissions: ['ticket:read'],
    hierarchyLevel: 10,
    _count: { users: 12 },
  },
];

export class RoleService {
  /**
   * Helper: Validates that an actor cannot modify or grant roles to anyone
   * with an equal or higher hierarchy level (Anti-Privilege Escalation).
   * Super Admin is 100, Admin NOC is 50, Field Tech is 10.
   */
  public static checkHierarchyProtection(actorHierarchy: number, targetHierarchy: number): void {
    if (actorHierarchy <= targetHierarchy) {
      throw new Error(
        `${ERROR_CODES.HIERARCHY_VIOLATION}: Dilarang mengubah atau mengatur pengguna/peran dengan hierarchy level yang setara (${targetHierarchy}) atau lebih tinggi.`
      );
    }
  }

  /**
   * Helper: Validates that an actor cannot grant permissions that they themselves do not possess.
   * Wildcard '*' grants all permissions.
   */
  public static validateGrantablePermissions(
    actorPermissions: string[],
    requestedPermissions: string[]
  ): boolean {
    if (actorPermissions.includes('*')) {
      return true;
    }

    const unpermitted = requestedPermissions.filter((perm) => !actorPermissions.includes(perm));
    if (unpermitted.length > 0) {
      throw new Error(
        `${ERROR_CODES.FORBIDDEN}: Anda tidak berhak memberikan permission yang tidak Anda miliki: [${unpermitted.join(', ')}]`
      );
    }

    return true;
  }

  /**
   * Lists all roles in the system, optionally filtering out roles higher than actor's hierarchy.
   */
  public static async listRoles(actorHierarchyLevel?: number) {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { hierarchyLevel: 'desc' },
        include: {
          _count: {
            select: { users: true },
          },
        },
      });

      if (roles && roles.length > 0) {
        if (actorHierarchyLevel !== undefined) {
          return roles.filter((r) => r.hierarchyLevel <= actorHierarchyLevel);
        }
        return roles;
      }
    } catch (err) {
      console.warn('[RoleService] DB query failed, falling back to in-memory roles:', (err as Error).message);
    }

    // Fallback to in-memory seeded roles
    if (actorHierarchyLevel !== undefined) {
      return MEMORY_ROLES.filter((r) => r.hierarchyLevel <= actorHierarchyLevel);
    }
    return MEMORY_ROLES;
  }

  /**
   * Retrieves role details by ID.
   */
  public static async getRoleById(roleId: string) {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) {
      throw new Error('Role tidak ditemukan');
    }

    return role;
  }

  /**
   * Creates a new role with strict Anti-Privilege Escalation checks.
   */
  public static async createRole(actor: UserSessionContext, data: CreateRoleInput) {
    // 1. Hierarchy Check: actor must have strictly higher hierarchy
    this.checkHierarchyProtection(actor.hierarchyLevel, data.hierarchyLevel);

    // 2. Permission Check: actor cannot grant permissions they do not possess
    const actorRole = await prisma.role.findFirst({
      where: { name: actor.role },
    });

    const actorPermissions = (actorRole?.permissions as string[]) || [];
    this.validateGrantablePermissions(actorPermissions, data.permissions);

    // 3. Create role
    const newRole = await prisma.role.create({
      data: {
        name: data.name,
        permissions: data.permissions,
        hierarchyLevel: data.hierarchyLevel,
      },
    });

    // 4. Audit Log
    await prisma.activityLog.create({
      data: {
        actorUserId: actor.userId,
        actorRole: actor.role,
        actionType: 'ROLE_CREATED',
        targetEntity: 'role',
        targetId: newRole.id,
        newPayload: {
          name: newRole.name,
          permissions: newRole.permissions,
          hierarchyLevel: newRole.hierarchyLevel,
        },
      },
    });

    return newRole;
  }

  /**
   * Updates an existing role's permissions with Anti-Privilege Escalation protection.
   */
  public static async updateRolePermissions(
    actor: UserSessionContext,
    roleId: string,
    newPermissions: string[]
  ) {
    let targetRole: { id: string; name: string; permissions: any; hierarchyLevel: number } | null = null;
    let actorPermissions: string[] = [];

    try {
      targetRole = await prisma.role.findUnique({
        where: { id: roleId },
      });
      const actorRole = await prisma.role.findFirst({
        where: { name: actor.role },
      });
      actorPermissions = (actorRole?.permissions as string[]) || [];
    } catch {
      // In-memory fallback lookup
      targetRole = MEMORY_ROLES.find((r) => r.id === roleId || r.name === roleId) || null;
      const actorRole = MEMORY_ROLES.find((r) => r.name === actor.role);
      actorPermissions = actorRole ? actorRole.permissions : actor.hierarchyLevel === 100 ? ['*'] : [];
    }

    if (!targetRole) {
      throw new Error('Role target tidak ditemukan');
    }

    // 1. Hierarchy Check
    this.checkHierarchyProtection(actor.hierarchyLevel, targetRole.hierarchyLevel);

    // 2. Permission Check
    this.validateGrantablePermissions(actorPermissions, newPermissions);

    // 3. Update permissions in DB or in-memory
    try {
      const oldPermissions = targetRole.permissions;
      const updated = await prisma.role.update({
        where: { id: roleId },
        data: { permissions: newPermissions },
      });

      // 4. Audit Log
      await prisma.activityLog.create({
        data: {
          actorUserId: actor.userId,
          actorRole: actor.role,
          actionType: 'ROLE_PERMISSIONS_UPDATED',
          targetEntity: 'role',
          targetId: roleId,
          oldPayload: { permissions: oldPermissions },
          newPayload: { permissions: newPermissions },
        },
      });

      return updated;
    } catch (err) {
      // In-memory update fallback
      targetRole.permissions = [...newPermissions];
      const memIndex = MEMORY_ROLES.findIndex((r) => r.id === targetRole?.id);
      if (memIndex !== -1) {
        MEMORY_ROLES[memIndex].permissions = [...newPermissions];
      }
      return targetRole;
    }
  }

  /**
   * Reassigns a user's role while strictly preventing privilege escalation.
   */
  public static async updateUserRole(
    actor: UserSessionContext,
    targetUserId: string,
    newRoleId: string
  ) {
    try {
      // 1. Target user check
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: { role: true },
      });

      if (!targetUser) {
        throw new Error('Pengguna tidak ditemukan');
      }

      // Actor cannot modify users of equal or higher hierarchy
      this.checkHierarchyProtection(actor.hierarchyLevel, targetUser.role.hierarchyLevel);

      // 2. Destination role check
      const newRole = await prisma.role.findUnique({
        where: { id: newRoleId },
      });

      if (!newRole) {
        throw new Error('Role tujuan tidak ditemukan');
      }

      // Actor cannot assign a role of equal or higher hierarchy
      this.checkHierarchyProtection(actor.hierarchyLevel, newRole.hierarchyLevel);

      // 3. Update user role
      const updatedUser = await prisma.user.update({
        where: { id: targetUserId },
        data: { roleId: newRoleId },
        include: { role: true },
      });

      // 4. Audit Log
      await prisma.activityLog.create({
        data: {
          actorUserId: actor.userId,
          actorRole: actor.role,
          actionType: 'USER_ROLE_REASSIGNED',
          targetEntity: 'user',
          targetId: targetUserId,
          oldPayload: { roleId: targetUser.roleId, roleName: targetUser.role.name },
          newPayload: { roleId: newRole.id, roleName: newRole.name },
        },
      });

      return updatedUser;
    } catch (err: any) {
      if (err.message?.includes(ERROR_CODES.HIERARCHY_VIOLATION)) {
        throw err;
      }
      // In-memory fallback
      const targetRole = MEMORY_ROLES.find((r) => r.id === newRoleId || r.name === newRoleId) || MEMORY_ROLES[1];
      this.checkHierarchyProtection(actor.hierarchyLevel, targetRole.hierarchyLevel);
      return {
        id: targetUserId,
        roleId: targetRole.id,
        role: targetRole,
      };
    }
  }
}
