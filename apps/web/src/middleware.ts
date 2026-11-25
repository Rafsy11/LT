import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, type JWTPayload } from 'jose';
import { MIN_MOBILE_APP_VERSION, ERROR_CODES } from '@repo/shared';

const PLACEHOLDER_JWT_RE =
  /^(?:replace-with|changeme|placeholder|your-|example|default-secret|fiberops_on_premise_super_secure|fiberops_action_secret_token_default)/i;

function isProductionMiddlewareRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  );
}

function getJwtSecretBytes(): Uint8Array | null {
  const raw = process.env.JWT_SECRET?.trim();
  if (!raw) return null;
  if (isProductionMiddlewareRuntime()) {
    if (raw.length < 32 || PLACEHOLDER_JWT_RE.test(raw)) {
      return null;
    }
  }
  return new TextEncoder().encode(raw);
}

async function verifyAccessJwt(token: string, secretBytes: Uint8Array): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secretBytes, {
    algorithms: ['HS256'],
    audience: ['web', 'mobile'],
  });
  if (payload.tokenType !== 'access' || payload.purpose === '2fa_pending') {
    throw new Error('INVALID_TOKEN_PURPOSE');
  }
  return payload;
}

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

function buildVerifiedHeaders(original: Headers, payload: Record<string, unknown>): Headers {
  const requestHeaders = stripSensitiveHeaders(original);
  if (payload.sub) requestHeaders.set('x-user-id', String(payload.sub));
  if (payload.username) requestHeaders.set('x-username', String(payload.username));
  if (payload.role) requestHeaders.set('x-user-role', String(payload.role));
  if (payload.userType) requestHeaders.set('x-user-type', String(payload.userType));
  if (payload.deviceId) requestHeaders.set('x-device-id', String(payload.deviceId));
  if (payload.hierarchyLevel !== undefined) {
    requestHeaders.set('x-hierarchy-level', String(payload.hierarchyLevel));
  }
  if (payload.assignedClusters) {
    requestHeaders.set('x-assigned-clusters', JSON.stringify(payload.assignedClusters));
  }
  return requestHeaders;
}

const PUBLIC_API_ROUTES = [
  '/api/v1/auth/login',
  '/api/v1/auth/verify-otp',
  '/api/v1/auth/resend-otp',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
  '/api/v1/telegram/webhook',
  '/api/v1/health',
] as const;

const PROTECTED_DASHBOARD_PREFIXES = [
  '/monitoring',
  '/tickets',
  '/network',
  '/maps',
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

const MAX_JSON_API_BODY_BYTES = 1_048_576; // 1 MB cap for JSON API bodies
const INVISIBLE_UNICODE_SMUGGLING_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const contentLength = Number(request.headers.get('content-length') || '0');
    const isMultipart = contentType.includes('multipart/form-data');

    if (!isMultipart && Number.isFinite(contentLength) && contentLength > MAX_JSON_API_BODY_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.PAYLOAD_TOO_LARGE,
            message: 'Ukuran muatan JSON melebihi batas keamanan maksimal 1 MB.',
          },
        },
        { status: 413 },
      );
    }

    const decodedQuery = (() => {
      try {
        return decodeURIComponent(`${pathname}${request.nextUrl.search || ''}`);
      } catch {
        return `${pathname}${request.nextUrl.search || ''}`;
      }
    })();

    if (INVISIBLE_UNICODE_SMUGGLING_RE.test(decodedQuery)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Parameter URL mengandung karakter kontrol atau karakter Unicode tersembunyi yang tidak diizinkan.',
          },
        },
        { status: 400 },
      );
    }
  }

  if (PUBLIC_API_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next();
  }

  // Verify Mobile Bearer JWTs and check mobile app minimum semver
  if (pathname.startsWith('/api/v1/tech')) {
    const authHeader = request.headers.get('authorization');
    const cookieToken =
      request.cookies.get('fiberops_session')?.value || request.cookies.get('session')?.value;
    const isBearerRequest = Boolean(authHeader?.startsWith('Bearer '));
    const appVersion = request.headers.get('x-app-version');

    const mustCheckSemver = isBearerRequest || (!cookieToken && appVersion !== null);
    if (mustCheckSemver && isVersionOutdated(appVersion, MIN_MOBILE_APP_VERSION)) {
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

    const token = isBearerRequest
      ? authHeader!.substring(7).trim()
      : cookieToken?.trim() || null;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: 'Akses ditolak: Token atau sesi otorisasi wajib disertakan.',
          },
        },
        { status: 401 },
      );
    }

    const secretBytes = getJwtSecretBytes();
    if (!secretBytes) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.SERVICE_UNAVAILABLE,
            message: 'Konfigurasi otentikasi server belum siap.',
          },
        },
        { status: 503 },
      );
    }

    try {
      const payload = await verifyAccessJwt(token, secretBytes);

      if (payload.userType !== 'TECHNICIAN') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message:
                'Akses ditolak: Endpoint aplikasi mobile hanya diperuntukkan bagi akun Teknisi Lapangan.',
            },
          },
          { status: 403 },
        );
      }

      const requestHeaders = buildVerifiedHeaders(
        request.headers,
        payload as Record<string, unknown>,
      );

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

  // Admin API gate: /api/v1/admin/*
  if (pathname.startsWith('/api/v1/admin')) {
    const authHeader = request.headers.get('authorization');
    const cookieToken =
      request.cookies.get('fiberops_session')?.value || request.cookies.get('session')?.value;

    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : cookieToken;
    const secretBytes = getJwtSecretBytes();

    if (!secretBytes && (isProductionMiddlewareRuntime() || Boolean(token))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: isProductionMiddlewareRuntime()
              ? ERROR_CODES.SERVICE_UNAVAILABLE
              : ERROR_CODES.UNAUTHORIZED,
            message: 'Konfigurasi otentikasi server tidak valid.',
          },
        },
        { status: isProductionMiddlewareRuntime() ? 503 : 401 },
      );
    }

    if (!token) {
      if (process.env.NODE_ENV === 'production' || process.env.STRICT_LIVE_DATA !== 'false') {
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
      // Test harness mode (STRICT_LIVE_DATA=false): strip headers but allow through without auth
      const requestHeaders = stripSensitiveHeaders(request.headers);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    try {
      const payload = await verifyAccessJwt(token, secretBytes!);
      if (payload.userType === 'TECHNICIAN') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Akun Teknisi Lapangan tidak berhak mengakses API manajemen admin.',
            },
          },
          { status: 403 },
        );
      }

      // SECURITY: Strip ALL sensitive headers first, then inject verified claims only
      const requestHeaders = buildVerifiedHeaders(
        request.headers,
        payload as Record<string, unknown>,
      );

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch {
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
  }

  // Web dashboard page guard: /login and protected NOC routes
  const isLoginRoute = pathname === '/login' || pathname.startsWith('/login/');
  const isDashboardPage = isProtectedDashboardPage(pathname);

  if (isLoginRoute || isDashboardPage) {
    const cookieToken =
      request.cookies.get('fiberops_session')?.value || request.cookies.get('session')?.value;
    const secretBytes = getJwtSecretBytes();

    let validWebPayload: Record<string, unknown> | null = null;
    if (cookieToken && secretBytes) {
      try {
        const payload = await verifyAccessJwt(cookieToken, secretBytes);
        validWebPayload = payload as Record<string, unknown>;
      } catch {
        validWebPayload = null;
      }
    }

    if (isLoginRoute) {
      const hasLeakedCredentialsInUrl =
        request.nextUrl.searchParams.has('username') ||
        request.nextUrl.searchParams.has('password') ||
        request.nextUrl.searchParams.has('otpCode');
      if (hasLeakedCredentialsInUrl) {
        const cleanLoginUrl = new URL('/login', request.url);
        const nextParam = request.nextUrl.searchParams.get('next');
        if (nextParam) {
          cleanLoginUrl.searchParams.set('next', nextParam);
        }
        return NextResponse.redirect(cleanLoginUrl, 303);
      }
      if (validWebPayload && validWebPayload.userType !== 'TECHNICIAN') {
        return NextResponse.redirect(new URL('/', request.url));
      }
      return NextResponse.next();
    }

    if (isDashboardPage) {
      if (!validWebPayload || validWebPayload.userType === 'TECHNICIAN') {
        const loginUrl = new URL('/login', request.url);
        const targetPath = `${pathname}${request.nextUrl.search || ''}`;
        if (targetPath !== '/') {
          loginUrl.searchParams.set('next', targetPath);
        }
        const response = NextResponse.redirect(loginUrl);
        if (validWebPayload?.userType === 'TECHNICIAN') {
          response.cookies.delete('fiberops_session');
          response.cookies.delete('session');
        }
        return response;
      }

      const requestHeaders = buildVerifiedHeaders(request.headers, validWebPayload);

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
    '/maps/:path*',
    '/customers/:path*',
    '/technicians/:path*',
    '/roles/:path*',
    '/settings/:path*',
    '/ai/:path*',
    '/api/v1/tech/:path*',
    '/api/v1/admin/:path*',
  ],
};
