import type { JsonPath, JsonValue } from './types';

export type RowKind = 'object-open' | 'object-close' | 'array-open' | 'array-close' | 'leaf';

export interface Row {
  id: string;            // path-string, unique
  depth: number;
  kind: RowKind;
  keyName: string | number | null;
  value: JsonValue;       // for leaf, the scalar; for openers, the container; for closers, the container
  path: JsonPath;
  childCount: number;     // for openers/closers
}

export function pathKey(path: JsonPath): string {
  return path.length === 0 ? '$' : '$' + path.map((p) => typeof p === 'number' ? `[${p}]` : `.${p}`).join('');
}

/** Default expanded predicate: shallow nodes open, deep ones closed. */
export function defaultExpanded(path: JsonPath): boolean {
  return path.length < 3;
}

export function flatten(
  value: JsonValue | undefined,
  expanded: Set<string>,
  userToggled: Set<string>,
): Row[] {
  if (value === undefined) return [];
  const rows: Row[] = [];
  visit(null, value, [], 0);
  return rows;

  function isOpen(path: JsonPath): boolean {
    const k = pathKey(path);
    if (userToggled.has(k)) return expanded.has(k);
    return defaultExpanded(path);
  }

  function visit(keyName: string | number | null, v: JsonValue, path: JsonPath, depth: number) {
    const id = pathKey(path);
    if (Array.isArray(v)) {
      const open = isOpen(path);
      rows.push({ id, depth, kind: 'array-open', keyName, value: v, path, childCount: v.length });
      if (open) {
        for (let i = 0; i < v.length; i++) visit(i, v[i], [...path, i], depth + 1);
        rows.push({ id: id + '|close', depth, kind: 'array-close', keyName: null, value: v, path, childCount: v.length });
      }
    } else if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      const open = isOpen(path);
      rows.push({ id, depth, kind: 'object-open', keyName, value: v, path, childCount: keys.length });
      if (open) {
        for (const k of keys) visit(k, (v as any)[k], [...path, k], depth + 1);
        rows.push({ id: id + '|close', depth, kind: 'object-close', keyName: null, value: v, path, childCount: keys.length });
      }
    } else {
      rows.push({ id, depth, kind: 'leaf', keyName, value: v, path, childCount: 0 });
    }
  }
}
