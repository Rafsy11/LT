import { classifyDbm, type ClusterListItem, type DbTicket } from '@repo/shared';

export type CsvDelimiter = ',' | ';';

export const EXCEL_CSV_BOM = '\uFEFF';
export const DEFAULT_EXCEL_CSV_DELIMITER: CsvDelimiter = ',';
export const EXCEL_CSV_LINE_ENDING = '\r\n';

export interface CsvSerializeOptions {
  delimiter?: CsvDelimiter;
  includeBom?: boolean;
  lineEnding?: '\n' | '\r\n';
}

export type ReportAttenuationLabel = 'Normal' | 'Peringatan' | 'Kritis' | 'Belum Diukur';

export interface FormattedAttenuationCell {
  numeric: number | '';
  label: ReportAttenuationLabel;
}

const FORMULA_PREFIX_RE = /^[\t\r=+\-@]/;
const TRIMMED_FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const INP_TASK_BUDGET_MS = 50;
const BLOB_REVOKE_DELAY_MS = 1000;

/**
 * Neutralizes spreadsheet formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`, including after
 * leading whitespace) with a leading single quote to defend against CWE-1236 in both CSV and XLSX.
 *
 * @param value - Raw text value to sanitize for spreadsheet cells.
 * @returns Formula-safe string value.
 * @example
 * neutralizeSpreadsheetText('=SUM(A1:A2)'); // "'=SUM(A1:A2)"
 */
export function neutralizeSpreadsheetText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = String(value);
  const needsFormulaNeutralization =
    FORMULA_PREFIX_RE.test(raw) || TRIMMED_FORMULA_PREFIX_RE.test(raw.trimStart());
  return needsFormulaNeutralization ? `'${raw}` : raw;
}

/**
 * Escapes and neutralizes a single CSV cell per RFC 4180 and CWE-1236 (CSV Formula Injection).
 * Neutralizes leading formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`, including after whitespace)
 * with a leading single quote and quotes cells containing special CSV characters.
 *
 * @param value - Cell value to escape.
 * @param delimiter - Column delimiter (`','` or `';'`). Defaults to `','`.
 * @returns RFC 4180 escaped and formula-safe CSV cell string.
 * @example
 * escapeCsvCell('PT Sinar; Jaya', ';'); // '"PT Sinar; Jaya"'
 */
export function escapeCsvCell(value: unknown, delimiter: CsvDelimiter = ','): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  const raw = String(value);
  const needsFormulaNeutralization =
    FORMULA_PREFIX_RE.test(raw) || TRIMMED_FORMULA_PREFIX_RE.test(raw.trimStart());
  const neutralized = needsFormulaNeutralization ? `'${raw}` : raw;

  if (
    needsFormulaNeutralization ||
    neutralized.includes(delimiter) ||
    /[",\r\n\t]/.test(neutralized)
  ) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }

  return neutralized;
}

async function yieldToMain(): Promise<void> {
  if (typeof globalThis !== 'undefined') {
    const maybeScheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (typeof maybeScheduler?.yield === 'function') {
      await maybeScheduler.yield();
      return;
    }
  }
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

/**
 * Serializes headers and data rows into an RFC 4180 CSV string with formula neutralization.
 *
 * @param headers - Column header labels.
 * @param rows - Row matrix to serialize.
 * @param options - Optional delimiter, BOM, and line-ending controls.
 * @returns Serialized CSV string.
 * @example
 * serializeCsv(['No', 'Nama'], [[1, 'Andi']], { delimiter: ';', includeBom: true, lineEnding: '\r\n' });
 */
export function serializeCsv(
  headers: string[],
  rows: unknown[][],
  options: CsvSerializeOptions = {},
): string {
  const delimiter = options.delimiter ?? ',';
  const lineEnding = options.lineEnding ?? '\n';
  const prefix = options.includeBom ? EXCEL_CSV_BOM : '';
  const headerLine = headers.map((h) => escapeCsvCell(h, delimiter)).join(delimiter);
  const dataLines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter),
  );
  return prefix + [headerLine, ...dataLines].join(lineEnding);
}

/**
 * Asynchronously escapes and serializes large CSV exports in 50ms slices, yielding to the main
 * thread via `scheduler.yield()` (with `setTimeout` fallback) to preserve INP responsiveness.
 *
 * @param headers - Column header labels.
 * @param rows - Row matrix to escape and serialize.
 * @param options - Optional delimiter, BOM, and line-ending controls.
 * @returns RFC 4180 CSV string with CWE-1236 formula neutralization.
 * @example
 * const csv = await escapeCsvRowsAsync(['ID', 'Name'], [['1', 'ODP-PLB-001']], { delimiter: ';', includeBom: true });
 */
export async function escapeCsvRowsAsync(
  headers: string[],
  rows: unknown[][],
  options: CsvSerializeOptions = {},
): Promise<string> {
  const delimiter = options.delimiter ?? ',';
  const lineEnding = options.lineEnding ?? '\n';
  const prefix = options.includeBom ? EXCEL_CSV_BOM : '';
  const lines: string[] = [headers.map((h) => escapeCsvCell(h, delimiter)).join(delimiter)];
  let deadline = typeof performance !== 'undefined' ? performance.now() + INP_TASK_BUDGET_MS : Infinity;

  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter));
    if (typeof performance !== 'undefined' && performance.now() >= deadline) {
      await yieldToMain();
      deadline = performance.now() + INP_TASK_BUDGET_MS;
    }
  }

  return prefix + lines.join(lineEnding);
}

/**
 * Collapses embedded line breaks and redundant whitespace so exported table rows stay single-line
 * and clean in spreadsheet viewers. Also avoids literal `'-'` placeholders that trigger CWE-1236
 * leading apostrophe prefixes (`'-`).
 *
 * @param value - Raw value to normalize.
 * @param emptyFallback - Safe fallback string when value is blank or `'-'`.
 * @returns Clean single-line text string.
 * @example
 * normalizeReportText('  Catatan\nbaris 2  '); // 'Catatan baris 2'
 */
export function normalizeReportText(value: unknown, emptyFallback = ''): string {
  if (value === null || value === undefined) {
    return emptyFallback;
  }
  const collapsed = String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!collapsed || collapsed === '-') {
    return emptyFallback;
  }
  return collapsed;
}

/**
 * Formats an ISO timestamp into Indonesian WIB format (`DD/MM/YYYY HH:mm WIB`).
 * Preserves already human-formatted non-ISO dates cleanly.
 *
 * @param value - ISO timestamp string or pre-formatted date label.
 * @returns Human-readable WIB timestamp or empty string.
 * @example
 * formatReportDateTimeWib('2026-11-23T05:30:00.000Z'); // '23/11/2026 12:30 WIB'
 */
export function formatReportDateTimeWib(value?: string | null): string {
  const clean = normalizeReportText(value, '');
  if (!clean) return '';

  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) {
    return clean;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(parsed);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${lookup('day')}/${lookup('month')}/${lookup('year')} ${lookup('hour')}:${lookup('minute')} WIB`;
}

/**
 * Formats an optical attenuation reading (dBm) for operational reports.
 * Treats `0`, `null`, and `undefined` as unmeasured rather than literal `0 dBm`.
 *
 * @param attenuation - Optical attenuation value in dBm.
 * @returns Numeric value (or empty string) paired with Indonesian classification label.
 * @example
 * formatReportAttenuation(-19.42); // { numeric: -19.42, label: 'Normal' }
 */
export function formatReportAttenuation(attenuation?: number | null): FormattedAttenuationCell {
  if (typeof attenuation !== 'number' || !Number.isFinite(attenuation) || attenuation === 0) {
    return { numeric: '', label: 'Belum Diukur' };
  }

  const severity = classifyDbm(attenuation);
  const label: ReportAttenuationLabel =
    severity === 'Critical'
      ? 'Kritis'
      : severity === 'Warning'
        ? 'Peringatan'
        : severity === 'Normal'
          ? 'Normal'
          : 'Belum Diukur';

  return {
    numeric: Number(attenuation.toFixed(2)),
    label,
  };
}

/**
 * Formats a 1-based ODP splitter port number as a zero-padded slot code (`P01..P32`).
 *
 * @param portNumber - Splitter port index.
 * @returns Zero-padded port label or empty string.
 * @example
 * formatReportPortSlot(4); // 'P04'
 */
export function formatReportPortSlot(portNumber?: number | null): string {
  if (typeof portNumber !== 'number' || !Number.isFinite(portNumber) || portNumber <= 0) {
    return '';
  }
  return `P${String(Math.trunc(portNumber)).padStart(2, '0')}`;
}

export const OVERVIEW_REPORT_HEADERS: string[] = [
  'No',
  'No. Tiket',
  'Pelanggan',
  'Nomor SIA',
  'Tipe Pekerjaan',
  'Cluster',
  'ODP / Port',
  'Teknisi',
  'Status',
  'Prioritas',
  'Redaman (dBm)',
  'Klasifikasi Redaman',
  'Waktu Dibuat (WIB)',
  'Keterangan / Anomali',
];

/**
 * Builds structured, spreadsheet-ready rows for the Overview operational ticket report.
 * Shared between client CSV exports and server ExcelJS workbook generation.
 *
 * @param tickets - Filtered list of operational tickets.
 * @returns Matrix of formatted values matching `OVERVIEW_REPORT_HEADERS`.
 * @example
 * const rows = buildOverviewReportRows(filteredTickets);
 */
export function buildOverviewReportRows(tickets: DbTicket[]): (string | number)[][] {
  return tickets.map((ticket, index) => {
    const att = formatReportAttenuation(ticket.currentAttenuation);
    const portCode = formatReportPortSlot(ticket.portNumber);
    const odpDisplay = ticket.splitterCode
      ? portCode
        ? `${ticket.splitterCode} / ${portCode}`
        : ticket.splitterCode
      : '';

    const noteParts: string[] = [];
    if (ticket.isLocationFlagged) {
      const dist =
        typeof ticket.distanceToSplitterM === 'number' && Number.isFinite(ticket.distanceToSplitterM)
          ? ` (${Math.round(ticket.distanceToSplitterM)} m)`
          : '';
      noteParts.push(`Anomali Lokasi${dist}`);
    }
    const complaint = normalizeReportText(ticket.complaintSummary, '');
    if (complaint) {
      noteParts.push(complaint);
    } else {
      const adminNote = normalizeReportText(ticket.adminNotes, '');
      if (adminNote) {
        noteParts.push(adminNote);
      }
    }

    return [
      index + 1,
      normalizeReportText(ticket.ticketNumber, ''),
      normalizeReportText(ticket.customerName, ''),
      normalizeReportText(ticket.siaNumber, ''),
      normalizeReportText(ticket.ticketType, ''),
      normalizeReportText(ticket.cluster, ''),
      odpDisplay,
      normalizeReportText(ticket.assignedTech, 'Belum ditugaskan'),
      normalizeReportText(ticket.status, ''),
      normalizeReportText(ticket.priority, 'Normal'),
      att.numeric,
      att.label,
      formatReportDateTimeWib(ticket.createdAt),
      noteParts.join(' | '),
    ];
  });
}

export const ODP_INSPECTION_REPORT_HEADERS: string[] = [
  'Cluster',
  'Kode ODP',
  'Port',
  'Status Port',
  'Pelanggan',
  'Nomor SIA',
  'Redaman (dBm)',
  'Klasifikasi Redaman',
  'Terakhir Dicek (WIB)',
  'Teknisi',
  'Catatan Inspeksi',
];

/**
 * Builds structured, spreadsheet-ready rows for the Network ODP port inspection report.
 * Uses clean empty cells instead of `'-'` placeholders to avoid CWE-1236 `'-` prefixes.
 *
 * @param splitter - Active ODP splitter with port telemetry array.
 * @returns Matrix of formatted values matching `ODP_INSPECTION_REPORT_HEADERS`.
 * @example
 * const rows = buildOdpInspectionReportRows(activeSplitter);
 */
export function buildOdpInspectionReportRows(splitter: ClusterListItem): (string | number)[][] {
  const clusterName = normalizeReportText(splitter.name || splitter.clusterCode, '');
  const splitterCode = normalizeReportText(splitter.splitterCode, '');

  return splitter.ports.map((port) => {
    const att = formatReportAttenuation(port.attenuation);
    return [
      clusterName,
      splitterCode,
      formatReportPortSlot(port.portNumber),
      port.isOccupied ? 'Terisi' : 'Siap PSB',
      normalizeReportText(port.customerName, ''),
      normalizeReportText(port.siaNumber, ''),
      att.numeric,
      port.isOccupied ? att.label : 'Siap PSB',
      formatReportDateTimeWib(port.lastActivity?.date),
      normalizeReportText(port.lastActivity?.technician, ''),
      normalizeReportText(port.lastActivity?.notes, ''),
    ];
  });
}

/**
 * Triggers a clean browser download for a generated Blob and safely revokes the object URL.
 *
 * @param blob - File blob to save.
 * @param filename - Suggested download filename.
 * @example
 * downloadBlobFile(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'laporan.csv');
 */
export function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, BLOB_REVOKE_DELAY_MS);
}
