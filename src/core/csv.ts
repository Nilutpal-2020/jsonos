import type { JsonValue } from './types';

/** RFC 4180-ish: quote if contains "," or '"' or '\n' / '\r'; escape '"' as '""'. */
function escapeCell(s: string): string {
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function cellToString(v: JsonValue | undefined): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export interface CsvExportInput {
  columns: string[];               // [] for scalar arrays
  rows: JsonValue[];               // already filtered/sorted by caller
  scalarHeader?: string;           // column name for scalar arrays (default 'value')
}

export function toCsv(input: CsvExportInput): string {
  const { columns, rows } = input;
  const out: string[] = [];

  if (columns.length === 0) {
    out.push(escapeCell(input.scalarHeader ?? 'value'));
    for (const r of rows) out.push(escapeCell(cellToString(r)));
    return out.join('\n');
  }

  out.push(columns.map(escapeCell).join(','));
  for (const r of rows) {
    const obj = (r && typeof r === 'object' && !Array.isArray(r))
      ? r as Record<string, JsonValue>
      : null;
    const cells = columns.map((c) => escapeCell(cellToString(obj ? obj[c] : undefined)));
    out.push(cells.join(','));
  }
  return out.join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM helps Excel detect UTF-8.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
