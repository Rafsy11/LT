import { NextRequest, NextResponse } from 'next/server';
import { AiService } from '@/services/ai.service';
import { AuthService } from '@/services/auth.service';
import { UserSessionContext } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = body.message || body.prompt;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_PROMPT', message: 'Pesan prompt tidak boleh kosong' } },
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
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Sesi Admin tidak valid atau telah kedaluwarsa' } },
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

    const response = await AiService.processChat(prompt, adminContext);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'AI_CHAT_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
