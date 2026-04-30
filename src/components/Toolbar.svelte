<script lang="ts">
  import { doc } from '../core/store.svelte';

  type Mode = 'text' | 'tree' | 'split' | 'table';
  let {
    mode = $bindable('split' as Mode),
    panelOpen = $bindable(false),
    onShare,
  }: { mode: Mode; panelOpen: boolean; onShare: () => void } = $props();

  let fileInput: HTMLInputElement;
  let repairError = $state('');

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const text = await f.text();
    doc.load(text, f.name);
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) doc.load(t);
    } catch { /* permission */ }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(doc.text); } catch { /* ignore */ }
  }

  async function repair() {
    repairError = '';
    try { await doc.repair(); }
    catch (e) { repairError = (e as Error).message; setTimeout(() => repairError = '', 3000); }
  }

  async function sortKeys() {
    repairError = '';
    try { await doc.sortKeys(true); }
    catch (e) { repairError = (e as Error).message; setTimeout(() => repairError = '', 3000); }
  }
</script>

<div class="toolbar">
  <div class="group">
    <button onclick={() => fileInput.click()} title="Open file">Open</button>
    <input type="file" accept=".json,application/json,text/plain" bind:this={fileInput} onchange={onFile} hidden />
    <button onclick={paste} title="Paste from clipboard">Paste</button>
    <button onclick={copy} title="Copy to clipboard">Copy</button>
    <button onclick={() => doc.download()} title="Download">Save</button>
    <button onclick={onShare} title="Create read-only share link">Share</button>
  </div>

  <div class="sep"></div>

  <div class="group">
    <button onclick={() => doc.format(2)} title="Format (2sp)">Format</button>
    <button onclick={() => doc.minify()} title="Minify">Minify</button>
    <button onclick={repair} title="Repair common JSON issues">Repair</button>
    <button onclick={sortKeys} title="Sort object keys (deep)">Sort</button>
  </div>

  <div class="sep"></div>

  <div class="group">
    <button onclick={() => doc.undo()} title="Undo (⌘Z)">Undo</button>
    <button onclick={() => doc.redo()} title="Redo (⌘⇧Z)">Redo</button>
  </div>

  <div class="spacer"></div>

  <div class="filename" title={doc.name}>
    {doc.name}{doc.dirty ? ' •' : ''}
  </div>

  <div class="sep"></div>

  <div class="group seg">
    <button class:active={mode === 'text'} onclick={() => mode = 'text'}>Text</button>
    <button class:active={mode === 'split'} onclick={() => mode = 'split'}>Split</button>
    <button class:active={mode === 'tree'} onclick={() => mode = 'tree'}>Tree</button>
    <button class:active={mode === 'table'} onclick={() => mode = 'table'}>Table</button>
  </div>

  <button class="panel-toggle" class:on={panelOpen} onclick={() => panelOpen = !panelOpen} title="Toggle side panel (⌘\\)">
    {panelOpen ? '⊟' : '⊞'}
  </button>
</div>

{#if repairError}
  <div class="repair-err">Repair failed: {repairError}</div>
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .group { display: flex; gap: 2px; }
  .seg button { border-radius: 0; }
  .seg button:first-child { border-radius: 4px 0 0 4px; }
  .seg button:last-child  { border-radius: 0 4px 4px 0; }
  .seg button.active {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .sep { width: 1px; height: 18px; background: var(--border); }
  .spacer { flex: 1; }
  .filename {
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
  }
  button:hover { background: var(--row-hover); }
  .panel-toggle {
    margin-left: 4px;
    font-size: 14px;
    padding: 3px 10px;
  }
  .panel-toggle.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .repair-err {
    background: var(--err-bg);
    color: var(--err);
    padding: 4px 10px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
</style>
