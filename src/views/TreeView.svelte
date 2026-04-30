<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Virtualizer, observeElementRect, observeElementOffset, elementScroll, type VirtualItem } from '@tanstack/virtual-core';
  import { workspace, type DocStore } from '../core/store.svelte';
  import { ui } from '../core/ui-prefs.svelte';
  import { flatten, pathKey, type Row } from '../core/tree-flatten';
  import type { JsonPath, JsonValue } from '../core/types';

  let { doc: docProp }: { doc?: DocStore } = $props();
  let active = $derived(docProp ?? workspace.active);

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
  const ROW_HEIGHT_WRAPPED = 24; // initial estimate; real height measured per-row

  onMount(() => {
    virtual = new Virtualizer<HTMLDivElement, HTMLDivElement>({
      count: rows.length,
      getScrollElement: () => scrollEl ?? null,
      estimateSize: () => ui.wrap ? ROW_HEIGHT_WRAPPED : ROW_HEIGHT,
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

  // When wrap toggles, drop all cached measurements so heights are recomputed.
  $effect(() => {
    void ui.wrap;
    if (!virtual) return;
    virtual.measure();
    virtual._willUpdate();
    virtualItems = virtual.getVirtualItems();
    totalSize = virtual.getTotalSize();
  });

  /** Svelte action: hand each row to the virtualizer for actual height measurement.
      virtual-core reads `data-index` from the element. */
  function measureRow(el: HTMLDivElement) {
    virtual?.measureElement(el);
    return {
      update() { virtual?.measureElement(el); },
    };
  }

  onDestroy(() => { virtual = null; });

  // Inline edit state — separate channels for value vs key edits.
  let editingValueId = $state<string | null>(null);
  let editingKeyId = $state<string | null>(null);
  let draft = $state('');
  // After addChild, queue an auto-rename so the new key opens in edit mode.
  let pendingKeyEdit: { rowId: string; original: string } | null = null;

  /** Render a value to its inline-edit text form: strings unquoted, others as JSON literals. */
  function valueToDraft(v: JsonValue): string {
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  /** Commit a value edit. If the original was a string, accept the draft as a literal
      string unless the user explicitly entered a JSON literal (number/bool/null/quoted). */
  function parseDraft(draft: string, originalKind: string): JsonValue {
    const trimmed = draft.trim();
    // Try JSON literals first
    if (/^(true|false|null|-?\d|"|\[|\{)/.test(trimmed)) {
      try { return JSON.parse(draft) as JsonValue; } catch { /* fall through */ }
    }
    if (originalKind === 'string') return draft;
    // Last try: maybe it's a bare number / bool the regex missed
    const v = JSON.parse(draft) as JsonValue;
    return v;
  }

  function startValueEdit(row: Row) {
    if (row.kind !== 'leaf') return;
    draft = valueToDraft(row.value);
    editingValueId = row.id;
    editingKeyId = null;
  }

  function commitValueEdit(row: Row) {
    try {
      const parsed = parseDraft(draft, valueKind(row.value));
      active.applyValuePatch({ op: 'replace', path: row.path, value: parsed });
      editingValueId = null;
    } catch { /* keep editing */ }
  }

  function startKeyEdit(row: Row) {
    if (row.path.length === 0) return;
    if (typeof row.keyName !== 'string') return; // array indices not editable
    draft = row.keyName;
    editingKeyId = row.id;
    editingValueId = null;
  }

  function commitKeyEdit(row: Row) {
    if (typeof row.keyName !== 'string') { editingKeyId = null; return; }
    const next = draft;
    if (!next || next === row.keyName) { editingKeyId = null; return; }
    const parentPath = row.path.slice(0, -1);
    active.applyValuePatch({ op: 'renameKey', path: parentPath, from: row.keyName, to: next });
    editingKeyId = null;
  }

  function cancelEdits() {
    editingValueId = null;
    editingKeyId = null;
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
      const newPath = [...row.path, key];
      // Make sure the parent is open so the new row is in the rendered list.
      const { expanded, toggled } = getExpanded();
      toggled.add(pathKey(row.path));
      expanded.add(pathKey(row.path));
      active.applyValuePatch({ op: 'add', path: newPath, value: null });
      // Tell the next render to start key-rename on this new row.
      pendingKeyEdit = { rowId: pathKey(newPath), original: key };
      bumpExpand++;
    }
  }

  // After parse completes and rows refresh, if we queued a key edit, start it now.
  $effect(() => {
    void rows;
    if (!pendingKeyEdit) return;
    const { rowId } = pendingKeyEdit;
    if (rows.some((r) => r.id === rowId)) {
      draft = pendingKeyEdit.original;
      editingKeyId = rowId;
      pendingKeyEdit = null;
    }
  });

  function valueKind(v: JsonValue): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function renderValue(v: JsonValue): string {
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    return String(v);
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
              class:wrap={ui.wrap}
              data-index={vi.index}
              style:transform="translateY({vi.start}px)"
              style:min-height="{ROW_HEIGHT}px"
              style:padding-left="{row.depth * 14 + 6}px"
              use:measureRow
            >
              {#if row.kind === 'object-open' || row.kind === 'array-open'}
                {@const k = pathKey(row.path)}
                {@const { expanded, toggled } = getExpanded()}
                {@const open = toggled.has(k) ? expanded.has(k) : row.path.length < 3}
                <button class="caret" onclick={() => toggle(row.path, open)} aria-label="toggle">
                  {open ? '▾' : '▸'}
                </button>
                {#if row.keyName !== null}
                  {#if editingKeyId === row.id && typeof row.keyName === 'string'}
                    <input
                      class="edit key-edit"
                      bind:value={draft}
                      onblur={() => commitKeyEdit(row)}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitKeyEdit(row); }
                        else if (e.key === 'Escape') cancelEdits();
                      }}
                      use:focusInput
                    />
                  {:else if typeof row.keyName === 'string'}
                    <button class="key" onclick={() => startKeyEdit(row)} title="click to rename key">{row.keyName}</button>
                  {:else}
                    <span class="key idx">{row.keyName}</span>
                  {/if}<span class="colon">:</span>
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
                  {#if editingKeyId === row.id && typeof row.keyName === 'string'}
                    <input
                      class="edit key-edit"
                      bind:value={draft}
                      onblur={() => commitKeyEdit(row)}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitKeyEdit(row); }
                        else if (e.key === 'Escape') cancelEdits();
                      }}
                      use:focusInput
                    />
                  {:else if typeof row.keyName === 'string'}
                    <button class="key" onclick={() => startKeyEdit(row)} title="click to rename key">{row.keyName}</button>
                  {:else}
                    <span class="key idx">{row.keyName}</span>
                  {/if}<span class="colon">:</span>
                {/if}
                {#if editingValueId === row.id}
                  <input
                    class="edit"
                    bind:value={draft}
                    onblur={() => commitValueEdit(row)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitValueEdit(row); }
                      else if (e.key === 'Escape') cancelEdits();
                    }}
                    use:focusInput
                  />
                {:else}
                  {@const k = valueKind(row.value)}
                  <button class="value v-{k}" onclick={() => startValueEdit(row)} title="click to edit">
                    {renderValue(row.value)}
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
    padding-top: 1px;
    padding-bottom: 1px;
  }
  .row.wrap {
    align-items: flex-start;
  }
  /* Wrap only the value column. Keys, carets, braces stay on a single line so a
     tall multi-line value doesn't force the key to break per-character. */
  .row.wrap .value {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    flex: 1 1 auto;
    min-width: 0;
  }
  .row.wrap .key,
  .row.wrap .caret,
  .row.wrap .colon,
  .row.wrap .brace,
  .row.wrap .actions {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .row.wrap .caret { padding-top: 2px; }
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
  .key {
    color: var(--key);
    background: transparent;
    border: 0;
    padding: 1px 3px;
    border-radius: 3px;
    font: inherit;
    cursor: text;
  }
  button.key:hover { background: var(--row-hover-strong); }
  .key.idx { color: var(--muted); }
  .colon { color: var(--muted); margin-right: 2px; }
  .brace { color: var(--muted); }
  .muted { color: var(--muted); font-style: italic; }
  .key-edit { color: var(--key); }
  .value {
    background: transparent;
    border: 0;
    cursor: text;
    padding: 1px 4px;
    border-radius: 3px;
    font: inherit;
    text-align: left;
  }
  .value:hover { background: var(--row-hover-strong); }
  .row.wrap .value { white-space: normal; word-break: break-word; }
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
    flex: 1 1 auto;
    min-width: 80px;
    width: 100%;
    box-shadow: 0 0 0 2px var(--ring);
    outline: none;
  }
  .edit.key-edit {
    flex: 0 1 auto;
    width: auto;
    min-width: 60px;
    field-sizing: content;
  }
  .actions {
    opacity: 0;
    margin-left: 6px;
    transition: opacity 80ms;
  }
</style>
