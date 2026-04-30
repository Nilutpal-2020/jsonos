<script lang="ts">
  import { workspace } from '../core/store.svelte';

  let editingId = $state<string | null>(null);
  let draftName = $state('');

  function startRename(id: string, currentName: string) {
    editingId = id;
    draftName = currentName;
  }
  function commitRename() {
    if (editingId && draftName.trim()) {
      workspace.rename(editingId, draftName.trim());
    }
    editingId = null;
  }

  function focusInput(el: HTMLInputElement) {
    el.focus();
    el.select();
  }
</script>

<div class="tabs">
  {#each workspace.docs as d (d.id)}
    {@const shown = workspace.slots.some((s) => s.docId === d.id)}
    {@const focused = workspace.active.id === d.id}
    <div
      class="tab"
      class:active={focused}
      class:shown={shown && !focused}
      role="button"
      tabindex="0"
      onclick={() => workspace.setActive(d.id)}
      onkeydown={(e) => { if (e.key === 'Enter') workspace.setActive(d.id); }}
      ondblclick={() => startRename(d.id, d.name)}
      title={shown ? 'Open · click to focus its column' : 'Click to open in focused column'}
    >
      {#if editingId === d.id}
        <input
          class="rename"
          bind:value={draftName}
          onblur={commitRename}
          onkeydown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
            else if (e.key === 'Escape') editingId = null;
          }}
          use:focusInput
        />
      {:else}
        <span class="name">{d.name}</span>
        {#if d.dirty}<span class="dot" title="unsaved">•</span>{/if}
        <button
          class="close"
          title="Close"
          onclick={(e) => { e.stopPropagation(); workspace.closeDoc(d.id); }}
          aria-label="close"
        >×</button>
      {/if}
    </div>
  {/each}
  <button class="new-tab" title="New document" onclick={() => workspace.newDoc()} aria-label="new tab">+</button>
</div>

<style>
  .tabs {
    display: flex;
    align-items: stretch;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: thin;
    min-height: 32px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-right: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
    color: var(--muted);
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    max-width: 220px;
    min-width: 90px;
    transition: background 80ms, color 80ms;
  }
  .tab:hover { background: var(--surface); color: var(--fg); }
  .tab.active {
    background: var(--surface);
    color: var(--fg);
    border-bottom: 2px solid var(--accent);
    margin-bottom: -1px;
  }
  .tab.shown {
    color: var(--fg);
    border-bottom: 2px solid var(--border);
    margin-bottom: -1px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .dot { color: var(--accent); font-size: 16px; line-height: 1; }
  .close {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
    border-radius: 3px;
  }
  .close:hover { background: var(--row-hover-strong); color: var(--fg); }
  .new-tab {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 0 12px;
    font-size: 16px;
  }
  .new-tab:hover { background: var(--surface); color: var(--fg); }
  .rename {
    font: inherit;
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 1px 4px;
    width: 140px;
  }
</style>
