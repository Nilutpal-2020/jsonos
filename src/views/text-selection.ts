/**
 * CodeMirror 6 extension: paint a "selected node" highlight on the editor and
 * report cursor → JsonPath via a callback.
 *
 * Two channels:
 *   - `setSelectedPath` effect — accepts a JsonPath | null. When non-null we
 *     resolve the offset/length via jsonc-parser and paint a `cm-jx-selected`
 *     mark, then scroll the line into view. Re-resolving on every doc change
 *     keeps the highlight live across edits.
 *   - `cursorPathListener` — a tiny ViewPlugin that watches selection moves
 *     and calls back with the JSON path under the primary cursor (debounced
 *     via requestAnimationFrame so we don't churn during drag-select).
 */

import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { parseTree, findNodeAtLocation, getLocation, type Node } from 'jsonc-parser';
import type { JsonPath } from '../core/types';

export const setSelectedPath = StateEffect.define<JsonPath | null>();

const selectedPathField = StateField.define<JsonPath | null>({
  create() { return null; },
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSelectedPath)) value = e.value;
    return value;
  },
});

function buildHighlight(view: EditorView, path: JsonPath): DecorationSet {
  // Root selection ([]) intentionally paints nothing — highlighting the entire
  // document buries the actual diff overlay during compare.
  if (path.length === 0) return Decoration.none;
  const text = view.state.doc.toString();
  if (!text) return Decoration.none;
  const tree = parseTree(text, [], { allowTrailingComma: false, disallowComments: true });
  if (!tree) return Decoration.none;
  const node = findNodeAtLocation(tree, path);
  if (!node) return Decoration.none;

  // Anchor the highlight at the property's key when we're an object member, so
  // the user sees `"key": value` selected — not just the value.
  let from = node.offset;
  const parent: Node | undefined = node.parent;
  if (parent && parent.type === 'property') from = parent.offset;
  let to = node.offset + node.length;
  // For container values, clamp to the first line so the highlight reads as
  // "this key" rather than tinting the entire object/array body. The contents
  // are reachable via their own paths.
  if (node.type === 'object' || node.type === 'array') {
    const firstLineEnd = view.state.doc.lineAt(from).to;
    to = Math.min(to, firstLineEnd);
  }
  from = Math.max(0, Math.min(from, view.state.doc.length));
  to = Math.max(from, Math.min(to, view.state.doc.length));
  if (from === to) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  builder.add(from, to, Decoration.mark({ class: 'cm-jx-selected' }));
  return builder.finish();
}

const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      const p = view.state.field(selectedPathField);
      this.decorations = p ? buildHighlight(view, p) : Decoration.none;
    }
    update(u: ViewUpdate) {
      const prev = u.startState.field(selectedPathField);
      const next = u.state.field(selectedPathField);
      if (next !== prev || u.docChanged) {
        this.decorations = next ? buildHighlight(u.view, next) : Decoration.none;
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Scroll selected node into the viewport when the path changes. */
function makeScrollWatcher() {
  return EditorView.updateListener.of((u) => {
    const prev = u.startState.field(selectedPathField);
    const next = u.state.field(selectedPathField);
    if (next === prev || !next || next.length === 0) return;
    const text = u.state.doc.toString();
    const tree = parseTree(text, [], { allowTrailingComma: false, disallowComments: true });
    if (!tree) return;
    const node = findNodeAtLocation(tree, next);
    if (!node) return;
    const from = Math.max(0, Math.min(node.offset, u.state.doc.length));
    queueMicrotask(() => {
      try { u.view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'center' }) }); } catch {}
    });
  });
}

/** Build a JsonPath from a cursor offset. Returns [] if the cursor is in
 *  whitespace/structure (e.g. between properties); skips reporting in that
 *  case to avoid clearing the tree's selection. */
function pathAtOffset(text: string, offset: number): JsonPath | null {
  try {
    const loc = getLocation(text, offset);
    if (!loc.path || loc.path.length === 0) {
      // Cursor at root context — only report if doc is empty-ish.
      return text.trim() === '' ? [] : null;
    }
    return loc.path as JsonPath;
  } catch { return null; }
}

/** ViewPlugin that calls `onPath` whenever the primary cursor's JSON path
 *  changes. Coalesces bursts via requestAnimationFrame. */
export function cursorPathListener(onPath: (p: JsonPath | null) => void) {
  return ViewPlugin.fromClass(class {
    lastKey = '';
    raf = 0;
    constructor(public view: EditorView) {}
    update(u: ViewUpdate) {
      if (!u.selectionSet) return;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        const sel = u.view.state.selection.main;
        const text = u.view.state.doc.toString();
        const path = pathAtOffset(text, sel.head);
        if (path === null) return; // cursor in non-leaf context — leave selection alone
        const k = path.map((p) => typeof p === 'number' ? `[${p}]` : `.${p}`).join('') || '$';
        if (k === this.lastKey) return;
        this.lastKey = k;
        onPath(path);
      });
    }
    destroy() { if (this.raf) cancelAnimationFrame(this.raf); }
  });
}

export function selectionHighlightExtension() {
  return [selectedPathField, highlightPlugin, makeScrollWatcher()];
}
