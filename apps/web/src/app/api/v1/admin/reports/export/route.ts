import { NextRequest, NextResponse } from 'next/server';
import { ERROR_CODES, PERMISSIONS, STANDARD_ERROR_MESSAGES } from '@repo/shared';
import { TicketService } from '@/server/services/ticket.service';
import { NetworkService } from '@/server/services/network.service';
import {
  ReportExportService,
  sanitizeExportFilenameSegment,
} from '@/server/services/report-export.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import {
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_PROFILES,
} from '@/server/lib/rate-limit';

export const dynamic = 'force-dynamic';

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function buildDateStampWib(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const reportType = (searchParams.get('type') || 'overview').trim().toLowerCase();

    if (reportType !== 'overview' && reportType !== 'odp') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Tipe laporan tidak valid. Gunakan "overview" atau "odp".',
          },
        },
        { status: 400 },
      );
    }

    const requiredPermission =
      reportType === 'odp' ? PERMISSIONS.NETWORK_READ : PERMISSIONS.TICKET_READ;
    const actor = await requireAdminActor(request, requiredPermission);

    const clientIp = extractClientIp(request);
    const rate = await checkRateLimit(
      `report-export:${actor.userId}:${clientIp}`,
      RATE_LIMIT_PROFILES.REPORT_EXPORT,
    );
    if (!rate.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Terlalu banyak permintaan ekspor laporan. Silakan coba lagi sebentar lagi.',
            retryAfter: retryAfterSec,
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSec) },
        },
      );
    }

    const dateStamp = buildDateStampWib();

    if (reportType === 'odp') {
      const splitterCode = (searchParams.get('splitterCode') || '').trim();
      if (!splitterCode) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'Parameter splitterCode wajib diisi untuk ekspor laporan ODP.',
            },
          },
          { status: 400 },
        );
      }

      const splitter = await NetworkService.getSplitterDetail(splitterCode);
      if (!matchesAssignedClusters(actor, splitter.clusterCode, splitter.name)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: `ODP "${splitter.splitterCode}" berada di luar wilayah cluster wewenang Anda.`,
            },
          },
          { status: 403 },
        );
      }

      const buffer = await ReportExportService.generateOdpInspectionWorkbook(splitter, {
        exportedBy: actor.fullName || actor.username,
      });
      const safeCode = sanitizeExportFilenameSegment(splitter.splitterCode);
      const filename = `inspeksi-${safeCode}-${dateStamp}.xlsx`;

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': XLSX_MIME_TYPE,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const cluster = (searchParams.get('cluster') || 'Semua cluster').trim();
    const status = (searchParams.get('status') || 'Semua').trim();
    const query = (searchParams.get('query') || '').trim();
    const normalizedQuery = query.toLowerCase();

    const rawTickets = await TicketService.listTickets(
      { cluster: cluster === 'Semua cluster' ? undefined : cluster },
      actor,
    );

    const scopedTickets = rawTickets.filter((t) => {
      if (!matchesAssignedClusters(actor, t.clusterCode, t.cluster)) return false;
      const matchesCluster =
        cluster === 'Semua cluster' || t.cluster === cluster || t.clusterCode === cluster;
      const matchesStatus = status === 'Semua' || t.status === status;
      const matchesQuery =
        normalizedQuery === '' ||
        t.ticketNumber.toLowerCase().includes(normalizedQuery) ||
        t.customerName.toLowerCase().includes(normalizedQuery) ||
        t.siaNumber.toLowerCase().includes(normalizedQuery) ||
        t.cluster.toLowerCase().includes(normalizedQuery) ||
        t.assignedTech.toLowerCase().includes(normalizedQuery);
      return matchesCluster && matchesStatus && matchesQuery;
    });

    const buffer = await ReportExportService.generateOverviewWorkbook(scopedTickets, {
      clusterLabel: cluster,
      statusLabel: status,
      query,
      exportedBy: actor.fullName || actor.username,
    });
    const filename = `laporan-operasional-${dateStamp}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME_TYPE,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      ERROR_CODES.INTERNAL_ERROR,
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
    );
  }
}
