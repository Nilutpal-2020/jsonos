<script lang="ts">
  import { workspace } from '../core/store.svelte';
  import { compare } from '../core/compare.svelte';

  type Props = {
    panelOpen?: boolean;
    sideTab?: string;
  };
  let { panelOpen = false, sideTab = '' }: Props = $props();

  let isPairingActive = $derived(compare.effectivePair !== null);
  let isDiffPanelOpen = $derived(panelOpen && sideTab === 'diff');

  let showBanner = $derived(isPairingActive || isDiffPanelOpen);
  let isSingleSlot = $derived(workspace.slots.length < 2);
  let isSameDoc = $derived(
    workspace.slots.length >= 2 &&
    workspace.slots[0].docId === workspace.slots[1].docId
  );

  let cursor = $state(0);
  let changes = $derived(compare.changes);
  let totalChanges = $derived(changes.length);

  function openSecondPanel() {
    workspace.addSlot(undefined, 'tree');
    if (workspace.slots.length >= 2) {
      compare.setPair(0, 1);
    }
  }

  function createNewDocForRightSlot() {
    const fresh = workspace.newDoc('', undefined);
    if (workspace.slots.length >= 2) {
      workspace.slots = [
        workspace.slots[0],
        { docId: fresh.id, view: 'tree' },
      ];
      compare.setPair(0, 1);
    }
  }

  function switchToTreeViews() {
    if (workspace.slots[0]) workspace.setSlotView(0, 'tree');
    if (workspace.slots[1]) workspace.setSlotView(1, 'tree');
  }

  function gotoChange(delta: number) {
    if (totalChanges === 0) return;
    cursor = ((cursor + delta) % totalChanges + totalChanges) % totalChanges;
    const ratio = totalChanges === 1 ? 0 : cursor / (totalChanges - 1);
    if (compare.pair) compare.publishScroll(compare.pair.left, ratio);
  }

  function unlinkPair() {
    compare.clear();
  }
</script>

{#if showBanner}
  <div class="compare-banner" class:warning={isSingleSlot || isSameDoc}>
    {#if isSingleSlot}
      <div class="banner-content">
        <span class="warn-icon">⚠️</span>
        <span class="banner-msg">
          Compare is available between two side-by-side panels. Open a 2nd panel to compare documents.
        </span>
        <button class="banner-btn primary" onclick={openSecondPanel}>
          ＋ Open 2nd Panel
        </button>
      </div>
    {:else if isSameDoc}
      <div class="banner-content">
        <span class="warn-icon">⚠️</span>
        <span class="banner-msg">
          Compare requires two different documents in side-by-side panels.
        </span>
        <button class="banner-btn primary" onclick={createNewDocForRightSlot}>
          📄 Create New Document
        </button>
      </div>
    {:else}
      <div class="banner-content pair-active">
        <span class="pair-tag">⇄ Comparing</span>
        <span class="doc-names">
          <strong>{compare.leftDoc?.name ?? 'Panel 1'}</strong>
          <span class="sep">↔</span>
          <strong>{compare.rightDoc?.name ?? 'Panel 2'}</strong>
        </span>

        <span class="diff-count" class:has-diffs={totalChanges > 0}>
          {#if totalChanges === 0}
            ✓ Documents match exactly
          {:else}
            ● {totalChanges} {totalChanges === 1 ? 'difference' : 'differences'}
          {/if}
        </span>

        {#if totalChanges > 0}
          <div class="nav-group">
            <button class="nav-btn" onclick={() => gotoChange(-1)} title="Previous difference">▲ Prev</button>
            <span class="pos-indicator">{cursor + 1}/{totalChanges}</span>
            <button class="nav-btn" onclick={() => gotoChange(1)} title="Next difference">▼ Next</button>
          </div>
        {/if}

        <button class="nav-btn tree-btn" onclick={switchToTreeViews} title="Set both panels to Tree view">
          Tree Mode
        </button>

        <button class="unlink-btn" onclick={unlinkPair} title="Close compare session">
          Unlink ✕
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .compare-banner {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    padding: 6px 12px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 120ms ease-out;
  }
  .compare-banner.warning {
    background: color-mix(in oklab, #f59e0b 15%, var(--surface));
    border-bottom-color: color-mix(in oklab, #f59e0b 40%, transparent);
  }
  .banner-content {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .warn-icon {
    font-size: 14px;
  }
  .banner-msg {
    font-weight: 500;
    color: var(--fg);
  }
  .banner-btn {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 100ms;
  }
  .banner-btn.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .banner-btn:hover {
    filter: brightness(1.08);
  }

  .pair-active {
    width: 100%;
    justify-content: space-between;
  }
  .pair-tag {
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.2px;
  }
  .doc-names {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .sep { color: var(--muted); }
  .diff-count {
    font-weight: 600;
    color: var(--muted);
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--surface);
  }
  .diff-count.has-diffs {
    color: #18181b;
    font-weight: 700;
    background: #f59e0b;
  }

  .nav-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .nav-btn {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .nav-btn:hover { background: var(--row-hover-strong); }
  .pos-indicator {
    font-size: 11px;
    color: var(--muted);
    font-family: ui-monospace, monospace;
    padding: 0 4px;
  }

  .unlink-btn {
    border: 0;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
  }
  .unlink-btn:hover { color: var(--err); }
</style>
