import type { JsonPath, JsonValue } from './types';

export interface TableShape {
  kind: 'object-array' | 'scalar-array' | 'mixed-array' | 'not-array';
  length: number;
  columns: string[];      // for object-array; empty otherwise
}

const COL_SCAN_LIMIT = 500;

export function inspectTable(value: JsonValue | undefined): TableShape {
  if (!Array.isArray(value)) return { kind: 'not-array', length: 0, columns: [] };
  if (value.length === 0) return { kind: 'object-array', length: 0, columns: [] };

  let allObj = true;
  let allScalar = true;
  for (let i = 0; i < Math.min(value.length, COL_SCAN_LIMIT); i++) {
    const v = value[i];
    const isObj = !!v && typeof v === 'object' && !Array.isArray(v);
    const isScalar = v === null || typeof v !== 'object';
    if (!isObj) allObj = false;
    if (!isScalar) allScalar = false;
  }

  if (allObj) {
    const cols: string[] = [];
    const seen = new Set<string>();
    const limit = Math.min(value.length, COL_SCAN_LIMIT);
    for (let i = 0; i < limit; i++) {
      const row = value[i] as Record<string, JsonValue>;
      for (const k of Object.keys(row)) {
        if (!seen.has(k)) { seen.add(k); cols.push(k); }
      }
    }
    return { kind: 'object-array', length: value.length, columns: cols };
  }
  if (allScalar) return { kind: 'scalar-array', length: value.length, columns: [] };
  return { kind: 'mixed-array', length: value.length, columns: [] };
}

/** Find paths in the document that are non-empty arrays (BFS, capped). */
export function findArrayPaths(root: JsonValue | undefined, max = 50): JsonPath[] {
  if (root === undefined) return [];
  const out: JsonPath[] = [];
  const queue: { v: JsonValue; p: JsonPath }[] = [{ v: root, p: [] }];
  while (queue.length && out.length < max) {
    const { v, p } = queue.shift()!;
    if (Array.isArray(v)) {
      out.push(p);
      // walk into first few entries to find nested arrays
      for (let i = 0; i < Math.min(v.length, 5); i++) {
        if (v[i] && typeof v[i] === 'object') queue.push({ v: v[i] as JsonValue, p: [...p, i] });
      }
    } else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (Array.isArray(child) || (child && typeof child === 'object')) {
          queue.push({ v: child as JsonValue, p: [...p, k] });
        }
      }
    }
  }
  return out;
}

export function getAt(root: JsonValue | undefined, path: JsonPath): JsonValue | undefined {
  let cur: any = root;
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg as any];
  }
  return cur;
}

export function pathToJSONish(path: JsonPath): string {
  if (path.length === 0) return '$';
  return '$' + path.map((p) => typeof p === 'number' ? `[${p}]` : `.${p}`).join('');
}
