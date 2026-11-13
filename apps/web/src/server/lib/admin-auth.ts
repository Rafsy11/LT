import { NextRequest, NextResponse } from 'next/server';
import {
  ERROR_CODES,
  PERMISSIONS,
  ROLE_PRESETS,
  UserSessionContext,
  UserTypeEnum,
} from '@repo/shared';
import { AuthService } from '../services/auth.service';
import { RoleService } from '../services/role.service';
import { ServiceUnavailableError, isStrictLiveMode } from './live-data';

export class AuthHttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthHttpError';
    this.status = status;
    this.code = code;
  }
}

const CLUSTER_ALIAS_MAP: Record<string, string[]> = {
  // Palembang GPON Clusters
  plbhraga01: ['plbhraga01', 'palembang h. r. agam', 'h. r. agam', 'hr agam', 'agam', 'plb-01'],
  'palembang h. r. agam': ['palembang h. r. agam', 'plbhraga01', 'h. r. agam', 'hr agam', 'agam', 'plb-01'],
  'h. r. agam': ['h. r. agam', 'plbhraga01', 'palembang h. r. agam', 'hr agam', 'agam'],
  'hr agam': ['hr agam', 'plbhraga01', 'palembang h. r. agam', 'h. r. agam', 'agam'],
  agam: ['agam', 'plbhraga01', 'palembang h. r. agam', 'h. r. agam', 'hr agam'],
  plbbsgga01: ['plbbsgga01', 'palembang basuki rahmat', 'basuki rahmat', 'bsg', 'plb-02'],
  'palembang basuki rahmat': ['palembang basuki rahmat', 'plbbsgga01', 'basuki rahmat', 'bsg', 'plb-02'],
  'basuki rahmat': ['basuki rahmat', 'plbbsgga01', 'palembang basuki rahmat', 'bsg', 'plb-02'],
  plbkbngr01: ['plbkbngr01', 'palembang kebun bunga', 'kebun bunga', 'kbn', 'plb-03'],
  'palembang kebun bunga': ['palembang kebun bunga', 'plbkbngr01', 'kebun bunga', 'kbn', 'plb-03'],
  'kebun bunga': ['kebun bunga', 'plbkbngr01', 'palembang kebun bunga', 'kbn', 'plb-03'],
  plbtkegr01: ['plbtkegr01', 'palembang kenten', 'kenten', 'tke', 'plb-04'],
  'palembang kenten': ['palembang kenten', 'plbtkegr01', 'kenten', 'tke', 'plb-04'],
  kenten: ['kenten', 'plbtkegr01', 'palembang kenten', 'tke', 'plb-04'],

  // Legacy Bandung token aliases (backward compatibility)
  'cl-01': ['cl-01', 'bdg-01', 'bandung utara', 'utara'],
  'bdg-01': ['bdg-01', 'cl-01', 'bandung utara', 'utara'],
  'bandung utara': ['bandung utara', 'utara', 'bdg-01', 'cl-01'],
  'cl-02': ['cl-02', 'bdg-03', 'bandung timur', 'timur'],
  'bdg-02': ['bdg-02', 'bandung selatan', 'selatan'],
  'bandung selatan': ['bandung selatan', 'selatan', 'bdg-02'],
  'bdg-03': ['bdg-03', 'cl-02', 'bandung timur', 'timur'],
  'bandung timur': ['bandung timur', 'timur', 'bdg-03', 'cl-02'],
  'bdg-04': ['bdg-04', 'bandung barat', 'barat'],
  'bandung barat': ['bandung barat', 'barat', 'bdg-04'],
  cimahi: ['cimahi', 'cmh-01', 'bdg-05'],
  rancaekek: ['rancaekek', 'rck-01', 'bdg-06'],
};

function expandClusterTokens(value: string): string[] {
  const clean = value.trim().toLowerCase();
  if (!clean) return [];
  const aliases = CLUSTER_ALIAS_MAP[clean] || [];
  const short = clean.replace(/^(?:bandung|palembang)\s+/i, '').trim();
  const shortAliases = CLUSTER_ALIAS_MAP[short] || [];
  return Array.from(new Set([clean, short, ...aliases, ...shortAliases]));
}

export function isGlobalScopeActor(actor: UserSessionContext): boolean {
  return (
    actor.hierarchyLevel >= 100 ||
    actor.userType === 'SUPER_ADMIN' ||
    actor.role.toLowerCase() === 'super admin' ||
    actor.assignedClusters.some((c) => c.toLowerCase() === 'global scope')
  );
}

export function matchesAssignedClusters(
  actor: UserSessionContext,
  ...candidates: Array<string | undefined | null>
): boolean {
  if (isGlobalScopeActor(actor)) {
    return true;
  }
  if (!actor.assignedClusters || actor.assignedClusters.length === 0) {
    return false;
  }

  const allowedTokens = new Set(actor.assignedClusters.flatMap((c) => expandClusterTokens(c)));
  return candidates.some((cand) => {
    if (!cand) return false;
    return expandClusterTokens(cand).some((token) => allowedTokens.has(token));
  });
}

/**
 * Extracts and verifies the authenticated Admin / Operator actor from Cookie (`fiberops_session`)
 * or `Authorization: Bearer` header. Rejects unauthenticated requests in production and rejects
 * mobile technician accounts (`TECHNICIAN`) from accessing `/api/v1/admin/*`.
 */
export async function resolveAdminActor(request: NextRequest): Promise<UserSessionContext> {
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken =
    request.cookies.get('fiberops_session')?.value ||
    request.cookies.get('session')?.value ||
    null;

  const token = bearerToken || cookieToken;

  if (token) {
    let actor: UserSessionContext;
    try {
      actor = await AuthService.verifyAccessToken(token);
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : '';
      const code = msg.includes(ERROR_CODES.SESSION_REVOKED)
        ? ERROR_CODES.SESSION_REVOKED
        : ERROR_CODES.UNAUTHORIZED;
      throw new AuthHttpError(401, code, 'Sesi Admin tidak valid atau telah kedaluwarsa.');
    }

    if (actor.userType === 'TECHNICIAN') {
      throw new AuthHttpError(
        403,
        ERROR_CODES.FORBIDDEN,
        'Akun Teknisi Lapangan tidak berhak mengakses API manajemen NOC.',
      );
    }

    return actor;
  }

  // Fallback to verified headers only when injected by Next.js middleware with an existing x-user-id
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId) {
    const userType = (request.headers.get('x-user-type') || 'ADMIN') as UserTypeEnum;
    if (userType === 'TECHNICIAN') {
      throw new AuthHttpError(
        403,
        ERROR_CODES.FORBIDDEN,
        'Akun Teknisi Lapangan tidak berhak mengakses API manajemen NOC.',
      );
    }

    let assignedClusters: string[] = [];
    const rawClusters = request.headers.get('x-assigned-clusters');
    if (rawClusters) {
      try {
        const parsed: unknown = JSON.parse(rawClusters);
        if (Array.isArray(parsed)) {
          assignedClusters = parsed.map(String);
        }
      } catch {
        assignedClusters = [];
      }
    }

    return {
      userId: headerUserId,
      username: request.headers.get('x-username') || headerUserId,
      fullName: request.headers.get('x-username') || 'Operator NOC',
      role: request.headers.get('x-user-role') || 'Admin Operasional',
      userType,
      hierarchyLevel: parseInt(request.headers.get('x-hierarchy-level') || '50', 10) || 50,
      assignedClusters,
    };
  }

  if (process.env.NODE_ENV === 'production' || isStrictLiveMode()) {
    throw new AuthHttpError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Sesi login admin wajib disertakan.',
    );
  }

  // Explicitly opted-out non-strict test harness fallback when STRICT_LIVE_DATA=false
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    username: 'superadmin',
    fullName: 'Aditya Saputra',
    role: 'Super Admin',
    userType: 'SUPER_ADMIN',
    hierarchyLevel: 100,
    assignedClusters: [],
  };
}

/**
 * Resolves effective permission codes for an authenticated Admin actor from DB roles or presets.
 */
export async function getActorPermissions(actor: UserSessionContext): Promise<string[]> {
  if (isGlobalScopeActor(actor)) {
    return [PERMISSIONS.ALL];
  }

  try {
    const roles = await RoleService.listRoles();
    const matched = roles.find((r) => r.name.toLowerCase() === actor.role.toLowerCase());
    if (matched && Array.isArray(matched.permissions)) {
      return matched.permissions.map(String);
    }
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      throw err;
    }
    // Fallback to static preset permissions below when non-strict
  }

  const preset = Object.values(ROLE_PRESETS).find(
    (p) => p.name.toLowerCase() === actor.role.toLowerCase() || p.userType === actor.userType,
  );
  return preset ? [...preset.permissions] : [];
}

/**
 * Enforces authentication and granular RBAC permissions on Admin API routes.
 */
export async function requireAdminActor(
  request: NextRequest,
  requiredPermission?: string | string[],
): Promise<UserSessionContext> {
  const actor = await resolveAdminActor(request);

  if (requiredPermission) {
    const perms = await getActorPermissions(actor);
    if (!perms.includes(PERMISSIONS.ALL)) {
      const candidates = Array.isArray(requiredPermission)
        ? requiredPermission
        : [requiredPermission];
      const allowed = candidates.some((perm) => perms.includes(perm));
      if (!allowed) {
        throw new AuthHttpError(
          403,
          ERROR_CODES.FORBIDDEN,
          `Akses ditolak: izin [${candidates.join(' / ')}] diperlukan untuk tindakan ini.`,
        );
      }
    }
  }

  return actor;
}

/**
 * Unified error formatter avoiding unsafe `any` casts in API route catch blocks.
 */
export function handleAdminRouteError(
  error: unknown,
  defaultCode: string,
  defaultMessage: string,
  overrideStatus?: number,
): NextResponse {
  if (error instanceof ServiceUnavailableError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code, message: error.message },
      },
      { status: 503 },
    );
  }

  if (error instanceof AuthHttpError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code, message: error.message },
      },
      { status: error.status },
    );
  }

  const errObj = error as {
    name?: string;
    code?: string;
    statusCode?: number;
    message?: string;
    errors?: Array<{ message: string }>;
  };

  if (errObj?.name === 'ZodError') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: errObj.errors?.[0]?.message || 'Validasi input gagal',
          details: errObj.errors,
        },
      },
      { status: 400 },
    );
  }

  const msg = errObj?.message || defaultMessage;
  let status = errObj?.statusCode ?? overrideStatus ?? 500;
  let code = errObj?.code || defaultCode;

  if (msg.includes(ERROR_CODES.FORBIDDEN)) {
    status = 403;
    code = ERROR_CODES.FORBIDDEN;
  } else if (msg.includes(ERROR_CODES.HIERARCHY_VIOLATION)) {
    status = 403;
    code = ERROR_CODES.HIERARCHY_VIOLATION;
  } else if (msg.includes(ERROR_CODES.PORT_OCCUPIED)) {
    status = 409;
    code = ERROR_CODES.PORT_OCCUPIED;
  } else if (msg.includes(ERROR_CODES.UNAUTHORIZED) || msg.includes(ERROR_CODES.SESSION_REVOKED)) {
    status = 401;
    code = ERROR_CODES.UNAUTHORIZED;
  }

  return NextResponse.json(
    {
      success: false,
      error: { code, message: msg },
    },
    { status },
  );
}

