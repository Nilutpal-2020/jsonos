<script lang="ts">
  import { workspace } from '../core/store.svelte';

  type JSONPathFn = (opts: { path: string; json: unknown }) => unknown[];
  let jsonPathFn = $state<JSONPathFn | null>(null);
  let loading = $state(false);

  async function ensureLib() {
    if (jsonPathFn || loading) return;
    loading = true;
    try {
      const mod = await import('jsonpath-plus');
      jsonPathFn = mod.JSONPath as unknown as JSONPathFn;
    } finally {
      loading = false;
    }
  }
  ensureLib();

  let active = $derived(workspace.active);
  let query = $state('$..*');
  let error = $state('');

  let result = $derived.by(() => {
    error = '';
    if (!jsonPathFn) return undefined;
    const v = active.parse.value;
    if (v === undefined) return undefined;
    if (!query.trim()) return undefined;
    try {
      return jsonPathFn({ path: query, json: v });
    } catch (e) {
      error = (e as Error).message;
      return undefined;
    }
  });

  let resultText = $derived(result === undefined ? '' : JSON.stringify(result, null, 2));

  async function copy() {
    try { await navigator.clipboard.writeText(resultText); } catch {}
  }

  function replaceDoc() {
    if (result === undefined || !Array.isArray(result)) return;
    active.replaceParsed(result as any);
  }
</script>

<div class="query">
  <div class="head">
    <span>JSONPath</span>
    <a href="https://goessner.net/articles/JsonPath/" target="_blank" rel="noopener" class="docs">syntax</a>
  </div>
  <input
    class="input"
    spellcheck="false"
    placeholder="$..book[?(@.price < 10)].title"
    bind:value={query}
  />
  <div class="status">
    {#if !jsonPathFn}
      <span class="muted">Loading JSONPath…</span>
    {:else if error}
      <span class="err">{error}</span>
    {:else if active.parse.value === undefined}
      <span class="muted">Document not parsed.</span>
    {:else if Array.isArray(result)}
      <span class="muted">{result.length} match{result.length === 1 ? '' : 'es'}</span>
    {/if}
    <span class="spacer"></span>
    <button onclick={copy} disabled={!resultText}>Copy</button>
    <button onclick={replaceDoc} disabled={!Array.isArray(result)} title="Replace document with results">→ Doc</button>
  </div>
  <pre class="result">{resultText}</pre>
</div>

<style>
  .query {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .docs { color: var(--accent); text-decoration: none; font-size: 11px; text-transform: none; }
  .docs:hover { text-decoration: underline; }
  .input {
    border: 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--fg);
    padding: 6px 12px;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    outline: none;
  }
  .input:focus { background: var(--surface); }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
  }
  .status .spacer { flex: 1; }
  .status button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font: inherit;
  }
  .status button:hover:not(:disabled) { color: var(--fg); }
  .status button:disabled { opacity: 0.4; cursor: not-allowed; }
  .err { color: var(--err); }
  .muted { color: var(--muted); }
  .result {
    flex: 1;
    margin: 0;
    padding: 8px 12px;
    overflow: auto;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--fg);
    white-space: pre;
  }
</style>
