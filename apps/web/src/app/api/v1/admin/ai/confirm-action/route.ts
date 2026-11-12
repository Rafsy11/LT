import { NextRequest, NextResponse } from 'next/server';
import { AiService, verifySignedActionToken } from '@/server/services/ai.service';
import {
  requireAdminActor,
  getActorPermissions,
  isGlobalScopeActor,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { confirmActionSchema, ERROR_CODES, PERMISSIONS } from '@repo/shared';
import { redisManager } from '@/server/lib/redis';

export async function POST(request: NextRequest) {
  try {
    // 1. Resolve Authenticated Admin Session Context & Verify AI Permission
    const adminContext = await requireAdminActor(request, PERMISSIONS.AI_USE);
    const body: unknown = await request.json();
    const validated = confirmActionSchema.parse(body);

    // 2. Cryptographic Token Verification (HMAC Signature & 5-minute validity)
    const tokenData = await verifySignedActionToken(validated.actionToken);

    if (tokenData.actionType !== validated.actionType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.INVALID_ACTION_TOKEN,
            message: 'Integritas token aksi draf rusak atau dimanipulasi.',
          },
        },
        { status: 400 },
      );
    }

    // Anti-Impersonation / Actor Verification: Ensure executing admin matches the drafter
    if (tokenData.actorId && adminContext.userId && tokenData.actorId !== adminContext.userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message:
              'Aksi ini hanya dapat dieksekusi oleh Administrator yang meminta draf (Actor mismatch).',
          },
        },
        { status: 403 },
      );
    }

    // 3. Enforce Granular RBAC Permission matching Action Type BEFORE consuming token
    const requiredPermissionMap: Record<string, string> = {
      CREATE_TICKET: PERMISSIONS.TICKET_CREATE,
      TOGGLE_TECH_ACCOUNT: PERMISSIONS.TECH_MANAGE,
      MUTATE_SPLITTER_PORT: PERMISSIONS.CUSTOMER_UPDATE,
    };

    const requiredPerm = requiredPermissionMap[validated.actionType];
    if (!isGlobalScopeActor(adminContext) && requiredPerm) {
      const perms = await getActorPermissions(adminContext);
      if (!perms.includes(PERMISSIONS.ALL) && !perms.includes(requiredPerm)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: `Izin [${requiredPerm}] diperlukan untuk mengeksekusi aksi ${validated.actionType}.`,
            },
          },
          { status: 403 },
        );
      }
    }

    // 4. Anti-Replay: Mark token JTI as used in Redis (Single-Use Token)
    if (tokenData.jti) {
      const isFirstUse = await redisManager.markActionTokenUsed(tokenData.jti, 300);
      if (!isFirstUse) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.ACTION_TOKEN_REPLAYED,
              message:
                'Token aksi ini sudah pernah dieksekusi sebelumnya (Anti-Replay). Silakan minta AI untuk menyiapkan draf baru.',
            },
          },
          { status: 409 },
        );
      }
    }

    // 5. Execute Service Mutation & Append-Only Activity Log
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes(ERROR_CODES.ACTION_TOKEN_REPLAYED)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: ERROR_CODES.ACTION_TOKEN_REPLAYED, message: msg },
        },
        { status: 409 },
      );
    }
    if (msg.includes('kedaluwarsa') || msg.includes(ERROR_CODES.AI_ACTION_EXPIRED)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: ERROR_CODES.AI_ACTION_EXPIRED, message: msg },
        },
        { status: 400 },
      );
    }
    if (msg.includes(ERROR_CODES.INVALID_ACTION_TOKEN) || msg.includes('manipulasi')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: ERROR_CODES.INVALID_ACTION_TOKEN, message: msg },
        },
        { status: 400 },
      );
    }
    return handleAdminRouteError(
      error,
      ERROR_CODES.VALIDATION_ERROR,
      'Gagal mengeksekusi aksi AI',
      400,
    );
  }
}
