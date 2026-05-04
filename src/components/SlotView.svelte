<script lang="ts">
  import TextView from '../views/TextView.svelte';
  import TreeView from '../views/TreeView.svelte';
  import TableView from '../views/TableView.svelte';
  import { workspace, MAX_SLOTS, type Slot, type SlotView, type DocStore } from '../core/store.svelte';
  import { compare } from '../core/compare.svelte';
  import { treeExpand } from '../core/tree-expand.svelte';

  type Props = {
    slot: Slot;
    index: number;
    focused: boolean;
  };
  let { slot, index, focused }: Props = $props();

  let doc = $derived<DocStore | undefined>(workspace.slotDoc(index));
  let diffSide = $derived(compare.side(index));
  let diffByPath = $derived(diffSide ? (compare.result?.byPath ?? null) : null);

  function onFocus() { workspace.focusSlot(index); }

  function pickDoc(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    const next = workspace.slots.slice();
    next[index] = { ...next[index], docId: id };
    workspace.slots = next;
    workspace.focusSlot(index);
  }

  function setView(v: SlotView) {
    workspace.setSlotView(index, v);
  }

  let canClose = $derived(workspace.slots.length > 1);
</script>

<div class="slot" class:focused onmousedown={onFocus} role="presentation">
  <div class="head">
    <select class="doc-pick" value={slot.docId} onchange={pickDoc} title="Doc shown in this column">
      {#each workspace.docs as d (d.id)}
        <option value={d.id}>{d.name}{d.dirty ? ' •' : ''}</option>
      {/each}
    </select>

    <div class="seg">
      <button class:on={slot.view === 'text'}  onclick={() => setView('text')}  title="Text view">Text</button>
      <button class:on={slot.view === 'tree'}  onclick={() => setView('tree')}  title="Tree view">Tree</button>
      <button class:on={slot.view === 'table'} onclick={() => setView('table')} title="Table view">Table</button>
    </div>

    {#if slot.view === 'tree' && doc}
      <div class="seg tree-ops" aria-label="Expand controls">
        <button onclick={() => treeExpand.expandAll(doc!.id, doc!.parse.value)}
                title="Expand all">⊞</button>
        <button onclick={() => treeExpand.collapseAll(doc!.id, doc!.parse.value)}
                title="Collapse all">⊟</button>
        <button onclick={() => treeExpand.reset(doc!.id)}
                title="Reset to default depth">⤺</button>
      </div>
    {/if}

    <span class="spacer"></span>

    {#if workspace.slots.length < MAX_SLOTS}
      <button class="add" onclick={() => workspace.addSlot(slot.docId, slot.view)} title="Add column">＋</button>
    {/if}
    {#if canClose}
      <button class="x" onclick={() => workspace.closeSlot(index)} title="Close column" aria-label="close">×</button>
    {/if}
  </div>

  <div class="body" class:paired={diffSide !== null} data-diff-side={diffSide}>
    {#if doc}
      {#if slot.view === 'text'}
        <TextView {doc} slotIndex={index} />
      {:else if slot.view === 'tree'}
        <TreeView {doc} {diffByPath} {diffSide} slotIndex={index} />
      {:else}
        <TableView {doc} />
      {/if}
    {/if}
  </div>
</div>

<style>
  .slot {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    position: relative;
  }
  .slot:last-child { border-right: 0; }
  .slot.focused::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-top: 2px solid var(--accent);
    box-shadow: inset 0 1px 0 var(--accent-soft);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 12px;
  }
  .doc-pick {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    flex: 1;
    min-width: 0;
    max-width: 240px;
  }
  .seg { display: flex; }
  .seg button {
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 3px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    transition: background 80ms, color 80ms;
  }
  .seg button:first-child { border-radius: var(--radius) 0 0 var(--radius); }
  .seg button:last-child  { border-radius: 0 var(--radius) var(--radius) 0; }
  .seg button + button { border-left: 0; }
  .seg button:hover { color: var(--fg); background: var(--row-hover); }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .spacer { flex: 1; }
  .add, .x {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 6px;
    font-size: 14px;
    line-height: 1;
    border-radius: 3px;
  }
  .add:hover { color: var(--accent); background: var(--row-hover-strong); }
  .x:hover  { color: var(--err); background: var(--row-hover-strong); }
  .body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
