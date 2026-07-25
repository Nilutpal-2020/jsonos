<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Virtualizer, observeElementRect, observeElementOffset, elementScroll, type VirtualItem } from '@tanstack/virtual-core';
  import { workspace, type DocStore } from '../core/store.svelte';
  import { ui } from '../core/ui-prefs.svelte';
  import { flatten, pathKey, type Row } from '../core/tree-flatten';
  import { getAt } from '../core/table-shape';
  import type { JsonPath, JsonValue } from '../core/types';
  import type { DiffNode } from '../core/diff-engine';
  import ContextMenu, { type MenuItem } from '../components/ContextMenu.svelte';
  import EmptyDoc from '../components/EmptyDoc.svelte';
  import { compare } from '../core/compare.svelte';
  import { treeExpand } from '../core/tree-expand.svelte';
  import { selection } from '../core/selection.svelte';

  type Props = {
    doc?: DocStore;
    diffByPath?: Map<string, DiffNode> | null;
    diffSide?: 'left' | 'right' | null;
    slotIndex?: number;
  };
  let { doc: docProp, diffByPath = null, diffSide = null, slotIndex }: Props = $props();
  let active = $derived(docProp ?? workspace.active);

  /** Diff status for a path; null if no diff context. */
  function diffStatus(path: JsonPath): DiffNode['status'] | null {
    if (!diffByPath) return null;
    return diffByPath.get(pathKey(path))?.status ?? null;
  }
  /** Look up the matching node so we can show before/after on changes. */
  function diffAt(path: JsonPath): DiffNode | null {
    if (!diffByPath) return null;
    return diffByPath.get(pathKey(path)) ?? null;
  }

  // expand state lives in src/core/tree-expand.svelte.ts so SlotView's
  // header chrome and TreeView agree on what's open.
  function getExpanded() { return treeExpand.get(active.id); }

  let rows = $derived.by(() => {
    void treeExpand.bump;
    if (active.parse.errors.length || active.parse.value === undefined) return [];
    const { expanded, toggled } = getExpanded();
    return flatten(active.parse.value, expanded, toggled);
  });

  function toggle(path: JsonPath, currentlyOpen: boolean) {
    treeExpand.toggle(active.id, path, currentlyOpen);
  }

  /** Used inside the row {@const}; reads `treeExpand.bump` so Svelte 5 keyed
      each items re-evaluate when set contents mutate (Sets aren't tracked). */
  function isPathOpen(path: JsonPath): boolean {
    void treeExpand.bump;
    const { expanded, toggled } = getExpanded();
    const k = pathKey(path);
    return toggled.has(k) ? expanded.has(k) : path.length < 3;
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
      count: visibleRows.length,
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
    void visibleRows;
    virtual.setOptions({
      ...virtual.options,
      count: visibleRows.length,
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

  // ──────────── sync-scroll between paired diff columns ────────────
  // Broadcast our scrollTop ratio when the user scrolls; consume the peer's
  // ratio when they scroll. Guard with `applyingExternal` to avoid feedback loops.
  let applyingExternal = false;

  $effect(() => {
    const peer = compare.scrollSignal;
    if (peer === null) return;
    if (slotIndex === undefined) return;
    if (compare.scrollSourceSlot === slotIndex) return;     // we sent it
    if (!compare.isPaired(slotIndex)) return;
    const sc = scrollEl;
    if (!sc) return;
    const max = sc.scrollHeight - sc.clientHeight;
    const next = Math.round(peer * max);
    if (Math.abs(sc.scrollTop - next) < 1) return;
    applyingExternal = true;
    sc.scrollTop = next;
    queueMicrotask(() => { applyingExternal = false; });
  });

  function onScroll() {
    if (applyingExternal) return;
    if (slotIndex === undefined) return;
    if (!compare.isPaired(slotIndex)) return;
    const sc = scrollEl;
    if (!sc) return;
    const max = sc.scrollHeight - sc.clientHeight;
    if (max <= 0) return;
    compare.publishScroll(slotIndex, sc.scrollTop / max);
  }

  // Inline edit state — separate channels for value vs key edits.
  let editingValueId = $state<string | null>(null);
  let editingKeyId = $state<string | null>(null);
  let draft = $state('');
  let filterQuery = $state('');
  // After addChild, queue an auto-rename so the new key opens in edit mode.
  let pendingKeyEdit: { rowId: string; original: string } | null = null;

  /** Search / filter rows in real time */
  let matchingRowIds = $derived.by<Set<string> | null>(() => {
    if (!filterQuery.trim()) return null;
    const q = filterQuery.trim().toLowerCase();
    const set = new Set<string>();
    for (const r of rows) {
      const kMatch = typeof r.keyName === 'string' && r.keyName.toLowerCase().includes(q);
      const vMatch = r.kind === 'leaf' && String(r.value ?? '').toLowerCase().includes(q);
      if (kMatch || vMatch) {
        for (let i = 0; i <= r.path.length; i++) {
          set.add(pathKey(r.path.slice(0, i)));
        }
      }
    }
    return set;
  });

  let visibleRows = $derived.by(() => {
    if (!matchingRowIds) return rows;
    return rows.filter((r) => matchingRowIds.has(r.id) || r.path.length === 0);
  });

  /** Path of currently selected row for top breadcrumbs */
  let selectedPath = $derived.by<JsonPath>(() => {
    void selection.stamp(active.id);
    if (!selectedKey) return [];
    const r = rows.find((row) => row.id === selectedKey);
    return r ? r.path : [];
  });

  function selectBreadcrumb(path: JsonPath) {
    if (path.length === 0) {
      selection.clear(active.id);
      return;
    }
    treeExpand.expandToPath(active.id, path);
    selection.set(active.id, path, 'tree');
  }

  function copyPath(path: JsonPath) {
    if (path.length === 0) {
      navigator.clipboard?.writeText('$').catch(() => {});
      return;
    }
    const formatted = '$' + path.map((seg) => (typeof seg === 'number' ? `[${seg}]` : `.${seg}`)).join('');
    navigator.clipboard?.writeText(formatted).catch(() => {});
  }

  /** Render a value to its inline-edit text form: strings unquoted, others as JSON literals. */
  function valueToDraft(v: JsonValue): string {
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  /** Commit a value edit with automatic boolean, number, null, and literal detection. */
  function parseDraft(draft: string, originalKind: string): JsonValue {
    const trimmed = draft.trim();
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
    if (trimmed.toLowerCase() === 'null') return null;

    // Strict number check
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
    }

    // Try full JSON parse for explicit JSON literals (e.g. quoted string "123", array [1,2], object {"a":1})
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return JSON.parse(trimmed) as JsonValue;
      } catch { /* fall through */ }
    }

    if (originalKind === 'string') return draft;
    return draft;
  }

  function toggleBool(row: Row) {
    if (row.kind !== 'leaf' || typeof row.value !== 'boolean') return;
    const nextVal = !row.value;
    active.applyValuePatch({ op: 'replace', path: row.path, value: nextVal });
  }

  function convertType(row: Row, targetKind: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null') {
    let nextValue: JsonValue;
    if (targetKind === 'string') {
      nextValue = row.value === null ? '' : String(row.value);
    } else if (targetKind === 'number') {
      const n = Number(row.value);
      nextValue = isNaN(n) ? 0 : n;
    } else if (targetKind === 'boolean') {
      nextValue = Boolean(row.value);
    } else if (targetKind === 'object') {
      nextValue = {};
    } else if (targetKind === 'array') {
      nextValue = [];
    } else {
      nextValue = null;
    }
    active.applyValuePatch({ op: 'replace', path: row.path, value: nextValue });
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
      treeExpand.bump++;
    }
  }

  // After parse completes and rows refresh, if we queued a key edit, start it now.
  $effect(() => {
    void visibleRows;
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

  // ──────────────────────────────────────────────────────────────────────
  // Context menu + sibling/duplicate operations
  // ──────────────────────────────────────────────────────────────────────

  // App-internal clipboard (separate from system clipboard so we can hold a
  // structured JsonValue, plus the source key when copied from an object).
  let internalClip = $state<{ value: JsonValue; key?: string } | null>(null);
  let menu = $state<{ x: number; y: number; row: Row } | null>(null);

  function snap<T>(v: T): T {
    return v == null || typeof v !== 'object' ? v : ($state.snapshot(v as any) as T);
  }

  function parentInfo(row: Row): { parentPath: JsonPath; parent: JsonValue | undefined; lastSeg: string | number | undefined } {
    if (row.path.length === 0) return { parentPath: [], parent: undefined, lastSeg: undefined };
    const parentPath = row.path.slice(0, -1);
    const parent = getAt(active.parse.value, parentPath);
    const lastSeg = row.path[row.path.length - 1];
    return { parentPath, parent: parent as JsonValue | undefined, lastSeg };
  }

  function nextUniqueKey(parent: Record<string, JsonValue>, base: string): string {
    if (!(base in parent)) return base;
    for (let i = 1; i < 10_000; i++) {
      const cand = `${base}${i}`;
      if (!(cand in parent)) return cand;
    }
    return `${base}_${Date.now()}`;
  }

  /** Insert into the parent of `row`. `where` = before | after | duplicate. */
  function insertSibling(row: Row, where: 'before' | 'after' | 'duplicate', value?: JsonValue) {
    if (row.path.length === 0) return;
    const { parentPath, parent, lastSeg } = parentInfo(row);
    if (parent === undefined) return;

    if (Array.isArray(parent)) {
      const idx = lastSeg as number;
      const insertAt = where === 'before' ? idx : idx + 1;
      const v: JsonValue = where === 'duplicate'
        ? snap(parent[idx] as JsonValue)
        : (value === undefined ? null : value);
      const next = [...parent.slice(0, insertAt), v, ...parent.slice(insertAt)];
      active.applyValuePatch({ op: 'replace', path: parentPath, value: snap(next) });
      return;
    }

    if (parent && typeof parent === 'object') {
      const obj = parent as Record<string, JsonValue>;
      const key = lastSeg as string;
      const baseKey = where === 'duplicate' ? `${key} copy` : 'newKey';
      const newKey = nextUniqueKey(obj, baseKey);
      const v: JsonValue = where === 'duplicate'
        ? snap(obj[key])
        : (value === undefined ? null : value);

      const next: Record<string, JsonValue> = {};
      const keys = Object.keys(obj);
      for (const k of keys) {
        if (k === key && where === 'before') next[newKey] = v;
        next[k] = obj[k];
        if (k === key && (where === 'after' || where === 'duplicate')) next[newKey] = v;
      }
      active.applyValuePatch({ op: 'replace', path: parentPath, value: snap(next) });

      // For "before"/"after" empty insertion, queue rename of the new key.
      if (where !== 'duplicate') {
        pendingKeyEdit = { rowId: pathKey([...parentPath, newKey]), original: newKey };
        treeExpand.bump++;
      }
    }
  }

  function copyRow(row: Row) {
    const value = snap(row.value);
    internalClip = {
      value,
      key: typeof row.keyName === 'string' ? row.keyName : undefined,
    };
    // Best-effort system clipboard too.
    navigator.clipboard?.writeText(JSON.stringify(value, null, 2)).catch(() => {});
  }

  function cutRow(row: Row) {
    if (row.path.length === 0) return;
    copyRow(row);
    active.applyValuePatch({ op: 'remove', path: row.path });
  }

  /** Paste from internalClip as: a child of an open container row, OR a sibling
      after a leaf row. Falls back to system clipboard if internalClip empty. */
  async function pasteAt(row: Row) {
    let value: JsonValue | null = internalClip?.value ?? null;
    let key: string | undefined = internalClip?.key;
    if (internalClip == null) {
      try {
        const txt = await navigator.clipboard.readText();
        value = JSON.parse(txt);
      } catch { return; }
    }

    // Paste into a container as last child
    if (row.kind === 'object-open') {
      const obj = row.value as Record<string, JsonValue>;
      const k = nextUniqueKey(obj, key ?? 'pasted');
      const next = { ...obj, [k]: snap(value as JsonValue) };
      active.applyValuePatch({ op: 'replace', path: row.path, value: snap(next) });
      return;
    }
    if (row.kind === 'array-open') {
      const arr = row.value as JsonValue[];
      const next = [...arr, snap(value as JsonValue)];
      active.applyValuePatch({ op: 'replace', path: row.path, value: snap(next) });
      return;
    }
    // Paste as sibling after the current leaf
    insertSibling(row, 'after', snap(value as JsonValue));
  }

  function sortRow(row: Row) {
    if (row.kind !== 'object-open') return;
    const obj = snap(row.value) as Record<string, JsonValue>;
    const next: Record<string, JsonValue> = {};
    for (const k of Object.keys(obj).sort()) next[k] = obj[k];
    active.applyValuePatch({ op: 'replace', path: row.path, value: next });
  }

  function convertTo(row: Row, kind: 'object' | 'array' | 'value') {
    let next: JsonValue;
    if (kind === 'object') next = {};
    else if (kind === 'array') next = [];
    else next = null;
    active.applyValuePatch({ op: 'replace', path: row.path, value: next });
  }

  function buildMenu(row: Row): MenuItem[] {
    const isContainerOpen = row.kind === 'object-open' || row.kind === 'array-open';
    const isLeaf = row.kind === 'leaf';
    const isBool = isLeaf && typeof row.value === 'boolean';
    const canEditKey = typeof row.keyName === 'string' && row.path.length > 0;
    const canRemove = row.path.length > 0;

    return [
      ...(canEditKey ? [{
        kind: 'item' as const, icon: '✎', label: 'Edit key',
        onSelect: () => startKeyEdit(row),
      }] : []),
      ...(isLeaf ? [{
        kind: 'item' as const, icon: '✎', label: 'Edit value',
        onSelect: () => startValueEdit(row),
      }] : []),
      ...(isBool ? [{
        kind: 'item' as const, icon: '☑', label: `Toggle boolean (${!row.value})`,
        onSelect: () => toggleBool(row),
      }] : []),
      { kind: 'divider' },
      { kind: 'item', icon: '⎘', label: 'Copy JSON path', onSelect: () => copyPath(row.path) },
      { kind: 'item', icon: '✂', label: 'Cut',  hint: '⌘X', disabled: !canRemove, onSelect: () => cutRow(row) },
      { kind: 'item', icon: '⎘', label: 'Copy value', hint: '⌘C', onSelect: () => copyRow(row) },
      { kind: 'item', icon: '📋', label: 'Paste', hint: '⌘V', onSelect: () => pasteAt(row) },
      { kind: 'item', icon: '⎘', label: 'Duplicate',  hint: '⌘D', disabled: !canRemove, onSelect: () => insertSibling(row, 'duplicate') },
      { kind: 'divider' },
      { kind: 'item', icon: '↥', label: 'Insert before', disabled: !canRemove, onSelect: () => insertSibling(row, 'before') },
      { kind: 'item', icon: '↧', label: 'Insert after',  disabled: !canRemove, onSelect: () => insertSibling(row, 'after')  },
      ...(isContainerOpen ? [{
        kind: 'item' as const, icon: '+', label: 'Add child',
        onSelect: () => addChild(row),
      }] : []),
      { kind: 'divider' },
      { kind: 'item', icon: '⇅', label: 'Sort keys', disabled: row.kind !== 'object-open', onSelect: () => sortRow(row) },
      {
        kind: 'submenu', icon: '⇄', label: 'Convert type to',
        items: [
          { kind: 'item', label: 'String  "abc"', onSelect: () => convertType(row, 'string') },
          { kind: 'item', label: 'Number  123',   onSelect: () => convertType(row, 'number') },
          { kind: 'item', label: 'Boolean true/false', onSelect: () => convertType(row, 'boolean') },
          { kind: 'item', label: 'Object  { }',   onSelect: () => convertType(row, 'object') },
          { kind: 'item', label: 'Array   [ ]',   onSelect: () => convertType(row, 'array')  },
          { kind: 'item', label: 'Null    null',  onSelect: () => convertType(row, 'null')   },
        ],
      },
      { kind: 'divider' },
      { kind: 'item', icon: '🗑', label: 'Remove', danger: true, disabled: !canRemove, hint: 'Del', onSelect: () => removeRow(row) },
    ];
  }

  function openContextMenu(e: MouseEvent, row: Row) {
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, row };
  }

  function rowKeyShortcut(e: KeyboardEvent, row: Row) {
    if (e.key === ' ' && row.kind === 'leaf' && typeof row.value === 'boolean') {
      e.preventDefault();
      toggleBool(row);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'INPUT') return;
      if (row.path.length > 0) {
        e.preventDefault();
        removeRow(row);
        return;
      }
    }
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const k = e.key.toLowerCase();
    if (k === 'c') { e.preventDefault(); copyRow(row); }
    else if (k === 'x') { e.preventDefault(); cutRow(row); }
    else if (k === 'v') { e.preventDefault(); pasteAt(row); }
    else if (k === 'd') { e.preventDefault(); insertSibling(row, 'duplicate'); }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Selection — single-row OR select-all. Bridged with TextView via the
  // shared selection store so clicking a row highlights the same key/value
  // in the editor and vice versa.
  // ──────────────────────────────────────────────────────────────────────

  let selectedKey = $derived.by<string | null>(() => {
    void selection.stamp(active.id);
    return selection.key(active.id);
  });
  let selectAll = $derived.by<boolean>(() => {
    void selection.stamp(active.id);
    return selection.isSelectAll(active.id);
  });

  function selectRow(row: Row) {
    if (row.path.length === 0) {
      selection.clear(active.id);
      return;
    }
    selection.set(active.id, row.path, 'tree');
  }

  function rowFromPathKey(k: string): Row | undefined {
    return rows.find((r) => r.id === k);
  }

  /** When another view (text cursor, query panel, etc.) moves the selection,
      scroll to the matching row and auto-expand parents so it's visible. */
  $effect(() => {
    void selection.stamp(active.id);
    if (selection.source === 'tree' || selection.source === null) return;
    const path = selection.get(active.id);
    if (!path) return;
    treeExpand.expandToPath(active.id, path);
    requestAnimationFrame(() => {
      if (!virtual) return;
      virtual.setOptions({ ...virtual.options, count: visibleRows.length });
      virtual._willUpdate();
      const k = pathKey(path);
      const idx = visibleRows.findIndex((r) => r.id === k);
      if (idx >= 0) virtual.scrollToIndex(idx, { align: 'center' });
    });
  });

  function copyAllText() {
    navigator.clipboard?.writeText(active.text).catch(() => {});
  }

  /** Replace the whole document with the given JSON value. */
  function replaceDoc(value: JsonValue) {
    active.applyValuePatch({ op: 'replace', path: [], value: snap(value) });
  }

  /** Tree-level Ctrl+A / Ctrl+V / Ctrl+C handler. */
  async function onTreeKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) {
      if (e.key === 'Escape') {
        if (selectedKey || selectAll) {
          e.preventDefault();
          selection.clear(active.id);
        }
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'a') {
      e.preventDefault();
      selection.setAll(active.id, true, 'tree');
      copyAllText();
      return;
    }
    if (k === 'c') {
      if (selectAll) {
        e.preventDefault();
        copyAllText();
        return;
      }
      if (selectedKey) {
        const row = rowFromPathKey(selectedKey);
        if (row) { e.preventDefault(); copyRow(row); }
        return;
      }
      return;
    }
    if (k === 'v') {
      e.preventDefault();
      let value: JsonValue;
      try {
        const txt = await navigator.clipboard.readText();
        value = JSON.parse(txt) as JsonValue;
      } catch {
        if (internalClip) value = internalClip.value;
        else return;
      }
      if (selectAll || selectedKey === null) {
        replaceDoc(value);
        selection.setAll(active.id, false);
        return;
      }
      const row = rowFromPathKey(selectedKey);
      if (!row) { replaceDoc(value); return; }
      if (row.kind === 'object-open' || row.kind === 'array-open') {
        await pasteAt(row);
      } else {
        insertSibling(row, 'after', snap(value));
      }
      return;
    }
    if (k === 'x') {
      if (selectedKey) {
        const row = rowFromPathKey(selectedKey);
        if (row) { e.preventDefault(); cutRow(row); selection.clear(active.id); }
      }
      return;
    }
  }

  function onTreeBackgroundPointerDown(e: PointerEvent) {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.classList.contains('scroll') || t.classList.contains('virt') || t.classList.contains('tree-root')) {
      selection.clear(active.id);
    }
    if (scrollEl && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') {
      scrollEl.focus({ preventScroll: true });
    }
  }

  function renderValue(v: JsonValue): string {
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    return String(v);
  }
</script>

<div class="tree-root">
  {#if active.parse.errors.length && !active.text.trim()}
    <EmptyDoc doc={active} />
  {:else if active.parse.errors.length}
    <div class="tree-empty">JSON has errors — fix in text view to use tree.</div>
  {:else if active.parse.value === undefined}
    <EmptyDoc doc={active} />
  {:else}
    <div class="tree-header">
      <div class="breadcrumbs" title="Current selected JSON path">
        <button class="crumb-btn" class:active={selectedPath.length === 0} onclick={() => selectBreadcrumb([])}>
          root
        </button>
        {#each selectedPath as seg, idx}
          <span class="crumb-sep">&rsaquo;</span>
          <button
            class="crumb-btn"
            class:active={idx === selectedPath.length - 1}
            onclick={() => selectBreadcrumb(selectedPath.slice(0, idx + 1))}
          >
            {seg}
          </button>
        {/each}
      </div>

      <div class="header-tools">
        <div class="filter-box">
          <span class="filter-icon">🔍</span>
          <input
            type="text"
            class="filter-input"
            placeholder="Filter keys & values..."
            bind:value={filterQuery}
          />
          {#if filterQuery}
            <button class="clear-btn" onclick={() => (filterQuery = '')}>×</button>
          {/if}
        </div>
        {#if selectedPath.length > 0}
          <button class="hdr-btn" onclick={() => copyPath(selectedPath)} title="Copy JSON path (.key)">
            ⎘ Path
          </button>
        {/if}
      </div>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="scroll"
      bind:this={scrollEl}
      onscroll={onScroll}
      onkeydown={onTreeKey}
      onpointerdown={onTreeBackgroundPointerDown}
      tabindex="0"
      role="tree"
      aria-label="JSON tree viewer"
    >
      <div class="virt" style:height="{totalSize}px">
        {#each virtualItems as vi (visibleRows[vi.index]?.id ?? vi.index)}
          {@const row = visibleRows[vi.index]}
          {#if row}
            {@const ds = diffStatus(row.path)}
            {@const isSel = selectAll || selectedKey === row.id}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              class="row"
              class:wrap={ui.wrap}
              class:selected={isSel}
              class:diff-added={ds === 'added'}
              class:diff-removed={ds === 'removed'}
              class:diff-changed={ds === 'changed'}
              class:diff-moved={ds === 'moved'}
              data-index={vi.index}
              style:transform="translateY({vi.start}px)"
              style:min-height="{ROW_HEIGHT}px"
              style:padding-left="{row.depth * 14 + 6}px"
              use:measureRow
              onclick={() => selectRow(row)}
              oncontextmenu={(e) => { selectRow(row); openContextMenu(e, row); }}
              onkeydown={(e) => rowKeyShortcut(e, row)}
              role="group"
              tabindex="-1"
            >
              {#if row.kind === 'object-open' || row.kind === 'array-open'}
                {@const open = isPathOpen(row.path)}
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
                <span class="count-badge">{row.childCount} {row.kind === 'object-open' ? (row.childCount === 1 ? 'key' : 'keys') : (row.childCount === 1 ? 'item' : 'items')}</span>
                {#if !open}
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
                  {#if k === 'boolean'}
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <label class="bool-toggle-wrap" title="Click to toggle boolean (Space / Click)" onclick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        class="bool-cb"
                        checked={row.value === true}
                        onchange={() => toggleBool(row)}
                      />
                      <span class="v-boolean">{row.value ? 'true' : 'false'}</span>
                    </label>
                  {:else}
                    <button class="value v-{k}" onclick={() => startValueEdit(row)} title="click to edit">
                      {renderValue(row.value)}
                    </button>
                  {/if}
                  {#if ds === 'changed'}
                    {@const dn = diffAt(row.path)}
                    {#if dn && diffSide === 'right' && dn.before !== undefined}
                      <span class="diff-old" title="Was: {JSON.stringify(dn.before)}">
                        was {renderValue(dn.before as JsonValue)}
                      </span>
                    {:else if dn && diffSide === 'left' && dn.after !== undefined}
                      <span class="diff-old" title="Now: {JSON.stringify(dn.after)}">
                        now {renderValue(dn.after as JsonValue)}
                      </span>
                    {/if}
                  {:else if ds === 'moved'}
                    {@const dn = diffAt(row.path)}
                    {#if dn && dn.fromIndex !== undefined && dn.toIndex !== undefined}
                      <span class="diff-old">moved {dn.fromIndex} → {dn.toIndex}</span>
                    {/if}
                  {/if}
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

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    items={buildMenu(menu.row)}
    onClose={() => (menu = null)}
  />
{/if}

<style>
  .tree-root {
    height: 100%;
    background: var(--surface);
    color: var(--fg);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    outline: none;
  }
  .scroll:focus { outline: none; }
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

  /* ─── selection (cross-view sync) ───────────────────────────── */
  .row.selected {
    background: var(--accent-soft);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .row.selected:hover { background: color-mix(in oklab, var(--accent-soft) 75%, var(--row-hover-strong)); }

  /* ─── diff overlay ──────────────────────────────────────────── */
  .row.diff-added   { background: rgba(34, 197, 94, 0.18) !important; box-shadow: inset 3px 0 0 #22c55e; }
  .row.diff-removed { background: rgba(239, 68, 68, 0.18) !important; box-shadow: inset 3px 0 0 #ef4444; }
  .row.diff-changed { background: rgba(245, 158, 11, 0.20) !important; box-shadow: inset 3px 0 0 #f59e0b; }
  .row.diff-moved   { background: rgba(59, 130, 246, 0.18) !important; box-shadow: inset 3px 0 0 #3b82f6; }

  .row.diff-changed .key,
  .row.diff-changed .value,
  .row.diff-changed .colon {
    background: rgba(245, 158, 11, 0.22);
    border-radius: 3px;
    padding: 1px 4px;
    font-weight: 600;
  }
  .row.diff-changed .key { color: #fbbf24 !important; }
  .row.diff-changed .value { color: #fde047 !important; }
  .row.diff-changed .value.v-string { color: #fde047 !important; }
  .row.diff-changed .value.v-number { color: #38bdf8 !important; }
  .row.diff-changed .value.v-boolean { color: #4ade80 !important; }

  .row.diff-added .key { color: #86efac !important; }
  .row.diff-added .value { color: #4ade80 !important; }

  .row.diff-removed .key,
  .row.diff-removed .value {
    color: #fca5a5 !important;
    text-decoration: line-through;
  }

  .diff-old {
    color: #fde047;
    font-style: normal;
    font-size: 11px;
    font-weight: 600;
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(245, 158, 11, 0.25);
    border: 1px solid rgba(245, 158, 11, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }

  /* ─── Light Mode theme adaptations ─── */
  :global([data-theme="light"]) .row.diff-changed {
    background: rgba(217, 119, 6, 0.16) !important;
    box-shadow: inset 3px 0 0 #d97706;
  }
  :global([data-theme="light"]) .row.diff-changed .key,
  :global([data-theme="light"]) .row.diff-changed .value,
  :global([data-theme="light"]) .row.diff-changed .colon {
    background: rgba(217, 119, 6, 0.22);
  }
  :global([data-theme="light"]) .row.diff-changed .key { color: #b45309 !important; }
  :global([data-theme="light"]) .row.diff-changed .value { color: #92400e !important; }
  :global([data-theme="light"]) .row.diff-changed .value.v-string { color: #92400e !important; }
  :global([data-theme="light"]) .row.diff-changed .value.v-number { color: #0284c7 !important; }
  :global([data-theme="light"]) .row.diff-changed .value.v-boolean { color: #16a34a !important; }

  :global([data-theme="light"]) .row.diff-added {
    background: rgba(22, 163, 74, 0.14) !important;
    box-shadow: inset 3px 0 0 #16a34a;
  }
  :global([data-theme="light"]) .row.diff-added .key { color: #15803d !important; }
  :global([data-theme="light"]) .row.diff-added .value { color: #166534 !important; }

  :global([data-theme="light"]) .row.diff-removed {
    background: rgba(220, 38, 38, 0.14) !important;
    box-shadow: inset 3px 0 0 #dc2626;
  }
  :global([data-theme="light"]) .row.diff-removed .key,
  :global([data-theme="light"]) .row.diff-removed .value {
    color: #b91c1c !important;
  }

  :global([data-theme="light"]) .diff-old {
    color: #78350f;
    background: rgba(217, 119, 6, 0.2);
    border-color: rgba(217, 119, 6, 0.5);
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

  /* ─── Tree Header & Breadcrumbs ─── */
  .tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    user-select: none;
    flex-wrap: wrap;
    min-height: 28px;
  }
  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    white-space: nowrap;
    max-width: 60%;
  }
  .crumb-btn {
    background: transparent;
    border: 0;
    color: var(--muted);
    font: inherit;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .crumb-btn:hover { background: var(--row-hover-strong); color: var(--fg); }
  .crumb-btn.active { color: var(--accent); font-weight: 600; }
  .crumb-sep { color: var(--muted); opacity: 0.6; font-size: 11px; }

  .header-tools {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .filter-box {
    display: flex;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    gap: 4px;
  }
  .filter-icon { font-size: 10px; opacity: 0.6; }
  .filter-input {
    border: 0;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 11px;
    outline: none;
    width: 130px;
  }
  .clear-btn {
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
  }
  .clear-btn:hover { color: var(--fg); }
  .hdr-btn {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .hdr-btn:hover { background: var(--row-hover-strong); border-color: var(--accent); }

  .count-badge {
    font-size: 10px;
    font-family: system-ui, -apple-system, sans-serif;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    background: color-mix(in oklab, var(--muted) 15%, transparent);
    color: var(--muted);
    margin-left: 4px;
    margin-right: 4px;
  }

  .bool-toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 3px;
    user-select: none;
  }
  .bool-toggle-wrap:hover { background: var(--row-hover-strong); }
  .bool-cb {
    cursor: pointer;
    accent-color: var(--accent);
    width: 13px;
    height: 13px;
    margin: 0;
  }
</style>
