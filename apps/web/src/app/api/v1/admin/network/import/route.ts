import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import {
  prisma,
  buildPalembangTopology,
  executePalembangImport,
  type RawDatekRow,
} from '@repo/database';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';
import {
  requireAdminActor,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';

function normalizeRowKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    normalized[cleanKey] = val;
  }
  return normalized;
}

function mapToRawDatekRow(raw: Record<string, unknown>, rowNumber: number): RawDatekRow | null {
  const norm = normalizeRowKeys(raw);

  const sia = String(norm.sia || norm.sianumber || norm.nomorsia || '').trim();
  if (!sia) return null;

  const customerName = String(
    norm.customername || norm.namapelanggan || norm.customer || norm.nama || `Pelanggan ${sia}`,
  ).trim();

  const rawCustomerCoord =
    norm.laltogcustomer != null && String(norm.laltogcustomer).trim() !== ''
      ? String(norm.laltogcustomer).trim()
      : norm.latlogcustomer != null && String(norm.latlogcustomer).trim() !== ''
        ? String(norm.latlogcustomer).trim()
        : norm.koordinatcustomer != null && String(norm.koordinatcustomer).trim() !== ''
          ? String(norm.koordinatcustomer).trim()
          : null;

  const odpName =
    norm.lokasinamaodp != null && String(norm.lokasinamaodp).trim() !== ''
      ? String(norm.lokasinamaodp).trim()
      : norm.namaodp != null && String(norm.namaodp).trim() !== ''
        ? String(norm.namaodp).trim()
        : norm.odp != null && String(norm.odp).trim() !== ''
          ? String(norm.odp).trim()
          : null;

  const rawOdpCoord =
    norm.latlogodp != null && String(norm.latlogodp).trim() !== ''
      ? String(norm.latlogodp).trim()
      : norm.koordinatodp != null && String(norm.koordinatodp).trim() !== ''
        ? String(norm.koordinatodp).trim()
        : null;

  const rawPort = norm.portdiodp ?? norm.portodp ?? norm.port;
  let port: number | null = null;
  if (rawPort != null && rawPort !== '') {
    const parsedPort = parseInt(String(rawPort).trim(), 10);
    if (!Number.isNaN(parsedPort) && parsedPort > 0) {
      port = parsedPort;
    }
  }

  const gponNode = String(
    norm.nodeaksesgpon || norm.gponnode || norm.nodegpon || 'PLBHRAGA01',
  )
    .trim()
    .toUpperCase();

  const ontSn =
    norm.snmodemont != null && String(norm.snmodemont).trim() !== ''
      ? String(norm.snmodemont).trim()
      : norm.ontsn != null && String(norm.ontsn).trim() !== ''
        ? String(norm.ontsn).trim()
        : null;

  const oltSlot =
    norm.slotolt != null && String(norm.slotolt).trim() !== ''
      ? String(norm.slotolt).trim()
      : norm.oltslot != null && String(norm.oltslot).trim() !== ''
        ? String(norm.oltslot).trim()
        : null;

  const rawRedaman = norm.redaman ?? norm.attenuation;
  let redaman: number | null = null;
  if (rawRedaman != null && rawRedaman !== '') {
    const parsedRedaman = parseFloat(String(rawRedaman).replace(',', '.').trim());
    if (!Number.isNaN(parsedRedaman)) {
      redaman = parsedRedaman;
    }
  }

  const catatan =
    norm.catatan != null && String(norm.catatan).trim() !== ''
      ? String(norm.catatan).trim()
      : norm.notes != null && String(norm.notes).trim() !== ''
        ? String(norm.notes).trim()
        : null;

  return {
    rowNumber,
    sia,
    customerName,
    rawCustomerCoord,
    odpName,
    rawOdpCoord,
    port,
    gponNode,
    ontSn,
    oltSlot,
    redaman,
    catatan,
  };
}

function parseCsvFallback(text: string): RawDatekRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  let delimiter = ',';
  if (headerLine.includes(';') && !headerLine.includes(',')) {
    delimiter = ';';
  } else if (headerLine.includes('\t')) {
    delimiter = '\t';
  }

  const headers = headerLine.split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rows: RawDatekRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim());
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = parts[idx] ?? '';
    });
    const mapped = mapToRawDatekRow(obj, i + 1);
    if (mapped) {
      rows.push(mapped);
    }
  }

  return rows;
}

function parseSpreadsheetBuffer(buffer: Buffer): RawDatekRow[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName =
      workbook.SheetNames.find(
        (s) => s.toLowerCase().includes('gpon plb') || s.toLowerCase().includes('gpon'),
      ) || workbook.SheetNames[0];

    if (sheetName) {
      const worksheet = workbook.Sheets[sheetName];
      const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
      });

      if (rawRecords.length > 0) {
        const sampleKeys = Object.keys(rawRecords[0]);
        if (sampleKeys.length === 1 && sampleKeys[0].includes(';')) {
          return parseCsvFallback(buffer.toString('utf-8'));
        }

        const rows: RawDatekRow[] = [];
        rawRecords.forEach((record, idx) => {
          const mapped = mapToRawDatekRow(record, idx + 2);
          if (mapped) {
            rows.push(mapped);
          }
        });
        if (rows.length > 0) return rows;
      }
    }
  } catch {
    return parseCsvFallback(buffer.toString('utf-8'));
  }

  return parseCsvFallback(buffer.toString('utf-8'));
}

/**
 * POST /api/v1/admin/network/import
 * Ingests Palembang GPON & ODP Datek Master Data.
 * Supports multipart/form-data (.xlsx, .xls, .csv) and JSON payload ({ rows: RawDatekRow[] }).
 * Query param ?dryRun=true previews analysis metrics without writing to PostgreSQL.
 * Query param ?dryRun=false performs transactional upsert with ActivityLog audit.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_UPDATE);

    const { searchParams } = new URL(request.url);
    const dryRunParam = searchParams.get('dryRun');
    const isDryRun = dryRunParam !== 'false';

    let datekRows: RawDatekRow[] = [];
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = (formData.get('file') || formData.get('datekFile')) as File | null;
      if (!file) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'File datek (.xlsx, .xls, .csv) wajib diunggah pada field "file".',
            },
          },
          { status: 400 },
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      datekRows = parseSpreadsheetBuffer(buffer);
    } else if (contentType.includes('application/json')) {
      const body = (await request.json()) as
        | { rows?: Record<string, unknown>[] }
        | Record<string, unknown>[];

      let rawList: Record<string, unknown>[] = [];
      if (Array.isArray(body)) {
        rawList = body;
      } else if (body && typeof body === 'object' && Array.isArray(body.rows)) {
        rawList = body.rows;
      }

      datekRows = rawList
        .map((item, idx) => mapToRawDatekRow(item, idx + 1))
        .filter(Boolean) as RawDatekRow[];
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message:
              'Content-Type tidak didukung. Harap gunakan multipart/form-data atau application/json.',
          },
        },
        { status: 415 },
      );
    }

    if (datekRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Data datek kosong atau kolom SIA tidak ditemukan pada file.',
          },
        },
        { status: 400 },
      );
    }

    const topology = buildPalembangTopology(datekRows);

    if (isDryRun) {
      return NextResponse.json({
        success: true,
        data: {
          dryRun: true,
          summary: topology.summary,
          anomalies: topology.anomalies,
        },
      });
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const result = await executePalembangImport(prisma, topology, {
      dryRun: false,
      actorUserId: actor.userId,
      actorRole: actor.role,
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      data: {
        dryRun: false,
        summary: result.summary,
        anomalies: result.anomalies,
        counts: result.counts,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    return handleAdminRouteError(
      err,
      ERROR_CODES.INTERNAL_ERROR,
      'Gagal memproses import datek jaringan.',
    );
  }
}
