<script lang="ts">
  import { tool, TOOLS, type Tool } from '../core/tool-router.svelte';

  type Props = { compact?: boolean };
  let { compact = false }: Props = $props();

  let btnEl = $state<HTMLButtonElement | undefined>();
  let open = $state(false);
  let panelPos = $state({ x: 0, y: 0 });

  let active = $derived(TOOLS.find((t) => t.id === tool.current) ?? TOOLS[0]);

  function toggle() {
    if (open) { open = false; return; }
    if (!btnEl) return;
    const r = btnEl.getBoundingClientRect();
    panelPos = { x: r.left, y: r.bottom + 6 };
    open = true;
  }
  function close() { open = false; }

  function pick(id: Tool) {
    open = false;
    tool.set(id);
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); open = false; }
  }
</script>

<svelte:window onkeydown={onKey} />

<button
  class="switcher"
  class:compact
  class:open
  bind:this={btnEl}
  onclick={toggle}
  aria-haspopup="menu"
  aria-expanded={open}
  title="Switch tool"
>
  <span class="active-icon" aria-hidden="true">{active.icon}</span>
  {#if !compact}<span class="active-name">{active.short}</span>{/if}
  <span class="chev" aria-hidden="true">▾</span>
</button>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" role="presentation" onmousedown={close}></div>
  <div
    class="panel"
    role="menu"
    style:left="{panelPos.x}px"
    style:top="{panelPos.y}px"
  >
    <div class="panel-head">
      <span class="panel-title">JSON OS · Tools</span>
      <span class="panel-sub">Switch between workbenches</span>
    </div>
    {#each TOOLS as t}
      {@const isActive = t.id === tool.current}
      <button
        class="tool-row"
        class:active={isActive}
        onclick={() => pick(t.id)}
        role="menuitem"
        type="button"
        aria-current={isActive ? 'true' : undefined}
      >
        <span class="tool-icon">{t.icon}</span>
        <span class="tool-text">
          <span class="tool-name">
            {t.name}
            {#if isActive}<span class="badge">Current</span>{/if}
          </span>
          <span class="tool-desc">{t.desc}</span>
        </span>
        <span class="tool-hint">{t.hint}</span>
      </button>
    {/each}
    <div class="panel-foot">More tools coming soon</div>
  </div>
{/if}

<style>
  .switcher {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px 4px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg);
    font: 600 11.5px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    letter-spacing: 0.02em;
    cursor: pointer;
    user-select: none;
    transition: background 80ms, border-color 80ms, color 80ms;
  }
  .switcher:hover {
    background: var(--row-hover-strong);
    border-color: var(--muted);
  }
  .switcher.open {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .switcher.compact { padding: 4px 8px; }
  .active-icon {
    font: 600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--accent);
    line-height: 1;
  }
  .switcher.open .active-icon { color: var(--accent); }
  .active-name { line-height: 1; }
  .chev { color: var(--muted); font-size: 10px; line-height: 1; }
  .switcher.open .chev { color: var(--accent); transform: rotate(180deg); }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
    background: transparent;
  }
  .panel {
    position: fixed;
    z-index: 200;
    width: 320px;
    max-width: calc(100vw - 16px);
    background: var(--surface-hi);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 6px;
    box-shadow: var(--shadow);
    color: var(--fg);
    font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    animation: fade-in 100ms ease-out;
  }
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .panel-head {
    padding: 8px 10px 6px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .panel-title {
    display: block;
    font-weight: 700;
    color: var(--fg);
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .panel-sub {
    display: block;
    color: var(--muted);
    font-size: 11px;
    margin-top: 1px;
  }
  .panel-foot {
    padding: 8px 10px 4px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
    color: var(--muted);
    font-size: 10.5px;
    text-align: center;
    letter-spacing: 0.02em;
  }

  .tool-row {
    display: grid;
    grid-template-columns: 26px 1fr auto;
    gap: 10px;
    align-items: center;
    width: 100%;
    padding: 9px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 80ms, border-color 80ms;
  }
  .tool-row + .tool-row { margin-top: 2px; }
  .tool-row:hover {
    background: var(--row-hover-strong);
    border-color: var(--border);
  }
  .tool-row.active {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .tool-icon {
    font: 600 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--accent);
    text-align: center;
    line-height: 1;
  }
  .tool-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .tool-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--fg);
  }
  .badge {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: var(--accent);
    color: var(--accent-fg);
    padding: 1px 5px;
    border-radius: 99px;
    font-weight: 700;
  }
  .tool-desc {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.4;
  }
  .tool-hint {
    align-self: center;
    color: var(--muted);
    font-size: 10.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  @media (max-width: 540px) {
    .panel { width: calc(100vw - 16px); }
    .tool-hint { display: none; }
  }
</style>
