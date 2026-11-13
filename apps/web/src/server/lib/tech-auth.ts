import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { ERROR_CODES, UserTypeEnum } from '@repo/shared';

export type SubmissionChannel = 'WEB' | 'MOBILE' | 'TELEGRAM';
import { AuthService } from '@/server/services/auth.service';
import { redisManager } from '@/server/lib/redis';

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
  const deviceId = request.headers.get('x-device-id');
  if (deviceId) {
    const isBlacklisted = await redisManager.isSessionBlacklisted(deviceId);
    if (isBlacklisted) {
      throw new TechHttpError(
        401,
        ERROR_CODES.SESSION_REVOKED,
        'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
      );
    }
  }

  let userId = request.headers.get('x-user-id') || '';
  let username = request.headers.get('x-username') || '';
  let userType = (request.headers.get('x-user-type') || '') as UserTypeEnum | '';

  if (!userId || !username) {
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken =
      request.cookies.get('fiberops_session')?.value ||
      request.cookies.get('session')?.value ||
      null;
    const token = bearerToken || cookieToken;

    if (token) {
      try {
        const verified = await AuthService.verifyAccessToken(token);
        userId = verified.userId;
        username = verified.username;
        userType = verified.userType;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        const code = msg.includes(ERROR_CODES.SESSION_REVOKED)
          ? ERROR_CODES.SESSION_REVOKED
          : ERROR_CODES.UNAUTHORIZED;
        throw new TechHttpError(401, code, 'Sesi vendor/teknisi tidak valid atau kedaluwarsa.');
      }
    }
  }

  if (!userId && !username) {
    throw new TechHttpError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Akses ditolak: Sesi autentikasi vendor/teknisi diperlukan.',
    );
  }

  const canonicalUsername = normalizeTechUsernameAlias(username);
  let fullName: string | undefined;

  if (await isDatabaseAvailable()) {
    try {
      const dbUser = userId
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, fullName: true, userType: true },
          })
        : await prisma.user.findUnique({
            where: { username: canonicalUsername || username },
            select: { id: true, username: true, fullName: true, userType: true },
          });
      if (dbUser) {
        userId = dbUser.id;
        username = dbUser.username;
        fullName = dbUser.fullName;
        userType = dbUser.userType as UserTypeEnum;
      }
    } catch (err) {
      markDatabaseUnavailable(err);
    }
  }

  if (!fullName && canonicalUsername) {
    const account = await AuthService.resolveAccountByUsername(canonicalUsername);
    if (account) {
      fullName = account.fullName;
      if (!userId) userId = account.id;
      if (!userType) userType = account.userType;
    }
  }

  return {
    userId: userId || deviceId || 'tech_unknown',
    username: username || canonicalUsername,
    canonicalUsername: canonicalUsername || username.toLowerCase(),
    fullName,
    userType: (userType || 'TECHNICIAN') as UserTypeEnum,
    deviceId,
    channel: deviceId ? 'MOBILE' : 'WEB',
  };
}

/**
 * Formats error responses consistently across all `/api/v1/tech/*` route handlers.
 */
export function handleTechRouteError(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  defaultStatus = 400,
): NextResponse {
  if (error instanceof TechHttpError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  const err = error as Error & { name?: string; errors?: Array<{ message: string }> };
  const isValidation = err.name === 'ZodError';
  const msg = err.message || fallbackMessage;
  const isOccupied = msg.includes(ERROR_CODES.PORT_OCCUPIED);
  const isMock = msg.includes(ERROR_CODES.MOCK_LOCATION_DETECTED);
  const isIdor = msg.includes(ERROR_CODES.IDOR_VIOLATION);
  const isNotFound = msg.toLowerCase().includes('tidak ditemukan');
  const isClosed =
    msg.includes('tidak dapat dimutasi') ||
    msg.includes(ERROR_CODES.TICKET_ALREADY_CLOSED) ||
    msg.includes('bisa dimulai kembali');

  let status = defaultStatus;
  if (isOccupied || isClosed) status = 409;
  else if (isMock || isIdor) status = 403;
  else if (isNotFound) status = 404;

  const code = isOccupied
    ? ERROR_CODES.PORT_OCCUPIED
    : isClosed
      ? ERROR_CODES.TICKET_ALREADY_CLOSED
      : isMock
        ? ERROR_CODES.MOCK_LOCATION_DETECTED
        : isIdor
          ? ERROR_CODES.IDOR_VIOLATION
          : isNotFound
            ? ERROR_CODES.TICKET_NOT_FOUND
            : isValidation
              ? ERROR_CODES.VALIDATION_ERROR
              : fallbackCode;

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message: isValidation ? err.errors?.[0]?.message || 'Payload tidak valid' : msg,
        details: err.errors,
      },
    },
    { status },
  );
}

