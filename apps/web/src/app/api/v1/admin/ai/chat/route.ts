import { NextRequest, NextResponse } from 'next/server';
import { AiService } from '@/services/ai.service';
import { AuthService } from '@/services/auth.service';
import { ERROR_CODES, UserSessionContext } from '@repo/shared';
import { checkRateLimit, RATE_LIMIT_PROFILES } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = body.message || body.prompt;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Pesan prompt tidak boleh kosong' } },
        { status: 400 }
      );
    }

    // Resolve Admin Context (Cookie or Bearer Token)
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
          { success: false, error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Sesi Admin tidak valid atau telah kedaluwarsa' } },
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

    // Rate Limiting: 10 req/60s per admin userId
    const rateResult = await checkRateLimit(
      `ai_chat:${adminContext.userId}`,
      RATE_LIMIT_PROFILES.AI_CHAT
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
        }
      );
    }

    const response = await AiService.processChat(prompt, adminContext);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.INTERNAL_ERROR, message: err.message } },
      { status: 500 }
    );
  }
}
