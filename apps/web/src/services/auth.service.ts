import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
const BCRYPT_SALT_ROUNDS = 10;

export class AuthService {
  /**
   * Hashes password using bcrypt with standard salt rounds.
   */
  public static async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
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
   * Includes a unique jti for token rotation tracking.
   */
  public static async generateRefreshToken(userId: string, sessionId: string, deviceId: string): Promise<string> {
    const jti = `rt_${sessionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return await new SignJWT({
      sessionId,
      deviceId,
      jti,
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
   * Refresh Token Rotation:
   * 1. Verifies incoming refresh token.
   * 2. Checks for Token Reuse Detection: if the submitted token's hash matches
   *    a previously-rotated token, ALL user sessions are revoked immediately.
   * 3. Issues a new access token AND a new refresh token (rotation).
   * 4. Marks the old refresh token hash as rotated in Redis for reuse detection.
   * 5. Stores the new refresh token hash in the session record.
   */
  public static async refreshMobileSession(refreshToken: string, deviceId: string) {
    try {
      const { payload } = await jwtVerify(refreshToken, JWT_SECRET);
      const userId = payload.sub as string;
      const sessionId = (payload as unknown as RefreshTokenPayload).sessionId;
      const tokenFingerprint = (payload as { jti?: string }).jti || crypto.createHash('sha256').update(refreshToken).digest('hex');

      // 1. REUSE DETECTION: Check if this specific token was already rotated
      const isRotated = await redisManager.isRefreshTokenRotated(sessionId, tokenFingerprint);
      if (isRotated) {
        // CONFIRMED REUSE ATTACK (CWE-613): Revoke all sessions for this user and blacklist device
        await this.revokeAllUserSessionsForReuse(userId, deviceId);

        await prisma.activityLog.create({
          data: {
            actorUserId: userId,
            actorRole: 'System',
            actionType: 'TOKEN_REUSE_DETECTED',
            targetEntity: 'user_session',
            targetId: sessionId,
            newPayload: {
              deviceId,
              tokenFingerprint,
              detectedAt: new Date().toISOString(),
              action: 'ALL_USER_SESSIONS_REVOKED_TOKEN_REUSE',
            },
          },
        }).catch(() => {});

        throw new Error(ERROR_CODES.TOKEN_REUSE_DETECTED);
      }

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

      // 2. Mark this token as rotated in Redis so any subsequent attempt triggers reuse detection
      await redisManager.markRefreshTokenRotated(sessionId, tokenFingerprint);

      // 3. Issue new Access Token AND new Refresh Token (ROTATION)
      const newAccessToken = await this.generateAccessToken({
        id: session.user.id,
        username: session.user.username,
        roleName: session.user.role.name,
        userType: session.user.userType as UserTypeEnum,
        hierarchyLevel: session.user.role.hierarchyLevel,
        assignedClusters: session.user.assignedClusters,
        deviceId,
      });

      const newRefreshToken = await this.generateRefreshToken(session.user.id, sessionId, deviceId);
      const newRefreshHash = await this.hashPassword(newRefreshToken);

      // 4. Update session record with the new hash
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { refreshTokenHash: newRefreshHash },
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (err: unknown) {
      const errMsg = (err as Error).message || '';
      if (errMsg.includes(ERROR_CODES.TOKEN_REUSE_DETECTED)) {
        throw err;
      }
      throw new Error(ERROR_CODES.UNAUTHORIZED);
    }
  }

  /**
   * Revokes all sessions for a user when refresh token reuse is detected.
   * Blacklists current device and all user devices in Redis for instant enforcement.
   */
  private static async revokeAllUserSessionsForReuse(userId: string, deviceId: string): Promise<void> {
    // Blacklist requesting device immediately
    await redisManager.blacklistSession(deviceId);

    // Blacklist all active session devices for this user
    const activeSessions = await prisma.userSession.findMany({
      where: { userId, revokedAt: null },
    });

    for (const session of activeSessions) {
      if (session.deviceId) {
        await redisManager.blacklistSession(session.deviceId);
      }
    }

    // Mark all active sessions as revoked in DB
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
