<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './components/Toolbar.svelte';
  import TabBar from './components/TabBar.svelte';
  import ValidationPanel from './components/ValidationPanel.svelte';
  import SidePanel from './components/SidePanel.svelte';
  import ShareDialog from './components/ShareDialog.svelte';
  import TextView from './views/TextView.svelte';
  import TreeView from './views/TreeView.svelte';
  import TableView from './views/TableView.svelte';
  import { doc, workspace } from './core/store.svelte';
  import { readShareIdFromUrl, clearShareIdFromUrl, loadShare } from './core/share';

  type Mode = 'text' | 'tree' | 'split' | 'table';
  type SideTab = 'schema' | 'query' | 'diff' | 'api';
  let mode = $state<Mode>('split');
  let panelOpen = $state(false);
  let sideTab = $state<SideTab>('schema');
  let shareOpen = $state(false);
  let shareLoadError = $state('');

  onMount(async () => {
    await workspace.init();
    const shareId = readShareIdFromUrl();
    if (shareId) {
      try {
        const payload = await loadShare(shareId);
        workspace.newDoc(payload.text, `${payload.name} (shared)`);
      } catch (e) {
        shareLoadError = `Could not load shared document: ${(e as Error).message}`;
        setTimeout(() => shareLoadError = '', 5000);
      } finally {
        clearShareIdFromUrl();
      }
    }
  });

  function onKey(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); doc.undo(); }
    else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); doc.redo(); }
    else if (e.key === 's') { e.preventDefault(); doc.download(); }
    else if (e.key === '/' || (e.shiftKey && e.key === 'F')) { e.preventDefault(); doc.format(2); }
    else if (e.key === '\\') { e.preventDefault(); panelOpen = !panelOpen; }
    else if (e.key === 't') { e.preventDefault(); workspace.newDoc(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <TabBar />
  <Toolbar bind:mode bind:panelOpen onShare={() => shareOpen = true} />

  {#if shareLoadError}
    <div class="share-err">{shareLoadError}</div>
  {/if}

  <div class="layout" class:has-panel={panelOpen}>
    <div class="workspace" data-mode={mode}>
      {#if mode === 'text' || mode === 'split'}
        <div class="pane"><TextView /></div>
      {/if}
      {#if mode === 'split'}
        <div class="divider"></div>
      {/if}
      {#if mode === 'tree' || mode === 'split'}
        <div class="pane"><TreeView /></div>
      {/if}
      {#if mode === 'table'}
        <div class="pane"><TableView /></div>
      {/if}
    </div>
    {#if panelOpen}
      <div class="side"><SidePanel bind:tab={sideTab} onClose={() => panelOpen = false} /></div>
    {/if}
  </div>

  <ValidationPanel />
  <ShareDialog bind:open={shareOpen} />
</div>

<style>
  :global(:root) {
    --bg: #0e1116;
    --surface: #14181f;
    --surface-2: #1a1f28;
    --fg: #e6e9ee;
    --muted: #7c8593;
    --border: #232a35;
    --row-hover: rgba(255,255,255,0.04);
    --row-hover-strong: rgba(255,255,255,0.08);
    --accent: #4f8cff;
    --accent-fg: #ffffff;
    --ok: #3fb950;
    --err: #f85149;
    --err-bg: rgba(248,81,73,0.12);
    --key: #79b8ff;
    --str: #a5d6ff;
    --num: #f2cc60;
    --bool: #ff7b72;
    --null: #8b949e;
  }
  :global(html, body, #app) { height: 100%; margin: 0; }
  :global(body) {
    background: var(--bg);
    color: var(--fg);
    font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .layout {
    flex: 1;
    display: grid;
    min-height: 0;
    grid-template-columns: 1fr;
  }
  .layout.has-panel { grid-template-columns: 1fr 380px; }
  .workspace {
    display: grid;
    min-height: 0;
    min-width: 0;
  }
  .workspace[data-mode="text"], .workspace[data-mode="tree"], .workspace[data-mode="table"] {
    grid-template-columns: 1fr;
  }
  .workspace[data-mode="split"] {
    grid-template-columns: 1fr 1px 1fr;
  }
  .pane { min-width: 0; min-height: 0; overflow: hidden; }
  .divider { background: var(--border); }
  .side { min-width: 0; min-height: 0; }
  .share-err {
    background: var(--err-bg);
    color: var(--err);
    padding: 6px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
</style>
