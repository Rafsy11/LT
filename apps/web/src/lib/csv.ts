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

const INP_TASK_BUDGET_MS = 50;

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
 */
export function serializeCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Asynchronously escapes and serializes large CSV exports in 50ms slices, yielding to the main
 * thread via `scheduler.yield()` (with `setTimeout` fallback) to preserve INP responsiveness.
 *
 * @param headers - Column header labels.
 * @param rows - Row matrix to escape and serialize.
 * @returns RFC 4180 CSV string with CWE-1236 formula neutralization.
 * @example
 * const csv = await escapeCsvRowsAsync(['ID', 'Name'], [['1', 'ODP-PLB-001']]);
 */
export async function escapeCsvRowsAsync(headers: string[], rows: unknown[][]): Promise<string> {
  const lines: string[] = [headers.map((h) => escapeCsvCell(h)).join(',')];
  let deadline = typeof performance !== 'undefined' ? performance.now() + INP_TASK_BUDGET_MS : Infinity;

  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(','));
    if (typeof performance !== 'undefined' && performance.now() >= deadline) {
      await yieldToMain();
      deadline = performance.now() + INP_TASK_BUDGET_MS;
    }
  }

  return lines.join('\n');
}
