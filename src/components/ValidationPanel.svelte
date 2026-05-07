<script lang="ts">
  import { doc } from '../core/store.svelte';
  let errors = $derived(doc.parse.errors);

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
</script>

<div class="panel">
  {#if errors.length === 0}
    <div class="ok">
      <span class="dot"></span>
      Valid JSON · {formatBytes(doc.parse.byteSize)}
    </div>
  {:else}
    <div class="header">{errors.length} error{errors.length === 1 ? '' : 's'}</div>
    <ul>
      {#each errors as e}
        <li>
          <span class="loc">L{e.line}:{e.column}</span>
          <span class="msg">{e.message}</span>
          <span class="path">{doc.pathToString(e.path)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .panel {
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--fg);
    font-size: 12px;
    max-height: 160px;
    overflow: auto;
    padding: 6px 12px;
  }
  @media (max-width: 540px) {
    .panel { padding: 6px 8px; max-height: 120px; font-size: 11px; }
    li { flex-wrap: wrap; gap: 4px 8px; }
    .loc { min-width: 0; }
  }
  .ok {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ok);
    font-weight: 500;
  }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 0 3px var(--ok-soft);
    display: inline-block;
  }
  .header {
    color: var(--err);
    margin-bottom: 4px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header::before {
    content: "";
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--err);
    box-shadow: 0 0 0 3px var(--err-bg);
    display: inline-block;
  }
  ul { list-style: none; padding: 0; margin: 0; }
  li {
    display: flex;
    gap: 10px;
    padding: 2px 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .loc { color: var(--err); min-width: 70px; }
  .msg { flex: 1; }
  .path { color: var(--muted); }
</style>
