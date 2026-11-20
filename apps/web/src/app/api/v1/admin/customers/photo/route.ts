import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';
import { requireAdminActor, handleAdminRouteError } from '@/server/lib/admin-auth';
import { minioManager } from '@/server/lib/minio';
import { requireLiveDatabase } from '@/server/lib/live-data';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SAFE_SIA_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Resolves a stored photo reference into an accessible URL for browser rendering.
 */
async function resolvePhotoPreviewUrl(photoObjectKey: string | null): Promise<string | null> {
  if (!photoObjectKey) return null;
  if (photoObjectKey.startsWith('https://') || photoObjectKey.startsWith('/assets/')) {
    return photoObjectKey;
  }
  return await minioManager.generatePresignedGetUrl(photoObjectKey);
}

/**
 * Uploads or replaces a customer building/location photo (SUPER_ADMIN only).
 * Stores object in MinIO (`customers/{sia}/{uuid}.{ext}`) with local public fallback in dev if MinIO is offline.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.CUSTOMER_UPDATE);
    if (actor.userType !== 'SUPER_ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Hanya Super Admin yang memiliki izin untuk mengunggah foto profil pelanggan.',
          },
        },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const rawSia = String(formData.get('siaNumber') || '').trim();
    const rawCaption = formData.get('caption');
    const caption =
      typeof rawCaption === 'string' && rawCaption.trim().length > 0
        ? rawCaption.trim().slice(0, 240)
        : undefined;
    const fileEntry = formData.get('file');

    if (!SAFE_SIA_PATTERN.test(rawSia)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Nomor SIA pelanggan tidak valid.',
          },
        },
        { status: 400 },
      );
    }

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Berkas foto bangunan pelanggan wajib dipilih.',
          },
        },
        { status: 400 },
      );
    }

    const ext = MIME_TO_EXT[fileEntry.type];
    if (!ext) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
            message:
              'Format foto belum didukung. Unggah gambar berformat JPG, PNG, atau WEBP (maksimal 5 MB).',
          },
        },
        { status: 415 },
      );
    }

    if (fileEntry.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Berkas gambar kosong. Pilih foto lain lalu coba kembali.',
          },
        },
        { status: 400 },
      );
    }

    if (fileEntry.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.PAYLOAD_TOO_LARGE,
            message: 'Ukuran foto melebihi batas maksimal 5 MB. Perkecil gambar lalu unggah kembali.',
          },
        },
        { status: 413 },
      );
    }

    await requireLiveDatabase('Database PostgreSQL diperlukan untuk menyimpan foto pelanggan.');
    const existing = await prisma.customer.findUnique({ where: { siaNumber: rawSia } });
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.CUSTOMER_NOT_FOUND,
            message: `Pelanggan dengan SIA ${rawSia} tidak ditemukan.`,
          },
        },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const safeSiaSlug = rawSia.replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = crypto.randomUUID().slice(0, 12);
    let storedKey = `customers/${safeSiaSlug}/${uniqueSuffix}.${ext}`;

    const minioOnline = await minioManager.isHealthy();
    if (minioOnline) {
      await minioManager.putObjectBuffer(storedKey, buffer, fileEntry.type);
    } else if (process.env.NODE_ENV !== 'production') {
      const publicDir = path.resolve(process.cwd(), 'public', 'assets', 'customers');
      await fs.mkdir(publicDir, { recursive: true });
      const filename = `${safeSiaSlug}-${uniqueSuffix}.${ext}`;
      await fs.writeFile(path.join(publicDir, filename), buffer);
      storedKey = `/assets/customers/${filename}`;
    } else {
      await minioManager.putObjectBuffer(storedKey, buffer, fileEntry.type);
    }

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          photoObjectKey: storedKey,
          ...(caption !== undefined ? { photoCaption: caption } : {}),
        },
      });

      await tx.activityLog.create({
        data: {
          actorUserId: actor.userId,
          actorRole: actor.role,
          actionType: 'CUSTOMER_PHOTO_UPDATED',
          targetEntity: 'customer',
          targetId: existing.id,
          oldPayload: {
            photoObjectKey: existing.photoObjectKey,
            photoCaption: existing.photoCaption,
          },
          newPayload: {
            photoObjectKey: storedKey,
            photoCaption: caption ?? existing.photoCaption,
          },
        },
      });
    });

    const photoUrl = await resolvePhotoPreviewUrl(storedKey);

    return NextResponse.json({
      success: true,
      data: {
        siaNumber: rawSia,
        photoObjectKey: storedKey,
        photoUrl,
        photoCaption: caption ?? existing.photoCaption ?? null,
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'CUSTOMER_PHOTO_UPLOAD_ERROR',
      'Gagal mengunggah foto profil pelanggan',
    );
  }
}

/**
 * Removes the customer building/location photo reference (SUPER_ADMIN only).
 */
export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.CUSTOMER_UPDATE);
    if (actor.userType !== 'SUPER_ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Hanya Super Admin yang memiliki izin untuk menghapus foto profil pelanggan.',
          },
        },
        { status: 403 },
      );
    }

    const siaNumber = request.nextUrl.searchParams.get('sia')?.trim() || '';
    if (!SAFE_SIA_PATTERN.test(siaNumber)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Nomor SIA pelanggan tidak valid.',
          },
        },
        { status: 400 },
      );
    }

    await requireLiveDatabase('Database PostgreSQL diperlukan untuk memperbarui profil pelanggan.');
    const existing = await prisma.customer.findUnique({ where: { siaNumber } });
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.CUSTOMER_NOT_FOUND,
            message: `Pelanggan dengan SIA ${siaNumber} tidak ditemukan.`,
          },
        },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          photoObjectKey: null,
          photoCaption: null,
        },
      });

      await tx.activityLog.create({
        data: {
          actorUserId: actor.userId,
          actorRole: actor.role,
          actionType: 'CUSTOMER_PHOTO_REMOVED',
          targetEntity: 'customer',
          targetId: existing.id,
          oldPayload: {
            photoObjectKey: existing.photoObjectKey,
            photoCaption: existing.photoCaption,
          },
          newPayload: {
            photoObjectKey: null,
            photoCaption: null,
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: { siaNumber, photoObjectKey: null, photoUrl: null },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'CUSTOMER_PHOTO_DELETE_ERROR',
      'Gagal menghapus foto profil pelanggan',
    );
  }
}
