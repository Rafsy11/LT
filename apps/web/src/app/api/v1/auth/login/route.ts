import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { loginRequestSchema, ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const validated = loginRequestSchema.parse(rawBody);

    // 1. Mobile Technician Login (requires deviceId)
    if (validated.deviceId) {
      const result = await AuthService.loginMobile(
        validated.username,
        validated.password,
        validated.deviceId,
        validated.deviceModel,
        validated.appVersion
      );

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // 2. Web Admin Dashboard Login
    const result = await AuthService.loginWeb(validated.username, validated.password);

    const response = NextResponse.json({
      success: true,
      data: {
        accessToken: result.token,
        user: result.user,
      },
    });

    // Set secure HttpOnly cookie for web admin session
    response.cookies.set('fiberops_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (error: any) {
    const isValidation = error.name === 'ZodError';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isValidation ? ERROR_CODES.VALIDATION_ERROR : ERROR_CODES.UNAUTHORIZED,
          message: isValidation ? error.errors[0]?.message : error.message,
          details: error.errors,
        },
      },
      { status: isValidation ? 400 : 401 }
    );
  }
}
