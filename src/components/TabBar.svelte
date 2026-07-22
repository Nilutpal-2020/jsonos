<script lang="ts">
  import { workspace } from "../core/store.svelte";
  import ToolSwitcher from "./ToolSwitcher.svelte";

  let editingId = $state<string | null>(null);
  let draftName = $state("");

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
  <a class="brand" href="/" aria-label="JSON OS — home" title="JSON OS">
    <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="url(#brand-grad)" />
      <defs>
        <linearGradient
          id="brand-grad"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stop-color="#5b9eff" />
          <stop offset="1" stop-color="#2563eb" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="#ffffff"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M11.5 7.5c-2.5 0-3.5 1.2-3.5 3.2v3.1c0 1.4-.7 2.2-2 2.2 1.3 0 2 .8 2 2.2v3.1c0 2 1 3.2 3.5 3.2"
        />
        <path
          d="M20.5 7.5c2.5 0 3.5 1.2 3.5 3.2v3.1c0 1.4.7 2.2 2 2.2-1.3 0-2 .8-2 2.2v3.1c0 2-1 3.2-3.5 3.2"
        />
      </g>
      <circle cx="16" cy="16" r="1.5" fill="#ffffff" />
    </svg>
    <span class="brand-name">JSON OS</span>
  </a>
  <ToolSwitcher />
  <span class="brand-sep" aria-hidden="true"></span>

  {#each workspace.docs as d (d.id)}
    {@const shown = workspace.slots.some((s) => s.docId === d.id)}
    {@const focused = workspace.active.id === d.id}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="tab"
      class:active={focused}
      class:shown={shown && !focused}
      role="button"
      tabindex="0"
      onclick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          // Cmd/Ctrl-click → open in a NEW column (alongside current).
          workspace.addSlot(
            d.id,
            workspace.slots[workspace.focusedSlotIndex]?.view ?? "text",
          );
        } else {
          workspace.setActive(d.id);
        }
      }}
      onauxclick={(e) => {
        // Middle-click closes the tab.
        if (e.button === 1) {
          e.preventDefault();
          workspace.closeDoc(d.id);
        }
      }}
      onkeydown={(e) => {
        if (e.key === "Enter") workspace.setActive(d.id);
      }}
      ondblclick={() => startRename(d.id, d.name)}
      title={shown
        ? "Click: focus column · ⌘-click: new column · middle-click: close · double-click: rename"
        : "Click: open in focused column · ⌘-click: new column · middle-click: close · double-click: rename"}
    >
      {#if editingId === d.id}
        <input
          class="rename"
          bind:value={draftName}
          onblur={commitRename}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") editingId = null;
          }}
          use:focusInput
        />
      {:else}
        <span class="name">{d.name}</span>
        {#if d.dirty}<span class="dot" title="unsaved">•</span>{/if}
        <button
          class="close"
          title="Close"
          onclick={(e) => {
            e.stopPropagation();
            workspace.closeDoc(d.id);
          }}
          aria-label="close">×</button
        >
      {/if}
    </div>
  {/each}
  <button
    class="new-tab"
    title="New document"
    onclick={() => workspace.newDoc()}
    aria-label="new tab">+</button
  >
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
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    color: var(--muted);
    text-decoration: none;
    font:
      600 12px/1 system-ui,
      -apple-system,
      "Segoe UI",
      Roboto,
      sans-serif;
    letter-spacing: 0.04em;
    flex-shrink: 0;
    user-select: none;
    transition: color 80ms;
  }
  .brand:hover {
    color: var(--fg);
  }
  .tabs :global(.switcher) {
    align-self: center;
    margin: 0 6px 0 -2px;
    flex-shrink: 0;
  }
  .brand-mark {
    width: 18px;
    height: 18px;
    display: block;
    flex-shrink: 0;
  }
  .brand-name {
    display: inline-block;
  }
  .brand-sep {
    display: inline-block;
    width: 1px;
    align-self: center;
    height: 18px;
    background: var(--border);
    margin: 0 4px 0 0;
    flex-shrink: 0;
  }
  @media (max-width: 540px) {
    .brand-name {
      display: none;
    }
    .brand {
      padding: 0 10px;
    }
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
    flex-shrink: 0;
    transition:
      background 80ms,
      color 80ms;
  }
  @media (max-width: 540px) {
    .tab {
      padding: 6px 10px;
      min-width: 80px;
      max-width: 160px;
    }
  }
  .tab:hover {
    background: var(--surface);
    color: var(--fg);
  }
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
  .dot {
    color: var(--accent);
    font-size: 16px;
    line-height: 1;
  }
  .close {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
    border-radius: 3px;
  }
  .close:hover {
    background: var(--row-hover-strong);
    color: var(--fg);
  }
  .new-tab {
    background: transparent;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 0 12px;
    font-size: 16px;
  }
  .new-tab:hover {
    background: var(--surface);
    color: var(--fg);
  }
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
