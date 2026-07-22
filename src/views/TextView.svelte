<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment, Prec } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
  import { defaultKeymap } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
  import { createSearchPanel } from './search-panel';
  import { json } from '@codemirror/lang-json';
  import { bracketMatching, indentOnInput, foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { lintGutter, linter, type Diagnostic } from '@codemirror/lint';
  import { tags as t } from '@lezer/highlight';
  import { workspace, type DocStore } from '../core/store.svelte';
  import { ui } from '../core/ui-prefs.svelte';
  import { compare } from '../core/compare.svelte';
  import { diffHighlightExtension, setDiffNodes } from './text-diff';
  import { selectionHighlightExtension, setSelectedPath, cursorPathListener } from './text-selection';
  import { selection } from '../core/selection.svelte';
  import type { DiffNode } from '../core/diff-engine';
  import type { JsonPath } from '../core/types';
  import { pathKey } from '../core/tree-flatten';

  type Props = { doc?: DocStore; slotIndex?: number };
  let { doc: docProp, slotIndex }: Props = $props();
  let doc = $derived(docProp ?? workspace.active);
  let diffSide = $derived(slotIndex !== undefined ? compare.side(slotIndex) : null);
  let diffNodes = $derived<DiffNode[] | null>(
    diffSide && compare.result ? [...compare.result.byPath.values()] : null,
  );

  // CodeMirror theme bound to our CSS variables — works for both light and dark.
  const cssVarTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: 'var(--surface)',
      color: 'var(--fg)',
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      lineHeight: '1.55',
    },
    '.cm-content': { caretColor: 'var(--accent)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '.cm-gutters': {
      backgroundColor: 'var(--surface)',
      color: 'var(--muted)',
      border: '0',
      borderRight: '1px solid var(--border)',
    },
    '.cm-activeLine': { backgroundColor: 'var(--row-hover)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--row-hover-strong)', color: 'var(--fg)' },
    '.cm-selectionMatch': { backgroundColor: 'var(--accent-soft)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--selection) !important',
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'var(--accent-soft)',
      outline: '1px solid var(--accent)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--surface-2)',
      color: 'var(--muted)',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      padding: '0 4px',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--surface-hi)',
      color: 'var(--fg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--surface-2)',
      color: 'var(--fg)',
      borderTop: '1px solid var(--border)',
    },
    '.cm-panel input, .cm-panel button': {
      backgroundColor: 'var(--surface)',
      color: 'var(--fg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '2px 6px',
      fontFamily: 'inherit',
    },
    '.cm-searchMatch': { backgroundColor: 'var(--accent-soft)' },
    '.cm-searchMatch-selected': { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' },
  });

  const jsonHighlight = HighlightStyle.define([
    { tag: t.string,        color: 'var(--str)' },
    { tag: t.number,        color: 'var(--num)' },
    { tag: t.bool,          color: 'var(--bool)' },
    { tag: t.null,          color: 'var(--null)', fontStyle: 'italic' },
    { tag: t.propertyName,  color: 'var(--key)' },
    { tag: t.keyword,       color: 'var(--bool)' },
    { tag: t.punctuation,   color: 'var(--muted)' },
    { tag: t.bracket,       color: 'var(--muted)' },
    { tag: t.brace,         color: 'var(--muted)' },
    { tag: t.invalid,       color: 'var(--err)' },
  ]);

  let host: HTMLDivElement;
  let view: EditorView | undefined = $state();
  let setting = false;
  let boundDoc = $state<DocStore | null>(null);

  const lintComp = new Compartment();
  const wrapComp = new Compartment();

  function makeLinter(d: DocStore) {
    return linter(() => {
      const diags: Diagnostic[] = d.parse.errors.map((e) => ({
        from: Math.min(e.offset, d.text.length),
        to: Math.min(e.offset + Math.max(1, e.length), d.text.length),
        severity: e.severity,
        message: e.message,
      }));
      return diags;
    }, { delay: 100 });
  }

  onMount(() => {
    boundDoc = doc;
    const state = EditorState.create({
      doc: doc.text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        foldGutter(),
        drawSelection(),
        bracketMatching(),
        indentOnInput(),
        highlightSelectionMatches(),
        search({ top: true, createPanel: createSearchPanel }),
        json(),
        lintGutter(),
        lintComp.of(makeLinter(doc)),
        wrapComp.of(ui.wrap ? EditorView.lineWrapping : []),
        // High-priority undo/redo bound to the store, so editor focus doesn't
        // route Cmd+Z / Cmd+Y to a competing CodeMirror history.
        Prec.highest(keymap.of([
          { key: 'Mod-z',       run: () => { boundDoc?.undo(); return true; } },
          { key: 'Mod-Shift-z', run: () => { boundDoc?.redo(); return true; } },
          { key: 'Mod-y',       run: () => { boundDoc?.redo(); return true; } },
        ])),
        keymap.of([...defaultKeymap, ...foldKeymap, ...searchKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !setting) {
            boundDoc?.setText(u.state.doc.toString());
          }
        }),
        cssVarTheme,
        syntaxHighlighting(jsonHighlight),
        diffHighlightExtension(),
        selectionHighlightExtension(),
        cursorPathListener((path) => {
          const id = boundDoc?.id;
          if (!id || !path) return;
          // Don't echo back our own updates from the tree side.
          const cur = selection.get(id);
          if (selection.source === 'tree' && cur && pathKey(cur) === pathKey(path)) return;
          selection.set(id, path, 'text');
        }),
      ],
    });
    view = new EditorView({ state, parent: host });
  });

  // Receive selection updates from the tree side and paint the highlight.
  // Ctrl+A in tree is a tree-only affordance; the editor has native select-all
  // already, so we leave its mark untouched in that case.
  $effect(() => {
    if (!view) return;
    const id = doc.id;
    void selection.stamp(id);
    if (selection.source === 'text') return;
    if (selection.isSelectAll(id)) return;
    const path = selection.get(id);
    const sel: JsonPath | null = path && path.length > 0 ? path : null;
    view.dispatch({ effects: setSelectedPath.of(sel) });
  });

  // Push the latest diff nodes into the editor whenever they change.
  $effect(() => {
    const nodes = diffNodes;
    view?.dispatch({ effects: setDiffNodes.of(nodes) });
  });

  // Re-bind editor when doc prop changes (slot reused for a different doc)
  $effect(() => {
    boundDoc = doc;
    const text = doc.text;
    const v = view;
    if (!v) return;
    if (v.state.doc.toString() === text) return;
    setting = true;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    setting = false;
  });

  // re-run linter when parse result changes
  $effect(() => {
    void doc.parse;
    view?.dispatch({ effects: lintComp.reconfigure(makeLinter(doc)) });
  });

  // Reconfigure line wrap when the user toggles it.
  $effect(() => {
    const wrap = ui.wrap;
    view?.dispatch({ effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) });
  });

  onDestroy(() => view?.destroy());

  export function focus() { view?.focus(); }
</script>

{#if doc.parse.errors.length > 0}
  <div class="parse-error-banner">
    <span class="err-icon">⚠️</span>
    <span class="err-text">JSON Syntax Error: {doc.parse.errors[0].message}</span>
    <button class="repair-btn" onclick={() => doc.repair()} title="Auto-fix escaped quotes, comments, trailing commas, JS/Python literals">⚡ Repair JSON</button>
  </div>
{/if}
<div class="text-view" bind:this={host}></div>

<style>
  .parse-error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--err-bg);
    border-bottom: 1px solid var(--err);
    color: var(--fg);
    font-size: 12px;
    flex-shrink: 0;
  }
  .err-icon { font-size: 14px; }
  .err-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--err);
    font-weight: 500;
  }
  .repair-btn {
    background: var(--accent);
    color: var(--accent-fg);
    border: 0;
    border-radius: var(--radius);
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: filter 80ms;
  }
  .repair-btn:hover { filter: brightness(1.1); }

  .text-view {
    flex: 1;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--surface);
    display: flex;
    flex-direction: column;
  }
  :global(.cm-editor) { height: 100%; }
  :global(.cm-editor.cm-focused) { outline: none; }

  /* Selection highlight (mark-level) — paired tree/text cross-view sync. */
  :global(.cm-jx-selected) {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
    border-radius: 2px;
  }

  /* Diff highlights (line-level). See views/text-diff.ts */
  :global(.cm-line.cm-diff-added) {
    background: color-mix(in oklab, var(--ok)  18%, transparent);
    box-shadow: inset 3px 0 0 var(--ok);
  }
  :global(.cm-line.cm-diff-removed) {
    background: color-mix(in oklab, var(--err) 18%, transparent);
    box-shadow: inset 3px 0 0 var(--err);
  }
  :global(.cm-line.cm-diff-changed) {
    background: color-mix(in oklab, var(--warn) 22%, transparent);
    box-shadow: inset 3px 0 0 var(--warn);
  }
  :global(.cm-line.cm-diff-moved) {
    background: color-mix(in oklab, var(--accent) 18%, transparent);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  /* Custom search panel — see views/search-panel.ts */
  :global(.cm-panels) {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  :global(.jx-search) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  :global(.jx-row) {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  :global(.jx-row-replace) { display: none; padding-left: 24px; }
  :global(.jx-search.jx-open .jx-row-replace) { display: flex; }

  :global(.jx-disclose) {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 0 2px;
    line-height: 0;
    border-radius: var(--radius);
    flex-shrink: 0;
  }
  :global(.jx-disclose:hover) { color: var(--fg); background: var(--row-hover); }

  :global(.jx-input) {
    flex: 1 1 200px;
    min-width: 80px;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
    font: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    outline: none;
    transition: border-color 80ms, box-shadow 80ms;
  }
  :global(.jx-input:focus) {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--ring);
  }

  :global(.jx-pill) {
    flex-shrink: 0;
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3px 7px;
    cursor: pointer;
    font: 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-weight: 600;
    min-width: 26px;
    text-align: center;
    transition: background 80ms, color 80ms, border-color 80ms;
  }
  :global(.jx-pill:hover) { color: var(--fg); border-color: var(--muted); }
  :global(.jx-pill.on) {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }

  :global(.jx-icon) {
    flex-shrink: 0;
    background: transparent;
    color: var(--muted);
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 4px;
    cursor: pointer;
    line-height: 0;
    transition: background 80ms, color 80ms, border-color 80ms;
  }
  :global(.jx-icon:hover) {
    color: var(--fg);
    background: var(--row-hover);
    border-color: var(--border);
  }
  :global(.jx-icon.jx-close:hover) { color: var(--err); }

  :global(.jx-count) {
    flex-shrink: 0;
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    padding: 0 6px;
    min-width: 48px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  :global(.jx-count.empty) { color: var(--err); }

  :global(.jx-btn) {
    flex-shrink: 0;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    transition: background 80ms, border-color 80ms;
  }
  :global(.jx-btn:hover) { background: var(--row-hover-strong); border-color: var(--muted); }
</style>
