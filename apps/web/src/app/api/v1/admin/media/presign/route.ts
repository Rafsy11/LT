import { NextRequest, NextResponse } from 'next/server';
import { minioManager } from '@/server/lib/minio';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    await requireAdminActor(request, [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.CUSTOMER_READ,
    ]);

    const rawKey = request.nextUrl.searchParams.get('key')?.trim() || '';
    if (!rawKey || rawKey.includes('..') || rawKey.startsWith('/')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Parameter key objek foto MinIO tidak valid.',
          },
        },
        { status: 400 },
      );
    }

    const url = await minioManager.generatePresignedGetUrl(rawKey);
    const isMockFallback = !url.includes('X-Amz-Signature');

    return NextResponse.json({
      success: true,
      data: {
        key: rawKey,
        url,
        isMockFallback,
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'MEDIA_PRESIGN_ERROR',
      'Gagal membuat tautan pratinjau foto MinIO',
    );
  }
}

