<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Virtualizer, observeElementRect, observeElementOffset, elementScroll,
    type VirtualItem,
  } from '@tanstack/virtual-core';
  import { workspace, type DocStore } from '../core/store.svelte';
  import { inspectTable, findArrayPaths, getAt, pathToJSONish } from '../core/table-shape';
  import { toCsv, downloadCsv } from '../core/csv';
  import type { JsonPath, JsonValue } from '../core/types';

  let { doc: docProp }: { doc?: DocStore } = $props();
  let active = $derived(docProp ?? workspace.active);

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

  // Sort + filter state (per-doc-per-focus-path)
  type SortDir = 'asc' | 'desc';
  interface ViewState {
    sortCol: string | null;
    sortDir: SortDir;
    filters: Record<string, string>;
    showFilters: boolean;
  }
  const viewByKey = new Map<string, ViewState>();
  let viewBump = $state(0);
  function viewKey(): string { return active.id + '@' + JSON.stringify(getFocus()); }
  function getView(): ViewState {
    const k = viewKey();
    let v = viewByKey.get(k);
    if (!v) {
      v = { sortCol: null, sortDir: 'asc', filters: {}, showFilters: false };
      viewByKey.set(k, v);
    }
    return v;
  }
  function bumpView() { viewBump++; }

  function cycleSort(col: string) {
    const v = getView();
    if (v.sortCol !== col) { v.sortCol = col; v.sortDir = 'asc'; }
    else if (v.sortDir === 'asc') { v.sortDir = 'desc'; }
    else { v.sortCol = null; }
    bumpView();
  }
  function setFilter(col: string, text: string) {
    const v = getView();
    if (text) v.filters[col] = text;
    else delete v.filters[col];
    bumpView();
  }
  function toggleFilters() {
    const v = getView();
    v.showFilters = !v.showFilters;
    if (!v.showFilters) v.filters = {};
    bumpView();
  }
  function clearAllFilters() {
    const v = getView();
    v.filters = {};
    v.sortCol = null;
    bumpView();
  }

  // Type-aware comparator for mixed JSON values.
  function typeRank(v: JsonValue): number {
    if (v === null) return 0;
    if (typeof v === 'boolean') return 1;
    if (typeof v === 'number') return 2;
    if (typeof v === 'string') return 3;
    if (Array.isArray(v)) return 5;
    return 4;
  }
  function cmp(a: JsonValue, b: JsonValue): number {
    const ra = typeRank(a), rb = typeRank(b);
    if (ra !== rb) return ra - rb;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
    if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
    return JSON.stringify(a).localeCompare(JSON.stringify(b));
  }

  function cellOf(rowVal: JsonValue, col: string): JsonValue {
    if (col === '$') return rowVal;
    if (rowVal && typeof rowVal === 'object' && !Array.isArray(rowVal)) {
      return ((rowVal as Record<string, JsonValue>)[col]) ?? null;
    }
    return null;
  }

  function passesFilters(rowVal: JsonValue, filters: Record<string, string>): boolean {
    for (const [col, q] of Object.entries(filters)) {
      const cell = cellOf(rowVal, col);
      const s = cell === null ? 'null' : (typeof cell === 'object' ? JSON.stringify(cell) : String(cell));
      if (!s.toLowerCase().includes(q.toLowerCase())) return false;
    }
    return true;
  }

  // viewIndices: positions into the underlying array, in display order.
  let viewIndices = $derived.by<number[]>(() => {
    void viewBump;
    const arr = focusedValue as JsonValue[] | undefined;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    if (shape.kind !== 'object-array' && shape.kind !== 'scalar-array') return [];
    const v = getView();
    const filterCol = shape.kind === 'scalar-array' ? '$' : null;
    const activeFilters: Record<string, string> = filterCol
      ? (v.filters['$'] ? { '$': v.filters['$'] } : {})
      : v.filters;
    const filtered: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      if (!Object.keys(activeFilters).length || passesFilters(arr[i], activeFilters)) {
        filtered.push(i);
      }
    }
    if (v.sortCol) {
      const col = v.sortCol;
      const dir = v.sortDir === 'asc' ? 1 : -1;
      filtered.sort((ia, ib) => dir * cmp(cellOf(arr[ia], col), cellOf(arr[ib], col)));
    }
    return filtered;
  });

  let viewLen = $derived(viewIndices.length);
  let view = $derived.by(() => { void viewBump; return getView(); });

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
      count: viewLen,
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
    void viewLen;
    virtual.setOptions({
      ...virtual.options,
      count: viewLen,
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

  function exportCsv() {
    const arr = focusedValue as JsonValue[] | undefined;
    if (!Array.isArray(arr)) return;
    if (shape.kind !== 'object-array' && shape.kind !== 'scalar-array') return;
    // Use viewIndices so what you see (filter + sort) is what you export.
    const rows = viewIndices.map((i) => arr[i]);
    const csv = toCsv({
      columns: shape.kind === 'object-array' ? shape.columns : [],
      rows,
      scalarHeader: 'value',
    });
    const baseName = active.name.replace(/\.json$/i, '');
    const focus = getFocus();
    const suffix = focus.length === 0 ? '' : '_' + pathToJSONish(focus).replace(/[^A-Za-z0-9]+/g, '_');
    downloadCsv(`${baseName}${suffix}.csv`, csv);
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
        {#if viewLen !== shape.length}
          <span class="meta dim">({viewLen} after filter)</span>
        {/if}
        <button class:on={view.showFilters} onclick={toggleFilters} title="Toggle column filters">⚙ Filter</button>
        {#if view.sortCol || Object.keys(view.filters).length}
          <button onclick={clearAllFilters} title="Clear sort + filters">Reset</button>
        {/if}
        <button onclick={exportCsv} title="Export current view as CSV">CSV</button>
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
              <button
                class="cell col sortable"
                style:width="{COL_WIDTH}px"
                title="Sort by {col}"
                onclick={() => cycleSort(col)}
              >
                <span class="col-name">{col}</span>
                <span class="sort-ind">
                  {#if view.sortCol === col}{view.sortDir === 'asc' ? '▲' : '▼'}{:else}∙{/if}
                </span>
              </button>
            {/each}
          {:else}
            <button
              class="cell col sortable"
              style:width="{COL_WIDTH}px"
              onclick={() => cycleSort('$')}
            >
              <span class="col-name">value</span>
              <span class="sort-ind">
                {#if view.sortCol === '$'}{view.sortDir === 'asc' ? '▲' : '▼'}{:else}∙{/if}
              </span>
            </button>
          {/if}
          <div class="cell actions"></div>
        </div>

        <!-- Filter row (optional) -->
        {#if view.showFilters}
          <div class="row filter-row" style:height="{ROW_HEIGHT}px">
            <div class="cell idx"></div>
            {#if shape.kind === 'object-array'}
              {#each shape.columns as col}
                <div class="cell" style:width="{COL_WIDTH}px">
                  <input
                    class="filter-input"
                    placeholder="filter…"
                    value={view.filters[col] ?? ''}
                    oninput={(e) => setFilter(col, (e.currentTarget as HTMLInputElement).value)}
                  />
                </div>
              {/each}
            {:else}
              <div class="cell" style:width="{COL_WIDTH}px">
                <input
                  class="filter-input"
                  placeholder="filter…"
                  value={view.filters['$'] ?? ''}
                  oninput={(e) => setFilter('$', (e.currentTarget as HTMLInputElement).value)}
                />
              </div>
            {/if}
            <div class="cell actions"></div>
          </div>
        {/if}

        <!-- Virtual rows -->
        <div class="virt" style:height="{totalSize}px">
          {#each virtualItems as vi (vi.index)}
            {@const realIndex = viewIndices[vi.index]}
            {@const row = realIndex}
            {@const rowVal = (focusedValue as JsonValue[])[realIndex]}
            <div class="row data"
                 style:transform="translateY({vi.start}px)"
                 style:height="{ROW_HEIGHT}px">
              <div class="cell idx">{realIndex}</div>
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
    flex-grow: 0;
    /* min-width: 0 overrides flex's default `min-width: auto` so an explicit
       width is respected even when child content has long unbreakable runs.
       Without this, long values expand the data cell and break column alignment
       relative to the header. */
    min-width: 0;
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
  .cell.col.sortable {
    background: var(--surface-2);
    color: var(--muted);
    border: 0;
    border-right: 1px solid var(--border);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .cell.col.sortable:hover { background: var(--row-hover-strong); color: var(--fg); }
  .col-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sort-ind { color: var(--accent); font-size: 10px; flex-shrink: 0; }
  .filter-row {
    position: sticky;
    top: 28px;
    z-index: 1;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .filter-input {
    width: 100%;
    background: var(--surface-2);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 2px 6px;
    font: inherit;
    font-weight: normal;
    outline: none;
  }
  .filter-input:focus { border-color: var(--accent); }
  .meta.dim { font-size: 11px; }
  .head button.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
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
    flex: 1 1 auto;
    min-width: 0;
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
