import ExcelJS from 'exceljs';
import { isAttenuationBad, type ClusterListItem, type DbTicket } from '@repo/shared';
import {
  buildOdpInspectionReportRows,
  buildOverviewReportRows,
  formatReportDateTimeWib,
  neutralizeSpreadsheetText,
  normalizeReportText,
  ODP_INSPECTION_REPORT_HEADERS,
  OVERVIEW_REPORT_HEADERS,
} from '@/lib/csv';

const BRAND_HEADER_FILL = 'FF0E5B92';
const BRAND_SUBTITLE_FILL = 'FFF0F7FF';
const ZEBRA_ROW_FILL = 'FFF8FAFC';
const BORDER_COLOR = 'FFDCE7F0';
const HEADER_TEXT_COLOR = 'FFFFFFFF';
const DARK_TEXT_COLOR = 'FF0F172A';
const MUTED_TEXT_COLOR = 'FF475569';

const STATUS_BADGE_STYLES: Record<string, { bg: string; fg: string }> = {
  Normal: { bg: 'FFDCFCE7', fg: 'FF056434' },
  Selesai: { bg: 'FFDCFCE7', fg: 'FF056434' },
  'Siap PSB': { bg: 'FFE0F2FE', fg: 'FF0369A1' },
  Peringatan: { bg: 'FFFEF3C7', fg: 'FF92400E' },
  'Menunggu verifikasi': { bg: 'FFFEF3C7', fg: 'FF92400E' },
  'Dalam proses': { bg: 'FFE0F2FE', fg: 'FF0369A1' },
  Menunggu: { bg: 'FFF1F5F9', fg: 'FF334155' },
  Kritis: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
  High: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
  Dibatalkan: { bg: 'FFF1F5F9', fg: 'FF64748B' },
  'Belum Diukur': { bg: 'FFF1F5F9', fg: 'FF475569' },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  left: { style: 'thin', color: { argb: BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BORDER_COLOR } },
};

export interface OverviewExcelExportMeta {
  clusterLabel: string;
  statusLabel: string;
  query?: string;
  exportedBy: string;
}

export interface OdpExcelExportMeta {
  exportedBy: string;
}

/**
 * Sanitizes a report filename segment to strictly safe ASCII characters for Content-Disposition.
 *
 * @param segment - Untrusted filename segment (e.g., splitter code).
 * @returns Sanitized filename token.
 * @example
 * sanitizeExportFilenameSegment('ODP-PLB 01/A'); // 'ODP-PLB-01-A'
 */
export function sanitizeExportFilenameSegment(segment: string): string {
  const cleaned = segment
    .trim()
    .replace(/\.{2,}/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'report';
}

function sanitizeWorkbookCellValue(cell: string | number): string | number {
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? cell : '';
  }
  return neutralizeSpreadsheetText(cell);
}

function applyTitleBanner(
  sheet: ExcelJS.Worksheet,
  columnCount: number,
  title: string,
  subtitle: string,
  summaryText: string,
): void {
  const titleRow = sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, columnCount);
  titleRow.height = 28;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: HEADER_TEXT_COLOR } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_HEADER_FILL } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const subRow = sheet.addRow([subtitle]);
  sheet.mergeCells(2, 1, 2, columnCount);
  subRow.height = 20;
  const subCell = subRow.getCell(1);
  subCell.font = { name: 'Calibri', size: 10, color: { argb: MUTED_TEXT_COLOR } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SUBTITLE_FILL } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const summaryRow = sheet.addRow([summaryText]);
  sheet.mergeCells(3, 1, 3, columnCount);
  summaryRow.height = 22;
  const summaryCell = summaryRow.getCell(1);
  summaryCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: DARK_TEXT_COLOR } };
  summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SUBTITLE_FILL } };
  summaryCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summaryCell.border = { bottom: { style: 'medium', color: { argb: BRAND_HEADER_FILL } } };

  const spacer = sheet.addRow([]);
  spacer.height = 8;
}

function applySemanticBadgeStyle(cell: ExcelJS.Cell, rawLabel: string): void {
  const style = STATUS_BADGE_STYLES[rawLabel];
  if (!style) return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.bg } };
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: style.fg } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function computeColumnWidths(
  headers: string[],
  rows: (string | number)[][],
  minWidths: number[],
  maxWidths: number[],
): number[] {
  const widths: number[] = [];
  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    let maxLen = headers[colIdx]?.length ?? 10;
    for (const row of rows) {
      const len = String(row[colIdx] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    const minW = minWidths[colIdx] ?? 10;
    const maxW = maxWidths[colIdx] ?? 40;
    widths.push(Math.max(minW, Math.min(maxW, maxLen + 4)));
  }
  return widths;
}

function applyColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]): void {
  for (let colIdx = 0; colIdx < widths.length; colIdx++) {
    sheet.getColumn(colIdx + 1).width = widths[colIdx];
  }
}

/**
 * Estimates wrapped line count across all cells in a row so Excel row height never clips
 * multi-line descriptions (e.g., Keterangan / Anomali or Catatan Inspeksi).
 */
function calculateWrappedRowHeight(rowValues: (string | number)[], colWidths: number[]): number {
  let maxLines = 1;
  for (let i = 0; i < rowValues.length; i++) {
    const text = String(rowValues[i] ?? '');
    if (!text) continue;
    const effectiveCharsPerLine = Math.max(8, Math.floor((colWidths[i] ?? 20) - 5));
    const segments = text.split(/\r?\n/);
    let totalLines = 0;
    for (const seg of segments) {
      totalLines += Math.max(1, Math.ceil(seg.length / effectiveCharsPerLine));
    }
    if (totalLines > maxLines) {
      maxLines = totalLines;
    }
  }
  return Math.max(24, maxLines * 16 + 10);
}

export class ReportExportService {
  /**
   * Builds a formatted, CWE-1236 safe Excel workbook for Overview operational tickets.
   *
   * @param tickets - Scoped and filtered operational tickets.
   * @param meta - Filter metadata and actor display name.
   * @returns Binary `.xlsx` Buffer ready for HTTP download response.
   * @example
   * const buffer = await ReportExportService.generateOverviewWorkbook(tickets, meta);
   */
  public static async generateOverviewWorkbook(
    tickets: DbTicket[],
    meta: OverviewExcelExportMeta,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FiberOps Lintasarta';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Laporan Operasional', {
      properties: { defaultRowHeight: 20 },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const headers = OVERVIEW_REPORT_HEADERS;
    const rawRows = buildOverviewReportRows(tickets);
    const printedAt = formatReportDateTimeWib(new Date().toISOString());

    const completedCount = tickets.filter((t) => t.status === 'Selesai').length;
    const pendingVerifyCount = tickets.filter((t) => t.status === 'Menunggu verifikasi').length;
    const inProgressCount = tickets.filter((t) => t.status === 'Dalam proses').length;
    const criticalAttCount = tickets.filter(
      (t) =>
        typeof t.currentAttenuation === 'number' &&
        t.currentAttenuation !== 0 &&
        isAttenuationBad(t.currentAttenuation),
    ).length;
    const flaggedCount = tickets.filter((t) => Boolean(t.isLocationFlagged)).length;

    const queryPart = meta.query?.trim() ? `  |  Pencarian: "${normalizeReportText(meta.query)}"` : '';
    applyTitleBanner(
      sheet,
      headers.length,
      'LAPORAN OPERASIONAL TIKET & WORK ORDER — FIBEROPS LINTASARTA',
      `Cluster: ${normalizeReportText(meta.clusterLabel, 'Semua cluster')}  |  Status: ${normalizeReportText(meta.statusLabel, 'Semua')}${queryPart}  |  Dicetak: ${printedAt} oleh ${normalizeReportText(meta.exportedBy, 'Operator')}`,
      `Ringkasan: Total ${tickets.length} Tiket  •  Selesai: ${completedCount}  •  Dalam Proses: ${inProgressCount}  •  Menunggu Verifikasi: ${pendingVerifyCount}  •  Redaman Buruk (> 28 dB): ${criticalAttCount}  •  Anomali Lokasi: ${flaggedCount}`,
    );

    const colWidths = computeColumnWidths(
      headers,
      rawRows,
      [6, 16, 22, 16, 15, 20, 18, 18, 18, 11, 15, 18, 22, 34],
      [8, 22, 34, 22, 20, 28, 24, 24, 22, 14, 18, 22, 24, 58],
    );

    const headerRowIndex = sheet.rowCount + 1;
    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: HEADER_TEXT_COLOR } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_HEADER_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = THIN_BORDER;
    });

    rawRows.forEach((rawRow, idx) => {
      const safeRow = rawRow.map((cell) => sanitizeWorkbookCellValue(cell));
      const excelRow = sheet.addRow(safeRow);
      excelRow.height = calculateWrappedRowHeight(safeRow, colWidths);
      const isEven = idx % 2 === 1;

      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, color: { argb: DARK_TEXT_COLOR } };
        cell.border = THIN_BORDER;
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_ROW_FILL } };
        }

        // Column alignment & explicit formatting
        if (colNumber === 1 || colNumber === 2 || colNumber === 5 || colNumber === 10) {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        } else if (colNumber === 4) {
          // Nomor SIA forced as text so Excel never converts long numeric IDs to scientific notation
          cell.numFmt = '@';
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colNumber === 11) {
          if (typeof rawRow[10] === 'number') {
            cell.numFmt = '0.00" dBm"';
          }
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colNumber === 13) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }

        if (colNumber === 9) {
          applySemanticBadgeStyle(cell, String(rawRow[8] ?? ''));
        } else if (colNumber === 10 && String(rawRow[9] ?? '') === 'High') {
          applySemanticBadgeStyle(cell, 'High');
        } else if (colNumber === 12) {
          applySemanticBadgeStyle(cell, String(rawRow[11] ?? ''));
        }
      });
    });

    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: Math.max(headerRowIndex, sheet.rowCount), column: headers.length },
    };
    sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

    applyColumnWidths(sheet, colWidths);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Builds a formatted, CWE-1236 safe Excel workbook for a single ODP splitter inspection report.
   *
   * @param splitter - Active ODP splitter and its ports.
   * @param meta - Actor display name.
   * @returns Binary `.xlsx` Buffer ready for HTTP download response.
   * @example
   * const buffer = await ReportExportService.generateOdpInspectionWorkbook(splitter, { exportedBy: 'Admin' });
   */
  public static async generateOdpInspectionWorkbook(
    splitter: ClusterListItem,
    meta: OdpExcelExportMeta,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FiberOps Lintasarta';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Inspeksi ODP', {
      properties: { defaultRowHeight: 20 },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const headers = ODP_INSPECTION_REPORT_HEADERS;
    const rawRows = buildOdpInspectionReportRows(splitter);
    const printedAt = formatReportDateTimeWib(new Date().toISOString());

    const occupiedPorts = splitter.ports.filter((p) => p.isOccupied);
    const measuredPorts = occupiedPorts.filter(
      (p) => typeof p.attenuation === 'number' && p.attenuation !== 0,
    );
    const badPortsCount = measuredPorts.filter((p) => isAttenuationBad(p.attenuation)).length;
    const avgDbm =
      measuredPorts.length > 0
        ? (
            measuredPorts.reduce((acc, p) => acc + (p.attenuation ?? 0), 0) / measuredPorts.length
          ).toFixed(2)
        : null;

    applyTitleBanner(
      sheet,
      headers.length,
      `LAPORAN INSPEKSI TEKNIS ODP ${normalizeReportText(splitter.splitterCode)} — FIBEROPS LINTASARTA`,
      `Cluster: ${normalizeReportText(splitter.name || splitter.clusterCode)}  |  Lokasi: ${normalizeReportText(splitter.locationName, 'Tidak tercatat')}  |  Dicetak: ${printedAt} oleh ${normalizeReportText(meta.exportedBy, 'Operator')}`,
      `Ringkasan Port: Terisi ${splitter.usedPorts} / ${splitter.maxPorts}  •  Siap PSB: ${Math.max(0, splitter.maxPorts - splitter.usedPorts)}  •  Rata-rata Redaman: ${avgDbm !== null ? `${avgDbm} dBm` : 'Belum diukur'}  •  Port > 28 dB: ${badPortsCount}`,
    );

    const colWidths = computeColumnWidths(
      headers,
      rawRows,
      [18, 16, 8, 13, 22, 16, 15, 18, 22, 18, 34],
      [28, 22, 10, 16, 34, 22, 18, 22, 24, 24, 58],
    );

    const headerRowIndex = sheet.rowCount + 1;
    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: HEADER_TEXT_COLOR } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_HEADER_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = THIN_BORDER;
    });

    rawRows.forEach((rawRow, idx) => {
      const safeRow = rawRow.map((cell) => sanitizeWorkbookCellValue(cell));
      const excelRow = sheet.addRow(safeRow);
      excelRow.height = calculateWrappedRowHeight(safeRow, colWidths);
      const isEven = idx % 2 === 1;

      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, color: { argb: DARK_TEXT_COLOR } };
        cell.border = THIN_BORDER;
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_ROW_FILL } };
        }

        if (colNumber === 2 || colNumber === 3 || colNumber === 4 || colNumber === 9) {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        } else if (colNumber === 6) {
          cell.numFmt = '@';
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colNumber === 7) {
          if (typeof rawRow[6] === 'number') {
            cell.numFmt = '0.00" dBm"';
          }
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }

        if (colNumber === 4) {
          applySemanticBadgeStyle(cell, String(rawRow[3] ?? ''));
        } else if (colNumber === 8) {
          applySemanticBadgeStyle(cell, String(rawRow[7] ?? ''));
        }
      });
    });

    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: Math.max(headerRowIndex, sheet.rowCount), column: headers.length },
    };
    sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

    applyColumnWidths(sheet, colWidths);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
