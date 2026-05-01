/**
 * Structural JSON diff engine — Beyond Compare style, JSON-native.
 *
 *  - Status taxonomy: unchanged | added | removed | changed | moved
 *  - Move detection in arrays: identity-key match for objects (arrayKeys hint),
 *    LCS for arrays of primitives. Falls back to index-aligned diff.
 *  - Ignore rules: paths (with `**` deep wildcard), null↔undefined↔missing,
 *    case-insensitive strings, whitespace-trimmed strings.
 *  - Hash quick-check skips deep recursion when both sides hash equal.
 *  - Returns a DiffNode tree + flat path-keyed map + stats; suitable for
 *    O(1) lookups during render of either side.
 */

import type { JsonPath, JsonValue } from './types';

export type DiffStatus = 'unchanged' | 'added' | 'removed' | 'changed' | 'moved';

export interface DiffNode {
  /** Stable string id for the node (path-key). */
  id: string;
  path: JsonPath;
  status: DiffStatus;
  /** For 'changed' on scalars; both sides for 'moved'. */
  before?: JsonValue;
  after?: JsonValue;
  /** Index in the OPPOSITE side (for moves). */
  fromIndex?: number;
  toIndex?: number;
  /** Container children. */
  children?: DiffNode[];
  /** True if this node (and all descendants) are unchanged.
      Useful for "collapse unchanged". */
  allUnchanged?: boolean;
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: number;
  moved: number;
  unchanged: number;
}

export interface IgnoreRules {
  /** JSON-path-ish patterns to ignore (compared exact / with `**` wildcard). */
  paths: string[];
  /** null, undefined, and missing are all equivalent. */
  nullEqMissing: boolean;
  /** Case-insensitive string compare. */
  caseInsensitive: boolean;
  /** Trim leading/trailing whitespace before comparing strings. */
  trimStrings: boolean;
  /** Per-path "id field" used to match objects across arrays. e.g.
      { "$.users": "id" } means user objects with same `id` are the same item. */
  arrayKeys: Record<string, string>;
}

export const DEFAULT_RULES: IgnoreRules = {
  paths: [],
  nullEqMissing: false,
  caseInsensitive: false,
  trimStrings: false,
  arrayKeys: {},
};

export interface DiffResult {
  root: DiffNode;
  /** path-key → node. Build once, query during render. */
  byPath: Map<string, DiffNode>;
  stats: DiffStats;
  rulesUsed: IgnoreRules;
}

// ──────────────────────────────────────────────────────────────────────────
//  Path utilities
// ──────────────────────────────────────────────────────────────────────────

export function pathToKey(path: JsonPath): string {
  if (path.length === 0) return '$';
  return '$' + path.map((p) => typeof p === 'number' ? `[${p}]` : `.${p}`).join('');
}

/** Match a path against an ignore pattern. Supports `**` (deep) and `*` (segment). */
function pathMatches(path: JsonPath, pattern: string): boolean {
  if (!pattern) return false;
  const norm = pattern.startsWith('$') ? pattern.slice(1) : pattern;
  // tokenize by . and [n]
  const tok = (s: string): string[] => {
    const out: string[] = [];
    s.replace(/\.([^.[\]]+)|\[([^\]]+)\]/g, (_m, k, idx) => {
      out.push(k ?? idx);
      return '';
    });
    return out;
  };
  const want = tok(norm);
  const have = path.map((p) => String(p));
  let i = 0, j = 0;
  while (i < want.length && j < have.length) {
    const w = want[i];
    if (w === '**') {
      // greedy match — anything until rest matches
      if (i === want.length - 1) return true;
      const restWant = want.slice(i + 1);
      for (let k = j; k <= have.length; k++) {
        const tail = have.slice(k);
        if (tail.length >= restWant.length &&
            restWant.every((w2, idx) => w2 === '*' || w2 === tail[idx])) return true;
      }
      return false;
    }
    if (w !== '*' && w !== have[j]) return false;
    i++; j++;
  }
  return i === want.length && j === have.length;
}

function isIgnoredPath(path: JsonPath, rules: IgnoreRules): boolean {
  for (const p of rules.paths) if (pathMatches(path, p)) return true;
  return false;
}

function lookupArrayKey(path: JsonPath, rules: IgnoreRules): string | undefined {
  for (const [pat, key] of Object.entries(rules.arrayKeys)) {
    if (pathMatches(path, pat)) return key;
  }
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────
//  Value normalization & equality
// ──────────────────────────────────────────────────────────────────────────

const MISSING = Symbol('missing');
type Side = JsonValue | typeof MISSING;

function normalize(v: Side, rules: IgnoreRules): Side {
  if (v === MISSING) return rules.nullEqMissing ? null : v;
  if (v === null && rules.nullEqMissing) return null;
  if (typeof v === 'string') {
    let s = v;
    if (rules.trimStrings) s = s.trim();
    if (rules.caseInsensitive) s = s.toLowerCase();
    return s;
  }
  return v;
}

function valueKind(v: Side): string {
  if (v === MISSING) return 'missing';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** Cheap structural hash for quick-equality. */
function hashValue(v: Side): string {
  if (v === MISSING) return '__missing__';
  if (v === null) return '__null__';
  if (typeof v !== 'object') return typeof v + ':' + JSON.stringify(v);
  // Stable stringify (sort keys) so key-order doesn't perturb the hash.
  const seen = new WeakSet<object>();
  const stringify = (x: any): string => {
    if (x == null) return 'n';
    if (typeof x !== 'object') return JSON.stringify(x);
    if (seen.has(x)) return '<cycle>';
    seen.add(x);
    if (Array.isArray(x)) return '[' + x.map(stringify).join(',') + ']';
    const keys = Object.keys(x).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stringify(x[k])).join(',') + '}';
  };
  return stringify(v);
}

function shallowEqual(a: Side, b: Side, rules: IgnoreRules): boolean {
  const na = normalize(a, rules);
  const nb = normalize(b, rules);
  if (na === MISSING && nb === MISSING) return true;
  if (na === MISSING || nb === MISSING) return false;
  if (typeof na !== 'object' || na === null) return na === nb;
  // For objects/arrays at this level, defer to deep equality via hash.
  return hashValue(na) === hashValue(nb);
}

// ──────────────────────────────────────────────────────────────────────────
//  Core diff
// ──────────────────────────────────────────────────────────────────────────

class DiffBuilder {
  byPath = new Map<string, DiffNode>();
  stats: DiffStats = { added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0 };
  constructor(public rules: IgnoreRules) {}

  bump(s: DiffStatus) {
    if (s === 'unchanged') this.stats.unchanged++;
    else if (s === 'added') this.stats.added++;
    else if (s === 'removed') this.stats.removed++;
    else if (s === 'changed') this.stats.changed++;
    else if (s === 'moved') this.stats.moved++;
  }

  node(path: JsonPath, status: DiffStatus, extra: Partial<DiffNode> = {}): DiffNode {
    const id = pathToKey(path);
    const n: DiffNode = { id, path, status, ...extra };
    this.byPath.set(id, n);
    if (!extra.children) this.bump(status);
    return n;
  }

  diff(left: Side, right: Side, path: JsonPath): DiffNode {
    if (isIgnoredPath(path, this.rules)) {
      return this.node(path, 'unchanged', { allUnchanged: true });
    }

    // Quick equality via hash (works for all values).
    if (hashValue(normalize(left, this.rules)) === hashValue(normalize(right, this.rules))) {
      return this.node(path, 'unchanged', { allUnchanged: true });
    }

    const lk = valueKind(left), rk = valueKind(right);
    if (lk === 'missing' && rk !== 'missing') {
      return this.node(path, 'added', { after: right === MISSING ? undefined : right });
    }
    if (rk === 'missing' && lk !== 'missing') {
      return this.node(path, 'removed', { before: left === MISSING ? undefined : left });
    }

    // Different shapes → "changed"
    if (lk !== rk) {
      return this.node(path, 'changed', {
        before: left === MISSING ? undefined : left,
        after:  right === MISSING ? undefined : right,
      });
    }

    if (lk === 'object') {
      return this.diffObject(left as Record<string, JsonValue>, right as Record<string, JsonValue>, path);
    }
    if (lk === 'array') {
      return this.diffArray(left as JsonValue[], right as JsonValue[], path);
    }

    // Same scalar kind, different value
    return this.node(path, 'changed', { before: left as JsonValue, after: right as JsonValue });
  }

  private diffObject(a: Record<string, JsonValue>, b: Record<string, JsonValue>, path: JsonPath): DiffNode {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const children: DiffNode[] = [];
    let allUnchanged = true;
    // Keep insertion order of `b` (the right side) as the canonical traversal.
    const ordered = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    for (const k of ordered) {
      if (!keys.has(k)) continue;
      const lv: Side = k in a ? a[k] : MISSING;
      const rv: Side = k in b ? b[k] : MISSING;
      const child = this.diff(lv, rv, [...path, k]);
      children.push(child);
      if (child.status !== 'unchanged' || !child.allUnchanged) allUnchanged = false;
    }
    const status: DiffStatus = allUnchanged ? 'unchanged' : 'changed';
    const id = pathToKey(path);
    const n: DiffNode = { id, path, status, children, allUnchanged };
    this.byPath.set(id, n);
    if (status === 'unchanged') this.bump('unchanged');
    return n;
  }

  private diffArray(a: JsonValue[], b: JsonValue[], path: JsonPath): DiffNode {
    const arrKey = lookupArrayKey(path, this.rules);

    // Strategy 1: identity-keyed object array — match by key field.
    if (arrKey
      && a.every((x) => x && typeof x === 'object' && !Array.isArray(x) && arrKey in (x as any))
      && b.every((x) => x && typeof x === 'object' && !Array.isArray(x) && arrKey in (x as any))
    ) {
      return this.diffArrayKeyed(a, b, path, arrKey);
    }

    // Strategy 2: arrays of primitives — LCS for move detection.
    const allPrim = (xs: JsonValue[]) => xs.every((x) => x === null || typeof x !== 'object');
    if (allPrim(a) && allPrim(b)) {
      return this.diffArrayLcs(a, b, path);
    }

    // Strategy 3: index-aligned (default).
    return this.diffArrayIndexAligned(a, b, path);
  }

  private diffArrayIndexAligned(a: JsonValue[], b: JsonValue[], path: JsonPath): DiffNode {
    const max = Math.max(a.length, b.length);
    const children: DiffNode[] = [];
    let allUnchanged = true;
    for (let i = 0; i < max; i++) {
      const lv: Side = i < a.length ? a[i] : MISSING;
      const rv: Side = i < b.length ? b[i] : MISSING;
      const child = this.diff(lv, rv, [...path, i]);
      children.push(child);
      if (child.status !== 'unchanged' || !child.allUnchanged) allUnchanged = false;
    }
    const id = pathToKey(path);
    const status: DiffStatus = allUnchanged ? 'unchanged' : 'changed';
    const n: DiffNode = { id, path, status, children, allUnchanged };
    this.byPath.set(id, n);
    if (status === 'unchanged') this.bump('unchanged');
    return n;
  }

  private diffArrayLcs(a: JsonValue[], b: JsonValue[], path: JsonPath): DiffNode {
    const eq = (x: JsonValue, y: JsonValue) => shallowEqual(x, y, this.rules);
    const lcs = lcsTable(a, b, eq);
    const ops = lcsToOps(lcs, a.length, b.length);

    const children: DiffNode[] = [];
    let allUnchanged = true;
    for (const op of ops) {
      if (op.kind === 'eq') {
        // Same index between sides? If indices differ, mark moved.
        const moved = op.ai !== op.bi;
        const child: DiffNode = moved
          ? this.node([...path, op.bi], 'moved', {
              before: a[op.ai], after: b[op.bi], fromIndex: op.ai, toIndex: op.bi,
            })
          : this.node([...path, op.bi], 'unchanged', {
              before: a[op.ai], after: b[op.bi], allUnchanged: true,
            });
        children.push(child);
        if (moved) allUnchanged = false;
      } else if (op.kind === 'add') {
        children.push(this.node([...path, op.bi], 'added', { after: b[op.bi] }));
        allUnchanged = false;
      } else {
        // 'remove' on left side — express as a removed node at the source index.
        children.push(this.node([...path, op.ai], 'removed', { before: a[op.ai] }));
        allUnchanged = false;
      }
    }
    const id = pathToKey(path);
    const status: DiffStatus = allUnchanged ? 'unchanged' : 'changed';
    const n: DiffNode = { id, path, status, children, allUnchanged };
    this.byPath.set(id, n);
    return n;
  }

  private diffArrayKeyed(a: JsonValue[], b: JsonValue[], path: JsonPath, key: string): DiffNode {
    const idOf = (x: JsonValue) => JSON.stringify((x as any)[key]);
    const aIdx = new Map<string, number>();
    a.forEach((x, i) => aIdx.set(idOf(x), i));

    const children: DiffNode[] = [];
    const matchedFromA = new Set<number>();
    let allUnchanged = true;

    b.forEach((bx, bi) => {
      const id = idOf(bx);
      const ai = aIdx.get(id);
      if (ai === undefined) {
        children.push(this.node([...path, bi], 'added', { after: bx }));
        allUnchanged = false;
        return;
      }
      matchedFromA.add(ai);
      // Recurse into the matched object for inner changes.
      const sub = this.diff(a[ai], bx, [...path, bi]);
      // Index moved?
      if (sub.status === 'unchanged' && ai !== bi) {
        sub.status = 'moved';
        sub.fromIndex = ai;
        sub.toIndex = bi;
        sub.before = a[ai];
        sub.after = bx;
        sub.allUnchanged = false;
        // Bookkeeping fix
        this.stats.unchanged--;
        this.bump('moved');
      }
      if (sub.status !== 'unchanged' || !sub.allUnchanged) allUnchanged = false;
      children.push(sub);
    });

    a.forEach((ax, ai) => {
      if (matchedFromA.has(ai)) return;
      // Removed item, not present in b. Report at original index.
      children.push(this.node([...path, ai], 'removed', { before: ax }));
      allUnchanged = false;
    });

    const id = pathToKey(path);
    const status: DiffStatus = allUnchanged ? 'unchanged' : 'changed';
    const n: DiffNode = { id, path, status, children, allUnchanged };
    this.byPath.set(id, n);
    return n;
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  LCS for primitive arrays
// ──────────────────────────────────────────────────────────────────────────

function lcsTable(a: JsonValue[], b: JsonValue[], eq: (x: JsonValue, y: JsonValue) => boolean): number[][] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = eq(a[i - 1], b[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

type LcsOp = { kind: 'eq'; ai: number; bi: number } | { kind: 'add'; bi: number } | { kind: 'remove'; ai: number };

function lcsToOps(dp: number[][], n: number, m: number): LcsOp[] {
  const ops: LcsOp[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (dp[i][j] === dp[i - 1][j - 1] + 1 && dp[i][j] !== dp[i - 1][j] && dp[i][j] !== dp[i][j - 1]) {
      ops.push({ kind: 'eq', ai: i - 1, bi: j - 1 });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ kind: 'remove', ai: i - 1 });
      i--;
    } else {
      ops.push({ kind: 'add', bi: j - 1 });
      j--;
    }
  }
  while (i > 0) { ops.push({ kind: 'remove', ai: i - 1 }); i--; }
  while (j > 0) { ops.push({ kind: 'add', bi: j - 1 }); j--; }
  return ops.reverse();
}

// ──────────────────────────────────────────────────────────────────────────
//  Public entry
// ──────────────────────────────────────────────────────────────────────────

export function diffJson(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
  rules: IgnoreRules = DEFAULT_RULES,
): DiffResult {
  const builder = new DiffBuilder(rules);
  const root = builder.diff(
    left === undefined ? MISSING : left,
    right === undefined ? MISSING : right,
    [],
  );
  return { root, byPath: builder.byPath, stats: builder.stats, rulesUsed: rules };
}

/** Walk a DiffNode tree and collect all "interesting" (changed) paths in order. */
export function collectChanges(root: DiffNode): DiffNode[] {
  const out: DiffNode[] = [];
  const walk = (n: DiffNode) => {
    if (n.status !== 'unchanged' && (!n.children || n.children.length === 0)) {
      out.push(n);
    }
    if (n.children) for (const c of n.children) walk(c);
    if (n.children && n.status !== 'unchanged' && !out.length) out.push(n);
  };
  walk(root);
  return out;
}
