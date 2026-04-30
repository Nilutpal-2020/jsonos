<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
  import { json } from '@codemirror/lang-json';
  import { bracketMatching, indentOnInput, foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { lintGutter, linter, type Diagnostic } from '@codemirror/lint';
  import { tags as t } from '@lezer/highlight';
  import { workspace, type DocStore } from '../core/store.svelte';
  import { ui } from '../core/ui-prefs.svelte';

  let { doc: docProp }: { doc?: DocStore } = $props();
  let doc = $derived(docProp ?? workspace.active);

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
        history(),
        highlightSelectionMatches(),
        search({ top: true }),
        json(),
        lintGutter(),
        lintComp.of(makeLinter(doc)),
        wrapComp.of(ui.wrap ? EditorView.lineWrapping : []),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !setting) {
            boundDoc?.setText(u.state.doc.toString());
          }
        }),
        cssVarTheme,
        syntaxHighlighting(jsonHighlight),
      ],
    });
    view = new EditorView({ state, parent: host });
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

<div class="text-view" bind:this={host}></div>

<style>
  .text-view {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--surface);
  }
  :global(.cm-editor) { height: 100%; }
  :global(.cm-editor.cm-focused) { outline: none; }
</style>
