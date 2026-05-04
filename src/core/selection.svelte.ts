/**
 * Per-doc selection state shared between text and tree views.
 *
 * - `path`     — the JSON node currently selected (single-row in tree, or
 *                resolved from the cursor in the text editor).
 * - `selectAll`— "everything" mode; lets Ctrl+C copy the whole document and
 *                Ctrl+V replace it.
 * - `source`   — which view originated the most recent change. Sinks ignore
 *                their own emissions to avoid feedback loops.
 * - `stamp`    — bumps on every change so $effect re-runs even when the
 *                Path reference happens to be deep-equal to the previous one.
 */

import type { JsonPath } from './types';
import { pathKey } from './tree-flatten';

export type SelectionSource = 'tree' | 'text' | 'external';

class SelectionStore {
  paths = $state<Record<string, JsonPath | null>>({});
  selectAll = $state<Record<string, boolean>>({});
  stamps = $state<Record<string, number>>({});
  source = $state<SelectionSource | null>(null);

  get(docId: string): JsonPath | null { return this.paths[docId] ?? null; }
  isSelectAll(docId: string): boolean { return !!this.selectAll[docId]; }
  stamp(docId: string): number { return this.stamps[docId] ?? 0; }
  key(docId: string): string | null {
    const p = this.paths[docId];
    return p ? pathKey(p) : null;
  }

  set(docId: string, path: JsonPath | null, source: SelectionSource) {
    this.paths = { ...this.paths, [docId]: path };
    if (this.selectAll[docId]) {
      this.selectAll = { ...this.selectAll, [docId]: false };
    }
    this.stamps = { ...this.stamps, [docId]: (this.stamps[docId] ?? 0) + 1 };
    this.source = source;
  }

  setAll(docId: string, on: boolean, source: SelectionSource = 'tree') {
    this.selectAll = { ...this.selectAll, [docId]: on };
    if (on) this.paths = { ...this.paths, [docId]: null };
    this.stamps = { ...this.stamps, [docId]: (this.stamps[docId] ?? 0) + 1 };
    this.source = source;
  }

  clear(docId: string) {
    this.paths = { ...this.paths, [docId]: null };
    this.selectAll = { ...this.selectAll, [docId]: false };
    this.source = null;
  }
}

export const selection = new SelectionStore();
