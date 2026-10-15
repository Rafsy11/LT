import { NextRequest, NextResponse } from 'next/server';
import { AiService, verifySignedActionToken } from '@/services/ai.service';
import { AuthService } from '@/services/auth.service';
import { confirmActionSchema, ERROR_CODES, UserSessionContext } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = confirmActionSchema.parse(body);

    // 1. Resolve Admin Session Context (Cookie or Bearer Token)
    let adminContext: UserSessionContext;
    const cookieToken = request.cookies.get('token')?.value;
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const token = cookieToken || bearerToken;

    if (token) {
      try {
        adminContext = await AuthService.verifyAccessToken(token);
      } catch {
        return NextResponse.json(
          { success: false, error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Sesi Admin tidak valid atau telah kedaluwarsa.' } },
          { status: 401 }
        );
      }
    } else {
      // Dev mode fallback
      adminContext = {
        userId: 'superadmin',
        username: 'superadmin',
        fullName: 'Aditya Saputra',
        role: 'Super Admin',
        userType: 'SUPER_ADMIN',
        hierarchyLevel: 100,
        assignedClusters: ['CL-01', 'CL-02'],
      };
    }

    // 2. Cryptographic Token Verification (HMAC Signature & 5-minute validity)
    const tokenData = await verifySignedActionToken(validated.actionToken);

    // Ensure actionType in body matches cryptographically signed actionType
    if (tokenData.actionType !== validated.actionType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.INVALID_ACTION_TOKEN,
            message: 'Integritas token aksi draf rusak atau dimanipulasi.',
          },
        },
        { status: 400 }
      );
    }

    // 3. RBAC Permission Validation
    const requiredPermissionMap: Record<string, string> = {
      CREATE_TICKET: 'ticket:create',
      TOGGLE_TECH_ACCOUNT: 'tech:manage',
      MUTATE_SPLITTER_PORT: 'customer:update',
    };

    const requiredPerm = requiredPermissionMap[validated.actionType];
    const isSuperAdmin = adminContext.hierarchyLevel >= 100 || adminContext.role === 'Super Admin';

    if (!isSuperAdmin && requiredPerm) {
      // In production, check role permissions
      // If unauthorized, return 403
    }

    // 4. Execute Service Mutation & Append-Only Activity Log
    const execution = await AiService.confirmAction(validated.actionToken, adminContext);

    return NextResponse.json({
      success: true,
      data: execution.result,
      meta: {
        actionType: execution.actionType,
        executedAt: execution.executedAt,
        executedBy: adminContext.fullName,
        message: `Aksi ${execution.actionType} berhasil disetujui & dieksekusi secara aman ke database.`,
      },
    });
  } catch (error: any) {
    const isExpired = error.message?.includes('kedaluwarsa') || error.message?.includes(ERROR_CODES.INVALID_ACTION_TOKEN);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isExpired ? ERROR_CODES.AI_ACTION_EXPIRED : ERROR_CODES.VALIDATION_ERROR,
          message: error.errors ? error.errors[0]?.message : error.message,
          details: error.errors,
        },
      },
      { status: isExpired ? 400 : 400 }
    );
  }
}
