<script lang="ts">
  import { createShare } from '../core/share';
  import { workspace } from '../core/store.svelte';

  let { open = $bindable(false) }: { open: boolean } = $props();

  let creating = $state(false);
  let error = $state('');
  let result = $state<{ id: string; url: string } | null>(null);
  let copied = $state(false);

  async function create() {
    creating = true;
    error = '';
    result = null;
    try {
      const r = await createShare({
        name: workspace.active.name,
        text: workspace.active.text,
      });
      result = { id: r.id, url: r.url };
    } catch (e) {
      error = (e as Error).message;
    } finally {
      creating = false;
    }
  }

  async function copyUrl() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    copied = true;
    setTimeout(() => copied = false, 1500);
  }

  function close() {
    open = false;
    result = null;
    error = '';
    copied = false;
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

{#if open}
  <div class="backdrop" onclick={onBackdrop} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div class="head">
        <h3 id="share-title">Share read-only link</h3>
        <button class="x" onclick={close} aria-label="close">×</button>
      </div>

      <div class="body">
        <div class="meta">
          <strong>{workspace.active.name}</strong>
          <span class="muted"> · {(new Blob([workspace.active.text])).size} bytes</span>
        </div>

        {#if !result}
          <p class="desc">
            Creates an immutable, read-only copy on the server. Anyone with the link can view but
            not modify the original document.
          </p>
          <div class="actions">
            <button class="primary" onclick={create} disabled={creating || !workspace.active.text}>
              {creating ? 'Creating…' : 'Create link'}
            </button>
            <button onclick={close}>Cancel</button>
          </div>
          {#if error}<div class="err">{error}</div>{/if}
        {:else}
          <div class="link-row">
            <input class="link" readonly value={result.url} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
            <button class="primary" onclick={copyUrl}>{copied ? 'Copied!' : 'Copy'}</button>
          </div>
          <p class="muted small">Share-id: <code>{result.id}</code></p>
          <div class="actions">
            <button onclick={close}>Done</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
  }
  .dialog {
    width: min(520px, 92vw);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--fg);
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .head h3 { margin: 0; font-size: 14px; }
  .x { background: transparent; border: 0; color: var(--muted); cursor: pointer; font-size: 18px; padding: 0 4px; }
  .x:hover { color: var(--fg); }
  .body { padding: 16px; }
  .meta { font-size: 13px; margin-bottom: 8px; }
  .desc { font-size: 12px; color: var(--muted); margin: 0 0 12px; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  button {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover { background: var(--row-hover-strong); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .primary:hover { filter: brightness(1.1); }
  .link-row {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .link {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 4px;
    padding: 6px 10px;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    outline: none;
  }
  .small { font-size: 11px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .err { color: var(--err); font-size: 12px; margin-top: 8px; }
</style>
