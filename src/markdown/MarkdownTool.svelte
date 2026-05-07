<script lang="ts">
  import { onMount } from 'svelte';
  import MdEditor from './MdEditor.svelte';
  import MdPreview from './MdPreview.svelte';
  import MdHelpDialog from './MdHelpDialog.svelte';
  import ThemeToggle from '../components/ThemeToggle.svelte';
  import ToolSwitcher from '../components/ToolSwitcher.svelte';
  import ContextMenu, { type MenuItem } from '../components/ContextMenu.svelte';
  import { ui } from '../core/ui-prefs.svelte';
  import { mdWorkspace } from './md-store.svelte';

  type HelpTab = 'docs' | 'syntax' | 'shortcuts' | 'embeds' | 'about' | 'feedback';

  type Layout = 'split' | 'edit' | 'preview';

  const LAYOUT_KEY = 'jsonos.md.layout';
  function readLayout(): Layout {
    try {
      const v = localStorage.getItem(LAYOUT_KEY);
      if (v === 'split' || v === 'edit' || v === 'preview') return v;
    } catch { /* ignore */ }
    return 'split';
  }
  function persistLayout(l: Layout) {
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* ignore */ }
  }

  let layout = $state<Layout>(readLayout());
  let editingId = $state<string | null>(null);
  let draftName = $state('');
  let editorRef: MdEditor | undefined = $state();
  let previewRef: MdPreview | undefined = $state();
  let dragOver = $state(false);
  let dragDepth = 0;
  let fileInput: HTMLInputElement;

  let active = $derived(mdWorkspace.active);

  let helpOpen = $state(false);
  let helpTab = $state<HelpTab>('docs');
  let helpMenu = $state<{ x: number; y: number } | null>(null);

  function openHelpAt(t: HelpTab) { helpTab = t; helpOpen = true; }
  function openHelpMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    helpMenu = { x: Math.max(8, r.right - 240), y: r.bottom + 4 };
  }
  function closeHelpMenu() { helpMenu = null; }

  const helpItems: MenuItem[] = [
    { kind: 'item', icon: '📖', label: 'Docs',         onSelect: () => openHelpAt('docs') },
    { kind: 'item', icon: '✎',  label: 'Syntax cheat sheet', onSelect: () => openHelpAt('syntax') },
    { kind: 'item', icon: '⌨',  label: 'Keyboard shortcuts', onSelect: () => openHelpAt('shortcuts') },
    { kind: 'item', icon: '⇄',  label: 'Embeds & providers', onSelect: () => openHelpAt('embeds') },
    { kind: 'divider' },
    { kind: 'item', icon: 'ⓘ',  label: 'About Markdown Studio', onSelect: () => openHelpAt('about') },
    { kind: 'item', icon: '✉',  label: 'Send feedback',         onSelect: () => openHelpAt('feedback') },
    { kind: 'divider' },
    { kind: 'item', icon: '🔒', label: 'Privacy Policy', hint: '↗',
      onSelect: () => window.open('/privacy.html', '_blank', 'noopener') },
    { kind: 'item', icon: '§',  label: 'Terms of Service', hint: '↗',
      onSelect: () => window.open('/terms.html', '_blank', 'noopener') },
  ];

  onMount(() => { mdWorkspace.init(); });

  function setLayout(l: Layout) {
    layout = l;
    persistLayout(l);
  }

  function startRename(id: string, currentName: string) {
    editingId = id;
    draftName = currentName;
  }
  function commitRename() {
    if (editingId && draftName.trim()) {
      mdWorkspace.rename(editingId, draftName.trim());
    }
    editingId = null;
  }
  function focusInput(el: HTMLInputElement) { el.focus(); el.select(); }

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const text = await f.text();
    mdWorkspace.newDoc(text, f.name);
    (e.target as HTMLInputElement).value = '';
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t && active) active.load(t);
    } catch { /* permission */ }
  }
  async function copy() {
    if (!active) return;
    try { await navigator.clipboard.writeText(active.text); } catch { /* ignore */ }
  }
  async function copyHtml() {
    const html = previewRef?.getHtml();
    if (!html) return;
    try { await navigator.clipboard.writeText(html); } catch { /* ignore */ }
  }

  function exportHtml() {
    if (!active || !previewRef) return;
    active.exportHtml(previewRef.getHtml());
  }

  // ─── Drag-drop md files ──
  function isFileDrag(e: DragEvent): boolean {
    return !!e.dataTransfer?.types.some((t) => t === 'Files');
  }
  function onDragEnter(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    dragOver = true;
  }
  function onDragLeave(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragOver = false;
  }
  function onDragOver(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  async function onDrop(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const text = await f.text();
    mdWorkspace.newDoc(text, f.name);
  }

  // ─── Keyboard ──
  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    // `?` opens help — only when nothing else is taking it.
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !target?.isContentEditable && !target?.closest?.('.cm-editor')) {
        e.preventDefault();
        helpOpen = true;
        return;
      }
    }
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    if (e.key === 's') { e.preventDefault(); active?.download(); }
    else if (e.key === 't') { e.preventDefault(); mdWorkspace.newDoc(); }
    else if (e.shiftKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      setLayout(layout === 'preview' ? 'split' : 'preview');
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  class="md-app"
  class:dragging={dragOver}
  ondragenter={onDragEnter}
  ondragleave={onDragLeave}
  ondragover={onDragOver}
  ondrop={onDrop}
  role="application"
>
  {#if dragOver}
    <div class="drop-overlay" aria-hidden="true">
      <div class="drop-card">
        <div class="drop-icon">⤓</div>
        <div class="drop-title">Drop a .md file</div>
      </div>
    </div>
  {/if}

  <!-- Tabs -->
  <div class="tabs">
    <a class="brand" href="/" aria-label="JSON OS — home" title="JSON OS">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="url(#md-brand-grad)"/>
        <defs>
          <linearGradient id="md-brand-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#5b9eff"/>
            <stop offset="1" stop-color="#2563eb"/>
          </linearGradient>
        </defs>
        <g fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11.5 7.5c-2.5 0-3.5 1.2-3.5 3.2v3.1c0 1.4-.7 2.2-2 2.2 1.3 0 2 .8 2 2.2v3.1c0 2 1 3.2 3.5 3.2"/>
          <path d="M20.5 7.5c2.5 0 3.5 1.2 3.5 3.2v3.1c0 1.4.7 2.2 2 2.2-1.3 0-2 .8-2 2.2v3.1c0 2-1 3.2-3.5 3.2"/>
        </g>
        <circle cx="16" cy="16" r="1.5" fill="#ffffff"/>
      </svg>
      <span class="brand-name">JSON OS</span>
    </a>
    <ToolSwitcher />
    <span class="brand-sep" aria-hidden="true"></span>
    {#each mdWorkspace.docs as d (d.id)}
      {@const focused = mdWorkspace.activeId === d.id}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="tab"
        class:active={focused}
        role="button"
        tabindex="0"
        onclick={() => mdWorkspace.setActive(d.id)}
        onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); mdWorkspace.closeDoc(d.id); } }}
        onkeydown={(e) => { if (e.key === 'Enter') mdWorkspace.setActive(d.id); }}
        ondblclick={() => startRename(d.id, d.name)}
        title="Click: focus · middle-click: close · double-click: rename"
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
            onclick={(e) => { e.stopPropagation(); mdWorkspace.closeDoc(d.id); }}
            aria-label="close"
          >×</button>
        {/if}
      </div>
    {/each}
    <button class="new-tab" title="New markdown doc (⌘T)" onclick={() => mdWorkspace.newDoc()} aria-label="new">+</button>
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="group">
      <button onclick={() => fileInput.click()} title="Open .md file">Open</button>
      <input type="file" accept=".md,.markdown,text/markdown,text/plain" bind:this={fileInput} onchange={onFile} hidden />
      <button onclick={paste} title="Paste from clipboard">Paste</button>
      <button onclick={copy} title="Copy markdown">Copy</button>
      <button onclick={() => active?.download()} title="Download .md (⌘S)">Save</button>
    </div>

    <div class="sep"></div>

    <div class="group format" aria-label="Format">
      <button onclick={() => editorRef?.applyWrap('**')} title="Bold (⌘B)"><b>B</b></button>
      <button onclick={() => editorRef?.applyWrap('*')} title="Italic (⌘I)"><i>I</i></button>
      <button onclick={() => editorRef?.applyWrap('~~')} title="Strikethrough"><s>S</s></button>
      <button onclick={() => editorRef?.applyWrap('`')} title="Inline code (⌘E)">{`<>`}</button>
      <button onclick={() => editorRef?.applyLink()} title="Link (⌘K)">🔗</button>
      <button onclick={() => editorRef?.applyLine('# ')} title="Heading 1">H1</button>
      <button onclick={() => editorRef?.applyLine('## ')} title="Heading 2">H2</button>
      <button onclick={() => editorRef?.applyLine('- ')} title="Bullet list">•</button>
      <button onclick={() => editorRef?.applyLine('1. ')} title="Numbered list">1.</button>
      <button onclick={() => editorRef?.applyLine('> ')} title="Blockquote">❝</button>
      <button onclick={() => editorRef?.applyLine('- [ ] ')} title="Task">☐</button>
      <button onclick={() => editorRef?.applyWrap('\n```\n', '\n```\n')} title="Code block">⌜⌟</button>
      <button onclick={() => editorRef?.applyWrap('\n```mermaid\n', '\n```\n')} title="Mermaid block">⇄</button>
    </div>

    <div class="sep"></div>

    <div class="group">
      <button onclick={() => active?.undo()} title="Undo (⌘Z)">↶</button>
      <button onclick={() => active?.redo()} title="Redo (⌘⇧Z)">↷</button>
    </div>

    <div class="sep"></div>

    <div class="group">
      <button onclick={copyHtml} title="Copy rendered HTML">⎘ HTML</button>
      <button onclick={exportHtml} title="Download as standalone .html">↧ HTML</button>
    </div>

    <div class="spacer"></div>

    <div class="filename" title={active?.name ?? ''}>{active?.name ?? ''}{active?.dirty ? ' •' : ''}</div>

    <div class="seg layout-seg" aria-label="Layout">
      <button class:on={layout === 'edit'} onclick={() => setLayout('edit')} title="Edit only">✎</button>
      <button class:on={layout === 'split'} onclick={() => setLayout('split')} title="Split">⇆</button>
      <button class:on={layout === 'preview'} onclick={() => setLayout('preview')} title="Preview only (⌘⇧P)">◧</button>
    </div>

    <button class="panel-toggle" class:on={ui.wrap} onclick={() => ui.toggleWrap()} title="Toggle text wrap">⤶</button>
    <ThemeToggle />
    <button
      class="panel-toggle help-btn"
      onclick={openHelpMenu}
      title="Help, syntax, shortcuts (?)"
      aria-haspopup="menu"
      aria-expanded={helpMenu !== null}
    >?</button>
  </div>

  <!-- Editor + preview -->
  <div class="layout layout-{layout}">
    {#if active && (layout === 'edit' || layout === 'split')}
      <div class="pane editor-pane">
        <MdEditor doc={active} bind:this={editorRef} />
      </div>
    {/if}
    {#if active && layout === 'split'}
      <div class="divider" aria-hidden="true"></div>
    {/if}
    {#if active && (layout === 'preview' || layout === 'split')}
      <div class="pane preview-pane">
        <MdPreview doc={active} bind:this={previewRef} />
      </div>
    {/if}
  </div>

  <div class="hint-bar" aria-hidden="true">
    <kbd>⌘B</kbd> bold ·
    <kbd>⌘I</kbd> italic ·
    <kbd>⌘E</kbd> code ·
    <kbd>⌘K</kbd> link ·
    <kbd>⌘S</kbd> save ·
    <kbd>⌘T</kbd> new ·
    <kbd>⌘⇧P</kbd> preview ·
    <kbd>?</kbd> help
  </div>
</div>

{#if helpMenu}
  <ContextMenu x={helpMenu.x} y={helpMenu.y} items={helpItems} onClose={closeHelpMenu} />
{/if}

<MdHelpDialog bind:open={helpOpen} bind:tab={helpTab} />

<style>
  .md-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: var(--bg);
    color: var(--fg);
  }

  .tabs {
    display: flex;
    align-items: stretch;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: thin;
    min-height: 32px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    color: var(--muted);
    text-decoration: none;
    font: 600 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    letter-spacing: 0.04em;
    flex-shrink: 0;
    user-select: none;
    transition: color 80ms;
  }
  .brand:hover { color: var(--fg); }
  .brand-mark { width: 18px; height: 18px; display: block; flex-shrink: 0; }
  .brand-sep {
    display: inline-block;
    width: 1px;
    align-self: center;
    height: 18px;
    background: var(--border);
    margin: 0 4px 0 0;
    flex-shrink: 0;
  }
  .tabs :global(.switcher) {
    align-self: center;
    margin: 0 6px 0 -2px;
    flex-shrink: 0;
  }
  @media (max-width: 540px) {
    .brand-name { display: none; }
    .brand { padding: 0 10px; }
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-right: 1px solid var(--border);
    border-left: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
    color: var(--muted);
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    max-width: 220px;
    min-width: 90px;
    flex-shrink: 0;
  }
  .tab + .tab { border-left: 0; }
  .tab:hover { background: var(--surface); color: var(--fg); }
  .tab.active {
    background: var(--surface);
    color: var(--fg);
    border-bottom: 2px solid var(--accent);
    margin-bottom: -1px;
  }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
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
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 4px 8px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .toolbar button {
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
  .toolbar button:hover { background: var(--row-hover-strong); border-color: var(--muted); }
  .format button { padding: 3px 8px; min-width: 28px; }
  .panel-toggle {
    margin-left: 4px;
    font-size: 14px;
    padding: 3px 10px !important;
  }
  .panel-toggle.on {
    background: var(--accent) !important;
    color: var(--accent-fg);
    border-color: var(--accent) !important;
  }
  .help-btn { font-weight: 700; }
  .seg { display: flex; }
  .seg button {
    padding: 3px 10px !important;
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    font-size: 12px;
    cursor: pointer;
  }
  .seg button:first-child { border-radius: var(--radius) 0 0 var(--radius); }
  .seg button:last-child  { border-radius: 0 var(--radius) var(--radius) 0; }
  .seg button + button { border-left: 0; }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }

  .layout {
    flex: 1;
    display: grid;
    min-height: 0;
  }
  .layout-edit { grid-template-columns: 1fr; }
  .layout-preview { grid-template-columns: 1fr; }
  .layout-split { grid-template-columns: 1fr 1px 1fr; }
  .pane { min-width: 0; min-height: 0; overflow: hidden; }
  .editor-pane { border-right: 1px solid var(--border); }
  .layout-edit .editor-pane,
  .layout-preview .preview-pane { border-right: 0; }
  .divider { background: var(--border); }

  @media (max-width: 768px) {
    .layout-split { grid-template-columns: 1fr; grid-template-rows: 1fr 1px 1fr; }
    .layout-split .editor-pane { border-right: 0; border-bottom: 1px solid var(--border); }
  }

  .hint-bar {
    flex-shrink: 0;
    background: var(--surface-2);
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
    padding: 3px 12px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
  }
  .hint-bar :global(kbd) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 5px;
    margin: 0 2px;
    color: var(--fg);
    font: 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (max-width: 768px) { .hint-bar { display: none; } }

  .md-app.dragging > :not(.drop-overlay) { pointer-events: none; }
  .drop-overlay {
    position: fixed; inset: 0;
    z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in oklab, var(--bg) 50%, transparent);
    backdrop-filter: blur(3px);
    border: 3px dashed var(--accent);
    box-shadow: inset 0 0 0 6px var(--accent-soft);
    pointer-events: none;
  }
  .drop-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 24px 32px;
    text-align: center;
    color: var(--fg);
  }
  .drop-icon { font-size: 38px; line-height: 1; color: var(--accent); margin-bottom: 6px; }
  .drop-title { font-size: 16px; font-weight: 600; }
</style>
