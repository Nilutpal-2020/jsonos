<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Virtualizer, observeElementRect, observeElementOffset, elementScroll, type VirtualItem } from '@tanstack/virtual-core';
  import { workspace } from '../core/store.svelte';
  import { flatten, pathKey, type Row } from '../core/tree-flatten';
  import type { JsonPath, JsonValue } from '../core/types';

  let active = $derived(workspace.active);

  // expand state per active doc
  const expandedByDoc = new Map<string, { expanded: Set<string>; toggled: Set<string> }>();
  function getExpanded() {
    let s = expandedByDoc.get(active.id);
    if (!s) {
      s = { expanded: new Set(), toggled: new Set() };
      expandedByDoc.set(active.id, s);
    }
    return s;
  }
  let bumpExpand = $state(0);

  let rows = $derived.by(() => {
    void bumpExpand;
    if (active.parse.errors.length || active.parse.value === undefined) return [];
    const { expanded, toggled } = getExpanded();
    return flatten(active.parse.value, expanded, toggled);
  });

  function toggle(path: JsonPath, currentlyOpen: boolean) {
    const { expanded, toggled } = getExpanded();
    const k = pathKey(path);
    toggled.add(k);
    if (currentlyOpen) expanded.delete(k);
    else expanded.add(k);
    bumpExpand++;
  }

  // Virtualizer
  let scrollEl = $state<HTMLDivElement | undefined>();
  let virtual = $state<Virtualizer<HTMLDivElement, HTMLDivElement> | null>(null);
  let virtualItems = $state<VirtualItem[]>([]);
  let totalSize = $state(0);

  const ROW_HEIGHT = 22;

  onMount(() => {
    virtual = new Virtualizer<HTMLDivElement, HTMLDivElement>({
      count: rows.length,
      getScrollElement: () => scrollEl ?? null,
      estimateSize: () => ROW_HEIGHT,
      overscan: 12,
      observeElementRect,
      observeElementOffset,
      scrollToFn: elementScroll,
      onChange: (v) => {
        virtualItems = v.getVirtualItems();
        totalSize = v.getTotalSize();
      },
    });
    virtual._willUpdate();
    virtualItems = virtual.getVirtualItems();
    totalSize = virtual.getTotalSize();
  });

  // Sync row count to virtualizer
  $effect(() => {
    if (!virtual) return;
    void rows;
    virtual.setOptions({
      ...virtual.options,
      count: rows.length,
    });
    virtual._willUpdate();
    virtualItems = virtual.getVirtualItems();
    totalSize = virtual.getTotalSize();
  });

  onDestroy(() => { virtual = null; });

  // Inline edit state
  let editingId = $state<string | null>(null);
  let draft = $state('');
  function startEdit(row: Row) {
    if (row.kind !== 'leaf') return;
    draft = JSON.stringify(row.value);
    editingId = row.id;
  }
  function commitEdit(row: Row) {
    try {
      const parsed = JSON.parse(draft) as JsonValue;
      active.applyValuePatch({ op: 'replace', path: row.path, value: parsed });
      editingId = null;
    } catch { /* keep editing */ }
  }
  function focusInput(el: HTMLInputElement) { el.focus(); el.select(); }

  function removeRow(row: Row) {
    if (row.path.length === 0) return;
    active.applyValuePatch({ op: 'remove', path: row.path });
  }

  function addChild(row: Row) {
    if (row.kind === 'array-open') {
      const arr = row.value as JsonValue[];
      active.applyValuePatch({ op: 'add', path: [...row.path, arr.length], value: null });
    } else if (row.kind === 'object-open') {
      const obj = row.value as Record<string, JsonValue>;
      let key = 'newKey'; let i = 1;
      while (key in obj) key = `newKey${i++}`;
      active.applyValuePatch({ op: 'add', path: [...row.path, key], value: null });
    }
  }

  function valueKind(v: JsonValue): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
</script>

<div class="tree-root">
  {#if active.parse.errors.length}
    <div class="tree-empty">JSON has errors — fix in text view to use tree.</div>
  {:else if active.parse.value === undefined}
    <div class="tree-empty">Empty document.</div>
  {:else}
    <div class="scroll" bind:this={scrollEl}>
      <div class="virt" style:height="{totalSize}px">
        {#each virtualItems as vi (rows[vi.index]?.id ?? vi.index)}
          {@const row = rows[vi.index]}
          {#if row}
            <div
              class="row"
              style:transform="translateY({vi.start}px)"
              style:height="{ROW_HEIGHT}px"
              style:padding-left="{row.depth * 14 + 6}px"
            >
              {#if row.kind === 'object-open' || row.kind === 'array-open'}
                {@const k = pathKey(row.path)}
                {@const { expanded, toggled } = getExpanded()}
                {@const open = toggled.has(k) ? expanded.has(k) : row.path.length < 3}
                <button class="caret" onclick={() => toggle(row.path, open)} aria-label="toggle">
                  {open ? '▾' : '▸'}
                </button>
                {#if row.keyName !== null}
                  <span class="key">{typeof row.keyName === 'number' ? row.keyName : `"${row.keyName}"`}</span><span class="colon">:</span>
                {/if}
                <span class="brace">{row.kind === 'object-open' ? '{' : '['}</span>
                {#if !open}
                  <span class="muted"> {row.childCount} {row.kind === 'object-open' ? 'keys' : 'items'} </span>
                  <span class="brace">{row.kind === 'object-open' ? '}' : ']'}</span>
                {/if}
                <span class="actions">
                  <button class="act" onclick={() => addChild(row)} title="add child">+</button>
                  {#if row.path.length > 0}
                    <button class="act" onclick={() => removeRow(row)} title="remove">×</button>
                  {/if}
                </span>
              {:else if row.kind === 'object-close' || row.kind === 'array-close'}
                <span class="caret-spacer"></span>
                <span class="brace">{row.kind === 'object-close' ? '}' : ']'}</span>
              {:else}
                <span class="caret-spacer"></span>
                {#if row.keyName !== null}
                  <span class="key">{typeof row.keyName === 'number' ? row.keyName : `"${row.keyName}"`}</span><span class="colon">:</span>
                {/if}
                {#if editingId === row.id}
                  <input
                    class="edit"
                    bind:value={draft}
                    onblur={() => commitEdit(row)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitEdit(row); }
                      else if (e.key === 'Escape') editingId = null;
                    }}
                    use:focusInput
                  />
                {:else}
                  {@const k = valueKind(row.value)}
                  <button class="value v-{k}" onclick={() => startEdit(row)} title="click to edit">
                    {k === 'string' ? `"${row.value}"` : String(row.value)}
                  </button>
                {/if}
                <span class="actions">
                  {#if row.path.length > 0}
                    <button class="act" onclick={() => removeRow(row)} title="remove">×</button>
                  {/if}
                </span>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .tree-root {
    height: 100%;
    background: var(--surface);
    color: var(--fg);
  }
  .scroll {
    height: 100%;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
  }
  .virt { position: relative; width: 100%; }
  .row {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .row:hover { background: var(--row-hover); }
  .row:hover .actions { opacity: 1; }
  .tree-empty {
    color: var(--muted);
    padding: 16px;
    text-align: center;
  }
  .caret, .act {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 0 4px;
    font: inherit;
  }
  .caret:hover, .act:hover { color: var(--fg); }
  .caret-spacer { display: inline-block; width: 16px; }
  .key { color: var(--key); }
  .colon { color: var(--muted); }
  .brace { color: var(--muted); }
  .muted { color: var(--muted); font-style: italic; }
  .value {
    background: transparent;
    border: 0;
    cursor: text;
    padding: 1px 4px;
    border-radius: 3px;
    font: inherit;
  }
  .value:hover { background: var(--row-hover-strong); }
  .v-string { color: var(--str); }
  .v-number { color: var(--num); }
  .v-boolean { color: var(--bool); }
  .v-null { color: var(--null); font-style: italic; }
  .edit {
    font: inherit;
    padding: 1px 4px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--surface);
    color: var(--fg);
    min-width: 80px;
  }
  .actions {
    opacity: 0;
    margin-left: 6px;
    transition: opacity 80ms;
  }
</style>
