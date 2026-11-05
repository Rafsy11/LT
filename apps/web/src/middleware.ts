import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MIN_MOBILE_APP_VERSION, ERROR_CODES } from '@repo/shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fiberops_on_premise_super_secure_jwt_secret_key_32chars',
);

/**
 * Sensitive internal headers that MUST be stripped from incoming requests
 * before being re-injected from verified JWT claims.
 * Prevents client-side header spoofing attacks (CWE-290).
 */
const SENSITIVE_HEADERS_TO_STRIP = [
  'x-user-id',
  'x-username',
  'x-user-role',
  'x-user-type',
  'x-hierarchy-level',
  'x-device-id',
  'x-assigned-clusters',
] as const;

/**
 * Parses semver string into [major, minor, patch] numbers.
 */
function parseSemver(version: string): [number, number, number] {
  const clean = version.replace(/^v/, '').trim();
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Compares client version against minimum required version.
 * Returns true if client version is strictly lower than minVersion.
 */
function isVersionOutdated(clientVersion: string | null, minVersion: string): boolean {
  if (!clientVersion) return true;
  const [cMaj, cMin, cPatch] = parseSemver(clientVersion);
  const [mMaj, mMin, mPatch] = parseSemver(minVersion);

  if (cMaj < mMaj) return true;
  if (cMaj > mMaj) return false;
  if (cMin < mMin) return true;
  if (cMin > mMin) return false;
  return cPatch < mPatch;
}

/**
 * Creates a new Headers object with all sensitive internal headers stripped.
 * This prevents attackers from injecting spoofed identity headers.
 */
function stripSensitiveHeaders(original: Headers): Headers {
  const cleaned = new Headers(original);
  for (const header of SENSITIVE_HEADERS_TO_STRIP) {
    cleaned.delete(header);
  }
  return cleaned;
}

const PUBLIC_API_ROUTES = [
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
  '/api/v1/health',
] as const;

const PROTECTED_DASHBOARD_PREFIXES = [
  '/monitoring',
  '/tickets',
  '/network',
  '/customers',
  '/technicians',
  '/roles',
  '/settings',
  '/ai',
] as const;

function isProtectedDashboardPage(pathname: string): boolean {
  if (pathname === '/') return true;
  return PROTECTED_DASHBOARD_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_API_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next();
  }

  // ---------------------------------------------------------------------------
  // 1. Mobile Technician Gate: /api/v1/tech/*
  // ---------------------------------------------------------------------------
  if (pathname.startsWith('/api/v1/tech')) {
    // a. Semver Check (Law 4 & AGENT.md Section 4: App Version Gate HTTP 426)
    const appVersion = request.headers.get('x-app-version');
    if (isVersionOutdated(appVersion, MIN_MOBILE_APP_VERSION)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.UPGRADE_REQUIRED,
            message: 'Versi aplikasi mobile Anda sudah usang dan wajib diperbarui.',
          },
          meta: {
            minVersion: MIN_MOBILE_APP_VERSION,
            currentVersion: appVersion || 'unknown',
          },
        },
        { status: 426 },
      );
    }

    // b. JWT Bearer Token Validation
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: 'Akses ditolak: Bearer token otorisasi wajib disertakan.',
          },
        },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7).trim();
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);

      // SECURITY: Strip ALL sensitive headers first, then inject verified claims only
      const requestHeaders = stripSensitiveHeaders(request.headers);

      if (payload.sub) requestHeaders.set('x-user-id', payload.sub);
      if (payload.username) requestHeaders.set('x-username', String(payload.username));
      if (payload.role) requestHeaders.set('x-user-role', String(payload.role));
      if (payload.userType) requestHeaders.set('x-user-type', String(payload.userType));
      if (payload.deviceId) requestHeaders.set('x-device-id', String(payload.deviceId));
      if (payload.hierarchyLevel)
        requestHeaders.set('x-hierarchy-level', String(payload.hierarchyLevel));
      if (payload.assignedClusters) {
        requestHeaders.set('x-assigned-clusters', JSON.stringify(payload.assignedClusters));
      }

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (err: unknown) {
      const isExpired = (err as { code?: string })?.code === 'ERR_JWT_EXPIRED';
      return NextResponse.json(
        {
          success: false,
          error: {
            code: isExpired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.UNAUTHORIZED,
            message: isExpired
              ? 'Token otentikasi telah kedaluwarsa. Silakan refresh token.'
              : 'Token otentikasi tidak valid atau telah kedaluwarsa.',
          },
        },
        { status: 401 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Admin API Gate: /api/v1/admin/*
  // ---------------------------------------------------------------------------
  if (pathname.startsWith('/api/v1/admin')) {
    const authHeader = request.headers.get('authorization');
    const cookieToken =
      request.cookies.get('fiberops_session')?.value || request.cookies.get('session')?.value;

    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : cookieToken;

    if (!token) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: 'Sesi login admin tidak ditemukan.',
            },
          },
          { status: 401 },
        );
      }
      // Dev mode: strip headers but allow through without auth
      const requestHeaders = stripSensitiveHeaders(request.headers);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);

      // SECURITY: Strip ALL sensitive headers first, then inject verified claims only
      const requestHeaders = stripSensitiveHeaders(request.headers);

      if (payload.sub) requestHeaders.set('x-user-id', payload.sub);
      if (payload.username) requestHeaders.set('x-username', String(payload.username));
      if (payload.role) requestHeaders.set('x-user-role', String(payload.role));
      if (payload.userType) requestHeaders.set('x-user-type', String(payload.userType));
      if (payload.hierarchyLevel)
        requestHeaders.set('x-hierarchy-level', String(payload.hierarchyLevel));
      if (payload.assignedClusters) {
        requestHeaders.set('x-assigned-clusters', JSON.stringify(payload.assignedClusters));
      }

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.UNAUTHORIZED,
              message: 'Sesi login admin tidak valid atau telah kedaluwarsa.',
            },
          },
          { status: 401 },
        );
      }
      const requestHeaders = stripSensitiveHeaders(request.headers);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Web Dashboard Page Guard: /login & Protected NOC Routes
  // ---------------------------------------------------------------------------
  const isLoginRoute = pathname === '/login' || pathname.startsWith('/login/');
  const isDashboardPage = isProtectedDashboardPage(pathname);

  if (isLoginRoute || isDashboardPage) {
    const cookieToken =
      request.cookies.get('fiberops_session')?.value || request.cookies.get('session')?.value;

    let validWebPayload: Record<string, unknown> | null = null;
    if (cookieToken) {
      try {
        const { payload } = await jwtVerify(cookieToken, JWT_SECRET);
        if (payload.userType !== 'TECHNICIAN') {
          validWebPayload = payload as Record<string, unknown>;
        }
      } catch {
        validWebPayload = null;
      }
    }

    if (isLoginRoute) {
      if (validWebPayload) {
        return NextResponse.redirect(new URL('/', request.url));
      }
      return NextResponse.next();
    }

    if (isDashboardPage) {
      if (!validWebPayload) {
        const loginUrl = new URL('/login', request.url);
        if (pathname !== '/') {
          loginUrl.searchParams.set('callbackUrl', pathname);
        }
        return NextResponse.redirect(loginUrl);
      }

      const requestHeaders = stripSensitiveHeaders(request.headers);
      if (validWebPayload.sub) requestHeaders.set('x-user-id', String(validWebPayload.sub));
      if (validWebPayload.username)
        requestHeaders.set('x-username', String(validWebPayload.username));
      if (validWebPayload.role) requestHeaders.set('x-user-role', String(validWebPayload.role));
      if (validWebPayload.userType)
        requestHeaders.set('x-user-type', String(validWebPayload.userType));
      if (validWebPayload.hierarchyLevel)
        requestHeaders.set('x-hierarchy-level', String(validWebPayload.hierarchyLevel));
      if (validWebPayload.assignedClusters) {
        requestHeaders.set(
          'x-assigned-clusters',
          JSON.stringify(validWebPayload.assignedClusters),
        );
      }

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/monitoring/:path*',
    '/tickets/:path*',
    '/network/:path*',
    '/customers/:path*',
    '/technicians/:path*',
    '/roles/:path*',
    '/settings/:path*',
    '/ai/:path*',
    '/api/v1/tech/:path*',
    '/api/v1/admin/:path*',
  ],
};
