<script lang="ts">
  import SchemaPanel from './SchemaPanel.svelte';
  import QueryPanel from './QueryPanel.svelte';
  import DiffPanel from './DiffPanel.svelte';
  import ApiPanel from './ApiPanel.svelte';

  type Tab = 'schema' | 'query' | 'diff' | 'api';
  let { tab = $bindable('schema' as Tab), onClose }: { tab: Tab; onClose: () => void } = $props();
</script>

<div class="side">
  <div class="tabs">
    <button class:active={tab === 'schema'} onclick={() => tab = 'schema'}>Schema</button>
    <button class:active={tab === 'query'}  onclick={() => tab = 'query'}>Query</button>
    <button class:active={tab === 'diff'}   onclick={() => tab = 'diff'}>Compare</button>
    <button class:active={tab === 'api'}    onclick={() => tab = 'api'}>API</button>
    <span class="spacer"></span>
    <button class="close" onclick={onClose} title="Close panel" aria-label="close">×</button>
  </div>
  <div class="content">
    {#if tab === 'schema'}<SchemaPanel />
    {:else if tab === 'query'}<QueryPanel />
    {:else if tab === 'diff'}<DiffPanel />
    {:else}<ApiPanel />{/if}
  </div>
</div>

<style>
  .side {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
    border-left: 1px solid var(--border);
  }
  .tabs {
    display: flex;
    align-items: center;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    background: transparent;
    border: 0;
    color: var(--muted);
    padding: 6px 12px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  .tabs button.active {
    color: var(--fg);
    border-bottom: 2px solid var(--accent);
    margin-bottom: -1px;
  }
  .tabs button:hover { color: var(--fg); }
  .spacer { flex: 1; }
  .close { font-size: 16px; padding: 4px 10px !important; }
  .content { flex: 1; min-height: 0; overflow: hidden; }
</style>
