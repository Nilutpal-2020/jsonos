<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './components/Toolbar.svelte';
  import TabBar from './components/TabBar.svelte';
  import ValidationPanel from './components/ValidationPanel.svelte';
  import SidePanel from './components/SidePanel.svelte';
  import ShareDialog from './components/ShareDialog.svelte';
  import SlotView from './components/SlotView.svelte';
  import SlotResizer from './components/SlotResizer.svelte';
  import { doc, workspace } from './core/store.svelte';
  import { ui } from './core/ui-prefs.svelte';
  import { readShareIdFromUrl, clearShareIdFromUrl, loadShare } from './core/share';

  type SideTab = 'schema' | 'query' | 'diff' | 'api';
  let panelOpen = $state(false);
  let sideTab = $state<SideTab>('schema');
  let shareOpen = $state(false);
  let shareLoadError = $state('');
  let workspaceEl = $state<HTMLDivElement | undefined>();

  let gridTemplate = $derived.by(() => {
    const fr = workspace.slotFractions;
    const parts: string[] = [];
    for (let i = 0; i < fr.length; i++) {
      parts.push(`minmax(0, ${fr[i]}fr)`);
      if (i < fr.length - 1) parts.push('4px');
    }
    return parts.join(' ');
  });

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
    // If a focused widget already handled it (CodeMirror keymap with
    // Prec.highest, native form controls), don't double-fire.
    if (e.defaultPrevented) return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); doc.undo(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); doc.redo(); }
    else if (e.key === 's') { e.preventDefault(); doc.download(); }
    else if (e.key === '/' || (e.shiftKey && e.key === 'F')) { e.preventDefault(); doc.format(2); }
    else if (e.key === '\\') { e.preventDefault(); panelOpen = !panelOpen; }
    else if (e.key === 't') { e.preventDefault(); workspace.newDoc(); }
    else if (e.shiftKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); ui.toggleWrap(); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') {
      const n = Number(e.key) - 1;
      if (workspace.slots[n]) { e.preventDefault(); workspace.focusSlot(n); }
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <TabBar />
  <Toolbar bind:panelOpen onShare={() => shareOpen = true} />

  {#if shareLoadError}
    <div class="share-err">{shareLoadError}</div>
  {/if}

  <div class="layout" class:has-panel={panelOpen}>
    <div class="workspace" bind:this={workspaceEl} style:grid-template-columns={gridTemplate}>
      {#each workspace.slots as slot, i (i)}
        <SlotView {slot} index={i} focused={i === workspace.focusedSlotIndex} />
        {#if i < workspace.slots.length - 1}
          <SlotResizer leftIndex={i} containerEl={workspaceEl ?? null} />
        {/if}
      {/each}
    </div>
    {#if panelOpen}
      <div class="side"><SidePanel bind:tab={sideTab} onClose={() => panelOpen = false} /></div>
    {/if}
  </div>

  <ValidationPanel />
  <ShareDialog bind:open={shareOpen} />
</div>

<style>
  :global(:root),
  :global([data-theme="dark"]) {
    color-scheme: dark;
    --bg: #0c0f14;
    --surface: #131720;
    --surface-2: #1a1f2a;
    --surface-hi: #232a37;
    --fg: #e8ecf2;
    --muted: #8b95a5;
    --border: #2a313e;
    --row-hover: rgba(255,255,255,0.045);
    --row-hover-strong: rgba(255,255,255,0.085);
    --accent: #5b9eff;
    --accent-fg: #ffffff;
    --accent-soft: rgba(91,158,255,0.16);
    --ok: #4ec97a;
    --ok-soft: rgba(78,201,122,0.16);
    --err: #ff6b66;
    --err-bg: rgba(255,107,102,0.14);
    --warn: #f5cf6a;
    --key: #82b6ff;
    --str: #b9dcff;
    --num: #f5cf6a;
    --bool: #ff8a82;
    --null: #8b95a5;
    --selection: rgba(91,158,255,0.28);
    --ring: rgba(91,158,255,0.55);
    --shadow: 0 20px 60px rgba(0,0,0,0.55);
    --radius: 4px;
    --radius-lg: 8px;
  }

  :global([data-theme="light"]) {
    color-scheme: light;
    --bg: #f5f7fa;
    --surface: #ffffff;
    --surface-2: #f1f4f9;
    --surface-hi: #e7ecf3;
    --fg: #11151c;
    --muted: #5a6373;
    --border: #d8dde6;
    --row-hover: rgba(15,23,42,0.04);
    --row-hover-strong: rgba(15,23,42,0.08);
    --accent: #2563eb;
    --accent-fg: #ffffff;
    --accent-soft: rgba(37,99,235,0.14);
    --ok: #16a34a;
    --ok-soft: rgba(22,163,74,0.14);
    --err: #dc2626;
    --err-bg: rgba(220,38,38,0.10);
    --warn: #b45309;
    --key: #1d4ed8;
    --str: #047857;
    --num: #b45309;
    --bool: #c026d3;
    --null: #6b7280;
    --selection: rgba(37,99,235,0.22);
    --ring: rgba(37,99,235,0.45);
    --shadow: 0 16px 48px rgba(15,23,42,0.18);
    --radius: 4px;
    --radius-lg: 8px;
  }

  :global(html, body, #app) { height: 100%; margin: 0; }
  :global(html) { background: var(--bg); }
  :global(body) {
    background: var(--bg);
    color: var(--fg);
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-feature-settings: "ss01", "cv11", "tnum" 0;
    overflow: hidden;
  }
  :global(::selection) {
    background: var(--selection);
    color: var(--fg);
  }
  :global(*) { box-sizing: border-box; }
  :global(button) { font-family: inherit; }
  :global(:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
    border-radius: var(--radius);
  }
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(textarea:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 2px var(--ring);
    border-color: var(--accent);
  }

  /* Scrollbars */
  :global(*::-webkit-scrollbar) { width: 10px; height: 10px; }
  :global(*::-webkit-scrollbar-track) { background: transparent; }
  :global(*::-webkit-scrollbar-thumb) {
    background: var(--border);
    border-radius: 6px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  :global(*::-webkit-scrollbar-thumb:hover) {
    background: var(--muted);
    background-clip: content-box;
    border: 2px solid transparent;
  }
  :global(*) { scrollbar-color: var(--border) transparent; scrollbar-width: thin; }
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
  .side { min-width: 0; min-height: 0; }
  .share-err {
    background: var(--err-bg);
    color: var(--err);
    padding: 6px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
</style>
