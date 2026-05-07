<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment, Prec } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
  import { defaultKeymap } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
  import { bracketMatching, indentOnInput, foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
  import { html } from '@codemirror/lang-html';
  import { javascript } from '@codemirror/lang-javascript';
  import { css } from '@codemirror/lang-css';
  import { json } from '@codemirror/lang-json';
  import { tags as t } from '@lezer/highlight';
  import { ui } from '../core/ui-prefs.svelte';
  import type { MdDoc } from './md-store.svelte';

  type Props = { doc: MdDoc };
  let { doc }: Props = $props();

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
  });

  const mdHighlight = HighlightStyle.define([
    { tag: t.heading,       color: 'var(--key)', fontWeight: '700' },
    { tag: t.heading1,      color: 'var(--key)', fontWeight: '700', fontSize: '1.15em' },
    { tag: t.heading2,      color: 'var(--key)', fontWeight: '700', fontSize: '1.08em' },
    { tag: t.heading3,      color: 'var(--key)', fontWeight: '700' },
    { tag: t.strong,        fontWeight: '700' },
    { tag: t.emphasis,      fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link,          color: 'var(--accent)', textDecoration: 'underline' },
    { tag: t.url,           color: 'var(--accent)' },
    { tag: t.monospace,     color: 'var(--str)', fontFamily: 'ui-monospace, monospace' },
    { tag: t.quote,         color: 'var(--muted)', fontStyle: 'italic' },
    { tag: t.list,          color: 'var(--num)' },
    { tag: t.meta,          color: 'var(--muted)' },
    { tag: t.keyword,       color: 'var(--bool)' },
    { tag: t.string,        color: 'var(--str)' },
    { tag: t.number,        color: 'var(--num)' },
    { tag: t.invalid,       color: 'var(--err)' },
  ]);

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let setting = false;
  let boundDoc = $state<MdDoc | null>(null);
  const wrapComp = new Compartment();

  function wrapSelection(prefix: string, suffix = prefix) {
    const v = view;
    if (!v) return;
    const r = v.state.selection.main;
    const sel = v.state.sliceDoc(r.from, r.to);
    const insert = sel ? `${prefix}${sel}${suffix}` : `${prefix}${suffix}`;
    v.dispatch({
      changes: { from: r.from, to: r.to, insert },
      selection: { anchor: r.from + prefix.length, head: r.from + prefix.length + sel.length },
    });
    v.focus();
  }

  function insertLink() {
    const v = view;
    if (!v) return;
    const r = v.state.selection.main;
    const sel = v.state.sliceDoc(r.from, r.to) || 'text';
    const insert = `[${sel}](url)`;
    v.dispatch({
      changes: { from: r.from, to: r.to, insert },
      selection: { anchor: r.from + insert.length - 4, head: r.from + insert.length - 1 },
    });
    v.focus();
  }

  function toggleLinePrefix(prefix: string) {
    const v = view;
    if (!v) return;
    const r = v.state.selection.main;
    const startLine = v.state.doc.lineAt(r.from);
    const endLine = v.state.doc.lineAt(r.to);
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let n = startLine.number; n <= endLine.number; n++) {
      const line = v.state.doc.line(n);
      if (line.text.startsWith(prefix)) {
        changes.push({ from: line.from, to: line.from + prefix.length, insert: '' });
      } else {
        changes.push({ from: line.from, to: line.from, insert: prefix });
      }
    }
    v.dispatch({ changes });
    v.focus();
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
        search({ top: true }),
        markdown({
          base: markdownLanguage,
          codeLanguages: (info) => {
            const i = info.toLowerCase();
            if (i === 'js' || i === 'jsx' || i === 'ts' || i === 'tsx' || i === 'javascript' || i === 'typescript') return javascript({ jsx: i.endsWith('x'), typescript: i.startsWith('ts') }).language;
            if (i === 'html') return html().language;
            if (i === 'css') return css().language;
            if (i === 'json') return json().language;
            return null;
          },
        }),
        wrapComp.of(ui.wrap ? EditorView.lineWrapping : []),
        Prec.highest(keymap.of([
          { key: 'Mod-z',       run: () => { boundDoc?.undo(); return true; } },
          { key: 'Mod-Shift-z', run: () => { boundDoc?.redo(); return true; } },
          { key: 'Mod-y',       run: () => { boundDoc?.redo(); return true; } },
          { key: 'Mod-b',       run: () => { wrapSelection('**'); return true; } },
          { key: 'Mod-i',       run: () => { wrapSelection('*');  return true; } },
          { key: 'Mod-e',       run: () => { wrapSelection('`');  return true; } },
          { key: 'Mod-k',       run: () => { insertLink(); return true; } },
          { key: 'Mod-Shift-.', run: () => { toggleLinePrefix('> '); return true; } },
        ])),
        keymap.of([...defaultKeymap, ...foldKeymap, ...searchKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !setting) {
            boundDoc?.setText(u.state.doc.toString());
          }
        }),
        cssVarTheme,
        syntaxHighlighting(mdHighlight),
      ],
    });
    view = new EditorView({ state, parent: host });
  });

  // Re-bind editor when doc prop changes (tab switch).
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

  $effect(() => {
    const wrap = ui.wrap;
    view?.dispatch({ effects: wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) });
  });

  onDestroy(() => view?.destroy());

  export function applyWrap(prefix: string, suffix?: string) { wrapSelection(prefix, suffix); }
  export function applyLine(prefix: string) { toggleLinePrefix(prefix); }
  export function applyLink() { insertLink(); }
</script>

<div class="md-editor" bind:this={host}></div>

<style>
  .md-editor {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--surface);
  }
  :global(.md-editor .cm-editor) { height: 100%; }
  :global(.md-editor .cm-editor.cm-focused) { outline: none; }
</style>
