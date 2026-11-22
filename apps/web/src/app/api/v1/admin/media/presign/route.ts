import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';
import { minioManager } from '@/server/lib/minio';
import {
  requireAdminActor,
  handleAdminRouteError,
  isGlobalScopeActor,
  matchesAssignedClusters,
} from '@/server/lib/admin-auth';
import { requireLiveDatabase } from '@/server/lib/live-data';

const SAFE_MEDIA_PRESIGN_KEY_RE =
  /^(?:opm-proofs|proofs|customers)\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.CUSTOMER_READ,
    ]);

    const rawKey = request.nextUrl.searchParams.get('key')?.trim() || '';
    if (
      !rawKey ||
      rawKey.includes('..') ||
      rawKey.includes('\\') ||
      rawKey.includes('%') ||
      rawKey.includes('?') ||
      rawKey.includes('#') ||
      /[\x00-\x1f\x7f]/.test(rawKey) ||
      rawKey.startsWith('/') ||
      rawKey.startsWith('backups/') ||
      !SAFE_MEDIA_PRESIGN_KEY_RE.test(rawKey)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Parameter key objek foto tidak valid atau berada di luar direktori media yang diizinkan.',
          },
        },
        { status: 400 },
      );
    }

    if (!isGlobalScopeActor(actor)) {
      const dbOnline = await requireLiveDatabase(
        'Database PostgreSQL tidak tersedia untuk memverifikasi kepemilikan media.',
      );
      if (!dbOnline) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Akses ditolak: kepemilikan cluster media tidak dapat diverifikasi.',
            },
          },
          { status: 403 },
        );
      }

      let clusterCandidates: Array<string | null | undefined> = [];
      let foundOwner = false;

      if (rawKey.startsWith('customers/')) {
        const customer = await prisma.customer.findFirst({
          where: { photoObjectKey: rawKey },
          select: {
            id: true,
            cluster: { select: { clusterCode: true, name: true } },
          },
        });
        if (customer) {
          foundOwner = true;
          clusterCandidates = [customer.cluster?.clusterCode, customer.cluster?.name];
        }
      } else {
        const history = await prisma.attenuationHistory.findFirst({
          where: { photoObjectKey: rawKey },
          select: {
            id: true,
            customer: {
              select: {
                cluster: { select: { clusterCode: true, name: true } },
              },
            },
          },
        });
        if (history) {
          foundOwner = true;
          clusterCandidates = [
            history.customer?.cluster?.clusterCode,
            history.customer?.cluster?.name,
          ];
        } else {
          const ticket = await prisma.ticket.findFirst({
            where: {
              pendingPayload: {
                path: ['photoObjectKey'],
                equals: rawKey,
              },
            },
            select: {
              id: true,
              customer: {
                select: {
                  cluster: { select: { clusterCode: true, name: true } },
                },
              },
            },
          });
          if (ticket) {
            foundOwner = true;
            clusterCandidates = [
              ticket.customer?.cluster?.clusterCode,
              ticket.customer?.cluster?.name,
            ];
          }
        }
      }

      if (!foundOwner || !matchesAssignedClusters(actor, ...clusterCandidates)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Akses ditolak: Anda tidak berwenang mengakses media di luar cluster Anda.',
            },
          },
          { status: 403 },
        );
      }
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
      'Gagal membuat tautan pratinjau foto',
    );
  }
}

