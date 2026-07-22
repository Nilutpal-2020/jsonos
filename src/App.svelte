<script lang="ts">
  import { onMount } from "svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import TabBar from "./components/TabBar.svelte";
  import ValidationPanel from "./components/ValidationPanel.svelte";
  import SidePanel from "./components/SidePanel.svelte";
  import SlotView from "./components/SlotView.svelte";
  import SlotResizer from "./components/SlotResizer.svelte";
  import CommandPalette from "./components/CommandPalette.svelte";
  import { doc, workspace } from "./core/store.svelte";
  import { ui } from "./core/ui-prefs.svelte";
  import { compare } from "./core/compare.svelte";
  import { tool } from "./core/tool-router.svelte";

  // Lazy-load the markdown tool — keeps marked / mermaid / katex out of the JSON bundle.
  let MarkdownTool = $state<any>(null);
  let mdLoading = $state(false);
  let mdError = $state("");
  $effect(() => {
    if (tool.current !== "md" || MarkdownTool || mdLoading) return;
    mdLoading = true;
    import("./markdown/MarkdownTool.svelte")
      .then((m) => {
        MarkdownTool = m.default;
      })
      .catch((e) => {
        mdError = String((e as Error).message ?? e);
      })
      .finally(() => {
        mdLoading = false;
      });
  });

  type SideTab = "schema" | "diff" | "query";
  let panelOpen = $state(false);
  let sideTab = $state<SideTab>("schema");
  let commandPaletteOpen = $state(false);
  let workspaceEl = $state<HTMLDivElement | undefined>();

  // Side-panel resize: pixels, persisted, clamped to [PANEL_MIN, viewport*0.5].
  const PANEL_KEY = "jsonos.panelWidth";
  const PANEL_MIN = 280;
  const PANEL_DEFAULT = 380;
  let panelWidthRaw = $state<number>(readPanelWidth());
  let viewportWidth = $state<number>(
    typeof window === "undefined" ? 1024 : window.innerWidth,
  );
  let panelMax = $derived(Math.floor(viewportWidth * 0.5));
  let panelWidth = $derived(
    Math.max(PANEL_MIN, Math.min(panelMax, panelWidthRaw)),
  );
  let resizing = $state(false);

  function readPanelWidth(): number {
    try {
      const v = parseInt(localStorage.getItem(PANEL_KEY) ?? "", 10);
      return Number.isFinite(v) && v > 0 ? v : PANEL_DEFAULT;
    } catch {
      return PANEL_DEFAULT;
    }
  }
  function persistPanelWidth(w: number) {
    try {
      localStorage.setItem(PANEL_KEY, String(w));
    } catch {}
  }

  function startPanelResize(e: PointerEvent) {
    e.preventDefault();
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: PointerEvent) => {
      // Panel sits on the right; dragging left increases width.
      const dx = ev.clientX - startX;
      panelWidthRaw = startW - dx;
    };
    const onUp = () => {
      resizing = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      panelWidthRaw = panelWidth; // commit clamped value
      persistPanelWidth(panelWidth);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function resetPanelWidth() {
    panelWidthRaw = PANEL_DEFAULT;
    persistPanelWidth(PANEL_DEFAULT);
  }
  function onWindowResize() {
    viewportWidth = window.innerWidth;
  }

  let gridTemplate = $derived.by(() => {
    const fr = workspace.slotFractions;
    const parts: string[] = [];
    for (let i = 0; i < fr.length; i++) {
      parts.push(`minmax(0, ${fr[i]}fr)`);
      if (i < fr.length - 1) parts.push("6px");
    }
    return parts.join(" ");
  });

  onMount(() => {
    workspace.init();
    const handleSideTabEvent = (e: Event) => {
      const tab = (e as CustomEvent).detail as SideTab;
      if (tab) {
        sideTab = tab;
        panelOpen = true;
      }
    };
    window.addEventListener("jsonos:open-side-tab", handleSideTabEvent);
    return () => {
      window.removeEventListener("jsonos:open-side-tab", handleSideTabEvent);
    };
  });

  // Global drag-and-drop: drop a JSON file anywhere on the app.
  // Loads into the focused slot's doc.
  let dragDepth = 0;
  let appDragOver = $state(false);
  function isFileDrag(e: DragEvent): boolean {
    return !!e.dataTransfer?.types.some(
      (t) => t === "Files" || t === "application/json",
    );
  }
  function onDragEnter(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    appDragOver = true;
  }
  function onDragLeave(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) appDragOver = false;
  }
  function onDragOver(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
  async function onDrop(e: DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = 0;
    appDragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const text = await f.text();
    workspace.active.load(text, f.name);
  }

  function toggleCompare() {
    // Toggle: linked → unlink. Otherwise auto-pair if exactly one peer exists,
    // else open the Compare panel for a manual pick.
    if (compare.pair) {
      compare.clear();
      return;
    }
    const others = workspace.docs.filter((d) => d.id !== workspace.active?.id);
    if (others.length === 1) {
      workspace.openSideBySide(workspace.active.id, others[0].id, "tree");
      compare.setPair(0, 1);
      return;
    }
    panelOpen = true;
    sideTab = "diff";
  }

  function onKey(e: KeyboardEvent) {
    // The Markdown tool owns its own keymap.
    if (tool.current === "md") return;
    // If a focused widget already handled it (CodeMirror keymap with
    // Prec.highest, native form controls), don't double-fire.
    if (e.defaultPrevented) return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      doc.undo();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      doc.redo();
    } else if (e.key === "s") {
      e.preventDefault();
      doc.download();
    } else if (e.key === "/" || (e.shiftKey && e.key === "F")) {
      e.preventDefault();
      doc.format(2);
    } else if (e.key === "\\") {
      e.preventDefault();
      panelOpen = !panelOpen;
    } else if (e.key === "t") {
      e.preventDefault();
      workspace.newDoc();
    } else if (e.shiftKey && (e.key === "w" || e.key === "W")) {
      e.preventDefault();
      ui.toggleWrap();
    } else if (e.shiftKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      toggleCompare();
    } else if (e.shiftKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      panelOpen = true;
      sideTab = "query";
    } else if (!e.shiftKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      commandPaletteOpen = true;
    } else if (e.key === "1" || e.key === "2" || e.key === "3") {
      const n = Number(e.key) - 1;
      if (workspace.slots[n]) {
        e.preventDefault();
        workspace.focusSlot(n);
      }
    }
  }
</script>

<svelte:window onkeydown={onKey} onresize={onWindowResize} />

{#if tool.current === "md"}
  {#if MarkdownTool}
    {@const Md = MarkdownTool}
    <Md />
  {:else if mdError}
    <div class="md-loading">
      <div class="md-error">Failed to load Markdown tool: {mdError}</div>
    </div>
  {:else}
    <div class="md-loading">Loading Markdown tool…</div>
  {/if}
{:else}
  <div
    class="app"
    class:dragging={appDragOver}
    ondragenter={onDragEnter}
    ondragleave={onDragLeave}
    ondragover={onDragOver}
    ondrop={onDrop}
    role="application"
  >
    {#if appDragOver}
      <div class="drop-overlay">
        <div class="drop-card">
          <div class="drop-icon">⤓</div>
          <div class="drop-title">Drop to load</div>
          <div class="drop-sub">
            Loads into <strong>{workspace.active?.name ?? "current doc"}</strong
            >
          </div>
        </div>
      </div>
    {/if}
    <TabBar />
    <Toolbar
      bind:panelOpen
      bind:sideTab
      bind:commandPaletteOpen
      onCompare={toggleCompare}
    />

    <div
      class="layout"
      class:has-panel={panelOpen}
      style:--panel-width="{panelWidth}px"
    >
      <div
        class="workspace"
        bind:this={workspaceEl}
        style:grid-template-columns={gridTemplate}
      >
        {#each workspace.slots as slot, i (i)}
          <SlotView
            {slot}
            index={i}
            focused={i === workspace.focusedSlotIndex}
          />
          {#if i < workspace.slots.length - 1}
            <SlotResizer leftIndex={i} containerEl={workspaceEl ?? null} />
          {/if}
        {/each}
      </div>
      {#if panelOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="panel-resizer"
          class:dragging={resizing}
          onpointerdown={startPanelResize}
          ondblclick={resetPanelWidth}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side panel"
          aria-valuemin={PANEL_MIN}
          aria-valuemax={panelMax}
          aria-valuenow={panelWidth}
          title="Drag to resize · double-click to reset"
        ></div>
        <div class="side">
          <SidePanel bind:tab={sideTab} onClose={() => (panelOpen = false)} />
        </div>
      {/if}
    </div>

    <ValidationPanel />
    <CommandPalette bind:open={commandPaletteOpen} />

    <div class="hint-bar" aria-hidden="true">
      {#if compare.pair}
        <kbd>⌘K</kbd> search ·
        <kbd>⌘⇧C</kbd> unlink ·
        <kbd>⌘[</kbd> / <kbd>⌘]</kbd> prev / next change ·
        <kbd>⌘⇧K</kbd> query
      {:else if workspace.slots.length > 1}
        <kbd>⌘K</kbd> search ·
        <kbd>⌘1</kbd>–<kbd>⌘3</kbd> focus column ·
        <kbd>⌘\</kbd> panel ·
        <kbd>⌘⇧K</kbd> query ·
        <kbd>⌘⇧C</kbd> compare
      {:else}
        <kbd>⌘K</kbd> search ·
        <kbd>⌘/</kbd> format ·
        <kbd>⌘⇧W</kbd> wrap ·
        <kbd>⌘\</kbd> panel ·
        <kbd>⌘⇧K</kbd> query ·
        <kbd>⌘⇧C</kbd> compare ·
        <kbd>?</kbd> help
      {/if}
    </div>
  </div>
{/if}

<style>
  .md-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    height: 100dvh;
    color: var(--muted);
    font-size: 13px;
  }
  .md-error {
    color: var(--err);
  }
  :global(:root),
  :global([data-theme="dark"]) {
    color-scheme: dark;
    --bg: #0c0f14;
    --surface: #131720;
    --surface-2: #1a1f2a;
    --surface-hi: #232a37;
    --fg: #e8ecf2;
    --muted: #8b95a5;
    --border: #2a313e;
    --row-hover: rgba(255, 255, 255, 0.045);
    --row-hover-strong: rgba(255, 255, 255, 0.085);
    --accent: #5b9eff;
    --accent-fg: #ffffff;
    --accent-soft: rgba(91, 158, 255, 0.16);
    --ok: #4ec97a;
    --ok-soft: rgba(78, 201, 122, 0.16);
    --err: #ff6b66;
    --err-bg: rgba(255, 107, 102, 0.14);
    --warn: #f5cf6a;
    --key: #82b6ff;
    --str: #b9dcff;
    --num: #f5cf6a;
    --bool: #ff8a82;
    --null: #8b95a5;
    --selection: rgba(91, 158, 255, 0.28);
    --ring: rgba(91, 158, 255, 0.55);
    --shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
    --radius: 4px;
    --radius-lg: 8px;
  }

  :global([data-theme="light"]) {
    color-scheme: light;
    --bg: #f5f7fa;
    --surface: #ffffff;
    --surface-2: #f1f4f9;
    --surface-hi: #e7ecf3;
    --fg: #11151c;
    --muted: #5a6373;
    --border: #d8dde6;
    --row-hover: rgba(15, 23, 42, 0.04);
    --row-hover-strong: rgba(15, 23, 42, 0.08);
    --accent: #2563eb;
    --accent-fg: #ffffff;
    --accent-soft: rgba(37, 99, 235, 0.14);
    --ok: #16a34a;
    --ok-soft: rgba(22, 163, 74, 0.14);
    --err: #dc2626;
    --err-bg: rgba(220, 38, 38, 0.1);
    --warn: #b45309;
    --key: #1d4ed8;
    --str: #047857;
    --num: #b45309;
    --bool: #c026d3;
    --null: #6b7280;
    --selection: rgba(37, 99, 235, 0.22);
    --ring: rgba(37, 99, 235, 0.45);
    --shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
    --radius: 4px;
    --radius-lg: 8px;
  }

  :global(html, body, #app) {
    height: 100%;
    margin: 0;
  }
  :global(html) {
    background: var(--bg);
  }
  :global(body) {
    background: var(--bg);
    color: var(--fg);
    font:
      13px/1.45 system-ui,
      -apple-system,
      "Segoe UI",
      Roboto,
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-feature-settings:
      "ss01",
      "cv11",
      "tnum" 0;
    overflow: hidden;
  }
  :global(::selection) {
    background: var(--selection);
    color: var(--fg);
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(button) {
    font-family: inherit;
  }
  :global(:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
    border-radius: var(--radius);
  }
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(textarea:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 2px var(--ring);
    border-color: var(--accent);
  }

  /* Scrollbars */
  :global(*::-webkit-scrollbar) {
    width: 10px;
    height: 10px;
  }
  :global(*::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(*::-webkit-scrollbar-thumb) {
    background: var(--border);
    border-radius: 6px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  :global(*::-webkit-scrollbar-thumb:hover) {
    background: var(--muted);
    background-clip: content-box;
    border: 2px solid transparent;
  }
  :global(*) {
    scrollbar-color: var(--border) transparent;
    scrollbar-width: thin;
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
  }
  .layout {
    flex: 1;
    display: grid;
    min-height: 0;
    grid-template-columns: 1fr;
  }
  .layout.has-panel {
    grid-template-columns: 1fr 6px var(--panel-width, 380px);
  }
  .workspace {
    display: grid;
    min-height: 0;
    min-width: 0;
  }
  .side {
    min-width: 0;
    min-height: 0;
  }

  /* Mobile: panel becomes full-width overlay; resizer hidden. */
  @media (max-width: 768px) {
    .layout.has-panel {
      grid-template-columns: 1fr;
    }
    .panel-resizer {
      display: none;
    }
    .side {
      position: fixed;
      inset: 0;
      z-index: 60;
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .hint-bar {
      display: none;
    }
  }
  .panel-resizer {
    width: 6px;
    cursor: col-resize;
    background: linear-gradient(
      to right,
      transparent 2px,
      var(--border) 2px,
      var(--border) 3px,
      transparent 3px
    );
    user-select: none;
    transition: background 120ms;
  }
  .panel-resizer:hover {
    background: linear-gradient(
      to right,
      transparent 2px,
      var(--accent) 2px,
      var(--accent) 3px,
      transparent 3px
    );
  }
  .panel-resizer.dragging {
    background: linear-gradient(
      to right,
      transparent 1px,
      var(--accent) 1px,
      var(--accent) 4px,
      transparent 4px
    );
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
    font:
      10px ui-monospace,
      SFMono-Regular,
      Menlo,
      Consolas,
      monospace;
  }

  .app.dragging > :not(.drop-overlay) {
    pointer-events: none;
  }
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, var(--bg) 50%, transparent);
    backdrop-filter: blur(3px);
    border: 3px dashed var(--accent);
    box-shadow: inset 0 0 0 6px var(--accent-soft);
    pointer-events: none;
    animation: drop-pulse 1.2s ease-in-out infinite;
  }
  @keyframes drop-pulse {
    0%,
    100% {
      box-shadow: inset 0 0 0 6px var(--accent-soft);
    }
    50% {
      box-shadow: inset 0 0 0 12px var(--accent-soft);
    }
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
  .drop-icon {
    font-size: 38px;
    line-height: 1;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .drop-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .drop-sub {
    font-size: 12px;
    color: var(--muted);
  }
</style>
