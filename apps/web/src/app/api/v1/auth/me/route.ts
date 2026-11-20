import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/server/services/auth.service';
import { getActorPermissions, handleAdminRouteError } from '@/server/lib/admin-auth';
import { ERROR_CODES } from '@repo/shared';

/**
 * Returns the authenticated Web operator profile verified from HttpOnly session cookie or Bearer token.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cookieToken =
      request.cookies.get('fiberops_session')?.value || request.cookies.get('session')?.value;
    const rawToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : cookieToken;

    if (!rawToken) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: 'Tidak ada sesi login aktif.',
          },
        },
        { status: 401 },
      );
    }

    const sessionCtx = await AuthService.verifyAccessToken(rawToken);
    const permissions =
      Array.isArray(sessionCtx.permissions) && sessionCtx.permissions.length > 0
        ? sessionCtx.permissions
        : await getActorPermissions(sessionCtx);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: sessionCtx.userId,
          nik: sessionCtx.nik ?? null,
          username: sessionCtx.username,
          fullName: sessionCtx.fullName || sessionCtx.username,
          vendorCompany: sessionCtx.vendorCompany ?? null,
          role: sessionCtx.role,
          roleName: sessionCtx.role,
          userType: sessionCtx.userType,
          hierarchyLevel: sessionCtx.hierarchyLevel,
          permissions,
          assignedClusters: sessionCtx.assignedClusters || [],
          isActive: true,
        },
      },
    });
  } catch (error: unknown) {
    const errMsg = (error as Error)?.message || '';
    if (errMsg === ERROR_CODES.UNAUTHORIZED || errMsg === ERROR_CODES.SESSION_REVOKED) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: errMsg,
            message: 'Sesi login telah berakhir atau dicabut. Silakan masuk kembali.',
          },
        },
        { status: 401 },
      );
    }
    return handleAdminRouteError(
      error,
      ERROR_CODES.INTERNAL_ERROR,
      'Gagal memuat profil sesi operator',
    );
  }
}

