<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Virtualizer, observeElementRect, observeElementOffset, elementScroll,
    type VirtualItem,
  } from '@tanstack/virtual-core';
  import { workspace } from '../core/store.svelte';
  import { inspectTable, findArrayPaths, getAt, pathToJSONish } from '../core/table-shape';
  import type { JsonPath, JsonValue } from '../core/types';

  let active = $derived(workspace.active);

  // Per-doc focus path (which array we're tabling). Default = root.
  const focusByDoc = new Map<string, JsonPath>();
  let focusBump = $state(0);
  function getFocus(): JsonPath {
    return focusByDoc.get(active.id) ?? [];
  }
  function setFocus(p: JsonPath) {
    focusByDoc.set(active.id, p);
    focusBump++;
  }

  let focusedValue = $derived.by(() => {
    void focusBump;
    return getAt(active.parse.value, getFocus());
  });

  let shape = $derived(inspectTable(focusedValue));
  let arrayPaths = $derived(active.parse.value === undefined ? [] : findArrayPaths(active.parse.value));

  // virtualization
  let scrollEl = $state<HTMLDivElement | undefined>();
  let virtual = $state<Virtualizer<HTMLDivElement, HTMLDivElement> | null>(null);
  let virtualItems = $state<VirtualItem[]>([]);
  let totalSize = $state(0);

  const ROW_HEIGHT = 28;
  const COL_WIDTH = 160;
  const INDEX_COL = 48;

  onMount(() => {
    virtual = new Virtualizer<HTMLDivElement, HTMLDivElement>({
      count: shape.length,
      getScrollElement: () => scrollEl ?? null,
      estimateSize: () => ROW_HEIGHT,
      overscan: 10,
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

  $effect(() => {
    if (!virtual) return;
    void shape;
    virtual.setOptions({
      ...virtual.options,
      count: shape.length,
    });
    virtual._willUpdate();
    virtualItems = virtual.getVirtualItems();
    totalSize = virtual.getTotalSize();
  });

  onDestroy(() => { virtual = null; });

  // edit state
  let editingKey = $state<string | null>(null); // `${rowIndex}|${col}` or `${rowIndex}|$` for scalar-array
  let draft = $state('');

  function cellKey(row: number, col: string): string { return `${row}|${col}`; }

  function startEdit(row: number, col: string, value: JsonValue) {
    draft = JSON.stringify(value);
    editingKey = cellKey(row, col);
  }

  function commitEdit(row: number, col: string) {
    try {
      const parsed = JSON.parse(draft) as JsonValue;
      const focus = getFocus();
      const path: JsonPath = col === '$'
        ? [...focus, row]
        : [...focus, row, col];
      active.applyValuePatch({ op: 'replace', path, value: parsed });
      editingKey = null;
    } catch { /* keep editing */ }
  }

  function cancelEdit() { editingKey = null; }

  function focusInput(el: HTMLInputElement) { el.focus(); el.select(); }

  function addRow() {
    const focus = getFocus();
    const arr = focusedValue as JsonValue[] | undefined;
    if (!Array.isArray(arr)) return;
    let value: JsonValue = null;
    if (shape.kind === 'object-array') {
      const obj: Record<string, JsonValue> = {};
      for (const c of shape.columns) obj[c] = null;
      value = obj;
    }
    active.applyValuePatch({ op: 'add', path: [...focus, arr.length], value });
  }

  function removeRow(row: number) {
    const focus = getFocus();
    active.applyValuePatch({ op: 'remove', path: [...focus, row] });
  }

  function valueKind(v: JsonValue): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function renderCell(v: JsonValue | undefined): string {
    if (v === undefined) return '';
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function isEditableCell(v: JsonValue | undefined): boolean {
    if (v === undefined) return true; // missing key — allow add
    return v === null || typeof v !== 'object';
  }

  // Computed strip width
  let stripWidth = $derived(
    INDEX_COL + (shape.kind === 'object-array' ? shape.columns.length * COL_WIDTH : COL_WIDTH) + 40,
  );
</script>

<div class="root">
  <div class="head">
    <div class="path-row">
      <span class="label">Path:</span>
      <select
        class="path-select"
        value={pathToJSONish(getFocus())}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          const idx = arrayPaths.findIndex((p) => pathToJSONish(p) === v);
          if (idx >= 0) setFocus(arrayPaths[idx]);
        }}
      >
        {#each arrayPaths as p (pathToJSONish(p))}
          <option value={pathToJSONish(p)}>{pathToJSONish(p)}</option>
        {/each}
      </select>
      <span class="meta">
        {#if shape.kind === 'object-array'}
          {shape.length} rows · {shape.columns.length} cols
        {:else if shape.kind === 'scalar-array'}
          {shape.length} scalars
        {:else if shape.kind === 'mixed-array'}
          {shape.length} mixed entries
        {:else}
          (not an array)
        {/if}
      </span>
      <span class="spacer"></span>
      {#if shape.kind === 'object-array' || shape.kind === 'scalar-array'}
        <button onclick={addRow} title="Append row">+ Row</button>
      {/if}
    </div>
  </div>

  {#if active.parse.errors.length}
    <div class="empty">JSON has errors — fix in text view to use table.</div>
  {:else if active.parse.value === undefined}
    <div class="empty">Empty document.</div>
  {:else if shape.kind === 'not-array'}
    <div class="empty">
      Selected path is not an array.
      {#if arrayPaths.length > 0}
        <p>Pick an array path above to view as a table.</p>
      {/if}
    </div>
  {:else if shape.kind === 'mixed-array'}
    <div class="empty">
      Mixed-type array (objects + scalars). Table view requires uniform shape — use Tree or Text.
    </div>
  {:else}
    <div class="scroll" bind:this={scrollEl}>
      <div class="strip" style:width="{stripWidth}px">
        <!-- Header -->
        <div class="row header" style:height="{ROW_HEIGHT}px">
          <div class="cell idx">#</div>
          {#if shape.kind === 'object-array'}
            {#each shape.columns as col}
              <div class="cell col" style:width="{COL_WIDTH}px" title={col}>{col}</div>
            {/each}
          {:else}
            <div class="cell col" style:width="{COL_WIDTH}px">value</div>
          {/if}
          <div class="cell actions"></div>
        </div>

        <!-- Virtual rows -->
        <div class="virt" style:height="{totalSize}px">
          {#each virtualItems as vi (vi.index)}
            {@const row = vi.index}
            {@const rowVal = (focusedValue as JsonValue[])[row]}
            <div class="row data"
                 style:transform="translateY({vi.start}px)"
                 style:height="{ROW_HEIGHT}px">
              <div class="cell idx">{row}</div>
              {#if shape.kind === 'object-array'}
                {@const obj = rowVal as Record<string, JsonValue>}
                {#each shape.columns as col}
                  {@const v = obj?.[col]}
                  {@const k = cellKey(row, col)}
                  <div class="cell" style:width="{COL_WIDTH}px">
                    {#if editingKey === k}
                      <input
                        class="cell-edit"
                        bind:value={draft}
                        onblur={() => commitEdit(row, col)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(row, col); }
                          else if (e.key === 'Escape') cancelEdit();
                        }}
                        use:focusInput
                      />
                    {:else if isEditableCell(v)}
                      <button class="cell-btn v-{valueKind(v ?? null)}" onclick={() => startEdit(row, col, v ?? null)}>
                        {renderCell(v)}
                      </button>
                    {:else}
                      <span class="cell-static">{renderCell(v)}</span>
                    {/if}
                  </div>
                {/each}
              {:else}
                {@const v = rowVal}
                {@const k = cellKey(row, '$')}
                <div class="cell" style:width="{COL_WIDTH}px">
                  {#if editingKey === k}
                    <input
                      class="cell-edit"
                      bind:value={draft}
                      onblur={() => commitEdit(row, '$')}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(row, '$'); }
                        else if (e.key === 'Escape') cancelEdit();
                      }}
                      use:focusInput
                    />
                  {:else}
                    <button class="cell-btn v-{valueKind(v)}" onclick={() => startEdit(row, '$', v)}>
                      {renderCell(v)}
                    </button>
                  {/if}
                </div>
              {/if}
              <div class="cell actions">
                <button class="x" onclick={() => removeRow(row)} aria-label="delete row" title="delete row">×</button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .root {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--fg);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }
  .head {
    border-bottom: 1px solid var(--border);
    padding: 6px 10px;
    background: var(--surface-2);
    flex-shrink: 0;
  }
  .path-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .label { color: var(--muted); }
  .path-select {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    font: inherit;
    max-width: 280px;
  }
  .meta { color: var(--muted); }
  .spacer { flex: 1; }
  .head button {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 10px;
    cursor: pointer;
    font: inherit;
  }
  .head button:hover { background: var(--row-hover-strong); }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    padding: 16px;
    text-align: center;
  }
  .empty p { margin: 6px 0 0; font-size: 11px; }

  .scroll {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  .strip {
    position: relative;
  }
  .virt {
    position: relative;
    width: 100%;
  }
  .row {
    display: flex;
    align-items: stretch;
  }
  .row.header {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    color: var(--muted);
  }
  .row.data {
    position: absolute;
    top: 0;
    left: 0;
    border-bottom: 1px solid var(--border);
  }
  .row.data:hover { background: var(--row-hover); }
  .row.data:hover .actions .x { opacity: 1; }

  .cell {
    flex-shrink: 0;
    padding: 0 8px;
    display: flex;
    align-items: center;
    border-right: 1px solid var(--border);
    overflow: hidden;
  }
  .cell.idx {
    width: 48px;
    color: var(--muted);
    text-align: right;
    justify-content: flex-end;
    background: var(--surface-2);
  }
  .cell.col { font-weight: 600; }
  .cell.actions {
    flex: 1;
    border-right: 0;
    justify-content: flex-end;
    min-width: 40px;
  }
  .cell-btn {
    background: transparent;
    border: 0;
    cursor: text;
    color: var(--fg);
    padding: 2px 4px;
    border-radius: 3px;
    font: inherit;
    text-align: left;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-btn:hover { background: var(--row-hover-strong); }
  .v-string { color: var(--str); }
  .v-number { color: var(--num); }
  .v-boolean { color: var(--bool); }
  .v-null { color: var(--null); font-style: italic; }
  .v-object, .v-array { color: var(--muted); font-style: italic; }
  .cell-static {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }
  .cell-edit {
    width: 100%;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 2px 4px;
    font: inherit;
    outline: none;
  }
  .x {
    opacity: 0;
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font-size: 16px;
    padding: 0 6px;
    transition: opacity 80ms;
  }
  .x:hover { color: var(--err); }
</style>
