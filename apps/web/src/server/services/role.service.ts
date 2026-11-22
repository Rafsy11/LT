import bcrypt from 'bcryptjs';
import {
  prisma,
  type Prisma,
} from '@repo/database';
import {
  CreateRoleInput,
  CreateUserInput,
  UpdateUserInput,
  AdminUserItem,
  UserSessionContext,
  UserTypeEnum,
  ERROR_CODES,
} from '@repo/shared';
import { redisManager } from '../lib/redis';
import {
  assertAssignableClusters,
  isGlobalScopeActor,
  matchesAssignedClusters,
} from '../lib/admin-auth';
import { maskTelegramChatId } from '../lib/telegram';
import {
  isStrictLiveMode,
  requireLiveDatabase,
  rethrowIfStrictDatabaseError,
} from '../lib/live-data';

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
    name: 'Vendor / Teknisi Lapangan',
    permissions: ['ticket:read', 'ticket:submit'],
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
        `${ERROR_CODES.HIERARCHY_VIOLATION}: Dilarang mengubah atau mengatur pengguna/peran dengan hierarchy level yang setara (${targetHierarchy}) atau lebih tinggi.`,
      );
    }
  }

  /**
   * Helper: Validates that an actor cannot grant permissions that they themselves do not possess.
   * Wildcard '*' grants all permissions.
   */
  public static validateGrantablePermissions(
    actorPermissions: string[],
    requestedPermissions: string[],
  ): boolean {
    if (actorPermissions.includes('*')) {
      return true;
    }

    const unpermitted = requestedPermissions.filter((perm) => !actorPermissions.includes(perm));
    if (unpermitted.length > 0) {
      throw new Error(
        `${ERROR_CODES.FORBIDDEN}: Anda tidak berhak memberikan permission yang tidak Anda miliki: [${unpermitted.join(', ')}]`,
      );
    }

    return true;
  }

  /**
   * Lists all roles in the system, optionally filtering out roles higher than actor's hierarchy.
   */
  public static async listRoles(actorHierarchyLevel?: number) {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat daftar peran.')) {
      try {
        const roles = await prisma.role.findMany({
          orderBy: { hierarchyLevel: 'desc' },
          include: {
            _count: {
              select: { users: true },
            },
          },
        });

        if (isStrictLiveMode() || roles.length > 0) {
          if (actorHierarchyLevel !== undefined) {
            return roles.filter((r) => r.hierarchyLevel <= actorHierarchyLevel);
          }
          return roles;
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal mengambil daftar role dari PostgreSQL.');
      }
    }

    // Fallback to in-memory seeded roles (non-strict mode only)
    if (actorHierarchyLevel !== undefined) {
      return MEMORY_ROLES.filter((r) => r.hierarchyLevel <= actorHierarchyLevel);
    }
    return MEMORY_ROLES;
  }

  /**
   * Retrieves role details by ID.
   */
  public static async getRoleById(roleId: string) {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat detail peran.')) {
      try {
        const role = await prisma.role.findUnique({
          where: { id: roleId },
          include: {
            _count: {
              select: { users: true },
            },
          },
        });

        if (role) {
          return role;
        }
        if (isStrictLiveMode()) {
          const notFound = new Error('Role tidak ditemukan') as Error & { statusCode?: number };
          notFound.statusCode = 404;
          throw notFound;
        }
      } catch (err) {
        if ((err as Error).message === 'Role tidak ditemukan') {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal mengambil detail role dari PostgreSQL.');
      }
    }

    const fallback = MEMORY_ROLES.find((r) => r.id === roleId || r.name === roleId);
    if (!fallback) {
      throw new Error('Role tidak ditemukan');
    }
    return fallback;
  }

  /**
   * Creates a new role with strict Anti-Privilege Escalation checks.
   */
  public static async createRole(actor: UserSessionContext, data: CreateRoleInput) {
    const cleanName = data.name.trim();
    const normalizedName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/super\s*admin/i.test(cleanName) || normalizedName.includes('superadmin')) {
      const err = new Error(
        `${ERROR_CODES.FORBIDDEN}: Nama role tidak boleh menggunakan variasi "Super Admin".`,
      ) as Error & { code?: string; statusCode?: number };
      err.code = ERROR_CODES.FORBIDDEN;
      err.statusCode = 403;
      throw err;
    }

    // 1. Hierarchy Check: actor must have strictly higher hierarchy
    this.checkHierarchyProtection(actor.hierarchyLevel, data.hierarchyLevel);

    if (!(await requireLiveDatabase('Database PostgreSQL sedang offline.'))) {
      throw new Error('Database PostgreSQL sedang offline.');
    }

    try {
      const duplicate = await prisma.role.findFirst({
        where: { name: { equals: cleanName, mode: 'insensitive' } },
      });
      if (duplicate && duplicate.name.toLowerCase() === cleanName.toLowerCase()) {
        const dupErr = new Error(`Nama role "${cleanName}" sudah digunakan.`) as Error & {
          statusCode?: number;
        };
        dupErr.statusCode = 409;
        throw dupErr;
      }

      // 2. Permission Check: actor cannot grant permissions they do not possess
      const actorRole = await prisma.role.findFirst({
        where: { name: actor.role },
      });

      const actorPermissions = isGlobalScopeActor(actor)
        ? ['*']
        : ((actorRole?.permissions as string[]) ?? actor.permissions ?? []).filter(
            (p) => p !== '*',
          );
      this.validateGrantablePermissions(actorPermissions, data.permissions);

      // 3. Create role
      const newRole = await prisma.role.create({
        data: {
          name: cleanName,
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
    } catch (err) {
      rethrowIfStrictDatabaseError(err, 'Gagal menyimpan peran baru ke PostgreSQL.');
      throw err;
    }
  }

  /**
   * Updates an existing role's permissions with Anti-Privilege Escalation protection.
   */
  public static async updateRolePermissions(
    actor: UserSessionContext,
    roleId: string,
    newPermissions: string[],
  ) {
    let targetRole: { id: string; name: string; permissions: unknown; hierarchyLevel: number } | null =
      null;
    let actorPermissions: string[] = [];

    const dbAvailable = await requireLiveDatabase(
      'Database PostgreSQL diperlukan untuk memperbarui izin peran.',
    );
    if (dbAvailable) {
      try {
        targetRole = await prisma.role.findUnique({
          where: { id: roleId },
        });
        const actorRole = await prisma.role.findFirst({
          where: { name: actor.role },
        });
        actorPermissions = isGlobalScopeActor(actor)
          ? ['*']
          : ((actorRole?.permissions as string[]) ?? actor.permissions ?? []).filter(
              (p) => p !== '*',
            );
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal membaca role dari PostgreSQL.');
        targetRole = null;
      }
    }

    if (!targetRole && !isStrictLiveMode()) {
      // In-memory fallback lookup
      targetRole = MEMORY_ROLES.find((r) => r.id === roleId || r.name === roleId) || null;
      const actorRole = MEMORY_ROLES.find((r) => r.name === actor.role);
      actorPermissions = isGlobalScopeActor(actor)
        ? ['*']
        : (actorRole ? actorRole.permissions : (actor.permissions ?? [])).filter(
            (p) => p !== '*',
          );
    }

    if (!targetRole) {
      const notFound = new Error('Role target tidak ditemukan') as Error & { statusCode?: number };
      notFound.statusCode = 404;
      throw notFound;
    }

    // 1. Hierarchy Check
    this.checkHierarchyProtection(actor.hierarchyLevel, targetRole.hierarchyLevel);

    // 2. Permission Check
    this.validateGrantablePermissions(actorPermissions, newPermissions);

    // 3. Update permissions in DB or in-memory
    if (dbAvailable) {
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
            oldPayload: { permissions: oldPermissions as Prisma.InputJsonValue },
            newPayload: { permissions: newPermissions as Prisma.InputJsonValue },
          },
        });

        return updated;
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal memperbarui permission role di PostgreSQL.');
        throw err;
      }
    }

    // In-memory update fallback (non-strict only)
    targetRole.permissions = [...newPermissions];
    const memIndex = MEMORY_ROLES.findIndex((r) => r.id === targetRole?.id);
    if (memIndex !== -1) {
      MEMORY_ROLES[memIndex].permissions = [...newPermissions];
    }
    return targetRole;
  }

  /**
   * Reassigns a user's role while strictly preventing privilege escalation.
   */
  public static async updateUserRole(
    actor: UserSessionContext,
    targetUserId: string,
    newRoleId: string,
  ) {
    if (targetUserId === actor.userId) {
      const err = new Error(
        `${ERROR_CODES.FORBIDDEN}: Dilarang mengubah peran akun sendiri.`,
      ) as Error & { code?: string; statusCode?: number };
      err.code = ERROR_CODES.FORBIDDEN;
      err.statusCode = 403;
      throw err;
    }

    if (await requireLiveDatabase('Database PostgreSQL diperlukan untuk mengubah peran pengguna.')) {
      try {
        // 1. Target user check
        const targetUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          include: {
            role: true,
            sessions: {
              where: { revokedAt: null },
              select: { id: true, deviceId: true },
            },
          },
        });

        if (!targetUser) {
          const err = new Error('Pengguna tidak ditemukan') as Error & { statusCode?: number };
          err.statusCode = 404;
          throw err;
        }

        if (
          !isGlobalScopeActor(actor) &&
          !matchesAssignedClusters(actor, ...targetUser.assignedClusters)
        ) {
          const err = new Error(
            `${ERROR_CODES.FORBIDDEN}: Pengguna target berada di luar cakupan cluster wewenang Anda.`,
          ) as Error & { code?: string; statusCode?: number };
          err.code = ERROR_CODES.FORBIDDEN;
          err.statusCode = 403;
          throw err;
        }

        // Actor cannot modify users of equal or higher hierarchy
        this.checkHierarchyProtection(actor.hierarchyLevel, targetUser.role.hierarchyLevel);

        // 2. Destination role check
        const newRole = await prisma.role.findUnique({
          where: { id: newRoleId },
        });

        if (!newRole) {
          const err = new Error('Role tujuan tidak ditemukan') as Error & { statusCode?: number };
          err.statusCode = 404;
          throw err;
        }

        // Actor cannot assign a role of equal or higher hierarchy
        this.checkHierarchyProtection(actor.hierarchyLevel, newRole.hierarchyLevel);

        const nextUserType = this.inferUserType(newRole.name, newRole.hierarchyLevel);

        // 3. Update user role, sync userType, revoke active UserSessions, and log audit
        const updatedUser = await prisma.user.update({
          where: { id: targetUserId },
          data: {
            roleId: newRoleId,
            userType: nextUserType,
          },
          include: {
            role: true,
            sessions: {
              where: { revokedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
        });

        await prisma.userSession.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await prisma.activityLog.create({
          data: {
            actorUserId: actor.userId,
            actorRole: actor.role,
            actionType: 'USER_ROLE_REASSIGNED',
            targetEntity: 'user',
            targetId: targetUserId,
            oldPayload: {
              roleId: targetUser.roleId,
              roleName: targetUser.role.name,
              userType: targetUser.userType,
            },
            newPayload: {
              roleId: newRole.id,
              roleName: newRole.name,
              userType: nextUserType,
            },
          },
        });

        // 4. Blacklist active sessions in Redis
        const targetSessions = Array.isArray(targetUser.sessions) ? targetUser.sessions : [];
        for (const s of targetSessions) {
          if (s.id) {
            await redisManager.blacklistSession(s.id).catch(() => {});
          }
          if (s.deviceId && s.deviceId !== 'web-browser') {
            await redisManager.blacklistSession(s.deviceId).catch(() => {});
          }
        }

        return this.mapUserToAdminItem(updatedUser);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.message.includes(ERROR_CODES.HIERARCHY_VIOLATION) ||
            err.message.includes(ERROR_CODES.FORBIDDEN) ||
            err.message.includes('tidak ditemukan'))
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memperbarui peran pengguna di PostgreSQL.');
        throw err;
      }
    }

    // In-memory fallback (non-strict only)
    const targetRole =
      MEMORY_ROLES.find((r) => r.id === newRoleId || r.name === newRoleId) || MEMORY_ROLES[1];
    this.checkHierarchyProtection(actor.hierarchyLevel, targetRole.hierarchyLevel);
    return {
      id: targetUserId,
      roleId: targetRole.id,
      role: targetRole.name,
      userType: this.inferUserType(targetRole.name, targetRole.hierarchyLevel),
    };
  }

  private static inferUserType(_roleName: string, hierarchyLevel: number): UserTypeEnum {
    if (hierarchyLevel >= 100) {
      return 'SUPER_ADMIN';
    }
    const lower = _roleName.toLowerCase();
    if (lower.includes('teknisi') || lower.includes('vendor') || lower.includes('field')) {
      return 'TECHNICIAN';
    }
    return 'ADMIN';
  }

  private static mapUserToAdminItem(u: {
    id: string;
    nik: string | null;
    username: string;
    fullName: string;
    vendorCompany: string | null;
    roleId: string;
    userType: string;
    assignedClusters: string[];
    isActive: boolean;
    twoFactorEnabled: boolean;
    telegramChatId: string | null;
    createdAt: Date;
    role: { id: string; name: string; hierarchyLevel: number };
    sessions?: Array<{ createdAt: Date }>;
  }): AdminUserItem {
    return {
      id: u.id,
      nik: u.nik,
      username: u.username,
      fullName: u.fullName,
      vendorCompany: u.vendorCompany,
      role: u.role.name,
      roleId: u.roleId,
      userType: u.userType as UserTypeEnum,
      hierarchyLevel: u.role.hierarchyLevel,
      assignedClusters: u.assignedClusters,
      isActive: u.isActive,
      twoFactorEnabled: u.twoFactorEnabled,
      telegramChatId: maskTelegramChatId(u.telegramChatId),
      lastActiveAt: u.sessions?.[0]?.createdAt ? u.sessions[0].createdAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  /**
   * Lists personnel/operator users from PostgreSQL scoped to actor's hierarchy ceiling and assigned clusters.
   */
  public static async listUsers(actor: UserSessionContext): Promise<AdminUserItem[]> {
    const dbReady = await requireLiveDatabase(
      'Database PostgreSQL diperlukan untuk memuat direktori pengguna.',
    );
    if (!dbReady) {
      return [];
    }

    try {
      const users = await prisma.user.findMany({
        include: {
          role: true,
          sessions: {
            where: { revokedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
        },
        orderBy: [{ role: { hierarchyLevel: 'desc' } }, { fullName: 'asc' }],
      });

      return users
        .filter(
          (u) =>
            isGlobalScopeActor(actor) ||
            (u.role.hierarchyLevel <= actor.hierarchyLevel &&
              matchesAssignedClusters(actor, ...u.assignedClusters)),
        )
        .map((u) => this.mapUserToAdminItem(u));
    } catch (err) {
      rethrowIfStrictDatabaseError(err, 'Gagal memuat direktori pengguna dari PostgreSQL.');
      throw err;
    }
  }

  /**
   * Creates a new web operator or field technician account with bcrypt hashing and audit trail.
   */
  public static async createUser(
    actor: UserSessionContext,
    input: CreateUserInput,
  ): Promise<AdminUserItem> {
    if (!input.password || input.password.trim().length < 8) {
      const pwdErr = new Error('Kata sandi awal minimal 8 karakter wajib diisi.') as Error & {
        code?: string;
        statusCode?: number;
      };
      pwdErr.code = ERROR_CODES.VALIDATION_ERROR;
      pwdErr.statusCode = 400;
      throw pwdErr;
    }

    assertAssignableClusters(actor, input.assignedClusters);

    await requireLiveDatabase('Database PostgreSQL diperlukan untuk membuat pengguna baru.');

    try {
      const targetRole = await prisma.role.findFirst({
        where: { name: { equals: input.roleName, mode: 'insensitive' } },
      });
      if (!targetRole) {
        const err = new Error(`Role "${input.roleName}" tidak ditemukan.`) as Error & {
          statusCode?: number;
        };
        err.statusCode = 400;
        throw err;
      }

      if (!isGlobalScopeActor(actor) || targetRole.hierarchyLevel >= 100) {
        this.checkHierarchyProtection(actor.hierarchyLevel, targetRole.hierarchyLevel);
      }

      const cleanUsername = input.username.trim().toLowerCase();
      const cleanNik = input.nik.trim().toUpperCase();

      const duplicate = await prisma.user.findFirst({
        where: {
          OR: [{ username: cleanUsername }, { nik: cleanNik }],
        },
        select: { username: true, nik: true },
      });
      if (duplicate) {
        const conflict = new Error(
          duplicate.username === cleanUsername
            ? `Username "${cleanUsername}" sudah digunakan.`
            : `NIK "${cleanNik}" sudah terdaftar.`,
        ) as Error & { statusCode?: number };
        conflict.statusCode = 409;
        throw conflict;
      }

      const passwordHash = await bcrypt.hash(input.password.trim(), 10);
      const userType = this.inferUserType(targetRole.name, targetRole.hierarchyLevel);

      const created = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            fullName: input.fullName.trim(),
            nik: cleanNik,
            username: cleanUsername,
            passwordHash,
            roleId: targetRole.id,
            userType,
            vendorCompany: input.vendorCompany?.trim() || null,
            assignedClusters: input.assignedClusters,
            telegramChatId: input.telegramChatId?.trim() || null,
            twoFactorEnabled: input.twoFactorEnabled ?? userType !== 'TECHNICIAN',
            isActive: true,
          },
          include: { role: true },
        });

        await tx.activityLog.create({
          data: {
            actorUserId: actor.userId,
            actorRole: actor.role,
            actionType: 'USER_CREATED',
            targetEntity: 'user',
            targetId: u.id,
            newPayload: {
              username: u.username,
              nik: u.nik,
              role: targetRole.name,
              userType,
              assignedClusters: u.assignedClusters,
            } as Prisma.InputJsonValue,
          },
        });

        return u;
      });

      return this.mapUserToAdminItem(created);
    } catch (err) {
      rethrowIfStrictDatabaseError(err, 'Gagal menyimpan akun pengguna baru.');
      throw err;
    }
  }

  /**
   * Updates user attributes, activation status, role, clusters, or Telegram binding in PostgreSQL.
   */
  public static async updateUser(
    actor: UserSessionContext,
    targetUserId: string,
    input: UpdateUserInput,
  ): Promise<AdminUserItem> {
    if (
      targetUserId === actor.userId &&
      (input.assignedClusters !== undefined ||
        input.twoFactorEnabled !== undefined ||
        input.roleName !== undefined ||
        input.isActive !== undefined)
    ) {
      const selfErr = new Error(
        `${ERROR_CODES.FORBIDDEN}: Dilarang mengubah cakupan cluster, status 2FA, peran, atau status aktif akun sendiri.`,
      ) as Error & { code?: string; statusCode?: number };
      selfErr.code = ERROR_CODES.FORBIDDEN;
      selfErr.statusCode = 403;
      throw selfErr;
    }

    await requireLiveDatabase('Database PostgreSQL diperlukan untuk memperbarui pengguna.');

    try {
      const existing = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          role: true,
          sessions: {
            where: { revokedAt: null },
            select: { id: true, deviceId: true },
          },
        },
      });
      if (!existing) {
        const err = new Error('Pengguna tidak ditemukan.') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      }

      if (targetUserId !== actor.userId) {
        this.checkHierarchyProtection(actor.hierarchyLevel, existing.role.hierarchyLevel);
        if (
          !isGlobalScopeActor(actor) &&
          !matchesAssignedClusters(actor, ...existing.assignedClusters)
        ) {
          const scopeErr = new Error(
            `${ERROR_CODES.FORBIDDEN}: Pengguna target berada di luar cakupan cluster wewenang Anda.`,
          ) as Error & { code?: string; statusCode?: number };
          scopeErr.code = ERROR_CODES.FORBIDDEN;
          scopeErr.statusCode = 403;
          throw scopeErr;
        }
        if (input.assignedClusters !== undefined) {
          assertAssignableClusters(actor, input.assignedClusters);
        }
      }

      let nextRoleId = existing.roleId;
      let nextUserType = existing.userType;
      if (input.roleName) {
        const newRole = await prisma.role.findFirst({
          where: { name: { equals: input.roleName, mode: 'insensitive' } },
        });
        if (!newRole) {
          const err = new Error(`Role "${input.roleName}" tidak ditemukan.`) as Error & {
            statusCode?: number;
          };
          err.statusCode = 400;
          throw err;
        }
        this.checkHierarchyProtection(actor.hierarchyLevel, newRole.hierarchyLevel);
        nextRoleId = newRole.id;
        nextUserType = this.inferUserType(newRole.name, newRole.hierarchyLevel);
      }

      const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
      const shouldRevokeSessions =
        input.isActive === false || Boolean(passwordHash) || nextRoleId !== existing.roleId;
      const nextTelegramChatId = input.unlinkTelegram
        ? null
        : input.telegramChatId !== undefined
          ? input.telegramChatId?.trim() || null
          : existing.telegramChatId;

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: targetUserId },
          data: {
            fullName: input.fullName?.trim() ?? existing.fullName,
            roleId: nextRoleId,
            userType: nextUserType,
            vendorCompany:
              input.vendorCompany !== undefined
                ? input.vendorCompany?.trim() || null
                : existing.vendorCompany,
            assignedClusters: input.assignedClusters ?? existing.assignedClusters,
            isActive: input.isActive ?? existing.isActive,
            twoFactorEnabled: input.twoFactorEnabled ?? existing.twoFactorEnabled,
            telegramChatId: nextTelegramChatId,
            ...(passwordHash ? { passwordHash } : {}),
          },
          include: {
            role: true,
            sessions: {
              where: { revokedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
        });

        if (shouldRevokeSessions) {
          await tx.userSession.updateMany({
            where: { userId: targetUserId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }

        await tx.activityLog.create({
          data: {
            actorUserId: actor.userId,
            actorRole: actor.role,
            actionType: input.unlinkTelegram ? 'USER_TELEGRAM_UNLINKED' : 'USER_UPDATED',
            targetEntity: 'user',
            targetId: targetUserId,
            oldPayload: {
              role: existing.role.name,
              isActive: existing.isActive,
              telegramLinked: Boolean(existing.telegramChatId),
              assignedClusters: existing.assignedClusters,
            } as Prisma.InputJsonValue,
            newPayload: {
              role: u.role.name,
              isActive: u.isActive,
              telegramLinked: Boolean(u.telegramChatId),
              assignedClusters: u.assignedClusters,
            } as Prisma.InputJsonValue,
          },
        });

        return u;
      });

      if (shouldRevokeSessions) {
        const activeSessions = Array.isArray(existing.sessions) ? existing.sessions : [];
        for (const s of activeSessions) {
          if (s.id) {
            await redisManager.blacklistSession(s.id).catch(() => {});
          }
          if (s.deviceId && s.deviceId !== 'web-browser') {
            await redisManager.blacklistSession(s.deviceId).catch(() => {});
          }
        }
      }

      return this.mapUserToAdminItem(updated);
    } catch (err) {
      rethrowIfStrictDatabaseError(err, 'Gagal memperbarui data pengguna.');
      throw err;
    }
  }
}
