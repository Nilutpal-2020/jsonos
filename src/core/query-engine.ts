/**
 * Lightweight MongoDB-style query engine for JSON documents.
 *
 * Supports the operator set that's actually useful for ad-hoc filtering and
 * validation in a workbench: comparison, logical, element, regex, array, and
 * `$elemMatch`. Deliberately omits server-only ops (`$where`, `$expr`,
 * geospatial, text search) to keep this dependency-free and tiny.
 *
 * Query shape:
 *   { "field": <literal>          }     // equality
 *   { "field": { "$gt": 10 }      }     // operator object — every op must match
 *   { "user.name": "Alex"         }     // dot-path (auto-branches over arrays)
 *   { "items.0.id": 7             }     // numeric segment indexes a single element
 *   { "$and": [ q1, q2, … ]       }     // logical combinators on whole queries
 *   { "tags": { "$elemMatch": q } }     // run a sub-query against array elements
 *
 * Top-level use:
 *   - filter:   for arrays, returns elements matching the query
 *   - validate: for any value, returns true/false (with a reason on failure)
 */

import type { JsonValue, JsonPath } from './types';

export type QueryDoc = Record<string, unknown>;

export interface QueryError {
  message: string;
  /** Operator or field that failed to compile. */
  at?: string;
}

export interface FilterResult {
  /** Matching elements with their paths inside the source array. */
  matches: { path: JsonPath; value: JsonValue }[];
  /** Total elements considered. */
  total: number;
  error?: QueryError;
}

export interface ValidateResult {
  ok: boolean;
  error?: QueryError;
}

const isObj = (v: unknown): v is Record<string, JsonValue> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function jsonType(v: JsonValue): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'string' | 'number' | 'boolean' | 'object'
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (!deepEqual(ao[k], bo[k])) return false;
    return true;
  }
  return false;
}

/** MongoDB-style ordering: numbers compare numerically, strings lexically;
 *  cross-type comparisons return undefined (treated as "no match"). */
function cmp(a: JsonValue, b: unknown): number | undefined {
  const ta = jsonType(a);
  const tb = a === null && b === null ? 'null' :
            (b === null ? 'null' :
            Array.isArray(b) ? 'array' : typeof b);
  if (ta !== tb) return undefined;
  if (ta === 'number' || ta === 'string' || ta === 'boolean') {
    if ((a as any) < (b as any)) return -1;
    if ((a as any) > (b as any)) return 1;
    return 0;
  }
  return undefined;
}

/** Resolve a dot path into one-or-more values. Encountering an array branches
 *  the resolution over every element (so `items.name` returns one value per
 *  element). Numeric segments index into arrays directly. */
function resolveField(doc: JsonValue, path: string): { values: JsonValue[]; existed: boolean } {
  if (path === '') return { values: [doc], existed: true };
  const segs = path.split('.');
  let current: JsonValue[] = [doc];
  let existed = true;
  for (const seg of segs) {
    const next: JsonValue[] = [];
    let any = false;
    for (const c of current) {
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) {
        const n = Number(seg);
        if (Number.isInteger(n) && String(n) === seg && n >= 0) {
          if (n < c.length) { next.push(c[n]); any = true; }
        } else {
          for (const e of c) {
            if (isObj(e) && seg in e) { next.push(e[seg]); any = true; }
          }
        }
      } else if (typeof c === 'object') {
        if (seg in (c as Record<string, JsonValue>)) {
          next.push((c as Record<string, JsonValue>)[seg]);
          any = true;
        }
      }
    }
    if (!any) existed = false;
    current = next;
    if (current.length === 0) break;
  }
  return { values: current, existed };
}

/** Turn `$regex` arg + optional `$options` into a RegExp, normalising patterns
 *  shaped like `/foo/i` (some users paste them straight from the docs). */
function compileRegex(pattern: unknown, options?: unknown): RegExp {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern !== 'string') throw new Error('$regex must be a string or RegExp');
  const flags = typeof options === 'string' ? options : '';
  const m = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
  if (m) return new RegExp(m[1], m[2] || flags);
  return new RegExp(pattern, flags);
}

function evalOp(op: string, arg: unknown, values: JsonValue[], cond: Record<string, unknown>): boolean {
  switch (op) {
    case '$eq':  return values.some((v) => deepEqual(v, arg));
    case '$ne':  return values.every((v) => !deepEqual(v, arg));
    case '$gt':  return values.some((v) => { const c = cmp(v, arg); return c !== undefined && c > 0; });
    case '$gte': return values.some((v) => { const c = cmp(v, arg); return c !== undefined && c >= 0; });
    case '$lt':  return values.some((v) => { const c = cmp(v, arg); return c !== undefined && c < 0; });
    case '$lte': return values.some((v) => { const c = cmp(v, arg); return c !== undefined && c <= 0; });
    case '$in': {
      if (!Array.isArray(arg)) throw new Error('$in expects an array');
      return values.some((v) => arg.some((a) =>
        deepEqual(v, a) || (Array.isArray(v) && v.some((vi) => deepEqual(vi, a))),
      ));
    }
    case '$nin': {
      if (!Array.isArray(arg)) throw new Error('$nin expects an array');
      return values.every((v) => !arg.some((a) =>
        deepEqual(v, a) || (Array.isArray(v) && v.some((vi) => deepEqual(vi, a))),
      ));
    }
    case '$exists': return arg ? values.length > 0 : values.length === 0;
    case '$type': {
      const want = String(arg);
      return values.some((v) => jsonType(v) === want);
    }
    case '$regex': {
      const re = compileRegex(arg, cond.$options);
      return values.some((v) => typeof v === 'string' && re.test(v));
    }
    case '$options': return true; // consumed by $regex
    case '$mod': {
      if (!Array.isArray(arg) || arg.length !== 2) throw new Error('$mod expects [divisor, remainder]');
      const [d, r] = arg as [number, number];
      return values.some((v) => typeof v === 'number' && v % d === r);
    }
    case '$size': {
      if (typeof arg !== 'number') throw new Error('$size expects a number');
      return values.some((v) => Array.isArray(v) && v.length === arg);
    }
    case '$all': {
      if (!Array.isArray(arg)) throw new Error('$all expects an array');
      return values.some((v) => Array.isArray(v) && arg.every((a) => v.some((vi) => deepEqual(vi, a))));
    }
    case '$elemMatch': {
      if (!isObj(arg)) throw new Error('$elemMatch expects a query object');
      return values.some((v) => Array.isArray(v) && v.some((vi) => matchesQuery(arg as QueryDoc, vi)));
    }
    case '$not': {
      // Inside a field condition: negate the inner condition.
      return !fieldMatches(values, arg);
    }
  }
  throw new Error(`Unknown operator: ${op}`);
}

function fieldMatches(values: JsonValue[], cond: unknown): boolean {
  // Operator object: every op must match (logical AND inside the field).
  if (isObj(cond)) {
    const keys = Object.keys(cond);
    if (keys.length > 0 && keys.every((k) => k.startsWith('$'))) {
      return keys.every((k) => evalOp(k, (cond as Record<string, unknown>)[k], values, cond as Record<string, unknown>));
    }
    // Plain object literal: deep-equality match against any of the candidates.
    return values.some((v) => deepEqual(v, cond));
  }
  // Literal: equality match against any candidate.
  return values.some((v) => deepEqual(v, cond));
}

/** True if `doc` satisfies the query. Throws on malformed queries (caller
 *  catches and reports the message). */
export function matchesQuery(query: QueryDoc, doc: JsonValue): boolean {
  for (const [k, v] of Object.entries(query)) {
    if (k === '$and') {
      if (!Array.isArray(v)) throw new Error('$and expects an array');
      if (!v.every((q) => matchesQuery(q as QueryDoc, doc))) return false;
      continue;
    }
    if (k === '$or') {
      if (!Array.isArray(v)) throw new Error('$or expects an array');
      if (!v.some((q) => matchesQuery(q as QueryDoc, doc))) return false;
      continue;
    }
    if (k === '$nor') {
      if (!Array.isArray(v)) throw new Error('$nor expects an array');
      if (v.some((q) => matchesQuery(q as QueryDoc, doc))) return false;
      continue;
    }
    if (k === '$not') {
      // Top-level $not: negate the inner query against the same doc.
      if (!isObj(v)) throw new Error('$not expects a query object');
      if (matchesQuery(v as QueryDoc, doc)) return false;
      continue;
    }
    if (k.startsWith('$')) throw new Error(`Unknown top-level operator: ${k}`);
    const { values, existed } = resolveField(doc, k);
    // Special-case $exists so missing fields evaluate correctly.
    if (isObj(v) && '$exists' in v) {
      const want = !!(v as any).$exists;
      if (want ? !existed : existed) return false;
      const restKeys = Object.keys(v).filter((x) => x !== '$exists');
      if (restKeys.length === 0) continue;
      const rest: Record<string, unknown> = {};
      for (const x of restKeys) rest[x] = (v as any)[x];
      if (!fieldMatches(values, rest)) return false;
      continue;
    }
    // For any other condition, an absent field can't satisfy it (mirrors Mongo).
    if (!existed && !(isObj(v) && '$ne' in v)) return false;
    if (!fieldMatches(values, v)) return false;
  }
  return true;
}

/** Filter an array (or wrap a single value as a one-element collection).
 *  Returns matches with their paths relative to `basePath`. */
export function filter(query: QueryDoc, value: JsonValue, basePath: JsonPath = []): FilterResult {
  const result: FilterResult = { matches: [], total: 0 };
  try {
    if (Array.isArray(value)) {
      result.total = value.length;
      for (let i = 0; i < value.length; i++) {
        if (matchesQuery(query, value[i])) {
          result.matches.push({ path: [...basePath, i], value: value[i] });
        }
      }
    } else {
      result.total = 1;
      if (matchesQuery(query, value)) {
        result.matches.push({ path: basePath.slice(), value });
      }
    }
  } catch (e) {
    result.error = { message: (e as Error).message };
  }
  return result;
}

/** Yes/no on a single doc. */
export function validate(query: QueryDoc, value: JsonValue): ValidateResult {
  try {
    return { ok: matchesQuery(query, value) };
  } catch (e) {
    return { ok: false, error: { message: (e as Error).message } };
  }
}

/** Pick a sensible default array path to query when the user opens the panel:
 *   - the doc itself if it's already an array
 *   - the first top-level array property, if any
 *   - else the empty path (root). */
export function pickDefaultTarget(value: JsonValue | undefined): JsonPath {
  if (value === undefined) return [];
  if (Array.isArray(value)) return [];
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (Array.isArray(v)) return [k];
    }
  }
  return [];
}

/** Walk into a JsonValue along a path. Returns undefined on any miss. */
export function getAtPath(v: JsonValue | undefined, path: JsonPath): JsonValue | undefined {
  let cur: JsonValue | undefined = v;
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      if (typeof seg !== 'number') return undefined;
      cur = cur[seg];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, JsonValue>)[seg as string];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Render a path as `$.users[0].name` for display purposes. */
export function formatPath(p: JsonPath): string {
  return '$' + p.map((s) => typeof s === 'number' ? `[${s}]` : `.${s}`).join('');
}

/** Parse `$.users[0]` style strings back to a JsonPath. Returns null on
 *  syntax errors. Empty / `$` → root. */
export function parsePath(s: string): JsonPath | null {
  const trimmed = s.trim();
  if (trimmed === '' || trimmed === '$') return [];
  let i = 0;
  const out: JsonPath = [];
  if (trimmed[0] === '$') i = 1;
  while (i < trimmed.length) {
    const c = trimmed[i];
    if (c === '.') {
      i++;
      let name = '';
      while (i < trimmed.length && trimmed[i] !== '.' && trimmed[i] !== '[') {
        name += trimmed[i++];
      }
      if (!name) return null;
      out.push(name);
    } else if (c === '[') {
      const end = trimmed.indexOf(']', i);
      if (end < 0) return null;
      const inside = trimmed.slice(i + 1, end);
      const n = Number(inside);
      if (Number.isInteger(n) && String(n) === inside) {
        out.push(n);
      } else {
        // Quoted bracket key: `["foo"]`
        const m = /^["'](.*)["']$/.exec(inside);
        if (!m) return null;
        out.push(m[1]);
      }
      i = end + 1;
    } else {
      // bare leading word like `users[0]`
      let name = '';
      while (i < trimmed.length && trimmed[i] !== '.' && trimmed[i] !== '[') {
        name += trimmed[i++];
      }
      if (!name) return null;
      out.push(name);
    }
  }
  return out;
}
