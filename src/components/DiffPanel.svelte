<script lang="ts">
  import { workspace, type SlotView } from '../core/store.svelte';
  import { diffJson } from '../core/diff';

  let active = $derived(workspace.active);
  let peerId = $state<string>('');
  let sideBySideView = $state<SlotView>('text');

  let candidates = $derived(workspace.docs.filter((d) => d.id !== active.id));
  let peer = $derived(candidates.find((d) => d.id === peerId));

  let entries = $derived.by(() => {
    if (!peer) return [];
    return diffJson(active.parse.value, peer.parse.value);
  });

  function trunc(v: unknown): string {
    const s = JSON.stringify(v);
    if (s === undefined) return 'undefined';
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  }

  function openSideBySide() {
    if (!peer) return;
    workspace.openSideBySide(active.id, peer.id, sideBySideView);
  }
</script>

<div class="diff">
  <div class="head">
    <span>Compare</span>
    <select bind:value={peerId}>
      <option value="">— select peer doc —</option>
      {#each candidates as d (d.id)}
        <option value={d.id}>{d.name}</option>
      {/each}
    </select>
  </div>

  <div class="actions" class:disabled={!peer}>
    <span class="label">Open as columns:</span>
    <div class="seg">
      <button class:on={sideBySideView === 'text'} onclick={() => sideBySideView = 'text'}>Text</button>
      <button class:on={sideBySideView === 'tree'} onclick={() => sideBySideView = 'tree'}>Tree</button>
    </div>
    <button class="primary" onclick={openSideBySide} disabled={!peer} title="Replace slots with this pair">
      Open side-by-side ↔
    </button>
  </div>

  <div class="body">
    {#if !peer}
      <div class="muted">Pick a doc to compare against {active.name}.</div>
    {:else if entries.length === 0}
      <div class="ok">No structural differences.</div>
    {:else}
      <div class="legend">
        <span class="leg add">+ add</span>
        <span class="leg rem">− remove</span>
        <span class="leg chg">~ change</span>
        <span class="muted">  ({entries.length} entries)</span>
      </div>
      <ul>
        {#each entries as e}
          <li class={e.kind}>
            <span class="sym">{e.kind === 'add' ? '+' : e.kind === 'remove' ? '−' : '~'}</span>
            <span class="path">{e.path}</span>
            {#if e.kind === 'change'}
              <span class="before">{trunc(e.before)}</span>
              <span class="arrow">→</span>
              <span class="after">{trunc(e.after)}</span>
            {:else if e.kind === 'add'}
              <span class="after">{trunc(e.after)}</span>
            {:else}
              <span class="before">{trunc(e.before)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .diff {
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
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    font-size: 11px;
  }
  .actions.disabled .label, .actions.disabled .seg button { opacity: 0.5; }
  .label { color: var(--muted); }
  .seg { display: flex; }
  .seg button {
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 2px 8px;
    cursor: pointer;
    font: inherit;
  }
  .seg button:first-child { border-radius: 3px 0 0 3px; }
  .seg button:last-child  { border-radius: 0 3px 3px 0; }
  .seg button + button { border-left: 0; }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .actions .primary {
    margin-left: auto;
    background: var(--accent);
    color: var(--accent-fg);
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 3px 10px;
    cursor: pointer;
    font: inherit;
  }
  .actions .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .head select {
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-transform: none;
    letter-spacing: 0;
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 8px 12px;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .legend { display: flex; gap: 12px; margin-bottom: 8px; font-size: 11px; }
  .leg.add { color: var(--ok); }
  .leg.rem { color: var(--err); }
  .leg.chg { color: var(--accent); }
  ul { list-style: none; padding: 0; margin: 0; }
  li {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    align-items: center;
    white-space: nowrap;
  }
  li.add .sym, li.add .after { color: var(--ok); }
  li.remove .sym, li.remove .before { color: var(--err); }
  li.change .sym, li.change .arrow { color: var(--accent); }
  .sym { width: 12px; }
  .path { color: var(--key); min-width: 180px; }
  .before { color: var(--err); overflow: hidden; text-overflow: ellipsis; }
  .after { color: var(--ok); overflow: hidden; text-overflow: ellipsis; }
  .arrow { color: var(--muted); }
  .muted { color: var(--muted); }
  .ok { color: var(--ok); }
</style>
