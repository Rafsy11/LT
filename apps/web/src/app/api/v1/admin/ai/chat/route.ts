import { NextRequest, NextResponse } from 'next/server';
import { AiService } from '@/server/services/ai.service';
import {
  requireAdminActor,
  getActorPermissions,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/server/lib/rate-limit';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const adminContext = await requireAdminActor(request, PERMISSIONS.AI_USE);
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      prompt?: string;
    };
    const prompt = body.message || body.prompt;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Pesan prompt tidak boleh kosong' },
        },
        { status: 400 },
      );
    }

    // Rate Limiting: 10 req/60s per admin userId
    const rateResult = await checkRateLimit(
      `ai_chat:${adminContext.userId}`,
      RATE_LIMIT_PROFILES.AI_CHAT,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: 'Terlalu banyak permintaan AI Chat. Silakan tunggu sebelum mencoba lagi.',
          },
          meta: { retryAfterMs: rateResult.retryAfterMs },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        },
      );
    }

    const permissions = await getActorPermissions(adminContext);
    const response = await AiService.processChat(prompt, adminContext, permissions);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, ERROR_CODES.INTERNAL_ERROR, 'Gagal memproses chat AI');
  }
}
