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
    const [account, permissions] = await Promise.all([
      AuthService.resolveAccountByUsername(sessionCtx.username),
      getActorPermissions(sessionCtx),
    ]);

    if (account && !account.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Akun Anda telah dinonaktifkan oleh Administrator.',
          },
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: account?.id || sessionCtx.userId,
          nik: account?.nik || null,
          username: account?.username || sessionCtx.username,
          fullName: account?.fullName || sessionCtx.fullName || sessionCtx.username,
          vendorCompany: account?.vendorCompany || null,
          role: account?.role.name || sessionCtx.role,
          roleName: account?.role.name || sessionCtx.role,
          userType: account?.userType || sessionCtx.userType,
          hierarchyLevel: account?.role.hierarchyLevel ?? sessionCtx.hierarchyLevel,
          permissions,
          assignedClusters: account?.assignedClusters || sessionCtx.assignedClusters || [],
          isActive: account?.isActive ?? true,
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

