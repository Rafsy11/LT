import { NextRequest, NextResponse } from 'next/server';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { parse as parseCsvSync } from 'csv-parse/sync';
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
  isGlobalScopeActor,
  matchesAssignedClusters,
} from '@/server/lib/admin-auth';
import {
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_PROFILES,
} from '@/server/lib/rate-limit';

const MAX_DATEK_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DATEK_ROWS = 50_000;
const MAX_CSV_RECORD_BYTES = 1024 * 1024; // 1 MB per record
const MAX_XLSX_ZIP_ENTRIES = 256;
const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_DATEK_EXTS = ['.xlsx', '.csv'] as const;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CD_SIGNATURE = 0x02014b50;
const ZIP_LFH_SIGNATURE = 0x04034b50;
const OLE2_MAGIC_8 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const OLE2_MAGIC_4 = [0xd0, 0xcf, 0x11, 0xe0] as const;
const DANGEROUS_ROW_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function startsWithBytes(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function createHttpError(statusCode: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

function normalizeRowKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = Object.create(null);
  if (!raw || typeof raw !== 'object') return normalized;
  for (const [key, val] of Object.entries(raw)) {
    const trimmedLower = key.trim().toLowerCase();
    if (DANGEROUS_ROW_KEYS.has(trimmedLower)) continue;
    const cleanKey = trimmedLower.replace(/[^a-z0-9]/g, '');
    if (cleanKey && !DANGEROUS_ROW_KEYS.has(cleanKey)) {
      normalized[cleanKey] = val;
    }
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

function unwrapExcelPrimitive(val: unknown): string | number | boolean {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('error' in obj) return '';
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((part) => String((part as { text?: unknown }).text ?? '')).join('');
    }
    if ('formula' in obj || 'sharedFormula' in obj) {
      return unwrapExcelPrimitive(obj.result);
    }
    if ('hyperlink' in obj) {
      const linkText = unwrapExcelPrimitive(obj.text);
      return linkText !== '' ? linkText : String(obj.hyperlink ?? '');
    }
  }
  return '';
}

function extractExcelCellValue(cell: ExcelJS.Cell): string | number | boolean {
  if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
    return '';
  }
  const unwrapped = unwrapExcelPrimitive(cell.value);
  if (unwrapped !== '') return unwrapped;
  return cell.text ? cell.text : '';
}

function validateXlsxZipBuffer(buffer: Buffer): void {
  if (buffer.length < 22) {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Struktur arsip OOXML (.xlsx) tidak valid atau terpotong.',
    );
  }

  const minEocdOffset = Math.max(0, buffer.length - 22 - 0xffff);
  let eocdOffset = -1;
  for (let pos = buffer.length - 22; pos >= minEocdOffset; pos--) {
    if (buffer.readUInt32LE(pos) === ZIP_EOCD_SIGNATURE) {
      const commentLen = buffer.readUInt16LE(pos + 20);
      if (pos + 22 + commentLen === buffer.length) {
        eocdOffset = pos;
        break;
      }
    }
  }

  if (eocdOffset === -1) {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Struktur arsip OOXML (.xlsx) tidak valid atau rusak.',
    );
  }

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const cdStartDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || cdStartDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Arsip .xlsx multi-disk tidak didukung.',
    );
  }

  if (totalEntries === 0xffff) {
    throw createHttpError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `Jumlah entri dalam arsip .xlsx melebihi batas maksimal ${MAX_XLSX_ZIP_ENTRIES} entri.`,
    );
  }

  if (cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Format arsip .xlsx ZIP64 tidak didukung.',
    );
  }

  if (totalEntries === 0) {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Arsip .xlsx kosong atau tidak memiliki entri lembar kerja.',
    );
  }

  if (totalEntries > MAX_XLSX_ZIP_ENTRIES) {
    throw createHttpError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `Jumlah entri dalam arsip .xlsx melebihi batas maksimal ${MAX_XLSX_ZIP_ENTRIES} entri.`,
    );
  }

  if (cdOffset > eocdOffset || cdSize > eocdOffset - cdOffset) {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Direktori pusat arsip .xlsx tidak valid atau terpotong.',
    );
  }

  const cdEnd = cdOffset + cdSize;
  let cursor = cdOffset;
  let entryIndex = 0;
  let totalUncompressedBytes = 0;

  while (cursor < cdEnd) {
    entryIndex++;
    if (entryIndex > MAX_XLSX_ZIP_ENTRIES) {
      throw createHttpError(
        413,
        ERROR_CODES.PAYLOAD_TOO_LARGE,
        `Jumlah entri dalam arsip .xlsx melebihi batas maksimal ${MAX_XLSX_ZIP_ENTRIES} entri.`,
      );
    }

    if (cursor + 46 > cdEnd || buffer.readUInt32LE(cursor) !== ZIP_CD_SIGNATURE) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Header direktori arsip .xlsx rusak atau tidak valid.',
      );
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const cdCompressedSize = buffer.readUInt32LE(cursor + 20);
    const cdUncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLen = buffer.readUInt16LE(cursor + 28);
    const extraFieldLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const nextCursor = cursor + 46 + fileNameLen + extraFieldLen + commentLen;
    if (nextCursor > cdEnd) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Entri direktori arsip .xlsx terpotong atau tidak valid.',
      );
    }

    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Berkas .xlsx terenkripsi atau dilindungi kata sandi tidak didukung.',
      );
    }

    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Metode kompresi pada berkas .xlsx tidak didukung.',
      );
    }

    if (cdUncompressedSize === 0xffffffff) {
      throw createHttpError(
        413,
        ERROR_CODES.PAYLOAD_TOO_LARGE,
        'Ukuran data terkompresi dalam berkas .xlsx melebihi batas maksimal 50 MB.',
      );
    }

    if (cdCompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Format entri ZIP64 pada berkas .xlsx tidak didukung.',
      );
    }

    const remainingBudget = MAX_XLSX_UNCOMPRESSED_BYTES - totalUncompressedBytes;
    if (cdUncompressedSize > remainingBudget) {
      throw createHttpError(
        413,
        ERROR_CODES.PAYLOAD_TOO_LARGE,
        'Ukuran data terkompresi dalam berkas .xlsx melebihi batas maksimal 50 MB.',
      );
    }

    if (
      localHeaderOffset + 30 > cdOffset ||
      buffer.readUInt32LE(localHeaderOffset) !== ZIP_LFH_SIGNATURE
    ) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Header lokal entri pada arsip .xlsx rusak atau tidak valid.',
      );
    }

    const lfhFlags = buffer.readUInt16LE(localHeaderOffset + 6);
    const lfhMethod = buffer.readUInt16LE(localHeaderOffset + 8);
    const lfhFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const lfhExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);

    if ((lfhFlags & 0x0001) !== 0 || (lfhFlags & 0x0040) !== 0) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Berkas .xlsx terenkripsi atau dilindungi kata sandi tidak didukung.',
      );
    }

    if (lfhMethod !== compressionMethod) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Metadata kompresi pada arsip .xlsx tidak konsisten atau rusak.',
      );
    }

    const dataStart = localHeaderOffset + 30 + lfhFileNameLen + lfhExtraLen;
    if (dataStart > cdOffset || cdCompressedSize > cdOffset - dataStart) {
      throw createHttpError(
        415,
        ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        'Batas payload entri pada arsip .xlsx rusak atau terpotong.',
      );
    }

    const compressedSlice = buffer.subarray(dataStart, dataStart + cdCompressedSize);

    if (compressionMethod === 0) {
      if (cdUncompressedSize !== cdCompressedSize) {
        throw createHttpError(
          415,
          ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
          'Ukuran entri tersimpan pada arsip .xlsx tidak konsisten.',
        );
      }
      if (compressedSlice.length > remainingBudget) {
        throw createHttpError(
          413,
          ERROR_CODES.PAYLOAD_TOO_LARGE,
          'Ukuran data terkompresi dalam berkas .xlsx melebihi batas maksimal 50 MB.',
        );
      }
      totalUncompressedBytes += compressedSlice.length;
    } else {
      let inflated: Buffer;
      try {
        inflated = inflateRawSync(compressedSlice, {
          maxOutputLength: Math.max(1, remainingBudget),
        });
      } catch (err: unknown) {
        const errCode =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (err instanceof RangeError || errCode === 'ERR_BUFFER_TOO_LARGE') {
          throw createHttpError(
            413,
            ERROR_CODES.PAYLOAD_TOO_LARGE,
            'Ukuran data terkompresi dalam berkas .xlsx melebihi batas maksimal 50 MB.',
          );
        }
        throw createHttpError(
          415,
          ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
          'Berkas .xlsx mengandung aliran data kompresi yang rusak atau tidak valid.',
        );
      }

      if (inflated.length > remainingBudget) {
        throw createHttpError(
          413,
          ERROR_CODES.PAYLOAD_TOO_LARGE,
          'Ukuran data terkompresi dalam berkas .xlsx melebihi batas maksimal 50 MB.',
        );
      }
      totalUncompressedBytes += inflated.length;
    }

    cursor = nextCursor;
  }

  if (entryIndex !== totalEntries) {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Jumlah entri direktori pada arsip .xlsx tidak sesuai dengan header.',
    );
  }
}

async function parseXlsxBuffer(buffer: Buffer): Promise<RawDatekRow[]> {
  validateXlsxZipBuffer(buffer);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0], {
      ignoreNodes: [
        'conditionalFormatting',
        'extLst',
        'dataValidations',
        'drawing',
        'picture',
        'sheetProtection',
        'autoFilter',
      ],
    });
  } catch {
    throw createHttpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      'Berkas .xlsx tidak dapat dibaca atau rusak. Pastikan berkas berasal dari format Excel OOXML (.xlsx) yang valid.',
    );
  }

  const worksheet =
    workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('gpon plb')) ??
    workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('gpon')) ??
    workbook.worksheets[0];

  if (!worksheet) return [];
  if (worksheet.rowCount > MAX_DATEK_ROWS) {
    throw createHttpError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `Jumlah baris lembar kerja melebihi batas maksimal ${MAX_DATEK_ROWS} baris.`,
    );
  }

  const headerRow = worksheet.getRow(1);
  const colCount = Math.max(worksheet.columnCount, headerRow.cellCount);
  const headers: Array<{ col: number; name: string }> = [];
  for (let col = 1; col <= colCount; col++) {
    const name = String(extractExcelCellValue(headerRow.getCell(col))).trim();
    if (name) headers.push({ col, name });
  }
  if (headers.length === 0) return [];

  const rows: RawDatekRow[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    if (!row.hasValues) continue;
    const record: Record<string, unknown> = Object.create(null);
    let hasData = false;
    for (const { col, name } of headers) {
      const cellVal = extractExcelCellValue(row.getCell(col));
      record[name] = cellVal;
      if (cellVal !== '') hasData = true;
    }
    if (!hasData) continue;
    const mapped = mapToRawDatekRow(record, r);
    if (mapped) rows.push(mapped);
  }

  return rows;
}

function detectCsvDelimiter(sampleText: string): string {
  const clean = sampleText.replace(/^\uFEFF/, '');

  let startIdx = 0;
  while (startIdx < clean.length) {
    let lineEnd = startIdx;
    while (lineEnd < clean.length && clean[lineEnd] !== '\r' && clean[lineEnd] !== '\n') {
      lineEnd++;
    }
    if (clean.slice(startIdx, lineEnd).trim().length > 0) {
      break;
    }
    startIdx = lineEnd;
    if (clean[startIdx] === '\r') startIdx++;
    if (clean[startIdx] === '\n') startIdx++;
  }

  let inQuotes = false;
  let commaCount = 0;
  let semicolonCount = 0;
  let tabCount = 0;

  for (let i = startIdx; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === '\r' || ch === '\n')) {
      break;
    }
    if (inQuotes) continue;
    if (ch === ',') commaCount++;
    else if (ch === ';') semicolonCount++;
    else if (ch === '\t') tabCount++;
  }

  if (semicolonCount > 0 && commaCount === 0) return ';';
  if (tabCount > 0 && commaCount === 0 && semicolonCount === 0) return '\t';
  if (semicolonCount > commaCount && semicolonCount >= tabCount) return ';';
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  return ',';
}

function parseCsvBuffer(buffer: Buffer, hasUtf16LeBom: boolean): RawDatekRow[] {
  const input: string | Buffer = hasUtf16LeBom ? buffer.subarray(2).toString('utf16le') : buffer;
  const sampleText =
    typeof input === 'string'
      ? input.slice(0, 8192)
      : input.subarray(0, 8192).toString('utf8');
  const delimiter = detectCsvDelimiter(sampleText);

  let records: Array<Record<string, string>>;
  try {
    records = parseCsvSync(input, {
      bom: true,
      delimiter,
      columns: (headers: string[]) => headers.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      max_record_size: MAX_CSV_RECORD_BYTES,
    }) as Array<Record<string, string>>;
  } catch (err: unknown) {
    const errCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (errCode === 'CSV_MAX_RECORD_SIZE') {
      throw createHttpError(
        413,
        ERROR_CODES.PAYLOAD_TOO_LARGE,
        'Ukuran baris pada berkas CSV melebihi batas maksimal 1 MB per baris.',
      );
    }
    throw createHttpError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Berkas CSV tidak dapat diurai. Periksa format pemisah kolom dan tanda kutip.',
    );
  }

  if (records.length > MAX_DATEK_ROWS) {
    throw createHttpError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `Jumlah baris CSV melebihi batas maksimal ${MAX_DATEK_ROWS} baris.`,
    );
  }

  const rows: RawDatekRow[] = [];
  records.forEach((rawRecord, idx) => {
    const safeRecord: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(rawRecord)) {
      if (DANGEROUS_ROW_KEYS.has(k.trim().toLowerCase())) continue;
      safeRecord[k] = v;
    }
    const mapped = mapToRawDatekRow(safeRecord, idx + 2);
    if (mapped) {
      rows.push(mapped);
    }
  });

  return rows;
}

/**
 * POST /api/v1/admin/network/import
 * Ingests Palembang GPON & ODP Datek Master Data.
 * Supports multipart/form-data (.xlsx, .csv) and JSON payload ({ rows: RawDatekRow[] }).
 * Query param ?dryRun=true previews analysis metrics without writing to PostgreSQL.
 * Query param ?dryRun=false performs transactional upsert with ActivityLog audit.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.NETWORK_UPDATE);
    const clientIp = extractClientIp(request);

    const rateResult = await checkRateLimit(
      `network_import:${actor.userId}:${clientIp}`,
      RATE_LIMIT_PROFILES.NETWORK_IMPORT,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: 'Terlalu banyak permintaan import Datek. Silakan tunggu 60 detik.',
          },
          meta: { retryAfterMs: rateResult.retryAfterMs },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateResult.retryAfterMs / 1000)) },
        },
      );
    }

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
              message: 'Berkas datek (.xlsx atau .csv) wajib dipilih sebelum mengunggah.',
            },
          },
          { status: 400 },
        );
      }

      const lowerName = (file.name || '').toLowerCase();
      if (lowerName.endsWith('.xls')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
              message:
                'Format .xls (Excel biner lama) tidak didukung. Simpan ulang berkas ke format .xlsx atau .csv lalu unggah kembali.',
            },
          },
          { status: 415 },
        );
      }

      if (!ALLOWED_DATEK_EXTS.some((ext) => lowerName.endsWith(ext))) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
              message:
                'Format berkas belum didukung. Unggah berkas berformat .xlsx atau .csv dengan ukuran maksimal 10 MB.',
            },
          },
          { status: 415 },
        );
      }

      if (file.size <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'Berkas yang diunggah kosong. Pilih berkas berisi data jaringan lalu coba kembali.',
            },
          },
          { status: 400 },
        );
      }

      if (file.size > MAX_DATEK_FILE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.PAYLOAD_TOO_LARGE,
              message:
                'Ukuran berkas melebihi batas maksimal 10 MB. Perkecil berkas (.xlsx atau .csv) lalu unggah kembali.',
            },
          },
          { status: 413 },
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (startsWithBytes(buffer, OLE2_MAGIC_8) || startsWithBytes(buffer, OLE2_MAGIC_4)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
              message:
                'Berkas terdeteksi sebagai format biner Excel lama (.xls / OLE2) yang tidak didukung. Simpan ulang berkas ke format .xlsx atau .csv lalu unggah kembali.',
            },
          },
          { status: 415 },
        );
      }

      if (lowerName.endsWith('.xlsx')) {
        if (!startsWithBytes(buffer, ZIP_MAGIC)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
                message:
                  'Konten berkas tidak sesuai dengan tanda tangan biner .xlsx (OOXML ZIP) yang valid.',
              },
            },
            { status: 415 },
          );
        }
        datekRows = await parseXlsxBuffer(buffer);
      } else {
        const hasUtf16LeBom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
        if (startsWithBytes(buffer, ZIP_MAGIC) || (!hasUtf16LeBom && buffer.includes(0x00))) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
                message:
                  'Konten berkas .csv tidak valid atau mengandung data biner yang tidak didukung.',
              },
            },
            { status: 415 },
          );
        }
        datekRows = parseCsvBuffer(buffer, hasUtf16LeBom);
      }
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

      if (rawList.length > MAX_DATEK_ROWS) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.PAYLOAD_TOO_LARGE,
              message: `Jumlah baris JSON melebihi batas maksimal ${MAX_DATEK_ROWS} baris.`,
            },
          },
          { status: 413 },
        );
      }

      datekRows = rawList
        .map((item, idx) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? mapToRawDatekRow(item, idx + 1)
            : null,
        )
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

    const importedClusterCodes = Array.from(
      new Set([
        ...datekRows.map((r) => (r.gponNode ? r.gponNode.trim().toUpperCase() : 'PLBHRAGA01')),
        ...topology.splitters.map((s) => s.clusterCode),
        ...topology.customers.map((c) => c.clusterCode),
      ]),
    );

    if (!isGlobalScopeActor(actor)) {
      const unauthorizedCluster = importedClusterCodes.some(
        (code) => !matchesAssignedClusters(actor, code),
      );
      if (unauthorizedCluster) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message:
                'Akses ditolak: Berkas import mengandung data cluster di luar wilayah wewenang Anda.',
            },
          },
          { status: 403 },
        );
      }
    }

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

    const result = await executePalembangImport(prisma, topology, {
      dryRun: false,
      actorUserId: actor.userId,
      actorRole: actor.role,
      ipAddress: clientIp,
      allowedClusterCodes: importedClusterCodes,
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
