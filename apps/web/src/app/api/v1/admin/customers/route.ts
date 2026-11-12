import { NextRequest, NextResponse } from 'next/server';
import { CustomerService } from '@/server/services/customer.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import {
  createCustomerSchema,
  mutatePortSchema,
  updateCustomerSchema,
  ERROR_CODES,
  PERMISSIONS,
} from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.CUSTOMER_READ);
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const cluster = searchParams.get('cluster') || 'Semua cluster';
    const sia = searchParams.get('sia') || undefined;

    if (sia) {
      const detail = await CustomerService.getCustomerBySia(sia);
      if (
        detail?.customer &&
        !matchesAssignedClusters(actor, detail.customer.clusterCode, detail.customer.cluster)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Akses ditolak: Data pelanggan ini berada di luar cluster Anda.',
            },
          },
          { status: 403 },
        );
      }
      return NextResponse.json({ success: true, data: detail });
    }

    const rawCustomers = await CustomerService.listCustomers(search, cluster);
    const customers = rawCustomers.filter((c) =>
      matchesAssignedClusters(actor, c.clusterCode, c.cluster),
    );

    return NextResponse.json({
      success: true,
      data: customers,
      meta: { count: customers.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'CUSTOMER_ERROR', 'Gagal memuat data pelanggan');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.CUSTOMER_UPDATE);
    const rawBody: unknown = await request.json();
    const validated = createCustomerSchema.parse(rawBody);

    if (!matchesAssignedClusters(actor, validated.clusterCode)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: `Cluster "${validated.clusterCode}" di luar wilayah cakupan Anda.`,
          },
        },
        { status: 403 },
      );
    }

    const created = await CustomerService.createCustomer(validated, actor);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'CUSTOMER_CREATE_ERROR',
      'Gagal mendaftarkan pelanggan baru',
      400,
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.CUSTOMER_UPDATE);
    const rawBody = (await request.json()) as Record<string, unknown>;

    if (rawBody.newSplitterCode && rawBody.newPortNumber) {
      const validated = mutatePortSchema.parse(rawBody);
      const existing = await CustomerService.getCustomerBySia(validated.siaNumber);
      if (!matchesAssignedClusters(actor, existing.customer.clusterCode, existing.customer.cluster)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Akses ditolak: Pelanggan berada di luar wilayah Anda.',
            },
          },
          { status: 403 },
        );
      }
      const updated = await CustomerService.mutateSplitterPort(
        validated.siaNumber,
        validated.newSplitterCode,
        validated.newPortNumber,
        actor.userId,
      );
      return NextResponse.json({ success: true, data: updated });
    }

    const validated = updateCustomerSchema.parse(rawBody);
    const existing = await CustomerService.getCustomerBySia(validated.siaNumber);
    if (!matchesAssignedClusters(actor, existing.customer.clusterCode, existing.customer.cluster)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Akses ditolak: Pelanggan berada di luar wilayah Anda.',
          },
        },
        { status: 403 },
      );
    }

    const updated = await CustomerService.updateCustomer(validated, actor);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'CUSTOMER_UPDATE_ERROR',
      'Gagal memperbarui data pelanggan',
      400,
    );
  }
}
