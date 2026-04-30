<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
  import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
  import { json } from '@codemirror/lang-json';
  import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
  import { lintGutter, linter, type Diagnostic } from '@codemirror/lint';
  import { doc } from '../core/store.svelte';

  let host: HTMLDivElement;
  let view: EditorView | undefined = $state();
  let setting = false;

  const lintComp = new Compartment();

  function makeLinter() {
    return linter(() => {
      const diags: Diagnostic[] = doc.parse.errors.map((e) => ({
        from: Math.min(e.offset, doc.text.length),
        to: Math.min(e.offset + Math.max(1, e.length), doc.text.length),
        severity: e.severity,
        message: e.message,
      }));
      return diags;
    }, { delay: 100 });
  }

  onMount(() => {
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
        lintComp.of(makeLinter()),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !setting) {
            doc.setText(u.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
        }),
      ],
    });
    view = new EditorView({ state, parent: host });
  });

  // sync store text -> editor when changed externally
  $effect(() => {
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
    view?.dispatch({ effects: lintComp.reconfigure(makeLinter()) });
  });

  onDestroy(() => view?.destroy());

  export function focus() { view?.focus(); }
  export function cmUndo() { if (view) undo(view); }
  export function cmRedo() { if (view) redo(view); }
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
