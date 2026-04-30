import type { JsonValue } from './types';

export interface DiffEntry {
  path: string;
  kind: 'add' | 'remove' | 'change';
  before?: JsonValue;
  after?: JsonValue;
}

function pathStr(parts: (string | number)[]): string {
  if (parts.length === 0) return '$';
  return parts.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').replace(/^\./, '$.');
}

export function diffJson(a: JsonValue | undefined, b: JsonValue | undefined): DiffEntry[] {
  const out: DiffEntry[] = [];
  walk([], a, b);
  return out;

  function walk(path: (string | number)[], x: any, y: any) {
    if (x === y) return;
    const xType = kind(x);
    const yType = kind(y);
    if (xType !== yType) {
      out.push({ path: pathStr(path), kind: 'change', before: x, after: y });
      return;
    }
    if (xType === 'object') {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of [...keys].sort()) {
        if (!(k in x)) out.push({ path: pathStr([...path, k]), kind: 'add', after: y[k] });
        else if (!(k in y)) out.push({ path: pathStr([...path, k]), kind: 'remove', before: x[k] });
        else walk([...path, k], x[k], y[k]);
      }
      return;
    }
    if (xType === 'array') {
      const max = Math.max(x.length, y.length);
      for (let i = 0; i < max; i++) {
        if (i >= x.length) out.push({ path: pathStr([...path, i]), kind: 'add', after: y[i] });
        else if (i >= y.length) out.push({ path: pathStr([...path, i]), kind: 'remove', before: x[i] });
        else walk([...path, i], x[i], y[i]);
      }
      return;
    }
    if (x !== y) out.push({ path: pathStr(path), kind: 'change', before: x, after: y });
  }
}

function kind(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
