<script lang="ts">
  import type { DocStore } from '../core/store.svelte';
  import { SITE_CONFIG } from '../core/site-config';

  type Props = {
    doc: DocStore;
    /** Reason shown above the actions. */
    reason?: string;
  };
  let { doc, reason }: Props = $props();

  let dragOver = $state(false);
  let pasteError = $state('');
  let fileInput: HTMLInputElement;

  async function pasteFromClipboard() {
    pasteError = '';
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) doc.load(t);
      else pasteError = 'Clipboard is empty.';
    } catch {
      pasteError = 'Clipboard read denied. Paste into the text view instead.';
    }
  }

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const text = await f.text();
    doc.load(text, f.name);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      f.text().then((t) => doc.load(t, f.name));
      return;
    }
    const t = e.dataTransfer?.getData('text/plain');
    if (t && t.trim()) doc.load(t);
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('text/plain')) {
      dragOver = true;
    }
  }
  function onDragOver(e: DragEvent) { e.preventDefault(); }
  function onDragLeave() { dragOver = false; }

  function startWithSample() {
    doc.load('{\n  "hello": "world",\n  "items": [1, 2, 3]\n}');
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="empty"
  class:drag-over={dragOver}
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <div class="card">
    {#if reason}
      <div class="reason">{reason}</div>
    {/if}
    <div class="title">No data yet</div>
    <p class="hint">Paste JSON, drop a file, or open one to get started.</p>

    <div class="actions">
      <button class="primary" onclick={pasteFromClipboard} title="Paste JSON from clipboard">
        📋 Paste
      </button>
      <button onclick={() => fileInput.click()} title="Open a JSON file">📂 Open file</button>
      <button onclick={startWithSample} title="Insert a small sample to play with">
        ✨ Sample
      </button>
    </div>

    {#if pasteError}<div class="err">{pasteError}</div>{/if}

    <p class="drop-hint">— or drag a <code>.json</code> file here —</p>

    <div class="kbd-hints">
      <span><kbd>⌘T</kbd> new doc</span>
      <span><kbd>⌘/</kbd> format</span>
      <span><kbd>⌘⇧K</kbd> query</span>
      <span><kbd>?</kbd> help</span>
    </div>

    <a
      href={SITE_CONFIG.kofiUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="sponsor-link"
      title="Support free, local-first open-source tools on Ko-fi"
    >
      ☕ Enjoying JSON OS? Support on Ko-fi ↗
    </a>
  </div>

  <input
    type="file"
    accept=".json,application/json,text/plain"
    bind:this={fileInput}
    onchange={onFile}
    hidden
  />
</div>

<style>
  .sponsor-link {
    display: inline-block;
    margin-top: 18px;
    font-size: 11px;
    color: var(--muted);
    text-decoration: none;
    padding: 4px 10px;
    border-radius: var(--radius, 4px);
    border: 1px dashed var(--border);
    transition: all 0.15s ease;
  }
  .sponsor-link:hover {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.08);
  }
  .empty {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--surface);
    transition: background 120ms;
  }
  .empty.drag-over {
    background: var(--accent-soft);
    outline: 2px dashed var(--accent);
    outline-offset: -8px;
  }
  .card {
    text-align: center;
    max-width: 420px;
    padding: 24px;
  }
  .reason {
    color: var(--err);
    font-size: 12px;
    margin-bottom: 12px;
    padding: 6px 10px;
    background: var(--err-bg);
    border-radius: var(--radius);
    display: inline-block;
  }
  .title {
    font-size: 18px;
    font-weight: 600;
    color: var(--fg);
    margin-bottom: 4px;
  }
  .hint {
    color: var(--muted);
    font-size: 13px;
    margin: 0 0 16px;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .actions button {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 14px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    transition: background 80ms, border-color 80ms;
  }
  .actions button:hover { background: var(--row-hover-strong); border-color: var(--muted); }
  .actions .primary {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .actions .primary:hover { filter: brightness(1.1); }
  .err {
    color: var(--err);
    font-size: 12px;
    margin-top: 10px;
  }
  .drop-hint {
    color: var(--muted);
    font-size: 11px;
    margin: 16px 0 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .kbd-hints {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    margin-top: 16px;
    color: var(--muted);
    font-size: 11px;
  }
  .kbd-hints kbd {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 5px;
    margin-right: 3px;
    color: var(--fg);
    font: 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  code {
    background: var(--surface-2);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
