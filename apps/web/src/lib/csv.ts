/**
 * Escapes and neutralizes a single CSV cell per RFC 4180 and CWE-1236 (CSV Formula Injection).
 * Neutralizes leading formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`, including after whitespace)
 * with a leading single quote and quotes cells containing special CSV characters.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  const raw = String(value);
  const needsFormulaNeutralization =
    /^[\t\r=+\-@]/.test(raw) || /^[=+\-@\t\r]/.test(raw.trimStart());
  const neutralized = needsFormulaNeutralization ? `'${raw}` : raw;

  if (needsFormulaNeutralization || /[",\r\n\t]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }

  return neutralized;
}

/**
 * Serializes headers and data rows into an RFC 4180 CSV string with formula neutralization.
 */
export function serializeCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  return [headerLine, ...dataLines].join('\n');
}
