import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '@repo/database';
import { redisManager } from '@/lib/redis';
import {
  JwtTokenPayload,
  RefreshTokenPayload,
  UserSessionContext,
  ERROR_CODES,
  UserTypeEnum,
} from '@repo/shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fiberops_on_premise_super_secure_jwt_secret_key_32chars'
);

const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived for technicians
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export class AuthService {
  /**
   * Hashes password using bcrypt with standard salt rounds.
   */
  public static async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  /**
   * Verifies plaintext password against stored hash.
   */
  public static async comparePassword(plain: string, hashed: string): Promise<boolean> {
    return await bcrypt.compare(plain, hashed);
  }

  /**
   * Generates short-lived Access Token.
   */
  public static async generateAccessToken(user: {
    id: string;
    username: string;
    roleName: string;
    userType: UserTypeEnum;
    hierarchyLevel: number;
    assignedClusters: string[];
    deviceId?: string;
  }): Promise<string> {
    return await new SignJWT({
      username: user.username,
      role: user.roleName,
      userType: user.userType,
      hierarchyLevel: user.hierarchyLevel,
      assignedClusters: user.assignedClusters,
      deviceId: user.deviceId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .sign(JWT_SECRET);
  }

  /**
   * Generates Refresh Token for mobile technician device binding.
   */
  public static async generateRefreshToken(userId: string, sessionId: string, deviceId: string): Promise<string> {
    return await new SignJWT({
      sessionId,
      deviceId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${REFRESH_TOKEN_EXPIRY_DAYS}d`)
      .sign(JWT_SECRET);
  }

  /**
   * Verifies access token signature and checks instant session revocation in Redis/DB.
   * Enforces Law 4: Dual-Auth & Instant Session Revocation.
   */
  public static async verifyAccessToken(token: string): Promise<UserSessionContext> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const userId = payload.sub as string;
      const deviceId = payload.deviceId as string | undefined;

      // Check user existence and active status in DB
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user || !user.isActive) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      // If mobile token with deviceId, verify active session
      if (deviceId) {
        const isBlacklisted = await redisManager.isSessionBlacklisted(deviceId);
        if (isBlacklisted) {
          throw new Error(ERROR_CODES.SESSION_REVOKED);
        }

        const activeSession = await prisma.userSession.findFirst({
          where: {
            userId: user.id,
            deviceId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });

        if (!activeSession) {
          throw new Error(ERROR_CODES.SESSION_REVOKED);
        }
      }

      return {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role.name,
        userType: user.userType as UserTypeEnum,
        hierarchyLevel: user.role.hierarchyLevel,
        assignedClusters: user.assignedClusters,
        deviceId,
      };
    } catch {
      throw new Error(ERROR_CODES.UNAUTHORIZED);
    }
  }

  /**
   * Authenticates user for Web Admin Dashboard (HttpOnly Cookie mechanism).
   */
  public static async loginWeb(username: string, plainPassword: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new Error('Username atau password tidak valid');
    }

    if (user.userType === 'TECHNICIAN') {
      throw new Error('Teknisi lapangan wajib login menggunakan aplikasi mobile resmi');
    }

    const match = await this.comparePassword(plainPassword, user.passwordHash).catch(() => false);
    // Allow demo fallback hash if in dev mode
    const isValid = match || (process.env.NODE_ENV !== 'production' && plainPassword === 'password123');

    if (!isValid) {
      throw new Error('Username atau password tidak valid');
    }

    const token = await this.generateAccessToken({
      id: user.id,
      username: user.username,
      roleName: user.role.name,
      userType: user.userType as UserTypeEnum,
      hierarchyLevel: user.role.hierarchyLevel,
      assignedClusters: user.assignedClusters,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role.name,
        userType: user.userType,
        hierarchyLevel: user.role.hierarchyLevel,
        assignedClusters: user.assignedClusters,
      },
    };
  }

  /**
   * Authenticates field technician via Mobile App with mandatory Device ID binding.
   */
  public static async loginMobile(
    username: string,
    plainPassword: string,
    deviceId: string,
    deviceModel?: string,
    appVersion?: string
  ) {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new Error('Akun teknisi dinonaktifkan atau tidak ditemukan');
    }

    const match = await this.comparePassword(plainPassword, user.passwordHash).catch(() => false);
    const isValid = match || (process.env.NODE_ENV !== 'production' && plainPassword === 'password123');

    if (!isValid) {
      throw new Error('Kredensial tidak valid');
    }

    // Revoke previous sessions on the same device
    await prisma.userSession.updateMany({
      where: {
        userId: user.id,
        deviceId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Create new session record
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        deviceId,
        deviceModel,
        appVersion,
        refreshTokenHash: 'pending',
        expiresAt,
      },
    });

    const accessToken = await this.generateAccessToken({
      id: user.id,
      username: user.username,
      roleName: user.role.name,
      userType: user.userType as UserTypeEnum,
      hierarchyLevel: user.role.hierarchyLevel,
      assignedClusters: user.assignedClusters,
      deviceId,
    });

    const refreshToken = await this.generateRefreshToken(user.id, session.id, deviceId);

    // Save refresh token hash
    const refreshHash = await this.hashPassword(refreshToken);
    await prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role.name,
        userType: user.userType,
        hierarchyLevel: user.role.hierarchyLevel,
        assignedClusters: user.assignedClusters,
      },
    };
  }

  /**
   * Refreshes short-lived Access Token using valid Refresh Token.
   */
  public static async refreshMobileSession(refreshToken: string, deviceId: string) {
    try {
      const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
      const userId = payload.sub as string;
      const sessionId = (payload as unknown as RefreshTokenPayload).sessionId;

      const session = await prisma.userSession.findUnique({
        where: { id: sessionId },
        include: { user: { include: { role: true } } },
      });

      if (!session || session.revokedAt || session.deviceId !== deviceId || session.expiresAt < new Date()) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      if (!session.user.isActive) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      const match = await this.comparePassword(refreshToken, session.refreshTokenHash);
      if (!match) {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }

      const accessToken = await this.generateAccessToken({
        id: session.user.id,
        username: session.user.username,
        roleName: session.user.role.name,
        userType: session.user.userType as UserTypeEnum,
        hierarchyLevel: session.user.role.hierarchyLevel,
        assignedClusters: session.user.assignedClusters,
        deviceId,
      });

      return { accessToken };
    } catch {
      throw new Error(ERROR_CODES.UNAUTHORIZED);
    }
  }

  /**
   * Force Logout (Instant Session Revocation):
   * Updates database and writes revocation flag into Redis so mobile requests fail immediately.
   */
  public static async revokeUserSessions(userId: string, actorAdminId = 'superadmin'): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { sessions: { where: { revokedAt: null } } },
    });

    if (!user) {
      throw new Error('User tidak ditemukan');
    }

    // Blacklist all active device sessions in Redis
    for (const session of user.sessions) {
      await redisManager.blacklistSession(session.deviceId);
    }

    // Revoke all sessions in PostgreSQL
    await prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Record activity audit log
    await prisma.activityLog.create({
      data: {
        actorUserId: actorAdminId,
        actorRole: 'Admin',
        actionType: 'FORCE_LOGOUT_EXECUTED',
        targetEntity: 'user',
        targetId: userId,
        oldPayload: { revokedSessionsCount: user.sessions.length },
        newPayload: { revokedAt: new Date().toISOString() },
      },
    });
  }
}
