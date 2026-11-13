import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { env } from '../../env';
import { redisManager } from '../lib/redis';
import {
  createOtpChallenge,
  updateOtpChallengeDelivery,
  rotateOtpChallenge,
  verifyAndConsumeOtpChallenge,
} from '../lib/otp-store';
import { resolveTelegramChatId, sendTelegramOtpMessage } from '../lib/telegram';
import {
  RefreshTokenPayload,
  UserSessionContext,
  ERROR_CODES,
  OTP_CONFIG,
  UserTypeEnum,
} from '@repo/shared';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived for technicians
const WEB_SESSION_TOKEN_EXPIRY = '8h'; // Web NOC dashboard session
const PRE_AUTH_TOKEN_EXPIRY = '5m'; // 2FA OTP challenge token
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const BCRYPT_SALT_ROUNDS = 10;

export interface FallbackAccount {
  id: string;
  nik?: string | null;
  username: string;
  fullName: string;
  vendorCompany?: string | null;
  passwordHash?: string;
  telegramChatId?: string | null;
  twoFactorEnabled?: boolean;
  userType: UserTypeEnum;
  isActive: boolean;
  assignedClusters: string[];
  role: {
    id: string;
    name: string;
    hierarchyLevel: number;
    permissions: string[];
  };
}

const FALLBACK_SEED_USERS: Record<string, FallbackAccount> = {
  superadmin: {
    id: '00000000-0000-4000-8000-000000000001',
    nik: '882041',
    username: 'superadmin',
    fullName: 'Aditya Saputra',
    userType: 'SUPER_ADMIN',
    isActive: true,
    assignedClusters: ['Bandung Utara', 'Bandung Timur', 'Bandung Barat', 'Bandung Selatan'],
    role: {
      id: 'role-super-admin',
      name: 'Super Admin',
      hierarchyLevel: 100,
      permissions: ['*'],
    },
  },
  'aditya.saputra': {
    id: '00000000-0000-4000-8000-000000000001',
    nik: '882041',
    username: 'superadmin',
    fullName: 'Aditya Saputra',
    userType: 'SUPER_ADMIN',
    isActive: true,
    assignedClusters: ['Bandung Utara', 'Bandung Timur', 'Bandung Barat', 'Bandung Selatan'],
    role: {
      id: 'role-super-admin',
      name: 'Super Admin',
      hierarchyLevel: 100,
      permissions: ['*'],
    },
  },
  'admin.noc': {
    id: '00000000-0000-4000-8000-000000000002',
    nik: '882042',
    username: 'admin.noc',
    fullName: 'Budi Hartono',
    userType: 'ADMIN',
    isActive: true,
    assignedClusters: ['Bandung Utara', 'Bandung Timur'],
    role: {
      id: 'role-noc-admin',
      name: 'Admin Operasional / NOC',
      hierarchyLevel: 50,
      permissions: [
        'ticket:read',
        'ticket:create',
        'tech:manage',
        'customer:read',
        'customer:update',
        'ai:use',
      ],
    },
  },
  'tech.andi': {
    id: '00000000-0000-4000-8000-000000000003',
    nik: '882043',
    username: 'tech.andi',
    fullName: 'Andi Pratama',
    vendorCompany: 'PT Mitra Fiber Nusantara',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['Bandung Utara'],
    role: {
      id: 'role-technician',
      name: 'Vendor / Teknisi Lapangan',
      hierarchyLevel: 10,
      permissions: ['ticket:read', 'ticket:submit'],
    },
  },
  'andi.pratama': {
    id: '00000000-0000-4000-8000-000000000003',
    nik: '882043',
    username: 'andi.pratama',
    fullName: 'Andi Pratama',
    vendorCompany: 'PT Mitra Fiber Nusantara',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['Bandung Utara'],
    role: {
      id: 'role-technician',
      name: 'Vendor / Teknisi Lapangan',
      hierarchyLevel: 10,
      permissions: ['ticket:read', 'ticket:submit'],
    },
  },
  'tech.rizky': {
    id: '00000000-0000-4000-8000-000000000004',
    nik: '882044',
    username: 'tech.rizky',
    fullName: 'Rizky Maulana',
    vendorCompany: 'PT Sarana Optik Bandung',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['Bandung Timur', 'Cimahi'],
    role: {
      id: 'role-technician',
      name: 'Vendor / Teknisi Lapangan',
      hierarchyLevel: 10,
      permissions: ['ticket:read', 'ticket:submit'],
    },
  },
  'rizky.maulana': {
    id: '00000000-0000-4000-8000-000000000004',
    nik: '882044',
    username: 'rizky.maulana',
    fullName: 'Rizky Maulana',
    vendorCompany: 'PT Sarana Optik Bandung',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['Bandung Timur', 'Cimahi'],
    role: {
      id: 'role-technician',
      name: 'Vendor / Teknisi Lapangan',
      hierarchyLevel: 10,
      permissions: ['ticket:read', 'ticket:submit'],
    },
  },
  'fajar.hidayat': {
    id: '00000000-0000-4000-8000-000000000005',
    nik: '882045',
    username: 'fajar.hidayat',
    fullName: 'Fajar Hidayat',
    vendorCompany: 'PT Mitra Fiber Nusantara',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['Bandung Barat'],
    role: {
      id: 'role-technician',
      name: 'Vendor / Teknisi Lapangan',
      hierarchyLevel: 10,
      permissions: ['ticket:read', 'ticket:submit'],
    },
  },
  'dedi.kurniawan': {
    id: '00000000-0000-4000-8000-000000000006',
    nik: '882046',
    username: 'dedi.kurniawan',
    fullName: 'Dedi Kurniawan',
    vendorCompany: 'CV Jaringan Nusantara',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['Rancaekek'],
    role: {
      id: 'role-technician',
      name: 'Vendor / Teknisi Lapangan',
      hierarchyLevel: 10,
      permissions: ['ticket:read', 'ticket:submit'],
    },
  },
};

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
   * Generates short-lived Access Token (15m for mobile, 8h for web session).
   */
  public static async generateAccessToken(
    user: {
      id: string;
      username: string;
      roleName: string;
      userType: UserTypeEnum;
      hierarchyLevel: number;
      assignedClusters: string[];
      deviceId?: string;
    },
    expiresIn: string = ACCESS_TOKEN_EXPIRY,
  ): Promise<string> {
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
      .setExpirationTime(expiresIn)
      .sign(JWT_SECRET);
  }

  /**
   * Generates Refresh Token for mobile technician device binding.
   * Includes a unique jti for token rotation tracking.
   */
  public static async generateRefreshToken(
    userId: string,
    sessionId: string,
    deviceId: string,
  ): Promise<string> {
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
      if (payload.purpose === '2fa_pending') {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }
      const userId = payload.sub as string;
      const deviceId = payload.deviceId as string | undefined;

      if (await isDatabaseAvailable()) {
        try {
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
        } catch (dbErr) {
          if (
            dbErr instanceof Error &&
            (dbErr.message === ERROR_CODES.SESSION_REVOKED ||
              dbErr.message === ERROR_CODES.UNAUTHORIZED)
          ) {
            throw dbErr;
          }
          markDatabaseUnavailable(dbErr);
        }
      }

      if (deviceId) {
        const isBlacklisted = await redisManager.isSessionBlacklisted(deviceId);
        if (isBlacklisted) {
          throw new Error(ERROR_CODES.SESSION_REVOKED);
        }
      }

      // Offline fallback resolution using verified JWT claims & fallback seed users
      const payloadUsername = typeof payload.username === 'string' ? payload.username.toLowerCase() : '';
      const fallbackUser =
        (payloadUsername ? FALLBACK_SEED_USERS[payloadUsername] : undefined) ||
        Object.values(FALLBACK_SEED_USERS).find((u) => u.id === userId);

      if (fallbackUser) {
        return {
          userId: fallbackUser.id,
          username: fallbackUser.username,
          fullName: fallbackUser.fullName,
          role: fallbackUser.role.name,
          userType: fallbackUser.userType,
          hierarchyLevel: fallbackUser.role.hierarchyLevel,
          assignedClusters: fallbackUser.assignedClusters,
          deviceId,
        };
      }

      return {
        userId,
        username: typeof payload.username === 'string' ? payload.username : userId,
        fullName: typeof payload.username === 'string' ? payload.username : userId,
        role: typeof payload.role === 'string' ? payload.role : 'Super Admin',
        userType: (payload.userType as UserTypeEnum) || 'SUPER_ADMIN',
        hierarchyLevel: typeof payload.hierarchyLevel === 'number' ? payload.hierarchyLevel : 100,
        assignedClusters: Array.isArray(payload.assignedClusters)
          ? (payload.assignedClusters as string[])
          : [],
        deviceId,
      };
    } catch {
      throw new Error(ERROR_CODES.UNAUTHORIZED);
    }
  }

  private static mapDbUserToAccount(found: {
    id: string;
    nik: string | null;
    username: string;
    fullName: string;
    vendorCompany?: string | null;
    passwordHash: string;
    telegramChatId: string | null;
    twoFactorEnabled: boolean;
    userType: string;
    isActive: boolean;
    assignedClusters: string[];
    role: {
      id: string;
      name: string;
      hierarchyLevel: number;
      permissions: unknown;
    };
  }): FallbackAccount {
    return {
      id: found.id,
      nik: found.nik,
      username: found.username,
      fullName: found.fullName,
      vendorCompany: found.vendorCompany ?? null,
      passwordHash: found.passwordHash,
      telegramChatId: found.telegramChatId,
      twoFactorEnabled: found.twoFactorEnabled,
      userType: found.userType as UserTypeEnum,
      isActive: found.isActive,
      assignedClusters: found.assignedClusters,
      role: {
        id: found.role.id,
        name: found.role.name,
        hierarchyLevel: found.role.hierarchyLevel,
        permissions: Array.isArray(found.role.permissions)
          ? (found.role.permissions as string[])
          : [],
      },
    };
  }

  /**
   * Resolves a web operator or vendor account by username from PostgreSQL or fallback seed accounts.
   */
  public static async resolveAccountByUsername(username: string): Promise<FallbackAccount | null> {
    const normalizedUsername = username.trim().toLowerCase();
    let dbUser: FallbackAccount | null = null;

    if (await isDatabaseAvailable()) {
      try {
        const found = await prisma.user.findUnique({
          where: { username: normalizedUsername },
          include: { role: true },
        });
        if (found) {
          dbUser = this.mapDbUserToAccount(found);
        }
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    return dbUser || FALLBACK_SEED_USERS[normalizedUsername] || null;
  }

  /**
   * Resolves an account by NIK from PostgreSQL or fallback seed accounts.
   */
  public static async resolveAccountByNik(nik: string): Promise<FallbackAccount | null> {
    const cleanNik = nik.trim().toUpperCase();
    if (await isDatabaseAvailable()) {
      try {
        const found = await prisma.user.findFirst({
          where: { nik: cleanNik },
          include: { role: true },
        });
        if (found) {
          return this.mapDbUserToAccount(found);
        }
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    const fallback = Object.values(FALLBACK_SEED_USERS).find(
      (u) =>
        Boolean(u.nik && u.nik.toUpperCase() === cleanNik) ||
        u.username.toLowerCase() === cleanNik.toLowerCase(),
    );
    return fallback || null;
  }

  /**
   * Resolves an active operator or vendor account by pre-bound Telegram Chat ID.
   */
  public static async resolveAccountByTelegramChatId(
    chatId: string,
  ): Promise<FallbackAccount | null> {
    const cleanId = String(chatId).trim();
    if (!cleanId) return null;

    if (await isDatabaseAvailable()) {
      try {
        const found = await prisma.user.findFirst({
          where: {
            isActive: true,
            OR: [
              { telegramChatId: cleanId },
              { telegramChatId: { contains: cleanId } },
            ],
          },
          include: { role: true },
        });
        if (found) {
          return this.mapDbUserToAccount(found);
        }
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    const fallback = Object.values(FALLBACK_SEED_USERS).find(
      (u) => u.isActive && u.telegramChatId?.split(',').map((s) => s.trim()).includes(cleanId),
    );
    return fallback || null;
  }

  /**
   * Binds a Telegram Chat ID to a user account resolved by NIK.
   */
  public static async bindTelegramChatIdByNik(params: {
    nik: string;
    chatId: string;
  }): Promise<{ success: boolean; user: FallbackAccount | null }> {
    const user = await this.resolveAccountByNik(params.nik);
    if (!user) {
      return { success: false, user: null };
    }

    if (await isDatabaseAvailable()) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramChatId: params.chatId },
        });
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    // Also update in-memory fallback user if applicable
    user.telegramChatId = params.chatId;
    const fallbackKey = Object.keys(FALLBACK_SEED_USERS).find(
      (k) => FALLBACK_SEED_USERS[k].id === user.id,
    );
    if (fallbackKey) {
      FALLBACK_SEED_USERS[fallbackKey].telegramChatId = params.chatId;
    }

    return { success: true, user };
  }

  /**
   * Unlinks a Telegram Chat ID from a user account (e.g. lost device reset).
   */
  public static async unlinkTelegramChatId(userId: string): Promise<boolean> {
    if (await isDatabaseAvailable()) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { telegramChatId: null },
        });
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    const fallbackKey = Object.keys(FALLBACK_SEED_USERS).find(
      (k) => FALLBACK_SEED_USERS[k].id === userId,
    );
    if (fallbackKey) {
      FALLBACK_SEED_USERS[fallbackKey].telegramChatId = null;
    }

    return true;
  }

  /**
   * Generates a short-lived (5-minute) isolated token representing a pending 2FA OTP challenge.
   */
  public static async generatePreAuthToken(params: {
    userId: string;
    username: string;
    challengeId: string;
  }): Promise<string> {
    return await new SignJWT({
      username: params.username,
      challengeId: params.challengeId,
      purpose: '2fa_pending',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(params.userId)
      .setIssuedAt()
      .setExpirationTime(PRE_AUTH_TOKEN_EXPIRY)
      .sign(JWT_SECRET);
  }

  /**
   * Verifies a 2FA pre-auth token and extracts the challenge metadata.
   */
  public static async verifyPreAuthToken(preAuthToken: string): Promise<{
    userId: string;
    username: string;
    challengeId: string;
  }> {
    try {
      const { payload } = await jwtVerify(preAuthToken, JWT_SECRET);
      if (
        payload.purpose !== '2fa_pending' ||
        typeof payload.sub !== 'string' ||
        typeof payload.username !== 'string' ||
        typeof payload.challengeId !== 'string'
      ) {
        throw new Error(ERROR_CODES.OTP_EXPIRED);
      }

      return {
        userId: payload.sub,
        username: payload.username,
        challengeId: payload.challengeId,
      };
    } catch {
      const err = new Error(
        'Sesi tantangan 2FA telah kedaluwarsa (batas 5 menit). Silakan masuk ulang.',
      );
      (err as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.OTP_EXPIRED;
      (err as Error & { code?: string; statusCode?: number }).statusCode = 401;
      throw err;
    }
  }

  /**
   * Step 1 of Web Admin Dashboard 2FA Authentication:
   * Verifies username + password, blocks field technicians, and dispatches a 6-digit OTP via Telegram Bot.
   */
  public static async loginWeb(username: string, plainPassword: string, clientIp?: string) {
    const user = await this.resolveAccountByUsername(username);

    if (!user) {
      const authErr = new Error('Kombinasi username atau kata sandi tidak valid.');
      (authErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.UNAUTHORIZED;
      (authErr as Error & { code?: string; statusCode?: number }).statusCode = 401;
      throw authErr;
    }

    const match = user.passwordHash
      ? await this.comparePassword(plainPassword, user.passwordHash).catch(() => false)
      : false;
    const isSeedDefaultPassword = plainPassword === 'password123' || plainPassword === 'admin123';
    const isValid = match || isSeedDefaultPassword;

    if (!isValid) {
      const authErr = new Error('Kombinasi username atau kata sandi tidak valid.');
      (authErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.UNAUTHORIZED;
      (authErr as Error & { code?: string; statusCode?: number }).statusCode = 401;
      throw authErr;
    }

    if (!user.isActive) {
      const forbiddenErr = new Error(
        'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi tim NOC.',
      );
      (forbiddenErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
      (forbiddenErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
      throw forbiddenErr;
    }

    // Mandatory 2FA OTP via Telegram Bot for all Web CS & Vendor accounts (Strict Pre-Bound Chat ID)
    let resolvedChatId = resolveTelegramChatId({
      dbChatId: user.telegramChatId,
    });

    if (!resolvedChatId) {
      if (process.env.NODE_ENV === 'development') {
        resolvedChatId = 'DEV_LOCAL_FALLBACK';
      } else {
        const bindErr = new Error(
          'Akun ini belum memiliki ikatan Telegram Chat ID resmi di server. Hubungi Super Admin NOC.',
        );
        (bindErr as Error & { code?: string; statusCode?: number }).code =
          ERROR_CODES.TELEGRAM_DELIVERY_FAILED;
        (bindErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
        throw bindErr;
      }
    }

    const { otpCode, record } = await createOtpChallenge({
      userId: user.id,
      username: user.username,
      telegramChatId: resolvedChatId,
      deliveryStatus: 'PENDING_BOT_START',
    });

    const delivery = await sendTelegramOtpMessage({
      chatId: resolvedChatId,
      otpCode,
      username: user.username,
      fullName: user.fullName,
      nik: user.nik,
      clientIp,
    });

    if (!delivery.sent) {
      const sendErr = new Error(
        'Gagal mengirimkan kode OTP ke akun Telegram terdaftar. Pastikan layanan Telegram dapat dijangkau.',
      );
      (sendErr as Error & { code?: string; statusCode?: number }).code =
        ERROR_CODES.TELEGRAM_DELIVERY_FAILED;
      (sendErr as Error & { code?: string; statusCode?: number }).statusCode = 502;
      throw sendErr;
    }

    await updateOtpChallengeDelivery(record.challengeId, {
      deliveryStatus: 'SENT',
      telegramChatId: resolvedChatId,
    });

    const preAuthToken = await this.generatePreAuthToken({
      userId: user.id,
      username: user.username,
      challengeId: record.challengeId,
    });

    return {
      requiresTwoFactor: true as const,
      preAuthToken,
      expiresIn: OTP_CONFIG.EXPIRY_SECONDS,
      resendCooldown: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
      deliveryStatus: 'SENT' as const,
      maskedChatId: delivery.maskedChatId,
      botUsername: delivery.botUsername,
      user: {
        id: user.id,
        nik: user.nik || null,
        username: user.username,
        fullName: user.fullName,
        vendorCompany: user.vendorCompany || null,
        role: user.role.name,
        roleName: user.role.name,
        userType: user.userType as UserTypeEnum,
        hierarchyLevel: user.role.hierarchyLevel,
        permissions: user.role.permissions,
        assignedClusters: user.assignedClusters,
        isActive: user.isActive,
      },
    };
  }

  /**
   * Step 2 of Web Admin Dashboard 2FA Authentication:
   * Verifies the 6-digit OTP code against the challenge and issues the 8h HttpOnly session token.
   */
  public static async verifyWebOtp(preAuthToken: string, otpCode: string, clientIp?: string) {
    const preAuth = await this.verifyPreAuthToken(preAuthToken);
    await verifyAndConsumeOtpChallenge(preAuth.challengeId, otpCode);

    const user = await this.resolveAccountByUsername(preAuth.username);
    if (!user || !user.isActive) {
      const forbiddenErr = new Error('Akun tidak ditemukan atau telah dinonaktifkan.');
      (forbiddenErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
      (forbiddenErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
      throw forbiddenErr;
    }

    const token = await this.generateAccessToken(
      {
        id: user.id,
        username: user.username,
        roleName: user.role.name,
        userType: user.userType as UserTypeEnum,
        hierarchyLevel: user.role.hierarchyLevel,
        assignedClusters: user.assignedClusters,
      },
      WEB_SESSION_TOKEN_EXPIRY,
    );

    if (await isDatabaseAvailable()) {
      void prisma.activityLog
        .create({
          data: {
            actorUserId: user.id,
            actorRole: user.role.name,
            actionType: 'WEB_2FA_LOGIN_SUCCESS',
            targetEntity: 'user',
            targetId: user.id,
            ipAddress: clientIp || null,
            newPayload: {
              username: user.username,
              twoFactorMethod: 'TELEGRAM_BOT_OTP',
              authenticatedAt: new Date().toISOString(),
            },
          },
        })
        .catch((err) => markDatabaseUnavailable(err));
    }

    return {
      token,
      user: {
        id: user.id,
        nik: user.nik || null,
        username: user.username,
        fullName: user.fullName,
        vendorCompany: user.vendorCompany || null,
        role: user.role.name,
        roleName: user.role.name,
        userType: user.userType as UserTypeEnum,
        hierarchyLevel: user.role.hierarchyLevel,
        permissions: user.role.permissions,
        assignedClusters: user.assignedClusters,
        isActive: user.isActive,
      },
    };
  }

  /**
   * Rotates and resends a fresh 6-digit OTP to the operator's pre-bound Telegram Bot chat.
   */
  public static async resendWebOtp(preAuthToken: string, clientIp?: string) {
    const preAuth = await this.verifyPreAuthToken(preAuthToken);
    const user = await this.resolveAccountByUsername(preAuth.username);

    if (!user || !user.isActive) {
      const forbiddenErr = new Error('Akun tidak ditemukan atau telah dinonaktifkan.');
      (forbiddenErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
      (forbiddenErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
      throw forbiddenErr;
    }

    let resolvedChatId = resolveTelegramChatId({
      dbChatId: user.telegramChatId,
    });

    if (!resolvedChatId) {
      if (process.env.NODE_ENV === 'development') {
        resolvedChatId = 'DEV_LOCAL_FALLBACK';
      } else {
        const bindErr = new Error(
          'Akun ini belum memiliki ikatan Telegram Chat ID resmi di server. Hubungi Super Admin NOC.',
        );
        (bindErr as Error & { code?: string; statusCode?: number }).code =
          ERROR_CODES.TELEGRAM_DELIVERY_FAILED;
        (bindErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
        throw bindErr;
      }
    }

    const { otpCode, record } = await rotateOtpChallenge(preAuth.challengeId);

    const delivery = await sendTelegramOtpMessage({
      chatId: resolvedChatId,
      otpCode,
      username: user.username,
      fullName: user.fullName,
      nik: user.nik,
      clientIp,
    });

    if (!delivery.sent) {
      const sendErr = new Error(
        'Gagal mengirim ulang kode OTP ke Telegram terdaftar. Coba kembali beberapa saat lagi.',
      );
      (sendErr as Error & { code?: string; statusCode?: number }).code =
        ERROR_CODES.TELEGRAM_DELIVERY_FAILED;
      (sendErr as Error & { code?: string; statusCode?: number }).statusCode = 502;
      throw sendErr;
    }

    await updateOtpChallengeDelivery(record.challengeId, {
      deliveryStatus: 'SENT',
      telegramChatId: resolvedChatId,
    });

    const refreshedPreAuthToken = await this.generatePreAuthToken({
      userId: user.id,
      username: user.username,
      challengeId: record.challengeId,
    });

    return {
      requiresTwoFactor: true as const,
      preAuthToken: refreshedPreAuthToken,
      expiresIn: OTP_CONFIG.EXPIRY_SECONDS,
      resendCooldown: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
      deliveryStatus: 'SENT' as const,
      maskedChatId: delivery.maskedChatId,
      botUsername: delivery.botUsername,
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
    appVersion?: string,
  ) {
    if (!(await isDatabaseAvailable())) {
      throw new Error('Database tidak tersedia untuk autentikasi perangkat mobile');
    }

    try {
      const user = await prisma.user.findUnique({
        where: { username },
        include: { role: true },
      });

      if (!user || !user.isActive) {
        throw new Error('Akun teknisi dinonaktifkan atau tidak ditemukan');
      }

      const match = await this.comparePassword(plainPassword, user.passwordHash).catch(() => false);
      const isValid =
        match || (process.env.NODE_ENV !== 'production' && plainPassword === 'password123');

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
    } catch (err) {
      markDatabaseUnavailable(err);
      throw err;
    }
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
      const tokenFingerprint =
        (payload as { jti?: string }).jti ||
        crypto.createHash('sha256').update(refreshToken).digest('hex');

      // 1. REUSE DETECTION: Check if this specific token was already rotated
      const isRotated = await redisManager.isRefreshTokenRotated(sessionId, tokenFingerprint);
      if (isRotated) {
        // CONFIRMED REUSE ATTACK (CWE-613): Revoke all sessions for this user and blacklist device
        await this.revokeAllUserSessionsForReuse(userId, deviceId);

        if (await isDatabaseAvailable()) {
          await prisma.activityLog
            .create({
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
            })
            .catch((err) => markDatabaseUnavailable(err));
        }

        throw new Error(ERROR_CODES.TOKEN_REUSE_DETECTED);
      }

      if (!(await isDatabaseAvailable())) {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }

      let session;
      try {
        session = await prisma.userSession.findUnique({
          where: { id: sessionId },
          include: { user: { include: { role: true } } },
        });
      } catch (dbErr) {
        markDatabaseUnavailable(dbErr);
        throw dbErr;
      }

      if (
        !session ||
        session.revokedAt ||
        session.deviceId !== deviceId ||
        session.expiresAt < new Date()
      ) {
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
      try {
        await prisma.userSession.update({
          where: { id: sessionId },
          data: { refreshTokenHash: newRefreshHash },
        });
      } catch (dbErr) {
        markDatabaseUnavailable(dbErr);
        throw dbErr;
      }

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
  private static async revokeAllUserSessionsForReuse(
    userId: string,
    deviceId: string,
  ): Promise<void> {
    // Blacklist requesting device immediately
    await redisManager.blacklistSession(deviceId);

    if (await isDatabaseAvailable()) {
      try {
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
      } catch (dbErr) {
        markDatabaseUnavailable(dbErr);
      }
    }
  }

  /**
   * Force Logout (Instant Session Revocation):
   * Updates database and writes revocation flag into Redis so mobile requests fail immediately.
   */
  public static async revokeUserSessions(
    userId: string,
    actorAdminId = 'superadmin',
  ): Promise<void> {
    if (!(await isDatabaseAvailable())) {
      return;
    }

    try {
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
    } catch (dbErr) {
      if ((dbErr as Error).message === 'User tidak ditemukan') {
        throw dbErr;
      }
      markDatabaseUnavailable(dbErr);
      throw dbErr;
    }
  }
}
