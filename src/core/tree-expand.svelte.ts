/**
 * Per-doc tree expand state — shared so chrome (SlotView header buttons) and
 * the tree itself agree on what's open.
 *
 *   expanded: paths the user opened (or default-open by heuristic)
 *   toggled:  paths the user has explicitly touched (overrides the default)
 *
 * Default heuristic: open all containers up to depth 3.
 */

import type { JsonPath, JsonValue } from './types';
// Use the same path-key format as the renderer so add/check agree.
import { pathKey } from './tree-flatten';

export interface DocExpand { expanded: Set<string>; toggled: Set<string> }

function walkContainers(v: JsonValue, path: JsonPath, fn: (key: string) => void): void {
  const isArr = Array.isArray(v);
  const isObj = !isArr && v !== null && typeof v === 'object';
  if (!isArr && !isObj) return;
  fn(pathKey(path));
  if (isArr) {
    const arr = v as JsonValue[];
    for (let i = 0; i < arr.length; i++) walkContainers(arr[i], [...path, i], fn);
  } else {
    for (const [k, c] of Object.entries(v as Record<string, JsonValue>)) {
      walkContainers(c, [...path, k], fn);
    }
  }
}

class TreeExpandStore {
  private byDoc = new Map<string, DocExpand>();
  /** Bumped on every mutation so consumers can $derive on it. */
  bump = $state(0);

  get(docId: string): DocExpand {
    let s = this.byDoc.get(docId);
    if (!s) { s = { expanded: new Set(), toggled: new Set() }; this.byDoc.set(docId, s); }
    return s;
  }

  /** Whether `path` should render expanded right now. */
  isOpen(docId: string, path: JsonPath): boolean {
    const { expanded, toggled } = this.get(docId);
    const k = pathKey(path);
    if (toggled.has(k)) return expanded.has(k);
    return path.length < 3; // default heuristic
  }

  toggle(docId: string, path: JsonPath, currentlyOpen: boolean) {
    const { expanded, toggled } = this.get(docId);
    const k = pathKey(path);
    toggled.add(k);
    if (currentlyOpen) expanded.delete(k);
    else expanded.add(k);
    this.bump++;
  }

  /** Mark a single path open (used when adding a child to ensure parent is expanded). */
  forceOpen(docId: string, path: JsonPath) {
    const { expanded, toggled } = this.get(docId);
    const k = pathKey(path);
    expanded.add(k);
    toggled.add(k);
    this.bump++;
  }

  expandAll(docId: string, value: JsonValue | undefined) {
    if (value === undefined) return;
    const s = this.get(docId);
    walkContainers(value, [], (k) => { s.expanded.add(k); s.toggled.add(k); });
    this.bump++;
  }

  collapseAll(docId: string, value: JsonValue | undefined) {
    if (value === undefined) return;
    const s = this.get(docId);
    walkContainers(value, [], (k) => { s.expanded.delete(k); s.toggled.add(k); });
    // keep root visible
    s.expanded.add('$');
    s.toggled.add('$');
    this.bump++;
  }

  reset(docId: string) {
    const s = this.get(docId);
    s.expanded.clear();
    s.toggled.clear();
    this.bump++;
  }
}

export const treeExpand = new TreeExpandStore();
