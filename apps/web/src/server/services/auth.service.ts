import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { env } from '@/env';
import {
  isStrictLiveMode,
  requireLiveDatabase,
  rethrowIfStrictDatabaseError,
  ServiceUnavailableError,
} from '../lib/live-data';
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
  STANDARD_ERROR_MESSAGES,
  OTP_CONFIG,
  UserTypeEnum,
} from '@repo/shared';

const NUMERIC_CHAT_ID_RE = /^-?\d{5,20}$/;

function getAccessJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || env.JWT_SECRET);
}

function getRefreshTokenSecretStr(): string {
  const explicit = process.env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const baseSecret = process.env.JWT_SECRET || env.JWT_SECRET;
  return crypto.createHmac('sha256', baseSecret).update('fiberops:jwt-refresh:v1').digest('hex');
}

function getRefreshJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getRefreshTokenSecretStr());
}

function hasExactChatIdToken(stored: string | null | undefined, targetId: string): boolean {
  if (!stored) return false;
  return stored
    .split(',')
    .map((part) => part.trim())
    .includes(targetId);
}

const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived for technicians
const WEB_SESSION_TOKEN_EXPIRY = '8h'; // Web NOC dashboard session
const PRE_AUTH_TOKEN_EXPIRY = '5m'; // 2FA OTP challenge token
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const BCRYPT_SALT_ROUNDS = 10;
// Pre-computed valid cost-10 bcrypt hash for constant-time dummy compare (anti-timing side-channel)
const DUMMY_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

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
    assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01', 'PLBKBNGR01', 'PLBTKEGR01'],
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
    assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01', 'PLBKBNGR01', 'PLBTKEGR01'],
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
    assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01', 'PLBKBNGR01', 'PLBTKEGR01'],
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
    assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01'],
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
    assignedClusters: ['PLBHRAGA01', 'PLBBSGGA01'],
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
    vendorCompany: 'PT Sarana Optik Palembang',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['PLBKBNGR01', 'PLBTKEGR01'],
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
    vendorCompany: 'PT Sarana Optik Palembang',
    userType: 'TECHNICIAN',
    isActive: true,
    assignedClusters: ['PLBKBNGR01', 'PLBTKEGR01'],
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
    assignedClusters: ['PLBHRAGA01', 'PLBKBNGR01'],
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
    assignedClusters: ['PLBBSGGA01', 'PLBTKEGR01'],
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

  public static hashRefreshToken(refreshToken: string): string {
    return crypto
      .createHmac('sha256', getRefreshTokenSecretStr())
      .update(refreshToken)
      .digest('hex');
  }

  public static verifyRefreshTokenHash(refreshToken: string, storedHash: string): boolean {
    if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) {
      return false;
    }
    const expectedHex = this.hashRefreshToken(refreshToken);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const storedBuf = Buffer.from(storedHash.toLowerCase(), 'hex');
    return expectedBuf.length === storedBuf.length && crypto.timingSafeEqual(expectedBuf, storedBuf);
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
      sessionId?: string;
    },
    expiresIn: string = ACCESS_TOKEN_EXPIRY,
  ): Promise<string> {
    const jti = crypto.randomUUID();
    const audience = user.deviceId && user.deviceId !== 'web-browser' ? 'mobile' : 'web';
    return await new SignJWT({
      username: user.username,
      role: user.roleName,
      userType: user.userType,
      hierarchyLevel: user.hierarchyLevel,
      assignedClusters: user.assignedClusters,
      ...(user.deviceId ? { deviceId: user.deviceId } : {}),
      ...(user.sessionId ? { sessionId: user.sessionId } : {}),
      tokenType: 'access',
      jti,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setAudience(audience)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(getAccessJwtSecretBytes());
  }

  /**
   * Generates Refresh Token for mobile technician or web session rotation.
   * Includes a unique UUID jti and channel audience separation.
   */
  public static async generateRefreshToken(
    userId: string,
    sessionId: string,
    deviceId: string,
    channel: 'mobile' | 'web' = 'mobile',
  ): Promise<string> {
    const jti = crypto.randomUUID();
    return await new SignJWT({
      sessionId,
      deviceId,
      jti,
      tokenType: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setAudience(channel)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${REFRESH_TOKEN_EXPIRY_DAYS}d`)
      .sign(getRefreshJwtSecretBytes());
  }

  /**
   * Verifies access token cryptographically for logout (without DB session/role checks so
   * demoted or session-invalidated callers can still cleanly revoke their jti and clear cookies).
   */
  public static async verifyAccessTokenForLogout(token: string): Promise<{
    userId: string;
    jti?: string;
    sessionId?: string;
    deviceId?: string;
    exp?: number;
  }> {
    try {
      const { payload } = await jwtVerify(token, getAccessJwtSecretBytes(), {
        algorithms: ['HS256'],
        audience: ['web', 'mobile'],
      });
      if (payload.tokenType !== 'access' || payload.purpose === '2fa_pending' || !payload.sub) {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }
      const jti = typeof payload.jti === 'string' ? payload.jti : undefined;
      if (jti && (await redisManager.isJwtRevoked(jti))) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }
      return {
        userId: payload.sub,
        jti,
        sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
        deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : undefined,
        exp: typeof payload.exp === 'number' ? payload.exp : undefined,
      };
    } catch (err) {
      if (err instanceof Error && err.message === ERROR_CODES.SESSION_REVOKED) {
        throw err;
      }
      throw new Error(ERROR_CODES.UNAUTHORIZED);
    }
  }

  /**
   * Verifies access token signature and checks instant session revocation in Redis/DB.
   * Enforces Law 4: Dual-Auth & Instant Session Revocation.
   */
  public static async verifyAccessToken(token: string): Promise<UserSessionContext> {
    try {
      const { payload } = await jwtVerify(token, getAccessJwtSecretBytes(), {
        algorithms: ['HS256'],
        audience: ['web', 'mobile'],
      });
      if (payload.tokenType !== 'access' || payload.purpose === '2fa_pending' || !payload.sub) {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }
      const userId = payload.sub;
      const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId : undefined;
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
      const jti = typeof payload.jti === 'string' ? payload.jti : undefined;

      if (jti && (await redisManager.isJwtRevoked(jti))) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }
      if (sessionId && (await redisManager.isSessionBlacklisted(sessionId))) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }
      if (deviceId && deviceId !== 'web-browser' && (await redisManager.isSessionBlacklisted(deviceId))) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk verifikasi sesi.')) {
        try {
          // Check user existence and active status in DB with narrow projection
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              nik: true,
              username: true,
              fullName: true,
              vendorCompany: true,
              userType: true,
              isActive: true,
              assignedClusters: true,
              role: {
                select: {
                  name: true,
                  hierarchyLevel: true,
                  permissions: true,
                },
              },
            },
          });

          if (!user || !user.isActive) {
            throw new Error(ERROR_CODES.SESSION_REVOKED);
          }

          if (user.id === userId) {
            // Verify active DB UserSession for mobile device tokens, or web tokens with sessionId in strict mode
            if (deviceId && deviceId !== 'web-browser') {
              const activeSession = await prisma.userSession.findFirst({
                where: {
                  ...(sessionId ? { id: sessionId } : {}),
                  userId: user.id,
                  deviceId,
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
                select: { id: true },
              });

              if (!activeSession) {
                throw new Error(ERROR_CODES.SESSION_REVOKED);
              }
            } else if (sessionId && isStrictLiveMode()) {
              const activeSession = await prisma.userSession.findFirst({
                where: {
                  id: sessionId,
                  userId: user.id,
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
                select: { id: true },
              });

              if (!activeSession) {
                throw new Error(ERROR_CODES.SESSION_REVOKED);
              }
            }

            return {
              userId: user.id,
              nik: user.nik,
              username: user.username,
              fullName: user.fullName,
              vendorCompany: user.vendorCompany ?? null,
              role: user.role.name,
              userType: user.userType as UserTypeEnum,
              hierarchyLevel: user.role.hierarchyLevel,
              permissions: Array.isArray(user.role.permissions)
                ? user.role.permissions.map(String)
                : [],
              assignedClusters: user.assignedClusters,
              deviceId,
              jti,
              sessionId,
            };
          }
        } catch (dbErr) {
          if (
            dbErr instanceof Error &&
            (dbErr.message === ERROR_CODES.SESSION_REVOKED ||
              dbErr.message === ERROR_CODES.UNAUTHORIZED)
          ) {
            throw dbErr;
          }
          rethrowIfStrictDatabaseError(
            dbErr,
            'Koneksi database PostgreSQL terputus saat memverifikasi sesi.',
          );
        }
      }

      // Offline fallback resolution using verified JWT claims & fallback seed users (non-strict test mode only)
      const payloadUsername = typeof payload.username === 'string' ? payload.username.toLowerCase() : '';
      const fallbackUser =
        (payloadUsername ? FALLBACK_SEED_USERS[payloadUsername] : undefined) ||
        Object.values(FALLBACK_SEED_USERS).find((u) => u.id === userId);

      if (fallbackUser) {
        return {
          userId: fallbackUser.id,
          nik: fallbackUser.nik ?? null,
          username: fallbackUser.username,
          fullName: fallbackUser.fullName,
          vendorCompany: fallbackUser.vendorCompany ?? null,
          role: fallbackUser.role.name,
          userType: fallbackUser.userType,
          hierarchyLevel: fallbackUser.role.hierarchyLevel,
          permissions: fallbackUser.role.permissions,
          assignedClusters: fallbackUser.assignedClusters,
          deviceId,
          jti,
          sessionId,
        };
      }

      return {
        userId,
        username: typeof payload.username === 'string' ? payload.username : userId,
        fullName: typeof payload.username === 'string' ? payload.username : userId,
        role: typeof payload.role === 'string' ? payload.role : 'Super Admin',
        userType: (payload.userType as UserTypeEnum) || 'SUPER_ADMIN',
        hierarchyLevel: typeof payload.hierarchyLevel === 'number' ? payload.hierarchyLevel : 100,
        permissions: Array.isArray(payload.permissions)
          ? payload.permissions.map(String)
          : undefined,
        assignedClusters: Array.isArray(payload.assignedClusters)
          ? (payload.assignedClusters as string[])
          : [],
        deviceId,
        jti,
        sessionId,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }
      if (err instanceof Error && err.message === ERROR_CODES.SESSION_REVOKED) {
        throw err;
      }
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
   * Resolves a web operator or vendor account by username from PostgreSQL or fallback seed accounts (non-strict test mode only).
   */
  public static async resolveAccountByUsername(username: string): Promise<FallbackAccount | null> {
    const normalizedUsername = username.trim().toLowerCase();
    let dbUser: FallbackAccount | null = null;

    if (await requireLiveDatabase('Database PostgreSQL tidak dapat dijangkau saat login.')) {
      try {
        const found = await prisma.user.findUnique({
          where: { username: normalizedUsername },
          include: { role: true },
        });
        if (found) {
          dbUser = this.mapDbUserToAccount(found);
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal menghubungi database PostgreSQL.');
        if (isStrictLiveMode()) {
          throw err;
        }
      }
      if (isStrictLiveMode()) {
        return dbUser;
      }
    }

    return dbUser || FALLBACK_SEED_USERS[normalizedUsername] || null;
  }

  /**
   * Resolves an account by NIK from PostgreSQL or fallback seed accounts (non-strict test mode only).
   */
  public static async resolveAccountByNik(nik: string): Promise<FallbackAccount | null> {
    const cleanNik = nik.trim().toUpperCase();
    if (await requireLiveDatabase('Database PostgreSQL tidak dapat dijangkau.')) {
      try {
        const found = await prisma.user.findFirst({
          where: { nik: cleanNik },
          include: { role: true },
        });
        if (found) {
          return this.mapDbUserToAccount(found);
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal menghubungi database PostgreSQL.');
        if (isStrictLiveMode()) {
          throw err;
        }
      }
      if (isStrictLiveMode()) {
        return null;
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
    if (!NUMERIC_CHAT_ID_RE.test(cleanId)) return null;

    if (await requireLiveDatabase('Database PostgreSQL tidak dapat dijangkau.')) {
      try {
        const exactMatch = await prisma.user.findFirst({
          where: {
            isActive: true,
            telegramChatId: cleanId,
          },
          include: { role: true },
        });
        if (exactMatch && hasExactChatIdToken(exactMatch.telegramChatId, cleanId)) {
          return this.mapDbUserToAccount(exactMatch);
        }

        const candidates = await prisma.user.findMany({
          where: {
            isActive: true,
            telegramChatId: { contains: cleanId },
          },
          include: { role: true },
        });
        const matched = candidates.find((u) => hasExactChatIdToken(u.telegramChatId, cleanId));
        if (matched) {
          return this.mapDbUserToAccount(matched);
        }
        return null;
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal menghubungi database PostgreSQL.');
        if (isStrictLiveMode()) {
          throw err;
        }
      }
      if (isStrictLiveMode()) {
        return null;
      }
    }

    const fallback = Object.values(FALLBACK_SEED_USERS).find(
      (u) => u.isActive && hasExactChatIdToken(u.telegramChatId, cleanId),
    );
    return fallback || null;
  }

  /**
   * Binds a Telegram Chat ID to an unbound non-privileged account by NIK.
   * Refuses unauthenticated overwrites of existing telegramChatId or ADMIN/SUPER_ADMIN accounts.
   */
  public static async bindTelegramChatIdByNik(params: {
    nik: string;
    chatId: string;
  }): Promise<{ success: boolean; user: FallbackAccount | null }> {
    const cleanChatId = String(params.chatId).trim();
    if (!NUMERIC_CHAT_ID_RE.test(cleanChatId)) {
      return { success: false, user: null };
    }

    const user = await this.resolveAccountByNik(params.nik);
    if (
      !user ||
      user.userType === 'SUPER_ADMIN' ||
      user.userType === 'ADMIN' ||
      Boolean(user.telegramChatId)
    ) {
      return { success: false, user: null };
    }

    if (await requireLiveDatabase('Database PostgreSQL tidak dapat dijangkau.')) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramChatId: cleanChatId },
        });
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal menyimpan ikatan Telegram ke database.');
      }
    }

    // Also update in-memory fallback user if applicable
    user.telegramChatId = cleanChatId;
    const fallbackKey = Object.keys(FALLBACK_SEED_USERS).find(
      (k) => FALLBACK_SEED_USERS[k].id === user.id,
    );
    if (fallbackKey) {
      FALLBACK_SEED_USERS[fallbackKey].telegramChatId = cleanChatId;
    }

    return { success: true, user };
  }

  /**
   * Unlinks a Telegram Chat ID from a user account (e.g. lost device reset).
   */
  public static async unlinkTelegramChatId(userId: string): Promise<boolean> {
    if (await requireLiveDatabase('Database PostgreSQL tidak dapat dijangkau.')) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { telegramChatId: null },
        });
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal memutuskan tautan Telegram dari database.');
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
   * Embeds channel & optional mobile device metadata to prevent cross-channel/device replay.
   */
  public static async generatePreAuthToken(params: {
    userId: string;
    username: string;
    challengeId: string;
    channel?: 'web' | 'mobile';
    deviceId?: string;
    deviceModel?: string;
    appVersion?: string;
  }): Promise<string> {
    return await new SignJWT({
      username: params.username,
      challengeId: params.challengeId,
      purpose: '2fa_pending',
      tokenType: '2fa_pending',
      channel: params.channel ?? 'web',
      ...(params.deviceId ? { deviceId: params.deviceId } : {}),
      ...(params.deviceModel ? { deviceModel: params.deviceModel } : {}),
      ...(params.appVersion ? { appVersion: params.appVersion } : {}),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(params.userId)
      .setAudience('2fa')
      .setIssuedAt()
      .setExpirationTime(PRE_AUTH_TOKEN_EXPIRY)
      .sign(getAccessJwtSecretBytes());
  }

  /**
   * Verifies a 2FA pre-auth token and extracts the challenge metadata.
   */
  public static async verifyPreAuthToken(preAuthToken: string): Promise<{
    userId: string;
    username: string;
    challengeId: string;
    channel: 'web' | 'mobile';
    deviceId?: string;
    deviceModel?: string;
    appVersion?: string;
  }> {
    try {
      const { payload } = await jwtVerify(preAuthToken, getAccessJwtSecretBytes(), {
        algorithms: ['HS256'],
        audience: '2fa',
      });
      if (
        payload.purpose !== '2fa_pending' ||
        (payload.tokenType !== undefined && payload.tokenType !== '2fa_pending') ||
        typeof payload.sub !== 'string' ||
        typeof payload.username !== 'string' ||
        typeof payload.challengeId !== 'string'
      ) {
        throw new Error(ERROR_CODES.OTP_EXPIRED);
      }

      const channel = payload.channel === 'mobile' ? 'mobile' : 'web';
      return {
        userId: payload.sub,
        username: payload.username,
        challengeId: payload.challengeId,
        channel,
        deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : undefined,
        deviceModel: typeof payload.deviceModel === 'string' ? payload.deviceModel : undefined,
        appVersion: typeof payload.appVersion === 'string' ? payload.appVersion : undefined,
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
    const hasHash = Boolean(user?.passwordHash);
    const candidateHash = user?.passwordHash || DUMMY_BCRYPT_HASH;
    const match = await this.comparePassword(plainPassword, candidateHash).catch(() => false);
    const isBuiltInSeedAccount = Boolean(
      user && Object.prototype.hasOwnProperty.call(FALLBACK_SEED_USERS, user.username.toLowerCase()),
    );
    const allowSeedPasswordFallback =
      process.env.NODE_ENV !== 'production' &&
      (isBuiltInSeedAccount || !isStrictLiveMode());
    const isSeedDefaultPassword =
      Boolean(user) &&
      allowSeedPasswordFallback &&
      (plainPassword === 'password123' ||
        plainPassword === 'admin123' ||
        plainPassword === 'FiberOps#2026');
    const isValid = Boolean(user) && ((hasHash && match) || isSeedDefaultPassword);

    if (!user || !isValid || !user.isActive) {
      const authErr = new Error(STANDARD_ERROR_MESSAGES.INVALID_CREDENTIALS) as Error & {
        code?: string;
        statusCode?: number;
      };
      authErr.code = ERROR_CODES.INVALID_CREDENTIALS;
      authErr.statusCode = 401;
      throw authErr;
    }

    if (user.userType === 'TECHNICIAN') {
      const forbiddenErr = new Error(
        'Akun Teknisi Lapangan hanya dapat diakses melalui Aplikasi Mobile FiberOps atau Bot Telegram.',
      ) as Error & { code?: string; statusCode?: number };
      forbiddenErr.code = ERROR_CODES.FORBIDDEN;
      forbiddenErr.statusCode = 403;
      throw forbiddenErr;
    }

    // Mandatory 2FA OTP via Telegram Bot for all Web Admin & NOC accounts (Strict Pre-Bound Chat ID)
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
        username: user.username,
        fullName: user.fullName,
        role: user.role.name,
        roleName: user.role.name,
        userType: user.userType as UserTypeEnum,
        isActive: user.isActive,
      },
    };
  }

  /**
   * Step 2 of Web Admin Dashboard 2FA Authentication:
   * Verifies the 6-digit OTP code against the challenge and issues the 8h HttpOnly session & refresh tokens.
   */
  public static async verifyWebOtp(preAuthToken: string, otpCode: string, clientIp?: string) {
    const preAuth = await this.verifyPreAuthToken(preAuthToken);
    if (preAuth.channel === 'mobile') {
      const forbiddenErr = new Error(
        'Token tantangan OTP mobile tidak dapat digunakan untuk sesi dasbor web.',
      );
      (forbiddenErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
      (forbiddenErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
      throw forbiddenErr;
    }

    await verifyAndConsumeOtpChallenge(preAuth.challengeId, otpCode, preAuth.userId);

    const user = await this.resolveAccountByUsername(preAuth.username);
    if (!user || !user.isActive) {
      const forbiddenErr = new Error('Akun tidak ditemukan atau telah dinonaktifkan.');
      (forbiddenErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
      (forbiddenErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
      throw forbiddenErr;
    }

    const sessionId = crypto.randomUUID();
    const token = await this.generateAccessToken(
      {
        id: user.id,
        username: user.username,
        roleName: user.role.name,
        userType: user.userType as UserTypeEnum,
        hierarchyLevel: user.role.hierarchyLevel,
        assignedClusters: user.assignedClusters,
        sessionId,
      },
      WEB_SESSION_TOKEN_EXPIRY,
    );

    const refreshToken = await this.generateRefreshToken(
      user.id,
      sessionId,
      'web-browser',
      'web',
    );
    const refreshHash = this.hashRefreshToken(refreshToken);

    if (await isDatabaseAvailable()) {
      try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
        await prisma.userSession.create({
          data: {
            id: sessionId,
            userId: user.id,
            deviceId: 'web-browser',
            refreshTokenHash: refreshHash,
            expiresAt,
          },
        });
      } catch (dbErr) {
        rethrowIfStrictDatabaseError(dbErr, 'Gagal menyimpan sesi dasbor web ke PostgreSQL.');
      }

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
              sessionId,
              twoFactorMethod: 'TELEGRAM_BOT_OTP',
              authenticatedAt: new Date().toISOString(),
            },
          },
        })
        .catch((err) => markDatabaseUnavailable(err));
    }

    return {
      token,
      refreshToken,
      sessionId,
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
      channel: preAuth.channel,
      deviceId: preAuth.deviceId,
      deviceModel: preAuth.deviceModel,
      appVersion: preAuth.appVersion,
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
   * Step 1 of Mobile App 2FA Authentication:
   * Verifies credentials, binds device metadata into preAuthToken, and dispatches 6-digit OTP via Telegram Bot.
   */
  public static async loginMobile(
    username: string,
    plainPassword: string,
    deviceId: string,
    deviceModel?: string,
    appVersion?: string,
    clientIp?: string,
  ) {
    if (!(await isDatabaseAvailable())) {
      throw new ServiceUnavailableError('Database PostgreSQL tidak tersedia untuk autentikasi perangkat mobile');
    }

    try {
      const normalizedUsername = username.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { username: normalizedUsername },
        include: { role: true },
      });

      const hasHash = Boolean(user?.passwordHash);
      const candidateHash = user?.passwordHash || DUMMY_BCRYPT_HASH;
      const match = await this.comparePassword(plainPassword, candidateHash).catch(() => false);
      const isBuiltInSeedAccount = Boolean(
        user &&
          Object.prototype.hasOwnProperty.call(FALLBACK_SEED_USERS, user.username.toLowerCase()),
      );
      const allowSeedPasswordFallback =
        process.env.NODE_ENV !== 'production' &&
        (isBuiltInSeedAccount || !isStrictLiveMode());
      const isValid =
        Boolean(user) &&
        ((hasHash && match) ||
          (allowSeedPasswordFallback &&
            (plainPassword === 'password123' ||
              plainPassword === 'admin123' ||
              plainPassword === 'FiberOps#2026')));

      if (!user || !isValid || !user.isActive) {
        const authErr = new Error(STANDARD_ERROR_MESSAGES.INVALID_CREDENTIALS) as Error & {
          code?: string;
          statusCode?: number;
        };
        authErr.code = ERROR_CODES.INVALID_CREDENTIALS;
        authErr.statusCode = 401;
        throw authErr;
      }

      // Mandatory 2FA OTP via Telegram Bot (same resolution & dev fallback as Web NOC login)
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
        channel: 'mobile',
        deviceId: deviceId.trim(),
        deviceModel: deviceModel?.trim() || undefined,
        appVersion: appVersion?.trim() || undefined,
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
          username: user.username,
          fullName: user.fullName,
          role: user.role.name,
          roleName: user.role.name,
          userType: user.userType as UserTypeEnum,
          isActive: user.isActive,
        },
      };
    } catch (err) {
      rethrowIfStrictDatabaseError(
        err,
        'Database PostgreSQL tidak tersedia untuk autentikasi perangkat mobile',
      );
      throw err;
    }
  }

  /**
   * Step 2 of Mobile App 2FA Authentication:
   * Verifies the 6-digit OTP code, enforces device binding, creates UserSession, and issues access & refresh tokens.
   */
  public static async verifyMobileOtp(
    preAuthToken: string,
    otpCode: string,
    options?: {
      deviceId?: string;
      deviceModel?: string;
      appVersion?: string;
      clientIp?: string;
    },
  ) {
    const preAuth = await this.verifyPreAuthToken(preAuthToken);
    if (preAuth.channel !== 'mobile' || !preAuth.deviceId) {
      const forbiddenErr = new Error(
        'Token tantangan OTP ini tidak valid untuk autentikasi perangkat mobile.',
      );
      (forbiddenErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
      (forbiddenErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
      throw forbiddenErr;
    }

    const submittedDeviceId = options?.deviceId?.trim();
    if (submittedDeviceId && submittedDeviceId !== preAuth.deviceId) {
      const mismatchErr = new Error(
        'Identitas perangkat tidak sesuai dengan sesi verifikasi OTP. Silakan minta OTP ulang.',
      );
      (mismatchErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
      (mismatchErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
      throw mismatchErr;
    }

    await verifyAndConsumeOtpChallenge(preAuth.challengeId, otpCode, preAuth.userId);

    if (!(await isDatabaseAvailable())) {
      throw new ServiceUnavailableError('Database PostgreSQL tidak tersedia untuk autentikasi perangkat mobile');
    }

    const resolvedDeviceId = preAuth.deviceId;
    const resolvedDeviceModel = options?.deviceModel?.trim() || preAuth.deviceModel;
    const resolvedAppVersion = options?.appVersion?.trim() || preAuth.appVersion;

    try {
      const user = await prisma.user.findUnique({
        where: { id: preAuth.userId },
        include: { role: true },
      });

      if (!user || !user.isActive) {
        const forbiddenErr = new Error('Akun tidak ditemukan atau telah dinonaktifkan.');
        (forbiddenErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
        (forbiddenErr as Error & { code?: string; statusCode?: number }).statusCode = 403;
        throw forbiddenErr;
      }

      // Revoke previous sessions on the same device
      await prisma.userSession.updateMany({
        where: {
          userId: user.id,
          deviceId: resolvedDeviceId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      // Clear prior device blacklist flag upon authenticated mobile 2FA re-login
      await redisManager.unblacklistSession(resolvedDeviceId);

      // Create new session record
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

      const session = await prisma.userSession.create({
        data: {
          userId: user.id,
          deviceId: resolvedDeviceId,
          deviceModel: resolvedDeviceModel,
          appVersion: resolvedAppVersion,
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
        deviceId: resolvedDeviceId,
        sessionId: session.id,
      });

      const refreshToken = await this.generateRefreshToken(
        user.id,
        session.id,
        resolvedDeviceId,
        'mobile',
      );

      // Save refresh token HMAC-SHA256 digest (no bcrypt 72-byte truncation)
      const refreshHash = this.hashRefreshToken(refreshToken);
      await prisma.userSession.update({
        where: { id: session.id },
        data: { refreshTokenHash: refreshHash },
      });

      void prisma.activityLog
        .create({
          data: {
            actorUserId: user.id,
            actorRole: user.role.name,
            actionType: 'MOBILE_2FA_LOGIN_SUCCESS',
            targetEntity: 'user_session',
            targetId: session.id,
            ipAddress: options?.clientIp || null,
            newPayload: {
              username: user.username,
              deviceId: resolvedDeviceId,
              deviceModel: resolvedDeviceModel || null,
              appVersion: resolvedAppVersion || null,
              twoFactorMethod: 'TELEGRAM_BOT_OTP',
              authenticatedAt: new Date().toISOString(),
            },
          },
        })
        .catch((err) => markDatabaseUnavailable(err));

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          nik: user.nik || null,
          username: user.username,
          fullName: user.fullName,
          role: user.role.name,
          userType: user.userType as UserTypeEnum,
          hierarchyLevel: user.role.hierarchyLevel,
          assignedClusters: user.assignedClusters,
          isActive: user.isActive,
        },
      };
    } catch (err) {
      rethrowIfStrictDatabaseError(
        err,
        'Database PostgreSQL tidak tersedia untuk autentikasi perangkat mobile',
      );
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
  private static async rotateSessionTokens(params: {
    refreshToken: string;
    expectedChannel: 'mobile' | 'web';
    expectedDeviceId?: string;
  }) {
    try {
      const { payload } = await jwtVerify(params.refreshToken, getRefreshJwtSecretBytes(), {
        algorithms: ['HS256'],
        audience: params.expectedChannel,
      });
      if (payload.tokenType !== 'refresh' || typeof payload.sub !== 'string') {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }

      const userId = payload.sub;
      const sessionId = (payload as unknown as RefreshTokenPayload).sessionId;
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }
      const tokenDeviceId =
        typeof (payload as { deviceId?: unknown }).deviceId === 'string'
          ? ((payload as { deviceId?: string }).deviceId as string)
          : params.expectedDeviceId || 'web-browser';

      if (params.expectedDeviceId && tokenDeviceId !== params.expectedDeviceId) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      const tokenFingerprint =
        (typeof payload.jti === 'string' && payload.jti) ||
        crypto.createHash('sha256').update(params.refreshToken).digest('hex');

      // 1. REUSE DETECTION: Check if this specific token was already rotated
      const isRotated = await redisManager.isRefreshTokenRotated(sessionId, tokenFingerprint);
      if (isRotated) {
        await this.revokeAllUserSessionsForReuse(userId, tokenDeviceId, sessionId);

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
                  deviceId: tokenDeviceId,
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

      if (await redisManager.isSessionBlacklisted(sessionId)) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }
      if (
        tokenDeviceId !== 'web-browser' &&
        (await redisManager.isSessionBlacklisted(tokenDeviceId))
      ) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      if (!(await isDatabaseAvailable())) {
        throw new ServiceUnavailableError(
          'Database PostgreSQL tidak tersedia untuk refresh sesi',
        );
      }

      let session;
      try {
        session = await prisma.userSession.findUnique({
          where: { id: sessionId },
          include: { user: { include: { role: true } } },
        });
      } catch (dbErr) {
        rethrowIfStrictDatabaseError(dbErr, 'Koneksi database PostgreSQL terputus saat refresh sesi.');
        throw dbErr;
      }

      if (
        !session ||
        session.revokedAt ||
        session.deviceId !== tokenDeviceId ||
        session.expiresAt < new Date()
      ) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      if (!session.user.isActive) {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      if (params.expectedChannel === 'web' && session.user.userType === 'TECHNICIAN') {
        throw new Error(ERROR_CODES.SESSION_REVOKED);
      }

      const match = this.verifyRefreshTokenHash(params.refreshToken, session.refreshTokenHash);
      if (!match) {
        throw new Error(ERROR_CODES.UNAUTHORIZED);
      }

      // 2. Mark this token as rotated in Redis so any subsequent attempt triggers reuse detection
      await redisManager.markRefreshTokenRotated(sessionId, tokenFingerprint);

      // 3. Issue new Access Token AND new Refresh Token (ROTATION)
      const isWeb = params.expectedChannel === 'web';
      const newAccessToken = await this.generateAccessToken(
        {
          id: session.user.id,
          username: session.user.username,
          roleName: session.user.role.name,
          userType: session.user.userType as UserTypeEnum,
          hierarchyLevel: session.user.role.hierarchyLevel,
          assignedClusters: session.user.assignedClusters,
          ...(isWeb ? {} : { deviceId: tokenDeviceId }),
          sessionId,
        },
        isWeb ? WEB_SESSION_TOKEN_EXPIRY : ACCESS_TOKEN_EXPIRY,
      );

      const newRefreshToken = await this.generateRefreshToken(
        session.user.id,
        sessionId,
        tokenDeviceId,
        params.expectedChannel,
      );
      const newRefreshHash = this.hashRefreshToken(newRefreshToken);

      // 4. Update session record with the new hash
      try {
        await prisma.userSession.update({
          where: { id: sessionId },
          data: { refreshTokenHash: newRefreshHash },
        });
      } catch (dbErr) {
        rethrowIfStrictDatabaseError(
          dbErr,
          'Koneksi database PostgreSQL terputus saat refresh sesi.',
        );
        throw dbErr;
      }

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }
      const errMsg = (err as Error).message || '';
      if (
        errMsg.includes(ERROR_CODES.TOKEN_REUSE_DETECTED) ||
        errMsg.includes(ERROR_CODES.SESSION_REVOKED)
      ) {
        throw err;
      }
      throw new Error(ERROR_CODES.UNAUTHORIZED);
    }
  }

  public static async refreshMobileSession(refreshToken: string, deviceId: string) {
    return await this.rotateSessionTokens({
      refreshToken,
      expectedChannel: 'mobile',
      expectedDeviceId: deviceId,
    });
  }

  public static async refreshWebSession(refreshToken: string) {
    return await this.rotateSessionTokens({
      refreshToken,
      expectedChannel: 'web',
      expectedDeviceId: 'web-browser',
    });
  }

  /**
   * Revokes all sessions for a user when refresh token reuse is detected.
   * Blacklists current session and all user sessions/devices in Redis for instant enforcement.
   */
  private static async revokeAllUserSessionsForReuse(
    userId: string,
    deviceId: string,
    sessionId?: string,
  ): Promise<void> {
    if (sessionId) {
      await redisManager.blacklistSession(sessionId);
    }
    if (deviceId && deviceId !== 'web-browser') {
      await redisManager.blacklistSession(deviceId);
    }

    if (await isDatabaseAvailable()) {
      try {
        // Blacklist all active session IDs & non-shared deviceIds for this user
        const activeSessions = await prisma.userSession.findMany({
          where: { userId, revokedAt: null },
        });

        for (const session of activeSessions) {
          if (session.id) {
            await redisManager.blacklistSession(session.id);
          }
          if (session.deviceId && session.deviceId !== 'web-browser') {
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
   * Updates database and writes revocation flag into Redis so mobile/web requests fail immediately.
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

      // Blacklist all active sessions in Redis (never blacklist shared 'web-browser' deviceId)
      for (const session of user.sessions) {
        if (session.id) {
          await redisManager.blacklistSession(session.id);
        }
        if (session.deviceId && session.deviceId !== 'web-browser') {
          await redisManager.blacklistSession(session.deviceId);
        }
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
