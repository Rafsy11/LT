import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { ERROR_CODES, UserTypeEnum } from '@repo/shared';

export type SubmissionChannel = 'WEB' | 'MOBILE' | 'TELEGRAM';
import { AuthService } from '@/server/services/auth.service';
import { sanitizeAndLogServerError } from '@/server/lib/api-error-sanitizer';
import { redisManager } from '@/server/lib/redis';
import {
  requireLiveDatabase,
  rethrowIfStrictDatabaseError,
  ServiceUnavailableError,
} from '@/server/lib/live-data';

const TECH_USERNAME_ALIASES: Record<string, string> = {
  'tech.andi': 'andi.pratama',
  'tech.rizky': 'rizky.maulana',
  'tech.fajar': 'fajar.hidayat',
  'tech.dedi': 'dedi.kurniawan',
  'tech.agus': 'agus.setiawan',
};

export class TechHttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'TechHttpError';
    this.status = status;
    this.code = code;
  }
}

export interface TechActorContext {
  userId: string;
  username: string;
  canonicalUsername: string;
  fullName?: string;
  userType: UserTypeEnum;
  deviceId: string | null;
  channel: SubmissionChannel;
}

export function normalizeTechUsernameAlias(username?: string | null): string {
  const clean = (username || '').trim().toLowerCase();
  return TECH_USERNAME_ALIASES[clean] || clean;
}

/**
 * Resolves and verifies the active Vendor / Technician actor (from Mobile Bearer JWT or Web Cookie).
 * Enforces Redis device revocation blacklist and rejects unauthenticated invocations.
 */
export async function resolveTechActor(request: NextRequest): Promise<TechActorContext> {
  const headerDeviceId = request.headers.get('x-device-id')?.trim() || null;
  if (headerDeviceId) {
    const isBlacklisted = await redisManager.isSessionBlacklisted(headerDeviceId);
    if (isBlacklisted) {
      throw new TechHttpError(
        401,
        ERROR_CODES.SESSION_REVOKED,
        'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
      );
    }
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken =
    request.cookies.get('fiberops_session')?.value ||
    request.cookies.get('session')?.value ||
    null;
  const token = bearerToken || cookieToken;

  if (!token) {
    throw new TechHttpError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Akses ditolak: Sesi autentikasi vendor/teknisi diperlukan.',
    );
  }

  let verified: Awaited<ReturnType<typeof AuthService.verifyAccessToken>>;
  try {
    verified = await AuthService.verifyAccessToken(token);
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : '';
    const code = msg.includes(ERROR_CODES.SESSION_REVOKED)
      ? ERROR_CODES.SESSION_REVOKED
      : ERROR_CODES.UNAUTHORIZED;
    throw new TechHttpError(401, code, 'Sesi vendor/teknisi tidak valid atau kedaluwarsa.');
  }

  if (
    headerDeviceId &&
    verified.deviceId &&
    headerDeviceId !== verified.deviceId
  ) {
    throw new TechHttpError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Identitas perangkat tidak sesuai dengan token sesi.',
    );
  }

  const effectiveDeviceId = verified.deviceId || headerDeviceId;
  if (effectiveDeviceId && effectiveDeviceId !== 'web-browser') {
    const isBlacklisted = await redisManager.isSessionBlacklisted(effectiveDeviceId);
    if (isBlacklisted) {
      throw new TechHttpError(
        401,
        ERROR_CODES.SESSION_REVOKED,
        'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
      );
    }
  }

  let userId = verified.userId;
  let username = verified.username;
  let userType = verified.userType;
  let fullName: string | undefined = verified.fullName;
  const canonicalUsername = normalizeTechUsernameAlias(username);

  if (await requireLiveDatabase('Database PostgreSQL tidak tersedia untuk autentikasi teknisi.')) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, fullName: true, userType: true, isActive: true },
      });
      if (!dbUser || !dbUser.isActive) {
        throw new TechHttpError(
          401,
          ERROR_CODES.SESSION_REVOKED,
          'Akun vendor/teknisi telah dinonaktifkan atau tidak ditemukan.',
        );
      }
      userId = dbUser.id;
      username = dbUser.username;
      fullName = dbUser.fullName;
      userType = dbUser.userType as UserTypeEnum;
    } catch (err) {
      if (err instanceof TechHttpError) {
        throw err;
      }
      rethrowIfStrictDatabaseError(err, 'Gagal memverifikasi akun teknisi di database.');
    }
  }

  return {
    userId,
    username,
    canonicalUsername: normalizeTechUsernameAlias(username) || canonicalUsername,
    fullName,
    userType: (userType || 'TECHNICIAN') as UserTypeEnum,
    deviceId: effectiveDeviceId,
    channel: effectiveDeviceId && effectiveDeviceId !== 'web-browser' ? 'MOBILE' : 'WEB',
  };
}

/**
 * Formats error responses consistently across all `/api/v1/tech/*` route handlers.
 */
export function handleTechRouteError(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  _defaultStatus = 500,
): NextResponse {
  return sanitizeAndLogServerError(error, {
    context: 'TECH_API',
    defaultCode: fallbackCode,
    defaultMessage: fallbackMessage,
  });
}

