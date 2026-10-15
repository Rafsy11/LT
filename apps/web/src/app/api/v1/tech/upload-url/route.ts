import { NextRequest, NextResponse } from 'next/server';
import { minioManager } from '@/lib/minio';
import { ERROR_CODES } from '@repo/shared';

export async function POST(request: NextRequest) {
  try {
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
