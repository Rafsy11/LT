import { NextRequest, NextResponse } from 'next/server';
import { minioManager } from '@/lib/minio';
import { redisManager } from '@/lib/redis';
import { ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
    // Instant Force Logout Check via Redis (Task 2 & Law 4)
    const deviceId = request.headers.get('x-device-id');
    if (deviceId) {
      const isBlacklisted = await redisManager.isSessionBlacklisted(deviceId);
      if (isBlacklisted) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.SESSION_REVOKED,
              message: 'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
            },
          },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    const { ticketId, submissionId, contentType = 'image/jpeg' } = body;

    if (!ticketId || !submissionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'ticketId dan submissionId wajib disertakan.',
          },
        },
        { status: 400 }
      );
    }

    const objectKey = body.objectKey || `proofs/${ticketId}_${submissionId}.jpg`;
    const expirySeconds = 900; // 15 minutes validity for presigned PUT

    const uploadUrl = await minioManager.generatePresignedPutUrl(objectKey, expirySeconds);

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,
        objectKey,
        expiresIn: expirySeconds,
        contentType,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: error.message || 'Gagal menghasilkan Presigned PUT URL MinIO',
        },
      },
      { status: 500 }
    );
  }
}
