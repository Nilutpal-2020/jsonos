<script lang="ts">
  import { doc, workspace } from '../core/store.svelte';
  import { ui } from '../core/ui-prefs.svelte';
  import { compare } from '../core/compare.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import HelpDialog from './HelpDialog.svelte';

  type SideTab = 'schema' | 'diff' | 'query';
  let {
    panelOpen = $bindable(false),
    sideTab   = $bindable<SideTab>('schema'),
    onCompare,
  }: { panelOpen: boolean; sideTab: SideTab; onCompare: () => void } = $props();

  function openSidePanel(tab: SideTab) {
    sideTab = tab;
    panelOpen = true;
  }

  // ───── Compare button: auto-pair when feasible, otherwise prompt ─────
  let compareMenu = $state<{ x: number; y: number } | null>(null);

  /** Snap together `active` and `peer` as a side-by-side diff pair. */
  function pairWith(peerId: string) {
    const active = workspace.active;
    if (!active || active.id === peerId) return;
    workspace.openSideBySide(active.id, peerId, 'tree');
    compare.setPair(0, 1);
    compareMenu = null;
  }

  function compareItems(): MenuItem[] {
    const others = workspace.docs.filter((d) => d.id !== workspace.active?.id);
    if (others.length === 0) {
      return [{ kind: 'item', label: 'Open another doc to compare', disabled: true, onSelect: () => {} }];
    }
    return [
      { kind: 'item', label: 'Compare with…', disabled: true, onSelect: () => {} },
      { kind: 'divider' },
      ...others.map<MenuItem>((d) => ({
        kind: 'item' as const,
        icon: '⇄',
        label: d.name + (d.dirty ? ' •' : ''),
        onSelect: () => pairWith(d.id),
      })),
      { kind: 'divider' },
      { kind: 'item', icon: '⚙', label: 'Open Compare panel', onSelect: () => { compareMenu = null; onCompare(); } },
    ];
  }

  function handleCompareClick(e: MouseEvent) {
    // Currently linked → unlink. Same behavior as before.
    if (compare.pair) { onCompare(); return; }
    const others = workspace.docs.filter((d) => d.id !== workspace.active?.id);
    // Exactly one peer: link instantly without a picker.
    if (others.length === 1) { pairWith(others[0].id); return; }
    // Several peers, or none — show picker anchored under the button.
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    compareMenu = { x: r.left, y: r.bottom + 4 };
  }

  // Help menu state
  type HelpTab = 'docs' | 'shortcuts' | 'about' | 'feedback';
  let helpMenu = $state<{ x: number; y: number } | null>(null);
  let helpOpen = $state(false);
  let helpTab = $state<HelpTab>('docs');

  function openHelpMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    helpMenu = { x: r.left, y: r.bottom + 4 };
  }
  function closeHelpMenu() { helpMenu = null; }
  function openHelpAt(t: HelpTab) { helpTab = t; helpOpen = true; }

  let helpItems: MenuItem[] = [
    { kind: 'item', icon: '📖', label: 'Documentation',     onSelect: () => openHelpAt('docs') },
    { kind: 'item', icon: '⌨',  label: 'Keyboard shortcuts', onSelect: () => openHelpAt('shortcuts') },
    { kind: 'divider' },
    { kind: 'item', icon: 'ⓘ',  label: 'About JSON OS',      onSelect: () => openHelpAt('about') },
    { kind: 'item', icon: '↗',  label: 'Share JSON OS',      onSelect: () => openHelpAt('about') },
    { kind: 'item', icon: '✉',  label: 'Send feedback',      onSelect: () => openHelpAt('feedback') },
    { kind: 'divider' },
    { kind: 'item', icon: '🔒', label: 'Privacy Policy', hint: '↗',
      onSelect: () => window.open('/privacy.html', '_blank', 'noopener') },
    { kind: 'item', icon: '§',  label: 'Terms of Service', hint: '↗',
      onSelect: () => window.open('/terms.html', '_blank', 'noopener') },
  ];

  let fileInput: HTMLInputElement;
  let repairError = $state('');
  let repairChanges = $state<string[]>([]);
  let repairOk = $state(false);
  let repairTimer: ReturnType<typeof setTimeout> | null = null;
  function clearRepairToast() {
    repairError = '';
    repairChanges = [];
    repairOk = false;
  }
  function scheduleClear(ms: number) {
    if (repairTimer) clearTimeout(repairTimer);
    repairTimer = setTimeout(clearRepairToast, ms);
  }

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const text = await f.text();
    doc.load(text, f.name);
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) doc.load(t);
    } catch { /* permission */ }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(doc.text); } catch { /* ignore */ }
  }

  async function repair() {
    clearRepairToast();
    const r = await doc.repair();
    if (r.ok) {
      repairOk = true;
      repairChanges = r.changes;
      // No-op repair = no toast.
      if (repairChanges.length > 0) scheduleClear(6000);
      else clearRepairToast();
    } else {
      repairError = r.error;
      repairChanges = r.changes;
      scheduleClear(8000);
    }
  }

  async function sortKeys() {
    repairError = '';
    try { await doc.sortKeys(true); }
    catch (e) { repairError = (e as Error).message; setTimeout(() => repairError = '', 3000); }
  }
</script>

<div class="toolbar">
  <div class="group">
    <button onclick={() => fileInput.click()} title="Open file">Open</button>
    <input type="file" accept=".json,application/json,text/plain" bind:this={fileInput} onchange={onFile} hidden />
    <button onclick={paste} title="Paste from clipboard">Paste</button>
    <button onclick={copy} title="Copy to clipboard">Copy</button>
    <button onclick={() => doc.download()} title="Download">Save</button>
    <button
      onclick={handleCompareClick}
      title={compare.pair ? 'Unlink current diff pair (⌘⇧C)' : 'Compare with another doc (⌘⇧C)'}
      class="compare-btn"
      class:on={compare.pair !== null}
      aria-pressed={compare.pair !== null}
      aria-haspopup={compare.pair ? undefined : 'menu'}
      aria-expanded={compareMenu !== null}
    >{compare.pair ? '⊗ Unlink' : '⇄ Compare'}</button>
    <button
      onclick={() => openSidePanel('query')}
      title="MongoDB-style query (⌘⇧K)"
      class:on={panelOpen && sideTab === 'query'}
      aria-pressed={panelOpen && sideTab === 'query'}
    >🔎 Query</button>
  </div>

  <div class="sep"></div>

  <div class="group">
    <button onclick={() => doc.format(2)} title="Format (2sp)">Format</button>
    <button onclick={() => doc.minify()} title="Minify">Minify</button>
    <button onclick={repair} title="Repair common JSON issues">Repair</button>
    <button onclick={sortKeys} title="Sort object keys (deep)">Sort</button>
  </div>

  <div class="sep"></div>

  <div class="group">
    <button onclick={() => doc.undo()} title="Undo (⌘Z)">Undo</button>
    <button onclick={() => doc.redo()} title="Redo (⌘⇧Z)">Redo</button>
  </div>

  <div class="spacer"></div>

  <div class="filename" title={doc.name}>
    {doc.name}{doc.dirty ? ' •' : ''}
  </div>

  <button
    class="panel-toggle"
    class:on={ui.wrap}
    onclick={() => ui.toggleWrap()}
    title="Toggle text wrap (⌘⇧W)"
    aria-pressed={ui.wrap}
  >⤶</button>

  <ThemeToggle />

  <button
    class="panel-toggle help-btn"
    onclick={openHelpMenu}
    title="Help, docs, feedback"
    aria-haspopup="menu"
    aria-expanded={helpMenu !== null}
  >?</button>

  <button class="panel-toggle" class:on={panelOpen} onclick={() => panelOpen = !panelOpen} title="Toggle side panel (⌘\\)">
    {panelOpen ? '⊟' : '⊞'}
  </button>
</div>

{#if helpMenu}
  <ContextMenu x={helpMenu.x} y={helpMenu.y} items={helpItems} onClose={closeHelpMenu} />
{/if}

{#if compareMenu}
  <ContextMenu
    x={compareMenu.x}
    y={compareMenu.y}
    items={compareItems()}
    onClose={() => (compareMenu = null)}
  />
{/if}

<HelpDialog bind:open={helpOpen} bind:tab={helpTab} />

{#if repairError}
  <div class="repair-toast err">
    <div class="head">
      <strong>Repair failed:</strong> {repairError}
      <button class="close" onclick={clearRepairToast} aria-label="dismiss">×</button>
    </div>
    {#if repairChanges.length}
      <div class="sub">Applied before failure:</div>
      <ul>{#each repairChanges as c}<li>{c}</li>{/each}</ul>
    {/if}
  </div>
{:else if repairOk && repairChanges.length}
  <div class="repair-toast ok">
    <div class="head">
      <strong>Repaired ({repairChanges.length} fix{repairChanges.length === 1 ? '' : 'es'})</strong>
      <button class="close" onclick={clearRepairToast} aria-label="dismiss">×</button>
    </div>
    <ul>{#each repairChanges as c}<li>{c}</li>{/each}</ul>
  </div>
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    flex-wrap: wrap;
  }
  .group { display: flex; gap: 4px; flex-wrap: wrap; }
  .sep { width: 1px; height: 20px; background: var(--border); }
  .spacer { flex: 1; }
  .filename {
    color: var(--fg);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 4px 8px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  button {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    padding: 4px 11px;
    border-radius: var(--radius);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
    transition: background 80ms, border-color 80ms, color 80ms;
  }
  button:hover { background: var(--row-hover-strong); border-color: var(--muted); }
  button:active { background: var(--accent-soft); }
  .panel-toggle {
    margin-left: 4px;
    font-size: 14px;
    padding: 3px 10px;
  }
  .panel-toggle.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .help-btn { font-weight: 700; }
  .compare-btn.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .repair-toast {
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
    line-height: 1.5;
  }
  .repair-toast.err { background: var(--err-bg); color: var(--err); }
  .repair-toast.ok  { background: var(--ok-soft); color: var(--ok); }
  .repair-toast .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .repair-toast .head strong { font-weight: 600; }
  .repair-toast .close {
    margin-left: auto;
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 6px;
    border-radius: var(--radius);
    opacity: 0.7;
  }
  .repair-toast .close:hover { opacity: 1; background: var(--row-hover-strong); }
  .repair-toast .sub { color: var(--muted); margin-top: 4px; }
  .repair-toast ul {
    margin: 4px 0 0 0;
    padding-left: 18px;
    color: var(--fg);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }
  .repair-toast.err ul, .repair-toast.ok ul { color: var(--fg); }
  .repair-toast li { padding: 1px 0; }

  @media (max-width: 768px) {
    .toolbar {
      gap: 6px;
      padding: 6px 8px;
    }
    .sep { display: none; }
    .filename {
      max-width: 140px;
      font-size: 11px;
    }
    button {
      padding: 5px 9px;
      font-size: 12px;
    }
  }
  @media (max-width: 540px) {
    .filename { display: none; }
    .spacer { flex-basis: 100%; height: 0; }
    button { padding: 6px 10px; }
    .panel-toggle { padding: 5px 10px; }
  }
</style>
