/**
 * CodeMirror 6 diff overlay for the text view.
 *
 * Given a list of DiffNode entries (from core/diff-engine), paint a line-level
 * background tint on every line whose source range maps to a changed path.
 *
 * Path → offset resolution uses jsonc-parser so it tracks the live document
 * shape regardless of formatting.
 *
 * Status tints reuse existing CSS variables from the app theme (rules in
 * TextView.svelte global styles).
 */

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { parseTree, findNodeAtLocation, type Node } from 'jsonc-parser';
import type { DiffNode } from '../core/diff-engine';

/** Push a new diff list (or null to clear) into the editor. */
export const setDiffNodes = StateEffect.define<DiffNode[] | null>();

/** Field stores the latest list; it doesn't compute decorations itself. */
const diffNodesField = StateField.define<DiffNode[] | null>({
  create() { return null; },
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setDiffNodes)) value = e.value;
    return value;
  },
});

const lineCls = (cls: string) => Decoration.line({ attributes: { class: cls } });

function buildDecorations(view: EditorView, nodes: DiffNode[]): DecorationSet {
  const text = view.state.doc.toString();
  if (!text || nodes.length === 0) return Decoration.none;

  const tree = parseTree(text, [], { allowTrailingComma: false, disallowComments: true });
  if (!tree) return Decoration.none;

  const doc = view.state.doc;
  // Map line.from -> chosen status. Last write wins; sort priority below.
  const linesByFrom = new Map<number, string>();
  // Process in priority order so "changed" beats "moved" beats add/remove
  // when multiple ranges land on the same line.
  const priority: Record<DiffNode['status'], number> = {
    unchanged: 0, added: 1, removed: 1, moved: 2, changed: 3,
  };
  const sorted = nodes
    .filter((n) => n.status !== 'unchanged')
    .sort((a, b) => priority[a.status] - priority[b.status]);

  for (const n of sorted) {
    const target: Node | undefined = n.path.length === 0 ? tree : findNodeAtLocation(tree, n.path);
    if (!target) continue;
    const startLine = doc.lineAt(target.offset);
    const endOff = Math.min(target.offset + target.length, doc.length);
    const endLine = doc.lineAt(endOff);
    const cls = `cm-diff-${n.status}`;
    for (let i = startLine.number; i <= endLine.number; i++) {
      const ln = doc.line(i);
      linesByFrom.set(ln.from, cls);
    }
  }

  const builder = new RangeSetBuilder<Decoration>();
  const offsets = [...linesByFrom.keys()].sort((a, b) => a - b);
  for (const from of offsets) {
    builder.add(from, from, lineCls(linesByFrom.get(from)!));
  }
  return builder.finish();
}

const diffViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      const nodes = view.state.field(diffNodesField);
      this.decorations = nodes ? buildDecorations(view, nodes) : Decoration.none;
    }
    update(u: ViewUpdate) {
      const prev = u.startState.field(diffNodesField);
      const next = u.state.field(diffNodesField);
      if (next !== prev || u.docChanged) {
        this.decorations = next ? buildDecorations(u.view, next) : Decoration.none;
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function diffHighlightExtension() {
  return [diffNodesField, diffViewPlugin];
}
